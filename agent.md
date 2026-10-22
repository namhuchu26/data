# agent.md: Hồ sơ dự án (chỉ cần đọc file này là nắm được toàn bộ dự án)

> **Cập nhật lần cuối:** 2026-10-22
> **Trạng thái:** **hoàn thành toàn bộ phần kỹ thuật và tài liệu.** Hệ thống chạy trọn vẹn; đủ 3 mô hình (NB, LR, BiLSTM) có kết quả thật trên Portal và trong báo cáo `BaoCao_DoAn.docx` (32 trang); đề tài cập nhật ở `detai_capnhat.docx`. **Nhóm tự điền:** tên trường, khoa, GVHD, thành viên trên bìa và Bảng C.1 phân công. Slide: không làm (theo yêu cầu).

---

## 0. Cách dùng file này

- **Mở chat AI mới trong Claude Code (thư mục dự án):** file này được tự nạp qua `CLAUDE.md`, không cần làm gì thêm.
- **Gửi cho bạn cùng nhóm hoặc hỏi chatbot trên web:** chỉ cần gửi riêng file này. Câu hỏi mẫu:
  > "Mình đính kèm agent.md mô tả toàn bộ đồ án (kiến trúc, code, số liệu, tiến độ). Đọc kỹ rồi giúp mình: <việc cần làm>. Nếu đề xuất thay đổi, ghi rõ cần sửa file nào và cập nhật mục nào trong agent.md."
- **Quy tắc cập nhật** (cho mọi AI và mọi thành viên):
  1. Cập nhật file này **ngay trong phiên làm việc** khi: thêm/sửa/xóa file hoặc tính năng; chạy pipeline có số liệu mới; huấn luyện mô hình; ra quyết định thiết kế; phát hiện hoặc sửa lỗi; đổi cấu hình, cổng, tài khoản.
  2. Lần nào cũng sửa: dòng *Cập nhật lần cuối*, **§2 Tiến độ**, **§17 Việc cần làm tiếp**, **§18 Nhật ký thay đổi** (ngày dạng `YYYY-MM-DD`, mới nhất ở trên), và các mục chi tiết bị ảnh hưởng.
  3. Chỉ ghi số liệu đã đo hoặc đã chạy thật. Chưa chạy thì ghi "chưa chạy", không ước đoán.
  4. File phải **tự đứng được**: người không có code trong tay vẫn hiểu. Không chép mật khẩu thật vào đây (hiện mới dùng mật khẩu mặc định cho môi trường local).

---

## 1. Dự án là gì

- **Đề tài:** *Xây dựng Data Pipeline Đa nguồn và Ứng dụng Học máy/Học sâu trong Khai phá Cảm xúc Đánh giá Sản phẩm Thương mại Điện tử* (bài tập cuối kỳ môn **Kho dữ liệu & Khai phá dữ liệu**, làm theo nhóm; đề cương gốc nằm trong `detai.docx`).
- **Dữ liệu:** Amazon Reviews 2023 (McAuley Lab, UCSD), danh mục **All_Beauty**, cộng thêm tỷ giá USD→VND từ World Bank API.
- **Bài toán:** phân loại cảm xúc 3 lớp từ nội dung review: Tiêu cực (1–2★), Trung tính (3★), Tích cực (4–5★).
- **Luồng tổng quát:** thu thập 3 nguồn → Data Lake (MinIO) → làm sạch, tích hợp, NLP → Kho dữ liệu (PostgreSQL, lược đồ hình sao) → mô hình ML (Naive Bayes, Logistic Regression) và DL (LSTM) → giao diện tổng hợp (Portal).

### 1.1. So sánh đề cương gốc với bản đã làm

| Đề cương gốc (`detai.docx`) | Bản đã triển khai | Ghi chú |
|---|---|---|
| 2 nguồn: Reviews + Metadata (.jsonl) | **3 nguồn**: thêm World Bank API (tỷ giá) | Vì 2 nguồn cũ cùng một bộ dữ liệu, chưa đủ thuyết phục là "đa nguồn" |
| Data Lake: AWS S3 / Google Cloud Storage | **MinIO** (tương thích S3, chạy local bằng Docker) | Image `pgsty/minio` (xem §14) |
| Môi trường: Google Colab | Docker Compose trên máy; **Colab chỉ dùng train LSTM** | Colab không kết nối được vào MinIO/Postgres trên máy |
| Không nêu công cụ điều phối | **Airflow 3.3.2** điều phối toàn bộ ETL và ML | |
| Không có dashboard | **Portal** tự viết (FastAPI + Chart.js), 5 tab | Thay cho Airflow UI, MinIO Console và Metabase |
| NLTK + spaCy | Chỉ dùng **NLTK** (WordNet lemmatizer) + regex | Không dùng spaCy |
| Star schema: Fact_Reviews, Dim_Product, Dim_User, Dim_Time | Giữ nguyên, thêm bảng `review_text` và `etl_load_log` | |
| NB/LR baseline + LSTM | NB + LR (chạy trong Airflow); **BiLSTM** (notebook TensorFlow, đã train trên CPU máy cá nhân) | Macro-F1 0,649 |
| Đánh giá bằng Accuracy, P, R, F1, Confusion Matrix | Thêm **Macro-F1** làm chỉ số chính (dữ liệu lệch lớp) | |

### 1.2. Các góp ý cho đề tài (2026-10-21) và tình trạng xử lý

