"""Portal tổng hợp: Data Lake (MinIO) · Pipeline (Airflow) · Kho dữ liệu (PostgreSQL) · Khai phá.

Một backend duy nhất đọc từ cả 3 hệ thống và phục vụ giao diện web ở /.
"""
import asyncio
import collections
import gzip
import io
import json
import os
import re
import threading
import time
import urllib.parse
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path

import httpx
import psycopg2
import psycopg2.extras
import pyarrow.parquet as pq
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from minio import Minio
from minio.error import S3Error
from pydantic import BaseModel

MINIO = Minio(os.getenv("MINIO_ENDPOINT", "localhost:9000"),
              access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
              secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin123"), secure=False)
DW_URL = os.getenv("DW_URL", "postgresql://dw:dw123@localhost:5432/dwh")
AIRFLOW_URL = os.getenv("AIRFLOW_URL", "http://localhost:8080")
AIRFLOW_USER = os.getenv("AIRFLOW_USER", "admin")
AIRFLOW_PASSWORD = os.getenv("AIRFLOW_PASSWORD", "admin")

ZONES = {
    "raw": "Raw Zone - dữ liệu gốc, giữ nguyên định dạng nguồn (.jsonl.gz, .json)",
    "staging": "Staging Zone - dữ liệu đã làm sạch, tích hợp (Parquet) + báo cáo chất lượng",
    "curated": "Curated Zone - tập dữ liệu ML, dự đoán và kết quả mô hình",
}
STATIC = Path(__file__).parent / "static"


# =================================================================== realtime lake events
class Broadcaster:
    """Nhận sự kiện từ MinIO (thread) và phát tới các trình duyệt đang mở (SSE)."""

    def __init__(self):
        self.recent = collections.deque(maxlen=200)
        self.subscribers: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def publish(self, event: dict):
        self.recent.appendleft(event)
        if self.loop:
            for q in list(self.subscribers):
                self.loop.call_soon_threadsafe(q.put_nowait, event)


BUS = Broadcaster()


def _listen_bucket(bucket: str):
    """MinIO Bucket Notification API: đẩy sự kiện ngay khi object được tạo/xóa."""
    while True:
        try:
            if not MINIO.bucket_exists(bucket):
                try:
                    MINIO.make_bucket(bucket)
                except S3Error as e:
                    if e.code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                        raise
            with MINIO.listen_bucket_notification(
                    bucket, events=("s3:ObjectCreated:*", "s3:ObjectRemoved:*")) as events:
                for ev in events:
                    for rec in ev.get("Records", []):
                        obj = rec["s3"]["object"]
                        BUS.publish({
                            "time": rec.get("eventTime"),
                            "event": rec.get("eventName", "").replace("s3:", ""),
                            "bucket": bucket,
                            "key": urllib.parse.unquote_plus(obj.get("key", "")),
                            "size": obj.get("size", 0),
                        })
        except Exception as exc:  # MinIO chưa sẵn sàng / mất kết nối -> thử lại
            print(f"[lake-listener:{bucket}] {exc!r}; thử lại sau 3s", flush=True)
            time.sleep(3)


@asynccontextmanager
async def lifespan(_app):
    BUS.loop = asyncio.get_running_loop()
    for b in ZONES:
        threading.Thread(target=_listen_bucket, args=(b,), daemon=True).start()
    yield


app = FastAPI(title="Amazon Sentiment Data Portal", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


# =================================================================== helpers
def _jsonable(v):
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def dw_query(sql: str, params=None, readonly=False, limit=None):
    conn = psycopg2.connect(DW_URL, connect_timeout=5)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if readonly:
                cur.execute("SET TRANSACTION READ ONLY")
                cur.execute("SET LOCAL statement_timeout = '15s'")
            cur.execute(sql, params)
            rows = cur.fetchmany(limit) if limit else cur.fetchall()
            cols = [d.name for d in cur.description] if cur.description else []
        conn.rollback()
    finally:
        conn.close()
    return cols, [{k: _jsonable(v) for k, v in r.items()} for r in rows]


def rows(sql, params=None):
    return dw_query(sql, params)[1]


# =================================================================== health / config
@app.get("/api/config")
def config():
    return {"airflow_url": os.getenv("AIRFLOW_PUBLIC_URL", "http://localhost:8080"),
            "minio_console_url": os.getenv("MINIO_CONSOLE_URL", "http://localhost:9001"),
            "category": os.getenv("AMZ_CATEGORY", "All_Beauty")}


@app.get("/api/health")
def health():
    out = {}
    t = time.time()
    try:
        MINIO.list_buckets()
        out["minio"] = {"ok": True, "ms": round((time.time() - t) * 1000)}
    except Exception as e:
        out["minio"] = {"ok": False, "error": str(e)[:200]}
    t = time.time()
    try:
        rows("SELECT 1")
        out["postgres"] = {"ok": True, "ms": round((time.time() - t) * 1000)}
    except Exception as e:
        out["postgres"] = {"ok": False, "error": str(e)[:200]}
    t = time.time()
    try:
        r = httpx.get(f"{AIRFLOW_URL}/api/v2/monitor/health", timeout=5).json()
        ok = all(v.get("status") == "healthy" for v in r.values() if isinstance(v, dict)
                 and "status" in v)
        out["airflow"] = {"ok": ok, "ms": round((time.time() - t) * 1000), "detail": r}
    except Exception as e:
        out["airflow"] = {"ok": False, "error": str(e)[:200]}
    return out


# =================================================================== DATA LAKE
def _ctype(key: str) -> str:
    for ext, t in ((".jsonl.gz", "JSON Lines (gzip)"), (".json", "JSON"),
                   (".parquet", "Parquet"), (".csv", "CSV"), (".gz", "gzip")):
        if key.endswith(ext):
            return t
    return "khác"


@app.get("/api/lake/summary")
def lake_summary():
    zones = []
    for b, desc in ZONES.items():
        try:
            objs = [o for o in MINIO.list_objects(b, recursive=True)]
        except S3Error:
            objs = []
        last = max((o.last_modified for o in objs), default=None)
        zones.append({"bucket": b, "description": desc, "objects": len(objs),
                      "bytes": sum(o.size or 0 for o in objs),
                      "last_modified": last.isoformat() if last else None})
    return {"zones": zones}


@app.get("/api/lake/objects")
def lake_objects(bucket: str, prefix: str = ""):
    if bucket not in ZONES:
        raise HTTPException(404, "bucket không tồn tại")
    items = [{"key": o.object_name, "size": o.size,
              "last_modified": o.last_modified.isoformat() if o.last_modified else None,
              "type": _ctype(o.object_name)}
             for o in MINIO.list_objects(bucket, prefix=prefix, recursive=True)]
    items.sort(key=lambda x: x["last_modified"] or "", reverse=True)
    return {"bucket": bucket, "objects": items}


def _shorten(v, n=180):
    if isinstance(v, str) and len(v) > n:
        return v[:n] + "…"
    if isinstance(v, (list, dict)):
        s = json.dumps(v, ensure_ascii=False, default=str)
        return s[:n] + "…" if len(s) > n else v
    return _jsonable(v)


@app.get("/api/lake/preview")
def lake_preview(bucket: str, key: str, n: int = 8):
    stat = MINIO.stat_object(bucket, key)
    info = {"bucket": bucket, "key": key, "size": stat.size, "type": _ctype(key),
            "last_modified": stat.last_modified.isoformat(), "metadata": dict(stat.metadata or {})}
    info["metadata"] = {k: v for k, v in info["metadata"].items() if k.lower().startswith("x-amz-meta")}
    resp = MINIO.get_object(bucket, key)
    try:
        if key.endswith(".jsonl.gz"):
            recs = []
            with gzip.GzipFile(fileobj=resp) as gz:
                for line in gz:
                    recs.append({k: _shorten(v) for k, v in json.loads(line).items()})
                    if len(recs) >= n:
                        break
            info.update(kind="records", rows=recs)
        elif key.endswith(".parquet"):
            pf = pq.ParquetFile(io.BytesIO(resp.read()))
            batch = next(pf.iter_batches(batch_size=n))
            info.update(kind="records", num_rows=pf.metadata.num_rows,
                        schema=[{"name": f.name, "type": str(f.type)} for f in pf.schema_arrow],
                        rows=[{k: _shorten(v) for k, v in r.items()} for r in batch.to_pylist()])
        else:
            raw = resp.read(200_000)
            try:
                info.update(kind="json", content=json.loads(raw))
            except ValueError:
                info.update(kind="text", content=raw.decode("utf-8", "replace")[:5000])
    finally:
        resp.close()
        resp.release_conn()
    return info


@app.get("/api/lake/download")
def lake_download(bucket: str, key: str):
    resp = MINIO.get_object(bucket, key)

    def gen():
        try:
            yield from resp.stream(1024 * 1024)
        finally:
            resp.close()
            resp.release_conn()
    return StreamingResponse(gen(), media_type="application/octet-stream", headers={
        "Content-Disposition": f'attachment; filename="{Path(key).name}"'})


@app.post("/api/lake/upload")
async def lake_upload(bucket: str = Form(...), prefix: str = Form(""), file: UploadFile = File(...)):
    if bucket not in ZONES:
        raise HTTPException(404, "bucket không tồn tại")
    data = await file.read()
    key = f"{prefix.strip('/')}/{file.filename}".lstrip("/")
    MINIO.put_object(bucket, key, io.BytesIO(data), len(data),
                     content_type=file.content_type or "application/octet-stream")
    return {"bucket": bucket, "key": key, "size": len(data)}


@app.get("/api/lake/events/recent")
def lake_events_recent():
    return list(BUS.recent)


@app.get("/api/lake/events")
async def lake_events():
    q: asyncio.Queue = asyncio.Queue()
    BUS.subscribers.add(q)

    async def stream():
        try:
            yield "retry: 3000\n\n"
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            BUS.subscribers.discard(q)
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# =================================================================== PIPELINE (Airflow 3 REST API)
class Airflow:
    def __init__(self):
        self.token, self.expires = None, 0.0

    def _auth(self):
        r = httpx.post(f"{AIRFLOW_URL}/auth/token",
                       json={"username": AIRFLOW_USER, "password": AIRFLOW_PASSWORD}, timeout=10)
        r.raise_for_status()
        self.token, self.expires = r.json()["access_token"], time.time() + 20 * 60

    def call(self, method, path, **kw):
        if not self.token or time.time() > self.expires:
            self._auth()
        for attempt in range(2):
            r = httpx.request(method, f"{AIRFLOW_URL}/api/v2{path}", timeout=20,
                              headers={"Authorization": f"Bearer {self.token}",
                                       **kw.pop("headers", {})}, **kw)
            if r.status_code == 401 and attempt == 0:
                self._auth()
                continue
            if r.status_code >= 400:
                raise HTTPException(r.status_code, r.text[:500])
            return r


AF = Airflow()


def _q(s: str) -> str:
    return urllib.parse.quote(s, safe="")


@app.get("/api/pipeline/dags")
def pipeline_dags():
    dags = AF.call("GET", "/dags", params={"limit": 100}).json()["dags"]
    out = []
    for d in dags:
        runs = AF.call("GET", f"/dags/{_q(d['dag_id'])}/dagRuns",
                       params={"limit": 1, "order_by": "-run_after"}).json()["dag_runs"]
        out.append({"dag_id": d["dag_id"], "description": d.get("description"),
                    "is_paused": d.get("is_paused"), "tags": [t["name"] for t in d.get("tags", [])],
                    "schedule": d.get("timetable_summary") or d.get("timetable_description"),
                    "next_run": d.get("next_dagrun_run_after"),
                    "last_run": runs[0] if runs else None})
    return out


@app.get("/api/pipeline/graph")
def pipeline_graph(dag_id: str):
    tasks = AF.call("GET", f"/dags/{_q(dag_id)}/tasks").json()["tasks"]
    return [{"task_id": t["task_id"], "downstream": t.get("downstream_task_ids", []),
             "operator": t.get("operator_name")} for t in tasks]


@app.get("/api/pipeline/runs")
def pipeline_runs(dag_id: str, limit: int = 15):
    return AF.call("GET", f"/dags/{_q(dag_id)}/dagRuns",
                   params={"limit": limit, "order_by": "-run_after"}).json()["dag_runs"]


@app.get("/api/pipeline/tasks")
def pipeline_tasks(dag_id: str, run_id: str):
    tis = AF.call("GET", f"/dags/{_q(dag_id)}/dagRuns/{_q(run_id)}/taskInstances",
                  params={"limit": 100}).json()["task_instances"]
    return [{"task_id": t["task_id"], "state": t.get("state"), "try_number": t.get("try_number"),
             "start_date": t.get("start_date"), "end_date": t.get("end_date"),
             "duration": t.get("duration")} for t in tis]


@app.get("/api/pipeline/xcom")
def pipeline_xcom(dag_id: str, run_id: str, task_id: str):
    try:
        r = AF.call("GET", f"/dags/{_q(dag_id)}/dagRuns/{_q(run_id)}/taskInstances/"
                           f"{_q(task_id)}/xcomEntries/return_value").json()
        return {"value": r.get("value")}
    except HTTPException:
        return {"value": None}


@app.get("/api/pipeline/log")
def pipeline_log(dag_id: str, run_id: str, task_id: str, try_number: int = 1):
    r = AF.call("GET", f"/dags/{_q(dag_id)}/dagRuns/{_q(run_id)}/taskInstances/{_q(task_id)}"
                       f"/logs/{try_number}", params={"full_content": "true"},
                headers={"Accept": "application/json"})
    content = r.json().get("content", "")
    if isinstance(content, list):  # Airflow 3: log có cấu trúc
        lines = []
        for item in content:
            if isinstance(item, dict):
                ts = (item.get("timestamp") or "")[11:19]
                lvl = (item.get("level") or "").upper()
                lines.append(f"{ts} {lvl:<7} {item.get('event', '')}".rstrip())
                for err in item.get("error_detail") or []:
                    lines.append(f"         {err.get('exc_type')}: {err.get('exc_value')}")
                    for fr in (err.get("frames") or [])[-4:]:
                        lines.append(f"           at {fr.get('filename')}:{fr.get('lineno')} {fr.get('name')}")
            else:
                lines.append(str(item))
        content = "\n".join(lines)
    return {"content": content[-60_000:]}


class DagAction(BaseModel):
    dag_id: str
    paused: bool | None = None


@app.post("/api/pipeline/trigger")
def pipeline_trigger(a: DagAction):
    return AF.call("POST", f"/dags/{_q(a.dag_id)}/dagRuns",
                   json={"logical_date": None, "conf": {}}).json()


@app.post("/api/pipeline/pause")
def pipeline_pause(a: DagAction):
    return AF.call("PATCH", f"/dags/{_q(a.dag_id)}", json={"is_paused": bool(a.paused)}).json()


# =================================================================== DATA WAREHOUSE
DW_TABLES = ["fact_reviews", "dim_product", "dim_user", "dim_time", "review_text"]


@app.get("/api/dw/overview")
def dw_overview():
    try:
        counts = {t: rows(f"SELECT count(*) AS n FROM {t}")[0]["n"] for t in DW_TABLES}
    except psycopg2.Error:
        return {"ready": False}
    if counts["fact_reviews"] == 0:
        return {"ready": False, "counts": counts}
    kpi = rows("""
        SELECT count(*) AS reviews, count(DISTINCT product_key) AS products,
               count(DISTINCT user_key) AS users, round(avg(rating), 3) AS avg_rating,
               round(100.0 * avg((sentiment_label = 'positive')::int), 2) AS pct_positive,
               round(avg(sentiment_score), 4) AS avg_sentiment,
               round(100.0 * avg(verified_purchase::int), 2) AS pct_verified
        FROM fact_reviews""")[0]
    rng = rows("SELECT min(full_date) AS date_min, max(full_date) AS date_max FROM dim_time")[0]
    log = rows("SELECT * FROM etl_load_log ORDER BY loaded_at DESC LIMIT 5")
    return {"ready": True, "counts": counts, "kpi": {**kpi, **rng}, "load_log": log}


@app.get("/api/dw/charts")
def dw_charts():
    return {
        "monthly": rows("""
            SELECT t.year_month AS period, count(*) AS reviews, round(avg(f.rating), 3) AS avg_rating,
                   round(avg(f.sentiment_score), 4) AS avg_sentiment
            FROM fact_reviews f JOIN dim_time t USING (time_key)
            WHERE t.year >= 2010 GROUP BY 1 ORDER BY 1"""),
        "yearly_labels": rows("""
            SELECT t.year, f.sentiment_label AS label, count(*) AS n
            FROM fact_reviews f JOIN dim_time t USING (time_key)
            GROUP BY 1, 2 ORDER BY 1"""),
        "rating_dist": rows("SELECT rating, count(*) AS n FROM fact_reviews GROUP BY 1 ORDER BY 1"),
        "top_brands": rows("""
            SELECT p.brand, count(*) AS reviews, round(avg(f.rating), 2) AS avg_rating,
                   round(avg(f.sentiment_score), 3) AS avg_sentiment
            FROM fact_reviews f JOIN dim_product p USING (product_key)
            WHERE p.brand <> 'Unknown' GROUP BY 1 ORDER BY 2 DESC LIMIT 12"""),
        "price_segments": rows("""
            SELECT p.price_segment AS segment, count(*) AS reviews, round(avg(f.rating), 3) AS avg_rating,
                   round(avg(f.sentiment_score), 4) AS avg_sentiment
            FROM fact_reviews f JOIN dim_product p USING (product_key)
            GROUP BY 1 ORDER BY min(coalesce(p.price_vnd, 1e12))"""),
        "verified": rows("""
            SELECT verified_purchase AS verified, count(*) AS reviews, round(avg(rating), 3) AS avg_rating
            FROM fact_reviews GROUP BY 1"""),
        "weekday": rows("""
            SELECT t.day_of_week AS dow, count(*) AS reviews, round(avg(f.rating), 3) AS avg_rating
            FROM fact_reviews f JOIN dim_time t USING (time_key) GROUP BY 1 ORDER BY 1"""),
        "fx": rows("""SELECT year, max(usd_vnd_rate) AS rate FROM dim_time GROUP BY 1 ORDER BY 1"""),
        "top_products": rows("""
            SELECT p.parent_asin, left(p.title, 90) AS title, p.brand, p.price_vnd,
                   count(*) AS reviews, round(avg(f.rating), 2) AS avg_rating,
                   round(avg(f.sentiment_score), 3) AS avg_sentiment
            FROM fact_reviews f JOIN dim_product p USING (product_key)
            GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT 10"""),
    }


class SqlBody(BaseModel):
    sql: str


@app.post("/api/dw/query")
def dw_sql(body: SqlBody):
    sql = body.sql.strip().rstrip(";")
    if not re.match(r"^(select|with|explain)\b", sql, re.I) or ";" in sql:
        raise HTTPException(400, "Chỉ cho phép 1 câu lệnh SELECT / WITH / EXPLAIN")
    t = time.time()
    try:
        cols, data = dw_query(sql, readonly=True, limit=500)
    except psycopg2.Error as e:
        raise HTTPException(400, str(e).strip())
    return {"columns": cols, "rows": data, "ms": round((time.time() - t) * 1000),
            "truncated": len(data) == 500}


# =================================================================== MINING
@app.get("/api/mining/models")
def mining_models():
    out = []
    for o in MINIO.list_objects("curated", prefix="models/", recursive=True):
        if o.object_name.endswith("metrics.json"):
            resp = MINIO.get_object("curated", o.object_name)
            try:
                m = json.loads(resp.read())
                m.pop("params", None)
                if m.get("quick_test"):  # kết quả chạy thử của notebook, không dùng để báo cáo
                    m["display_name"] = f"{m.get('display_name', m.get('model'))} (chạy thử)"
                m["_key"] = o.object_name
                out.append(m)
            finally:
                resp.close()
                resp.release_conn()
    order = {"naive_bayes": 0, "logistic_regression": 1, "lstm": 2}
    out.sort(key=lambda m: order.get(m.get("model"), 9))
    return out


@app.get("/api/mining/score-hist")
def mining_score_hist():
    return rows("""
        SELECT sentiment_label AS label, width_bucket(sentiment_score, -1, 1.0001, 20) AS bin, count(*) AS n
        FROM fact_reviews WHERE sentiment_score IS NOT NULL GROUP BY 1, 2 ORDER BY 2""")


@app.get("/api/mining/errors")
def mining_errors(n: int = 8):
    return rows("""
        SELECT f.rating, f.sentiment_label AS actual, f.sentiment_pred AS predicted,
               f.sentiment_score AS score, left(t.text_raw, 400) AS text
        FROM fact_reviews f JOIN review_text t USING (review_key)
        WHERE f.sentiment_pred IS NOT NULL AND f.sentiment_pred <> f.sentiment_label
          AND length(t.text_raw) BETWEEN 40 AND 400
        ORDER BY random() LIMIT %s""", (n,))
