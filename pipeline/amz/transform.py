"""Bước 2 - Transform: làm sạch, tích hợp 3 nguồn theo parent_asin / năm, tiền xử lý NLP.

Kết quả ghi vào Staging Zone (Parquet) + một báo cáo chất lượng dữ liệu (JSON).
"""
import datetime as dt
import html
import random
import re
from functools import lru_cache

import pandas as pd
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from . import config, lake

# ---------------------------------------------------------------- NLP
# Giữ lại từ phủ định: xóa "not" sẽ biến "not good" thành "good" -> sai cảm xúc
NEGATIONS = {"not", "no", "nor", "never", "none", "nothing", "nobody", "neither",
             "nowhere", "cannot", "without"}
STOPWORDS = frozenset(ENGLISH_STOP_WORDS - NEGATIONS)

_RE_TAG = re.compile(r"<[^>]+>")
_RE_URL = re.compile(r"https?://\S+|www\.\S+")
_RE_NT = re.compile(r"n't\b")
_RE_NON_ALPHA = re.compile(r"[^a-z\s]")
_RE_SPACE = re.compile(r"\s+")

_lemmatizer = None


@lru_cache(maxsize=200_000)
def _lemma(word: str) -> str:
    global _lemmatizer
    if _lemmatizer is None:
        from nltk.stem import WordNetLemmatizer
        _lemmatizer = WordNetLemmatizer()
    return _lemmatizer.lemmatize(_lemmatizer.lemmatize(word, "n"), "v")


def clean_light(text: str) -> str:
    """Chữ thường, bỏ HTML/URL/dấu câu, tách "n't" -> " not". Dùng cho LSTM."""
    t = html.unescape(text or "")
    t = _RE_TAG.sub(" ", t)
    t = _RE_URL.sub(" ", t).lower()
    t = t.replace("’", "'")
    t = _RE_NT.sub(" not", t)
    t = _RE_NON_ALPHA.sub(" ", t)
    return _RE_SPACE.sub(" ", t).strip()


def clean_full(light: str) -> str:
    """Tokenize + bỏ stopword (trừ phủ định) + lemmatize. Dùng cho TF-IDF."""
    return " ".join(_lemma(w) for w in light.split() if w not in STOPWORDS and len(w) > 1)


def rating_to_label(r: float) -> str:
    return "negative" if r <= 2 else ("neutral" if r == 3 else "positive")