| Góp ý | Tình trạng |
|---|---|
| "Đa nguồn" yếu vì 2 nguồn cùng một bộ dữ liệu | ✅ Thêm World Bank API |
| Dữ liệu quá lớn (khoảng 570 triệu review) | ✅ Chọn 1 danh mục (All_Beauty) + lấy mẫu 15% |
| Mất cân bằng nhãn | ✅ `class_weight="balanced"`, chia tập có `stratify`, báo cáo Macro-F1 |
| `sentiment_score` chưa rõ nguồn | ✅ Định nghĩa = P(tích cực) − P(tiêu cực) của LR, dự đoán **out-of-fold** |
| Xóa stopword làm mất từ phủ định | ✅ Giữ not/no/never…; tách 2 phiên bản văn bản (TF-IDF / LSTM) |
| `brand` không phải trường cấp 1; thiếu `timestamp` cho Dim_Time | ✅ Lấy từ `details.Brand` hoặc `store`; dùng `timestamp` (ms) |
| Thiếu phần khai thác kho (OLAP, dashboard) | ✅ Tab Kho dữ liệu của Portal |
| PostgreSQL chạy ở đâu | ✅ Docker local |
| Câu "LSTM xử lý tốt mỉa mai" là nói quá | ✅ Đã viết lại trong `detai_capnhat.docx` |

---

## 2. Tiến độ

| Hạng mục | Trạng thái |
|---|---|
| Đánh giá và góp ý đề tài | ✅ Xong (2026-10-21) |
| Hạ tầng Docker Compose: MinIO, PostgreSQL, Airflow, Portal | ✅ Xong, đã kiểm thử dựng lại từ đầu |
| Extract 3 nguồn vào Raw Zone (streaming) | ✅ Xong |
| Transform: làm sạch, tích hợp, NLP, báo cáo chất lượng | ✅ Xong |
| Load: Star Schema PostgreSQL | ✅ Xong |
| ML baseline: Naive Bayes, Logistic Regression | ✅ Xong (Macro-F1 0,651 / 0,660) |
| Điểm cảm xúc out-of-fold ghi ngược vào kho | ✅ Xong |
| Portal 5 tab (realtime lake, pipeline, kho, khai phá) | ✅ Xong, kiểm tra cả giao diện sáng/tối và điện thoại |
| Notebook LSTM | ✅ Code xong, đã chạy thử và chạy chính thức |
| Train LSTM thật | ✅ Xong (2026-10-21, CPU local): Macro-F1 0,6492 — kết quả ở `notebooks/lstm_metrics.json` |
| Đưa kết quả LSTM lên Portal (`curated/models/lstm/metrics.json`) và vào báo cáo | ✅ Xong (2026-10-22) |
| Cập nhật đề tài | ✅ `detai_capnhat.docx` (giữ nguyên `detai.docx` gốc) |
| Báo cáo cuối kỳ `BaoCao_DoAn.docx` | ✅ Hoàn chỉnh (2026-10-22, 32 trang, có kết quả BiLSTM và mục 7.7 thảo luận); nhóm tự điền bìa + bảng phân công |
| Slide thuyết trình | ➖ Không làm (người dùng không yêu cầu) |
| README hướng dẫn (gồm hướng dẫn MinIO) | ✅ Xong |
| `huongdanchay.md` (hướng dẫn chạy từng bước) | ✅ Xong (2026-10-21) |

---

## 3. Kiến trúc và công nghệ

```
 Nguồn 1: Amazon Reviews (.jsonl.gz) ─┐
 Nguồn 2: Amazon Metadata (.jsonl.gz) ─┼─► Airflow DAG ─► MinIO Data Lake ─► PostgreSQL (Star Schema) ─► ML / DL
 Nguồn 3: World Bank API (JSON)  ──────┘    (điều phối)    raw/staging/curated   fact + 3 dim              NB · LR · LSTM
                                                   └──────────── Portal :8000 (giao diện tổng hợp) ────────────┘
```

