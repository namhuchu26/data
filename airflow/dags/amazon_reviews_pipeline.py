"""DAG: Thu thập đa nguồn -> Data Lake (MinIO) -> Kho dữ liệu (PostgreSQL) -> Khai phá cảm xúc.

  extract (3 nguồn, song song) -> transform -> load_warehouse -> build_dataset
                                                              -> train_baselines
                                                              -> score_reviews
"""
from datetime import datetime, timedelta

from airflow.sdk import dag, task, task_group

DEFAULT_ARGS = {"retries": 1, "retry_delay": timedelta(minutes=1)}


@dag(
    dag_id="amazon_reviews_pipeline",
    description="Amazon Reviews 2023 + World Bank FX -> MinIO -> PostgreSQL -> Sentiment ML",
    schedule="@daily",
    start_date=datetime(2026, 10, 1),
    catchup=False,
    max_active_runs=1,
    default_args=DEFAULT_ARGS,
    tags=["datalake", "warehouse", "ml"],
)
def amazon_reviews_pipeline():

    @task_group(group_id="extract")
    def extract():
        @task
        def extract_reviews():
            from amz.extract import extract_reviews
            return extract_reviews()

        @task
        def extract_metadata():
            from amz.extract import extract_metadata
            return extract_metadata()

        @task
        def extract_fx():
            from amz.extract import extract_fx
            return extract_fx()

        return extract_reviews(), extract_metadata(), extract_fx()

    @task
    def transform(reviews: dict, meta: dict, fx: dict, run_id=None):
        from amz.transform import transform
        return transform(reviews["key"], meta["key"], fx["key"], run_id=run_id)

    @task
    def load_warehouse(_upstream: dict, run_id=None):
        from amz.load import load_warehouse
        return load_warehouse(run_id=run_id)

    @task_group(group_id="mining")
    def mining(_upstream):
        @task
        def build_dataset(_):
            from amz.mining import build_dataset
            return build_dataset()

        @task
        def train_baselines(_):
            from amz.mining import train_baselines
            return train_baselines()

        @task
        def score_reviews(_):
            from amz.mining import score_reviews
            return score_reviews()

        ds = build_dataset(_upstream)
        train_baselines(ds)
        score_reviews(ds)

    reviews, meta, fx = extract()
    mining(load_warehouse(transform(reviews, meta, fx)))


amazon_reviews_pipeline()