# ---------------------------------------------------------------- helpers
def _parse_price(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if v > 0 else None
    m = re.search(r"\d+(?:\.\d+)?", str(v).replace(",", ""))
    return float(m.group()) if m else None


def _price_segment(vnd):
    if vnd is None or pd.isna(vnd):
        return "Không rõ"
    for limit, name in [(200_000, "< 200K"), (500_000, "200K - 500K"),
                        (1_000_000, "500K - 1 triệu"), (2_000_000, "1 - 2 triệu")]:
        if vnd < limit:
            return name
    return "> 2 triệu"


# ---------------------------------------------------------------- transform
def transform(reviews_key: str, meta_key: str, fx_key: str, run_id: str = "") -> dict:
    report = {"run_id": run_id, "category": config.CATEGORY,
              "created_at": dt.datetime.now().isoformat(timespec="seconds")}

    # 1) Reviews: đọc tuần tự (streaming) + lấy mẫu ngẫu nhiên có seed
    rng = random.Random(config.RANDOM_SEED)
    keep = ("rating", "title", "text", "parent_asin", "user_id", "timestamp",
            "helpful_vote", "verified_purchase")
    rows, n_read = [], 0
    for rec in lake.iter_jsonl_gz(config.RAW, reviews_key):
        n_read += 1
        if rng.random() < config.SAMPLE_FRAC:
            rows.append({k: rec.get(k) for k in keep})
    rv = pd.DataFrame(rows)
    report["reviews_raw_rows"] = n_read
    report["reviews_sampled"] = len(rv)

    # 2) Làm sạch cấu trúc
    before = len(rv)
    rv = rv.dropna(subset=["rating", "text", "parent_asin", "user_id", "timestamp"])
    report["dropped_missing"] = before - len(rv)
    before = len(rv)
    rv = rv[rv["rating"].between(1, 5)]
    report["dropped_invalid_rating"] = before - len(rv)
    before = len(rv)
    rv = rv.drop_duplicates(subset=["user_id", "parent_asin", "timestamp"])
    report["dropped_duplicates"] = before - len(rv)

    rv["rating"] = rv["rating"].astype(int)
    rv["review_ts"] = pd.to_datetime(rv["timestamp"], unit="ms", errors="coerce")
    rv = rv.dropna(subset=["review_ts"])
    rv["helpful_vote"] = rv["helpful_vote"].fillna(0).astype(int)
    rv["verified_purchase"] = rv["verified_purchase"].fillna(False).astype(bool)
    rv["title"] = rv["title"].fillna("")

    # 3) NLP
    rv["text_light"] = rv["text"].map(clean_light)
    rv["text_clean"] = rv["text_light"].map(clean_full)
    before = len(rv)
    rv = rv[rv["text_clean"].str.len() > 0]
    report["dropped_empty_text"] = before - len(rv)
    rv["text_length"] = rv["text"].str.len()
    rv["word_count"] = rv["text_light"].str.split().str.len()
    rv["sentiment_label"] = rv["rating"].map(rating_to_label)

    # 4) Metadata: chỉ giữ sản phẩm có trong mẫu review
    asins = set(rv["parent_asin"])
    meta_rows, n_meta = [], 0
    for m in lake.iter_jsonl_gz(config.RAW, meta_key):
        n_meta += 1
        if m.get("parent_asin") not in asins:
            continue
        details = m.get("details") or {}
        meta_rows.append({
            "parent_asin": m["parent_asin"],
            "title": m.get("title"),
            "store": m.get("store"),
            # brand không phải trường cấp 1 trong bản 2023: nằm trong details hoặc store
            "brand": details.get("Brand") or m.get("store") or "Unknown",
            "main_category": m.get("main_category") or "Unknown",
            "categories": " > ".join(m.get("categories") or []),
            "price_usd": _parse_price(m.get("price")),
            "average_rating": m.get("average_rating"),
            "rating_number": m.get("rating_number"),
        })
    pr = pd.DataFrame(meta_rows).drop_duplicates("parent_asin")
    report["meta_raw_rows"] = n_meta

    # 5) Nguồn 3: tỷ giá theo năm (World Bank)
    wb = lake.get_json(config.RAW, fx_key)
    fx = pd.DataFrame([{"year": int(x["date"]), "usd_vnd": float(x["value"])}
                       for x in wb[1] if x.get("value") is not None]).sort_values("year")
    snap = fx[fx["year"] <= config.PRICE_SNAPSHOT_YEAR]["usd_vnd"].iloc[-1]
    pr["price_vnd"] = (pr["price_usd"] * snap).round(-2)
    pr["price_segment"] = pr["price_vnd"].map(_price_segment)

    # 6) Tích hợp: review LEFT JOIN metadata theo parent_asin
    missing = asins - set(pr["parent_asin"])
    if missing:
        pr = pd.concat([pr, pd.DataFrame({"parent_asin": sorted(missing), "brand": "Unknown",
                                          "main_category": "Unknown",
                                          "price_segment": "Không rõ"})], ignore_index=True)
    report.update({
        "products": len(pr),
        "products_without_meta": len(missing),
        "products_missing_price_pct": round(float(pr["price_usd"].isna().mean() * 100), 2),
        "products_unknown_brand_pct": round(float((pr["brand"] == "Unknown").mean() * 100), 2),
        "reviews_clean": len(rv),
        "users": int(rv["user_id"].nunique()),
        "date_min": rv["review_ts"].min().date().isoformat(),
        "date_max": rv["review_ts"].max().date().isoformat(),
        "label_distribution": rv["sentiment_label"].value_counts().to_dict(),
        "fx_years": f"{fx['year'].min()}-{fx['year'].max()}",
        "fx_snapshot_rate": round(float(snap), 2),
    })

    cols = ["parent_asin", "user_id", "review_ts", "rating", "sentiment_label", "title", "text",
            "text_clean", "text_light", "helpful_vote", "verified_purchase", "text_length",
            "word_count"]
    lake.put_parquet(config.STAGING, config.STG_REVIEWS, rv[cols])
    lake.put_parquet(config.STAGING, config.STG_PRODUCTS, pr)
    lake.put_parquet(config.STAGING, config.STG_FX, fx)
    lake.put_json(config.STAGING, f"_reports/quality_{dt.datetime.now():%Y%m%d_%H%M%S}.json", report)
    return {k: report[k] for k in ("reviews_clean", "products", "users")}