| Thành phần | Image / phiên bản | Container | Cổng | Tài khoản (mặc định local) |
|---|---|---|---|---|
| Data Lake | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` | `amz-minio` | 9000 (S3 API), 9001 (Console) | `minioadmin` / `minioadmin123` |
| Kho dữ liệu + metadata Airflow | `postgres:16` | `amz-postgres` | 5432 | Kho: `dw` / `dw123`, DB `dwh`. Airflow: `airflow` / `airflow`, DB `airflow` |
| Điều phối | build từ `apache/airflow:3.3.2` (Python 3.13), chế độ `standalone`, LocalExecutor | `amz-airflow` | 8080 | `admin` / `admin` (SimpleAuthManager) |
| Portal | build từ `python:3.12-slim`; FastAPI, uvicorn, minio, psycopg2, httpx, pyarrow; frontend HTML/JS thuần + Chart.js 4.4.1 (CDN) | `amz-portal` | 8000 | – |
| Học sâu | TensorFlow 2.21 / Keras (đã train trên CPU trong container `python:3.12-slim`; notebook cũng chạy được trên Colab GPU) | – | – | – |

- Volume dữ liệu: `cuoiki_minio_data`, `cuoiki_postgres_data` (bị xóa khi chạy `docker compose down -v`).
- Đã đo thực tế: cả hệ thống dùng khoảng **3 GB RAM** lúc cao điểm (Airflow 2,8 GB khi train mô hình). Image Airflow nặng 3,35 GB, Portal 521 MB, Postgres 642 MB, MinIO 216 MB.

---

## 4. Cấu trúc thư mục

```
cuoiki/
├── agent.md                    # FILE NÀY: hồ sơ dự án và tiến độ
├── CLAUDE.md                   # quy tắc cho Claude Code; tự nạp agent.md
├── README.md                   # tài liệu kỹ thuật: MinIO, pipeline, kho, xử lý sự cố
├── huongdanchay.md             # hướng dẫn chạy từng bước cho người mới (Windows)
├── BaoCao_DoAn.docx            # BÁO CÁO ĐỒ ÁN (Word, 32 trang, 9 chương + phụ lục, 15 hình)
├── baocao/                     # nguồn dựng báo cáo: build.js (thư viện docx của Node), arch.html (sơ đồ kiến trúc), img/ (15 hình chụp từ Portal), jobs.json. Dựng lại: `NODE_PATH=<thư mục có node_modules/docx> node baocao/build.js out.docx`, rồi mở bằng Word để cập nhật mục lục
├── detai.docx                  # đề cương gốc (giữ nguyên)
├── detai_capnhat.docx          # đề cương cập nhật theo kiến trúc đã làm (3 nguồn, MinIO, Airflow, Portal, BiLSTM, Macro-F1)
├── docker-compose.yml          # 4 dịch vụ: minio, postgres, airflow, portal
├── .env                        # tài khoản, AMZ_CATEGORY=All_Beauty, SAMPLE_FRAC=0.15, JWT secret Airflow
├── airflow/
│   ├── Dockerfile              # airflow 3.3.2 + requirements + tải NLTK wordnet/omw-1.4
│   ├── requirements.txt        # minio, pandas, pyarrow, requests, psycopg2-binary, scikit-learn, nltk
│   ├── config/passwords.json   # {"admin": "admin"} cho SimpleAuthManager
│   └── dags/amazon_reviews_pipeline.py   # DAG (TaskFlow API, airflow.sdk)
├── pipeline/amz/               # code ETL + khai phá (mount vào /opt/airflow/pipeline, nằm trên PYTHONPATH)
│   ├── config.py               # biến môi trường, URL nguồn, tên bucket, đường dẫn object, nhãn
│   ├── lake.py                 # client MinIO: tạo bucket, stream lên, đọc jsonl.gz tuần tự, đọc/ghi parquet/json
│   ├── extract.py              # Bước 1: 3 nguồn -> raw zone
│   ├── transform.py            # Bước 2: lấy mẫu, làm sạch, NLP, tích hợp, quy đổi giá -> staging zone
│   ├── load.py                 # Bước 3: staging -> Star Schema (COPY), ghi etl_load_log
│   └── mining.py               # Bước 4: dataset từ kho, TF-IDF + NB/LR, điểm out-of-fold
├── sql/
│   ├── 00_init_databases.sql   # chạy khi Postgres khởi tạo lần đầu: tạo user + DB airflow
│   └── dw_schema.sql           # CREATE TABLE IF NOT EXISTS cho star schema + index + etl_load_log
├── portal/
│   ├── Dockerfile, requirements.txt
│   ├── app.py                  # backend FastAPI: gom MinIO + PostgreSQL + Airflow REST API
│   └── static/                 # index.html, style.css, app.js (5 tab, Chart.js, SSE realtime)
└── notebooks/
    ├── train_lstm_colab.ipynb  # BiLSTM -> metrics.json (chạy trên máy hoặc Colab)
    └── lstm_metrics.json       # kết quả BiLSTM chính thức (bản sao của curated/models/lstm/metrics.json)
```

---

## 5. Dữ liệu nguồn

| # | Nguồn | Cách lấy | Trường dùng | Kích thước |
|---|---|---|---|---|
| 1 | Amazon Reviews 2023: `https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/review_categories/All_Beauty.jsonl.gz` | Stream HTTP thẳng vào MinIO | `rating, title, text, parent_asin, user_id, timestamp (ms), helpful_vote, verified_purchase` | 90,1 MB gz, 701.528 review |
| 2 | Item Metadata: `.../raw/meta_categories/meta_All_Beauty.jsonl.gz` | Như trên | `parent_asin, title, main_category, store, details.Brand, categories, price, average_rating, rating_number` | 38,0 MB gz, 112.590 sản phẩm |
| 3 | World Bank API: `https://api.worldbank.org/v2/country/VNM/indicator/PA.NUS.FCRF?format=json&date=1995:2030&per_page=200` | REST, JSON | `date` (năm), `value` (VND/USD bình quân năm) | 7,9 KB, có dữ liệu năm 1995–2024 |

Lưu ý: trong metadata bản 2023, `brand` không phải trường cấp 1 (nằm ở `details.Brand` hoặc `store`), và `price` thường bị null.

---

## 6. Data Lake MinIO

Mỗi zone là một bucket. Bucket được tạo tự động bởi pipeline (`lake.ensure_buckets`) và Portal.

| Bucket | Object (sau lần chạy 2026-10-21) | Kích thước |
|---|---|---|
| `raw/` | `amazon/reviews/All_Beauty/ingest_date=YYYY-MM-DD/All_Beauty.jsonl.gz` (metadata `x-amz-meta-source-url`) | 90,1 MB |
| | `amazon/meta/All_Beauty/ingest_date=YYYY-MM-DD/meta_All_Beauty.jsonl.gz` | 38,0 MB |
| | `worldbank/usd_vnd/ingest_date=YYYY-MM-DD/PA.NUS.FCRF_HHMMSS.json` | 7,9 KB |
| `staging/` | `amazon/All_Beauty/reviews_clean.parquet` | 32,8 MB |
| | `amazon/All_Beauty/products_clean.parquet` | 4,1 MB |
| | `worldbank/fx_usd_vnd.parquet` | 2 KB |
| | `_reports/quality_YYYYMMDD_HHMMSS.json` (báo cáo chất lượng mỗi lần chạy) | <1 KB |
| `curated/` | `ml/All_Beauty/sentiment_dataset.parquet` (có cột `split` train/test) | 16,2 MB |
| | `ml/All_Beauty/predictions_oof.parquet` | 0,9 MB |
| | `models/naive_bayes/metrics.json`, `models/logistic_regression/metrics.json` | |
| | `models/lstm/metrics.json` (BiLSTM, upload qua Portal ngày 2026-10-22) | 1,4 KB |

