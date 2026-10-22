# Data Pipeline đa nguồn & Khai phá cảm xúc đánh giá sản phẩm (Amazon Reviews 2023)

Toàn bộ hệ thống chạy bằng Docker và được quản lý tập trung qua **một giao diện duy nhất: Portal** (http://localhost:8000).

```
 Nguồn 1: Amazon Reviews (.jsonl.gz) ─┐
 Nguồn 2: Amazon Metadata (.jsonl.gz) ─┼─► Airflow DAG ─► MinIO Data Lake ─► PostgreSQL (Star Schema) ─► ML / DL
 Nguồn 3: World Bank API (JSON)  ──────┘    (điều phối)    raw/staging/curated   fact + 3 dim              NB · LR · LSTM
                                                   │               │                     │                      │
                                                   └───────────────┴──── Portal :8000 ───┴──────────────────────┘
                                                  Tổng quan · Data Lake (realtime) · Pipeline · Kho dữ liệu · Khai phá
```

| Thành phần | Công nghệ | Địa chỉ | Tài khoản |
|---|---|---|---|
| **Portal (giao diện tổng hợp)** | FastAPI + Chart.js | http://localhost:8000 | – |
| Data Lake | MinIO (S3) | API `:9000`, Console http://localhost:9001 | `minioadmin` / `minioadmin123` |
| Kho dữ liệu | PostgreSQL 16 | `localhost:5432`, DB `dwh` | `dw` / `dw123` |
| Điều phối ETL | Airflow 3.3 | http://localhost:8080 | `admin` / `admin` |
| Học sâu | Google Colab | `notebooks/train_lstm_colab.ipynb` | – |

## 1. Chạy hệ thống

Yêu cầu: Docker Desktop đang chạy, còn trống khoảng 4 GB RAM (đo thực tế: cả hệ thống dùng khoảng 3 GB lúc huấn luyện mô hình) và 6 GB ổ đĩa (riêng image Airflow chiếm 3,4 GB).

```bash
docker compose up -d --build      # lần đầu mất vài phút để build image
```

Sau khoảng 1–2 phút, mở **http://localhost:8000**. Trên thanh trên cùng, ba mục MinIO, PostgreSQL và Airflow đều phải hiện "hoạt động".

Chạy pipeline: vào tab **Pipeline** → bấm **▶ Chạy ngay**. Với `SAMPLE_FRAC=0.15` (khoảng 105.000 review), lần đầu chạy mất khoảng 3–4 phút (gồm tải 134 MB dữ liệu gốc). Trong lúc chạy, bạn theo dõi được:

- **Pipeline**: tác vụ nào đang chạy, xem log và kết quả XCom của từng tác vụ.
- **Data Lake**: file mới xuất hiện ngay lập tức trong luồng *Sự kiện realtime*.
- **Kho dữ liệu** và **Khai phá dữ liệu**: tự cập nhật khi pipeline xong.

Dừng hoặc xóa hệ thống:

```bash
docker compose stop          # dừng, giữ dữ liệu
docker compose down -v       # xóa sạch container + dữ liệu MinIO/PostgreSQL
```

> **Lưu ý cổng:** máy đã có các container cũ tên `minio`, `postgres`, `superset` (bài thực hành trước) dùng cùng cổng 9000/9001/5432. Nếu chúng đang chạy, hãy dừng trước: `docker stop minio postgres superset`.

## 2. Cấu trúc thư mục

```
cuoiki/
├── agent.md                    # hồ sơ dự án + tiến độ (gửi riêng file này cho bạn/chatbot là đủ)
├── CLAUDE.md                   # quy tắc cho Claude Code: tự đọc và cập nhật agent.md
├── docker-compose.yml          # MinIO + PostgreSQL + Airflow + Portal
├── .env                        # tài khoản, danh mục sản phẩm, tỷ lệ lấy mẫu
├── airflow/
│   ├── Dockerfile              # Airflow 3.3.2 + pandas, minio, scikit-learn, nltk
│   └── dags/amazon_reviews_pipeline.py
├── pipeline/amz/               # code ETL + khai phá (DAG gọi vào đây)
│   ├── extract.py              # Bước 1: 3 nguồn -> raw zone
│   ├── transform.py            # Bước 2: làm sạch, tích hợp, NLP -> staging zone
│   ├── load.py                 # Bước 3: staging -> Star Schema PostgreSQL
│   ├── mining.py               # Bước 4: TF-IDF + Naive Bayes / Logistic Regression
│   └── lake.py                 # hàm đọc/ghi MinIO
├── sql/dw_schema.sql           # lược đồ hình sao
├── portal/                     # giao diện tổng hợp (FastAPI + HTML/JS)
└── notebooks/train_lstm_colab.ipynb   # LSTM trên Colab
```

## 3. Hướng dẫn sử dụng MinIO (Data Lake)

### 3.1. Khái niệm

MinIO là kho lưu trữ đối tượng (object storage) tương thích **Amazon S3**: code viết cho MinIO có thể chạy với AWS S3 mà chỉ cần đổi địa chỉ.

- **Bucket**: thùng chứa cấp cao nhất. Dự án dùng 3 bucket, tương ứng 3 vùng của Data Lake.
- **Object**: một file, gồm dữ liệu và metadata. Mỗi object có một **key**, ví dụ `amazon/reviews/All_Beauty/ingest_date=2026-10-21/All_Beauty.jsonl.gz`.
- **Prefix**: phần đầu của key. S3 thật ra không có thư mục; dấu `/` chỉ giúp nhóm các object lại, và Console hiển thị chúng như thư mục.

| Bucket (Zone) | Nội dung | Định dạng |
|---|---|---|
| `raw/` | Dữ liệu gốc từ 3 nguồn, **không sửa**, chia theo ngày nạp `ingest_date=YYYY-MM-DD` | `.jsonl.gz`, `.json` |
| `staging/` | Dữ liệu đã làm sạch, tích hợp; báo cáo chất lượng ở `_reports/` | Parquet, JSON |
| `curated/` | Tập dữ liệu ML, dự đoán, kết quả mô hình `models/<tên>/metrics.json` | Parquet, JSON |

### 3.2. Dùng giao diện web (Console)

Mở http://localhost:9001 và đăng nhập bằng `minioadmin` / `minioadmin123`.

- *Object Browser*: chọn bucket → duyệt prefix → bấm vào file để xem metadata, tải về, xóa hoặc tải file lên.
- Portal tab **Data Lake** làm được những việc thường dùng nhất (duyệt, xem trước nội dung, tải về, tải lên) mà không cần mở Console.

### 3.3. Dùng dòng lệnh `mc` (MinIO Client)

Image MinIO có sẵn `mc`, nên không cần cài thêm:

```bash
docker exec -it amz-minio sh
mc alias set local http://localhost:9000 minioadmin minioadmin123   # khai báo kết nối
mc ls local                                   # liệt kê bucket
mc ls --recursive local/raw                   # liệt kê toàn bộ object trong raw
mc du local/raw                               # dung lượng
mc cp /etc/hostname local/staging/_test/a.txt # tải file lên
mc cat local/staging/_test/a.txt              # đọc nội dung
mc rm local/staging/_test/a.txt               # xóa
mc stat local/raw/<key>                       # metadata (vd. source-url của file gốc)
mc watch local/raw                            # theo dõi sự kiện realtime (Ctrl+C để thoát)
```

### 3.4. Dùng Python SDK (cách pipeline đang dùng)

```python
from minio import Minio
client = Minio("localhost:9000", access_key="minioadmin", secret_key="minioadmin123", secure=False)

client.make_bucket("demo")                                    # tạo bucket
client.fput_object("demo", "folder/data.csv", "data.csv")     # tải file lên
client.fget_object("demo", "folder/data.csv", "copy.csv")     # tải file về
for obj in client.list_objects("demo", prefix="folder/", recursive=True):
    print(obj.object_name, obj.size, obj.last_modified)

# Ghi luồng dữ liệu không biết trước kích thước (tải thẳng từ Internet vào lake)
import requests
with requests.get(url, stream=True) as r:
    client.put_object("raw", "nguon/file.gz", r.raw, length=-1, part_size=16 * 1024 * 1024)

# Realtime: nhận sự kiện mỗi khi có object được tạo/xóa (Portal dùng cách này)
with client.listen_bucket_notification("raw", events=["s3:ObjectCreated:*"]) as events:
    for ev in events:
        print(ev["Records"][0]["s3"]["object"]["key"])
```

Từ máy host dùng `localhost:9000`; từ container khác trong docker compose dùng `minio:9000`.

### 3.5. Vì sao dùng image `pgsty/minio`?

Từ năm 2025, MinIO ngừng phát hành image cộng đồng: `minio/minio` trên Docker Hub đã bị gỡ, và `quay.io/minio/minio` báo lỗi 401. Dự án dùng `pgsty/minio`, một bản fork cộng đồng còn được duy trì, giữ nguyên API S3, Console và `mc`. Tag được cố định ở `RELEASE.2026-08-04T00-00-00Z` để lần cài sau ra đúng phiên bản này.

## 4. Pipeline (Airflow DAG `amazon_reviews_pipeline`)

```
extract.extract_reviews  ─┐
extract.extract_metadata ─┼─► transform ─► load_warehouse ─► mining.build_dataset ─┬─► mining.train_baselines
extract.extract_fx       ─┘                                                       └─► mining.score_reviews
```

| Tác vụ | Việc làm | Kết quả |
|---|---|---|
| `extract_reviews`, `extract_metadata` | Stream file `.jsonl.gz` từ McAuley Lab thẳng vào MinIO (không qua ổ đĩa); bỏ qua nếu hôm nay đã tải | `raw/amazon/...` |
| `extract_fx` | Gọi World Bank API, chỉ số `PA.NUS.FCRF` (VND/USD theo năm) | `raw/worldbank/...` |
| `transform` | Đọc tuần tự (streaming) và lấy mẫu `SAMPLE_FRAC`; bỏ dòng thiếu, trùng, rating sai; ghép metadata theo `parent_asin`; quy đổi giá sang VND; NLP (giữ từ phủ định *not/no/never*, lemmatize) | `staging/*.parquet`, `staging/_reports/quality_*.json` |
| `load_warehouse` | Tạo Star Schema, nạp lại toàn bộ (full refresh) bằng `COPY` | Bảng `fact_reviews`, `dim_*`, `review_text` |
| `build_dataset` | Trích dữ liệu **từ kho**, chia train/test 80/20 có phân tầng | `curated/ml/.../sentiment_dataset.parquet` |
| `train_baselines` | TF-IDF (1–2 gram) + Naive Bayes, Logistic Regression | `curated/models/*/metrics.json` |
| `score_reviews` | Tính `sentiment_score = P(tích cực) − P(tiêu cực)` bằng dự đoán **out-of-fold 5-fold** (mô hình không tự chấm dữ liệu nó đã học), ghi vào `fact_reviews` | Cột `sentiment_score`, `sentiment_pred` |

DAG được lên lịch `@daily`. Đổi danh mục sản phẩm hoặc lượng dữ liệu trong `.env` (`AMZ_CATEGORY`, `SAMPLE_FRAC`) rồi chạy `docker compose up -d`.

## 5. Kho dữ liệu (Star Schema)

- `fact_reviews`: rating, nhãn cảm xúc, điểm cảm xúc, helpful_vote, verified_purchase, độ dài văn bản.
- `dim_product`: tiêu đề, thương hiệu, danh mục, giá USD/VND, phân khúc giá.
- `dim_user`: số review, ngày review đầu tiên.
- `dim_time`: ngày/tháng/quý/năm + `usd_vnd_rate` (nguồn 3).
- `review_text`: văn bản gốc, `text_clean` (cho TF-IDF), `text_light` (cho LSTM).

Tab **Kho dữ liệu** của Portal có sẵn các biểu đồ OLAP và một ô SQL chỉ đọc, với truy vấn mẫu cho roll-up, drill-down, slice và dice.

## 6. LSTM trên Google Colab

1. Portal → **Data Lake** → bucket `curated` → `ml/<category>/sentiment_dataset.parquet` → **Tải về**.
2. Mở `notebooks/train_lstm_colab.ipynb` trên Colab (chọn runtime GPU) → *Run all* → chọn file parquet.
3. Notebook tải về `metrics.json`. Portal → **Data Lake** → **Tải file lên**: bucket `curated`, thư mục `models/lstm`.
4. Tab **Khai phá dữ liệu** tự hiện LSTM bên cạnh Naive Bayes và Logistic Regression, kèm biểu đồ loss theo epoch.

LSTM được đánh giá trên **đúng tập test** của các mô hình ML, nên so sánh là công bằng.

## 7. Ghi chú phương pháp

- `price` trong metadata là giá tại thời điểm thu thập (2023), nên được quy đổi bằng tỷ giá năm 2023. Tỷ giá theo năm trong `dim_time` dùng cho phân tích theo thời gian.
- Khoảng 73% review thuộc sản phẩm không có giá trong metadata (phân khúc "Không rõ").
- Nhãn lệch mạnh về Tích cực (khoảng 71%). Vì vậy mô hình dùng `class_weight="balanced"` và nên so sánh bằng **Macro-F1** thay vì chỉ Accuracy. Lớp Trung tính (3★) là lớp khó nhất.

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `container name "/minio" is already in use` | Container cũ của bài thực hành. Dự án này dùng tên `amz-*` nên không trùng; nếu vẫn trùng cổng, chạy `docker stop minio postgres` |
| Portal báo Airflow "lỗi" ngay sau khi khởi động | Airflow cần 1–2 phút để khởi động; xem `docker logs -f amz-airflow` |
| Một tác vụ thất bại | Portal → **Pipeline** → bấm vào tác vụ để xem log và lỗi (exception) → sửa code trong `pipeline/amz/` → **Chạy ngay** (Airflow đọc lại code mới mà không cần build lại) |
| Muốn làm lại từ đầu | `docker compose down -v && docker compose up -d --build` |
