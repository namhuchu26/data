"""Bước 1 - Extract: thu thập 3 nguồn vào Raw Zone của Data Lake (giữ nguyên bản gốc)."""
import datetime as dt
import json

import requests

from . import config, lake


def _raw_key(source: str, filename: str) -> str:
    # Phân vùng theo ngày nạp: raw/<nguồn>/ingest_date=YYYY-MM-DD/<file>
    return f"{source}/ingest_date={dt.date.today().isoformat()}/{filename}"


def _download_to_lake(url: str, key: str) -> dict:
    """Stream file từ URL thẳng vào MinIO. Bỏ qua nếu hôm nay đã tải đủ dung lượng."""
    lake.ensure_buckets()
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        size = int(r.headers.get("Content-Length", 0))
        existing = lake.stat_or_none(config.RAW, key)
        if existing and size and existing.size == size:
            return {"key": key, "bytes": size, "skipped": True}
        r.raw.decode_content = False  # giữ nguyên file .gz gốc
        lake.put_stream(config.RAW, key, r.raw, "application/gzip",
                        metadata={"source-url": url})
    return {"key": key, "bytes": lake.stat_or_none(config.RAW, key).size, "skipped": False}


def extract_reviews() -> dict:
    """Nguồn 1: User Reviews (dữ liệu động, bán cấu trúc .jsonl)."""
    return _download_to_lake(config.REVIEWS_URL,
                             _raw_key(f"amazon/reviews/{config.CATEGORY}", f"{config.CATEGORY}.jsonl.gz"))


def extract_metadata() -> dict:
    """Nguồn 2: Item Metadata (dữ liệu tĩnh, bán cấu trúc .jsonl)."""
    return _download_to_lake(config.META_URL,
                             _raw_key(f"amazon/meta/{config.CATEGORY}", f"meta_{config.CATEGORY}.jsonl.gz"))


def extract_fx() -> dict:
    """Nguồn 3: Tỷ giá USD->VND theo năm từ World Bank REST API (chỉ số PA.NUS.FCRF)."""
    lake.ensure_buckets()
    r = requests.get(config.FX_URL, params={"format": "json", "date": "1995:2030", "per_page": 200},
                     timeout=60)
    r.raise_for_status()
    payload = r.json()
    key = _raw_key("worldbank/usd_vnd", f"PA.NUS.FCRF_{dt.datetime.now():%H%M%S}.json")
    lake.put_bytes(config.RAW, key, json.dumps(payload).encode(), "application/json")
    n = sum(1 for x in payload[1] if x.get("value") is not None)
    return {"key": key, "years": n}