- Raw được phân vùng theo ngày nạp. Extract **bỏ qua** việc tải nếu trong ngày đã có object cùng dung lượng.
- Từ host dùng `localhost:9000`; từ container khác trong compose dùng `minio:9000`.

---

## 7. Pipeline Airflow (DAG `amazon_reviews_pipeline`)

```
extract.extract_reviews  ─┐
extract.extract_metadata ─┼─► transform ─► load_warehouse ─► mining.build_dataset ─┬─► mining.train_baselines
extract.extract_fx       ─┘                                                       └─► mining.score_reviews
```

- Lịch `@daily` (cron `0 0 * * *` UTC, tức 07:00 giờ Việt Nam); `catchup=False`, `max_active_runs=1`, `retries=1` (chờ 1 phút).
- `DAGS_ARE_PAUSED_AT_CREATION=False`, nên **DAG tự chạy một lần ngay khi hệ thống khởi động**.
- Các task import `amz.*` bên trong hàm, nên sửa code trong `pipeline/amz/` thì lần chạy sau dùng code mới, không cần build lại image.

| Task | Việc làm | Thời gian (lần dựng lại từ đầu, 2026-10-21) | XCom trả về |
|---|---|---|---|
| `extract_reviews` | Stream file gz vào `raw/` | 110 s | `{key, bytes, skipped}` |
| `extract_metadata` | Như trên | 74 s | như trên |
| `extract_fx` | Gọi World Bank API, ghi JSON vào `raw/` | 10,5 s | `{key, years}` |
| `transform` | Xem §8 | 19,3 s | `{reviews_clean, products, users}` |
| `load_warehouse` | Tạo schema, TRUNCATE, `COPY` vào 5 bảng, ghi log | 9,3 s | số dòng mỗi bảng |
| `build_dataset` | Trích dữ liệu từ kho, chia 80/20 có stratify (seed 42) → `curated/` | 3,2 s | `{rows, train, test}` |
| `train_baselines` | TF-IDF + NB + LR → `metrics.json` | 76,7 s | accuracy và f1_macro từng mô hình |
| `score_reviews` | 5-fold `cross_val_predict` (LR) → điểm cảm xúc, ghi vào `fact_reviews` | 105 s | `{scored, oof_accuracy}` |

**Tổng thời gian khoảng 4 phút 20 giây**; cả 8 task thành công ngay lần thử đầu. Kết quả tái lập được (cùng seed cho ra cùng số liệu).

---

## 8. Làm sạch và tiền xử lý (`transform.py`)

1. **Lấy mẫu khi đọc tuần tự** (không nạp cả file vào RAM): giữ mỗi dòng với xác suất `SAMPLE_FRAC=0.15`, `random.Random(42)`.
2. **Làm sạch cấu trúc:** bỏ dòng thiếu `rating/text/parent_asin/user_id/timestamp`; giữ rating trong khoảng 1–5; bỏ trùng theo (`user_id`, `parent_asin`, `timestamp`); `timestamp` ms → datetime; `helpful_vote` null → 0; `verified_purchase` null → False.
3. **NLP:**
   - `text_light` (cho LSTM): `html.unescape`, bỏ thẻ HTML và URL, chuyển chữ thường, đổi `n't` thành ` not`, bỏ ký tự không phải chữ cái, gộp khoảng trắng.
   - `text_clean` (cho TF-IDF): từ `text_light`, bỏ stopword (`ENGLISH_STOP_WORDS` của sklearn **trừ các từ phủ định** not/no/nor/never/none/nothing/nobody/neither/nowhere/cannot/without), bỏ từ 1 ký tự, lemmatize bằng WordNet (danh từ rồi động từ).
   - Bỏ review có `text_clean` rỗng.
4. **Metadata:** chỉ giữ sản phẩm xuất hiện trong mẫu review; `brand = details.Brand` hoặc `store` hoặc `"Unknown"`; `categories` nối bằng `" > "`; tách số từ `price`.
5. **Nguồn 3:** `price_vnd = price_usd × tỷ giá năm 2023` (23.787,32, làm tròn đến trăm đồng), vì giá trong metadata là ảnh chụp năm 2023. Phân khúc giá: `< 200K`, `200K - 500K`, `500K - 1 triệu`, `1 - 2 triệu`, `> 2 triệu`, `Không rõ`.
6. **Tích hợp:** review LEFT JOIN metadata theo `parent_asin`; sản phẩm thiếu metadata được thêm dòng "Unknown" (lần chạy này: 0 sản phẩm).

**Báo cáo chất lượng (lần chạy 2026-10-21):** đọc 701.528 review → lấy mẫu 105.332 → bỏ 0 do thiếu giá trị, 0 do rating sai, 160 trùng, 395 văn bản rỗng → **104.777 review sạch**; 41.314 sản phẩm (0 thiếu metadata; **82,16% thiếu giá**; 8,73% không rõ thương hiệu); 102.358 người dùng; review từ 2001-01-30 đến 2023-09-09. Phân bố nhãn: tích cực 74.707 (71,3%), tiêu cực 21.658 (20,7%), trung tính 8.412 (8,0%).

---

## 9. Kho dữ liệu PostgreSQL (DB `dwh`, Star Schema)

