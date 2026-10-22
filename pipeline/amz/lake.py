"""Thao tác với Data Lake MinIO (S3 API)."""
import gzip
import io
import json

import pandas as pd
from minio import Minio
from minio.error import S3Error

from . import config


def client() -> Minio:
    return Minio(config.MINIO_ENDPOINT, access_key=config.MINIO_ACCESS_KEY,
                 secret_key=config.MINIO_SECRET_KEY, secure=False)


def ensure_buckets(c: Minio | None = None) -> None:
    c = c or client()
    for b in config.BUCKETS:
        if not c.bucket_exists(b):
            try:
                c.make_bucket(b)
            except S3Error as e:  # các task extract chạy song song có thể tạo cùng lúc
                if e.code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                    raise


def stat_or_none(bucket: str, key: str):
    try:
        return client().stat_object(bucket, key)
    except S3Error:
        return None


def put_stream(bucket: str, key: str, stream, content_type: str, metadata=None) -> None:
    """Ghi luồng dữ liệu không biết trước kích thước (multipart upload 16MB/phần)."""
    client().put_object(bucket, key, stream, length=-1, part_size=16 * 1024 * 1024,
                        content_type=content_type, metadata=metadata)


def put_bytes(bucket: str, key: str, data: bytes, content_type: str) -> None:
    client().put_object(bucket, key, io.BytesIO(data), len(data), content_type=content_type)


def put_json(bucket: str, key: str, obj) -> None:
    put_bytes(bucket, key, json.dumps(obj, ensure_ascii=False, indent=2, default=str).encode(),
              "application/json")


def get_json(bucket: str, key: str):
    resp = client().get_object(bucket, key)
    try:
        return json.loads(resp.read())
    finally:
        resp.close()
        resp.release_conn()


def iter_jsonl_gz(bucket: str, key: str):
    """Đọc tuần tự từng dòng JSON từ file .jsonl.gz trên MinIO, không tải hết vào RAM."""
    resp = client().get_object(bucket, key)
    try:
        with gzip.GzipFile(fileobj=resp) as gz:
            for line in gz:
                if line.strip():
                    yield json.loads(line)
    finally:
        resp.close()
        resp.release_conn()


def put_parquet(bucket: str, key: str, df: pd.DataFrame) -> None:
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    put_bytes(bucket, key, buf.getvalue(), "application/vnd.apache.parquet")


def get_parquet(bucket: str, key: str) -> pd.DataFrame:
    resp = client().get_object(bucket, key)
    try:
        return pd.read_parquet(io.BytesIO(resp.read()))
    finally:
        resp.close()
        resp.release_conn()


def latest_key(bucket: str, prefix: str) -> str:
    """Object mới nhất theo thời gian sửa đổi trong một prefix."""
    objs = [o for o in client().list_objects(bucket, prefix=prefix, recursive=True)
            if not o.object_name.endswith("/")]
    if not objs:
        raise FileNotFoundError(f"Không có object nào ở {bucket}/{prefix}")
    return max(objs, key=lambda o: o.last_modified).object_name
