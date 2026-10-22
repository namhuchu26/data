import os

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
DW_URL = os.getenv("DW_URL", "postgresql://dw:dw123@localhost:5432/dwh")

CATEGORY = os.getenv("AMZ_CATEGORY", "All_Beauty")
SAMPLE_FRAC = float(os.getenv("SAMPLE_FRAC", "0.15"))
RANDOM_SEED = 42

AMZ_BASE = "https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw"
REVIEWS_URL = f"{AMZ_BASE}/review_categories/{CATEGORY}.jsonl.gz"
META_URL = f"{AMZ_BASE}/meta_categories/meta_{CATEGORY}.jsonl.gz"
FX_URL = "https://api.worldbank.org/v2/country/VNM/indicator/PA.NUS.FCRF"

# Các vùng (zone) của Data Lake, mỗi vùng là một bucket
RAW, STAGING, CURATED = "raw", "staging", "curated"
BUCKETS = [RAW, STAGING, CURATED]

# Đường dẫn object cố định ở staging/curated (raw thì chia theo ngày nạp)
STG_REVIEWS = f"amazon/{CATEGORY}/reviews_clean.parquet"
STG_PRODUCTS = f"amazon/{CATEGORY}/products_clean.parquet"
STG_FX = "worldbank/fx_usd_vnd.parquet"
CUR_DATASET = f"ml/{CATEGORY}/sentiment_dataset.parquet"
CUR_PREDICTIONS = f"ml/{CATEGORY}/predictions_oof.parquet"

LABELS = ["negative", "neutral", "positive"]
# Năm thu thập metadata (giá sản phẩm là ảnh chụp năm 2023)
PRICE_SNAPSHOT_YEAR = 2023