| Bảng | Khóa | Cột chính | Số dòng |
|---|---|---|---|
| `fact_reviews` | `review_key` (PK), FK `product_key`, `user_key`, `time_key` | `rating, sentiment_label` (theo rating), `sentiment_score` (−1..1), `sentiment_pred`, `helpful_vote, verified_purchase, text_length, word_count` | 104.777 |
| `dim_product` | `product_key` | `parent_asin` (unique), `title, brand, store, main_category, categories, price_usd, price_vnd, price_segment, average_rating, rating_number` | 41.314 |
| `dim_user` | `user_key` | `user_id` (unique), `review_count` (tính trong mẫu), `first_review_date` | 102.358 |
| `dim_time` | `time_key` = yyyymmdd | `full_date, day, month, quarter, year, year_month, day_of_week` (0 = Thứ Hai), `usd_vnd_rate` (tỷ giá năm gần nhất) | 5.041 |
| `review_text` | `review_key` (PK/FK) | `title, text_raw, text_clean, text_light` | 104.777 |
| `etl_load_log` | `id` | `run_id, loaded_at` và số dòng từng bảng | 1 dòng mỗi lần nạp |

- Nạp kiểu **full refresh** (TRUNCATE … CASCADE rồi `COPY`), nên chạy lại DAG nhiều lần vẫn cho kết quả như nhau.
- **Một số kết quả từ kho (2026-10-21):** rating trung bình 3,961; 71,3% tích cực; điểm cảm xúc trung bình 0,374; 90,38% đã xác thực mua hàng. Review đã xác thực có rating TB **3,95** (94.694 review), chưa xác thực **4,07** (10.083 review). Rating TB theo phân khúc giá: <200K 3,97 · 200–500K 4,13 · 500K–1tr 4,18 · 1–2tr 4,24 · >2tr 4,04 · Không rõ 3,91 (76.936 review). Thương hiệu nhiều review nhất: PHILIPS (472), Segbeauty (411), Lume (354).

---

## 10. Khai phá dữ liệu (`mining.py`)

- **Tập dữ liệu:** trích từ kho (`fact_reviews` JOIN `review_text`), chia train/test 80/20 phân tầng (seed 42): **83.821 train / 20.956 test**. Tập test này dùng chung cho mọi mô hình, kể cả LSTM.
- **Đặc trưng:** TF-IDF trên `text_clean`, n-gram (1,2), `min_df=3`, `max_features=50.000`, `sublinear_tf=True`.
- **Mô hình:**
  - `MultinomialNB(alpha=0.3, fit_prior=False)`
  - `LogisticRegression(max_iter=2000, C=2.0, class_weight="balanced")`

| Mô hình | Accuracy | Precision (macro) | Recall (macro) | **F1 (macro)** | F1 (weighted) | Thời gian train |
|---|---|---|---|---|---|---|
| Multinomial Naive Bayes | 0,8066 | 0,6334 | 0,6790 | **0,6506** | 0,8195 | 0,3 s |
| Logistic Regression | 0,8159 | 0,6472 | 0,6833 | **0,6595** | 0,8297 | 67,1 s |
| BiLSTM | 0,7566 | 0,6559 | 0,7248 | **0,6492** | 0,7971 | 4.606 s (CPU, 4 epoch) |

F1 theo lớp (NB / LR / BiLSTM): Tiêu cực 0,744 / 0,750 / 0,742 · **Trung tính 0,309 / 0,318 / 0,342** · Tích cực 0,899 / 0,910 / 0,865. BiLSTM theo lớp (P / R): tiêu cực 0,763 / 0,721; trung tính 0,228 / **0,677**; tích cực 0,976 / 0,776. Số mẫu test mỗi lớp: 4.332 / 1.682 / 14.942.

Ma trận nhầm lẫn (hàng = nhãn thật, cột = dự đoán; thứ tự tiêu cực, trung tính, tích cực):
- NB: `[[3489, 545, 298], [636, 633, 413], [928, 1233, 12781]]`
- LR: `[[3335, 718, 279], [563, 680, 439], [660, 1198, 13084]]`
- BiLSTM: `[[3125, 1087, 120], [379, 1139, 164], [591, 2760, 11591]]` — nhận đúng 68% review trung tính (LR: 40%) nhưng kéo 2.760 review tích cực sang trung tính, nên accuracy thấp hơn.
- **Kết luận so sánh:** LR tốt nhất về Macro-F1/Accuracy; BiLSTM tốt nhất về Recall macro (0,725) và lớp Trung tính; NB nhanh nhất.

- **Từ khóa quyết định (hệ số LR):** tiêu cực: *worst, not worth, disappoint, return, not recommend*; trung tính: *not, okay, hop, kind, not worst* ("hop" là lỗi lemmatize của *hope/hoping*, hạn chế của WordNet); tích cực: *love, amaze, perfect, great, not disappoint*. Mô hình học được cụm có phủ định, nhờ giữ lại từ "not".
- **Điểm cảm xúc:** `sentiment_score = P(pos) − P(neg)` lấy từ dự đoán **out-of-fold 5-fold** (pipeline TF-IDF + LR), nên mỗi review được chấm bởi mô hình chưa từng thấy nó. Accuracy out-of-fold 0,8153. Kết quả ghi vào `fact_reviews.sentiment_score` và `sentiment_pred`.
- **Định dạng `metrics.json`** (Portal đọc theo đúng định dạng này): `model, display_name, family, trained_at, labels, accuracy, precision_macro, recall_macro, f1_macro, f1_weighted, per_class{label:{precision, recall, f1, support}}, confusion_matrix, n_train, n_test, train_seconds`; tùy chọn thêm `top_terms`, `history` (loss theo epoch), `quick_test`.

