"""Bước 3 - Load: nạp dữ liệu sạch từ Staging Zone vào kho PostgreSQL theo Star Schema."""
import io
from pathlib import Path

import pandas as pd
import psycopg2

from . import config, lake

SCHEMA_SQL = Path("/opt/airflow/sql/dw_schema.sql")


def connect():
    return psycopg2.connect(config.DW_URL)


def _copy(cur, table: str, df: pd.DataFrame) -> None:
    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False)
    buf.seek(0)
    cur.copy_expert(f"COPY {table} ({', '.join(df.columns)}) FROM STDIN WITH (FORMAT csv)", buf)


def build_dimensions(rv: pd.DataFrame, pr: pd.DataFrame, fx: pd.DataFrame):
    # Dim_Time: mỗi ngày có review là một dòng, gắn tỷ giá của năm (gần nhất nếu thiếu)
    dates = pd.DataFrame({"full_date": pd.to_datetime(rv["review_ts"].dt.date.unique())})
    dates = dates.sort_values("full_date")
    dates["year"] = dates["full_date"].dt.year.astype("int64")
    rates = fx.rename(columns={"usd_vnd": "usd_vnd_rate"}).astype({"year": "int64"}).sort_values("year")
    dates = pd.merge_asof(dates, rates, on="year", direction="nearest")
    dim_time = pd.DataFrame({
        "time_key": dates["full_date"].dt.strftime("%Y%m%d").astype(int),
        "full_date": dates["full_date"].dt.date,
        "day": dates["full_date"].dt.day,
        "month": dates["full_date"].dt.month,
        "quarter": dates["full_date"].dt.quarter,
        "year": dates["year"],
        "year_month": dates["full_date"].dt.strftime("%Y-%m"),
        "day_of_week": dates["full_date"].dt.dayofweek,
        "usd_vnd_rate": dates["usd_vnd_rate"].round(2),
    })

    dim_product = pr.reset_index(drop=True).copy()
    dim_product.insert(0, "product_key", range(1, len(dim_product) + 1))
    dim_product["rating_number"] = dim_product["rating_number"].astype("Int64")
    dim_product = dim_product[["product_key", "parent_asin", "title", "brand", "store",
                               "main_category", "categories", "price_usd", "price_vnd",
                               "price_segment", "average_rating", "rating_number"]]

    users = (rv.groupby("user_id")
             .agg(review_count=("rating", "size"), first_review_date=("review_ts", "min"))
             .reset_index())
    users["first_review_date"] = users["first_review_date"].dt.date
    users.insert(0, "user_key", range(1, len(users) + 1))
    return dim_time, dim_product, users


def load_warehouse(run_id: str = "") -> dict:
    rv = lake.get_parquet(config.STAGING, config.STG_REVIEWS)
    pr = lake.get_parquet(config.STAGING, config.STG_PRODUCTS)
    fx = lake.get_parquet(config.STAGING, config.STG_FX)
    dim_time, dim_product, dim_user = build_dimensions(rv, pr, fx)

    rv = rv.reset_index(drop=True)
    rv["review_key"] = range(1, len(rv) + 1)
    rv["time_key"] = rv["review_ts"].dt.strftime("%Y%m%d").astype(int)
    rv = rv.merge(dim_product[["parent_asin", "product_key"]], on="parent_asin")
    rv = rv.merge(dim_user[["user_id", "user_key"]], on="user_id")
    fact = rv[["review_key", "product_key", "user_key", "time_key", "rating", "sentiment_label",
               "helpful_vote", "verified_purchase", "text_length", "word_count"]]
    texts = rv[["review_key", "title", "text", "text_clean", "text_light"]].rename(
        columns={"text": "text_raw"})

    with connect() as conn, conn.cursor() as cur:
        cur.execute(SCHEMA_SQL.read_text(encoding="utf-8"))
        # Nạp lại toàn bộ (full refresh) để chạy lại DAG nhiều lần vẫn cho kết quả như nhau
        cur.execute("TRUNCATE review_text, fact_reviews, dim_product, dim_user, dim_time CASCADE")
        _copy(cur, "dim_time", dim_time)
        _copy(cur, "dim_product", dim_product)
        _copy(cur, "dim_user", dim_user)
        _copy(cur, "fact_reviews", fact)
        _copy(cur, "review_text", texts)
        cur.execute("ANALYZE")
        cur.execute("INSERT INTO etl_load_log (run_id, fact_rows, product_rows, user_rows, time_rows)"
                    " VALUES (%s, %s, %s, %s, %s)",
                    (run_id, len(fact), len(dim_product), len(dim_user), len(dim_time)))
    return {"fact_reviews": len(fact), "dim_product": len(dim_product),
            "dim_user": len(dim_user), "dim_time": len(dim_time)}