---

## 11. LSTM (`notebooks/train_lstm_colab.ipynb`)

- **Quy trình:** Portal → Data Lake → tải `curated/ml/All_Beauty/sentiment_dataset.parquet` → mở notebook trên Colab (runtime GPU) → *Run all* → tải `metrics.json` về → Portal → Data Lake → upload vào bucket `curated`, prefix `models/lstm`. Tab Khai phá sẽ tự so sánh với NB và LR.
- **Mô hình:** `TextVectorization` (30.000 từ, độ dài chuỗi 150, `standardize=None` trên `text_light`) → `Embedding(30000, 128, mask_zero=True)` → `Bidirectional(LSTM(64))` → Dropout 0,3 → Dense 64 ReLU → Dropout 0,3 → Dense 3 softmax. Adam 1e-3, batch 256, tối đa 8 epoch, `EarlyStopping(val_loss, patience=2, restore_best_weights)`, `class_weight="balanced"`, 10% tập train làm validation. Khoảng 3,95 triệu tham số.
- **Tình trạng: đã train chính thức** (2026-10-21) bằng TensorFlow 2.21 CPU trong container, chạy đúng code notebook với `QUICK_TEST=False`: 75.438 mẫu train, EarlyStopping dừng sau 4 epoch (giữ trọng số epoch 2), 4.606 s (~77 phút, chỉ dùng ~1 nhân CPU). Loss train 0,746→0,572→0,485→0,417; val_loss 0,599→**0,571**→0,595→0,740 (quá khớp sau epoch 2). Test: Accuracy 0,7566, **Macro-F1 0,6492**. Kết quả ở `notebooks/lstm_metrics.json` và trên Portal. Nếu file `metrics.json` có `quick_test: true`, Portal sẽ gắn nhãn "(chạy thử)".

---

## 12. Portal (http://localhost:8000)

| Tab | Nội dung | Tự làm mới |
|---|---|---|
| Tổng quan | 6 chỉ số chính, luồng 5 bước có số liệu thật, lần chạy DAG gần nhất, báo cáo chất lượng mới nhất, sự kiện Data Lake mới nhất | 20 s |
| Data Lake | 3 zone (số object, dung lượng, lần cập nhật), duyệt và lọc object, xem trước (jsonl.gz / parquet kèm schema / json), tải về, tải lên. **Sự kiện realtime** qua MinIO Bucket Notification và SSE | Ngay khi có sự kiện |
| Pipeline | Thông tin DAG, công tắc bật/tắt lịch, nút ▶ Chạy ngay, sơ đồ task tô màu theo trạng thái, danh sách lần chạy, bảng task có thanh thời lượng, xem log (kèm traceback) và XCom | 4 s khi đang chạy, 15 s khi rảnh |
| Kho dữ liệu | Sơ đồ hình sao kèm số dòng; 8 biểu đồ (review theo tháng, rating TB theo tháng, phân bố sao, nhãn theo năm, top thương hiệu, rating theo phân khúc giá, theo thứ trong tuần, tỷ giá); xác thực mua hàng; top 10 sản phẩm; **ô SQL chỉ đọc** kèm 6 truy vấn mẫu (roll-up, drill-down, slice, dice…) | 30 s |
| Khai phá dữ liệu | So sánh mô hình, F1 theo lớp, histogram điểm cảm xúc theo nhãn thật, ma trận nhầm lẫn, từ khóa quyết định, phần LSTM (hướng dẫn hoặc biểu đồ loss), phân tích review bị dự đoán sai | 30 s |

- Biểu đồ nào cũng có nút **"Bảng"** để xem số liệu dạng bảng. Có giao diện sáng/tối và chạy được trên điện thoại.
- **API backend (`portal/app.py`):**
  - `GET /api/config`, `GET /api/health`
  - Lake: `GET /api/lake/summary`, `/objects?bucket&prefix`, `/preview?bucket&key`, `/download?bucket&key`, `/events` (SSE), `/events/recent`; `POST /api/lake/upload` (form: bucket, prefix, file)
  - Pipeline (gọi Airflow REST API v2, lấy token qua `POST /auth/token`): `GET /api/pipeline/dags`, `/graph?dag_id`, `/runs?dag_id`, `/tasks?dag_id&run_id`, `/xcom`, `/log`; `POST /api/pipeline/trigger`, `/pause`
  - Kho: `GET /api/dw/overview`, `/charts`; `POST /api/dw/query` (chỉ cho phép SELECT/WITH/EXPLAIN, giao dịch read-only, timeout 15 s, tối đa 500 dòng)
  - Khai phá: `GET /api/mining/models`, `/score-hist`, `/errors`
- **Màu sắc:** dùng bảng màu đã kiểm định về mù màu. Mô hình: NB xanh dương, LR cam, LSTM xanh ngọc (cố định theo mô hình). Nhãn: tiêu cực đỏ, trung tính xám, tích cực xanh. Không có biểu đồ hai trục y.

---

## 13. Cách chạy và lệnh thường dùng

```bash
docker compose up -d --build          # khởi động (lần đầu build vài phút); DAG tự chạy 1 lần
docker compose ps                     # trạng thái
docker logs -f amz-airflow            # log Airflow
docker compose stop                   # dừng, giữ dữ liệu
docker compose down -v                # xóa sạch container + dữ liệu
docker exec amz-airflow python -c "from amz.load import load_warehouse; print(load_warehouse())"  # chạy thử 1 bước ngoài DAG
docker exec -it amz-minio sh          # rồi: mc alias set local http://localhost:9000 minioadmin minioadmin123
docker exec -it amz-postgres psql -U dw -d dwh
```

Đổi danh mục hoặc lượng dữ liệu: sửa `AMZ_CATEGORY` / `SAMPLE_FRAC` trong `.env` → `docker compose up -d` → chạy lại DAG.

---

## 14. Quyết định thiết kế và lý do

- **MinIO dùng image `pgsty/minio`:** image chính thức `minio/minio` đã bị gỡ khỏi Docker Hub, `quay.io/minio/minio` trả về 401 (đã kiểm tra 2026-10-21). `pgsty/minio` là bản fork cộng đồng còn được duy trì, giữ API S3, Console và `mc`. Tag được cố định.
- **Airflow 3.3.2 chạy `standalone`:** một container chứa đủ api-server, scheduler, dag-processor, triggerer, metadata nằm trên Postgres. Đơn giản và đủ dùng cho đồ án (không dùng cho production).
- **Stream dữ liệu thẳng vào MinIO** (`put_object(length=-1)`) và **đọc gz tuần tự**, để tránh tràn RAM, đúng ý "chunking" trong đề cương.
- **Kho nạp kiểu full refresh**, đơn giản và chạy lại nhiều lần vẫn ra cùng kết quả. Chưa làm nạp tăng dần (incremental) hay SCD.
- **Giữ từ phủ định**, và tách `text_clean` (TF-IDF) với `text_light` (LSTM).
- **Macro-F1 là chỉ số chính** vì dữ liệu lệch lớp (71% tích cực).
- **Điểm cảm xúc tính out-of-fold** để tránh rò rỉ dữ liệu (mô hình tự chấm dữ liệu đã học).
- **Giá quy đổi bằng tỷ giá 2023** vì giá trong metadata là ảnh chụp năm 2023. Tỷ giá theo năm trong `dim_time` dùng cho phân tích theo thời gian.
- **LSTM train ngoài Airflow** (notebook chạy trên máy hoặc Colab), vì nặng và cần TensorFlow; kết quả đưa về lake bằng `metrics.json`. Lần chính thức chạy trên CPU máy cá nhân (Colab GPU sẽ nhanh hơn nhiều).
- **Portal tự viết thay cho Metabase**, để gom Lake, Pipeline, Kho và Khai phá vào một chỗ. Nếu thầy cô bắt buộc dùng Metabase, có thể cho Metabase kết nối thẳng vào database `dwh`.

---

## 15. Hạn chế và vấn đề đã biết

- Lớp **Trung tính** rất khó (F1 khoảng 0,31); nhầm nhiều sang hai lớp còn lại.
- **82% sản phẩm thiếu giá**, nên phân tích theo giá chỉ dựa trên khoảng 27% review.
- Do lấy mẫu 15%, gần như mỗi người dùng chỉ có 1 review (102.358 người dùng / 104.777 review), nên phân tích theo người dùng còn yếu.
- Lịch `@daily` **tải lại 134 MB mỗi ngày** vào phân vùng `ingest_date` mới, nên raw tăng dần; chưa có chính sách dọn dữ liệu cũ (tắt lịch được trong Portal).
- Lịch sử sự kiện realtime của Portal chỉ lưu trong bộ nhớ, mất khi Portal khởi động lại.
- Portal tải Chart.js từ CDN, nên cần Internet. Portal chạy uvicorn `--reload` (chế độ dev).
- Tài khoản đều là mặc định local (xem §3), cần đổi nếu đưa lên môi trường thật.
- BiLSTM: train CPU lâu (~77 phút), quá khớp sau epoch 2, Precision lớp Trung tính thấp (0,228).
- Lemmatizer WordNet đôi khi cắt sai (ví dụ *hoping* thành *hop*), ảnh hưởng nhẹ tới TF-IDF.

---

## 16. Môi trường máy đang dùng

- Windows 11 Home, Intel i5-13420H, 15,7 GB RAM; Docker Desktop 29.7.2 (WSL2, giới hạn 7,6 GB); Python 3.14 và Node 24 trên máy.
- Thư mục cha `D:\khovskhaiphadulieu\` chứa các bài thực hành khác. Có **container cũ đang dừng** từ bài thực hành (`minio`, `postgres`, `superset`, `minio-init`, `kafka`, `rabbitmq`) **trùng cổng** 9000/9001/5432 với dự án này. Đừng bật cùng lúc, và không xóa chúng (thuộc bài khác).
- Đã tìm trên toàn máy ngày 2026-10-21: **không có** DAG Airflow, code crawl hay cấu hình Metabase nào khác của nhóm. Nếu nhóm có code ở máy thành viên khác, cần ghép vào `pipeline/amz/` và DAG hiện có.

---

## 17. Việc cần làm tiếp (theo thứ tự ưu tiên)

1. ⬜ **Nhóm tự điền** trong `BaoCao_DoAn.docx`: tên trường, khoa, GVHD, thành viên + MSSV trên bìa; Bảng C.1 phân công.
2. ⬜ (Tùy chọn) Cải thiện mô hình: embedding tiền huấn luyện (GloVe/fastText) hoặc DistilBERT trên GPU; LinearSVC; chỉnh ngưỡng/trọng số lớp cho lớp Trung tính.
3. ⬜ (Tùy chọn) Nạp tăng dần (incremental), thêm danh mục, dọn raw cũ, thêm Metabase nếu được yêu cầu.

---

## 18. Nhật ký thay đổi (mới nhất ở trên)

### 2026-10-22
- Chạy lại dự án theo yêu cầu: 4 container `amz-*` hoạt động, health OK; kích hoạt DAG `manual__2026-10-21T18:03:51` từ Portal → **8/8 task thành công** (extract bỏ qua tải lại vì container dùng giờ UTC nên vẫn là ngày nạp 2026-10-21; transform 13 s, load 6,3 s, train_baselines 74 s, score_reviews 97 s). Số liệu không đổi: 104.777 review; Macro-F1 NB 0,6506 / LR 0,6595 / BiLSTM 0,6492.
- Bật lại hệ thống; upload `notebooks/lstm_metrics.json` lên `curated/models/lstm/metrics.json` qua Portal → tab Khai phá hiển thị đủ 3 mô hình. Chụp lại hình so sánh mô hình, ma trận nhầm lẫn (3 mô hình) và thêm hình quá trình huấn luyện BiLSTM.
- Cập nhật `BaoCao_DoAn.docx` (32 trang): điền kết quả BiLSTM vào Bảng 7.3, 7.4, 9.1; thêm Hình 7.3 (loss theo epoch), phân tích ma trận nhầm lẫn BiLSTM, mục **7.7 Thảo luận học máy so với học sâu**, cập nhật Kết luận, Hạn chế, Hướng phát triển; sửa các chỗ ghi "Colab GPU" cho đúng thực tế (train trên CPU máy). Không còn ô `[bổ sung]`.
- Đánh dấu hoàn thành mọi hạng mục kỹ thuật; còn lại thông tin nhóm trên bìa do nhóm tự điền.

### 2026-10-21
- **Train BiLSTM đầy đủ** bằng TensorFlow 2.21 CPU trong container (code notebook, QUICK_TEST=False): 75.438 mẫu train, dừng sớm sau 4 epoch, 76,8 phút. Test (20.956 mẫu): Accuracy 0,7566, Macro-P 0,6559, Macro-R 0,7248, **Macro-F1 0,6492**, F1 weighted 0,7971; F1 theo lớp: tiêu cực 0,742, **trung tính 0,342** (cao nhất trong 3 mô hình), tích cực 0,865. Nhận xét: Macro-F1 ngang NB, thấp hơn LR một chút; recall cao hơn nhưng accuracy thấp hơn do đẩy nhiều mẫu sang lớp thiểu số. Lưu ở `notebooks/lstm_metrics.json`. Tạo `detai_capnhat.docx` (đề tài cập nhật, giữ định dạng gốc). Bỏ việc làm slide theo yêu cầu người dùng.
- Viết báo cáo `BaoCao_DoAn.docx` (31 trang): bìa, mục lục tự động, 9 chương (tổng quan, lý thuyết, dữ liệu, kiến trúc, ETL, OLAP, khai phá, portal, đánh giá), kết luận, 10 tài liệu tham khảo, phụ lục; 14 hình chụp từ Portal + sơ đồ kiến trúc. Dựng bằng `baocao/build.js`; Word cập nhật mục lục. Sửa thêm Portal: tiêu đề cột số trong kết quả SQL căn phải. Đánh giá độ hoàn thiện: phần kỹ thuật khoảng 90%, toàn đồ án khoảng 80%.
- Viết `huongdanchay.md`: 6 bước chạy trên Windows, bảng xử lý lỗi, cách tùy chỉnh. Chạy lại hệ thống và kích hoạt DAG `manual__2026-10-21T03:21:51` từ Portal → **8/8 task thành công**. Extract bỏ qua tải lại vì trong ngày đã có file (mỗi task khoảng 1,5 s); transform 11,6 s, load 6,1 s, train_baselines 69 s, score_reviews 99 s. Số liệu kho và mô hình không đổi (104.777 review; Macro-F1 NB 0,6506 / LR 0,6595).
- Tạo `agent.md` (file này) và `CLAUDE.md` (Claude Code tự nạp agent.md, kèm quy tắc cập nhật).
- Kiểm thử dựng lại từ đầu (`docker compose down -v` rồi `up -d --build`): DAG tự chạy, **8/8 task thành công ngay lần đầu, khoảng 4 phút 20 giây**, số liệu trùng khớp lần chạy trước.
- Viết `README.md`: cách chạy, hướng dẫn MinIO (khái niệm, Console, `mc`, Python SDK), pipeline, kho, LSTM, xử lý sự cố.
- Viết notebook LSTM, chạy thử bằng TensorFlow CPU trong container (QUICK_TEST); kiểm tra cách Portal hiển thị LSTM rồi xóa file chạy thử.
- Viết Portal 5 tab (FastAPI + Chart.js): realtime Data Lake qua MinIO notification và SSE; điều khiển và xem log Airflow; dashboard kho và SQL chỉ đọc; dashboard khai phá. Sửa các lỗi hiển thị: đường nối sơ đồ DAG bị vẽ nhầm vào icon SVG, nhãn trục bị ẩn, định dạng năm "2.001", thẻ `<br>` trong review.
- Viết pipeline `pipeline/amz/` và DAG. Sửa 2 lỗi: (1) **race condition khi tạo bucket** do 3 task extract chạy song song (bỏ qua lỗi `BucketAlreadyOwnedByYou`); (2) `merge_asof` lỗi vì cột `year` int32 khác int64.
- Dựng hạ tầng Docker Compose: MinIO (`pgsty/minio`, vì image chính thức đã bị gỡ), PostgreSQL 16, Airflow 3.3.2, Portal. Đổi tên container thành `amz-*` để không trùng với container cũ.
- Đánh giá đề tài và đưa ra góp ý (§1.2); thống nhất thêm nguồn World Bank và dùng MinIO làm Data Lake.
