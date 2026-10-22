# Hướng dẫn chạy dự án (từng bước)

Dành cho thành viên nhóm chạy dự án lần đầu trên máy Windows. Làm lần lượt từ bước 1 đến bước 6; tổng cộng khoảng 15 phút (phần lớn là chờ tải image).

---

## Bước 1. Chuẩn bị máy

| Cần có | Cách kiểm tra | Ghi chú |
|---|---|---|
| **Docker Desktop** (đã bật WSL2) | Mở PowerShell, gõ `docker --version` | Tải ở https://www.docker.com/products/docker-desktop |
| RAM trống khoảng 4 GB | Task Manager → Performance | Cả hệ thống dùng khoảng 3 GB lúc cao điểm |
| Ổ đĩa trống khoảng 6 GB | | Riêng image Airflow chiếm 3,4 GB |
| Internet | | Để tải image và khoảng 134 MB dữ liệu Amazon |

**Mở Docker Desktop và chờ đến khi biểu tượng cá voi báo "Engine running".** Kiểm tra lại:

```powershell
docker info --format "{{.ServerVersion}}"
```

Nếu in ra số phiên bản (ví dụ `29.7.2`) là được. Nếu báo lỗi `failed to connect to the docker API` thì Docker Desktop chưa bật xong.

---

## Bước 2. Mở thư mục dự án

```powershell
cd D:\khovskhaiphadulieu\cuoiki
```

Thư mục phải có các file `docker-compose.yml`, `.env`, cùng các thư mục `airflow/`, `pipeline/`, `portal/`, `sql/`.

> Nếu bạn nhận dự án dưới dạng file nén từ bạn cùng nhóm, hãy giải nén ra một thư mục **không có dấu tiếng Việt và khoảng trắng** trong đường dẫn, rồi `cd` vào đó.

---

## Bước 3. Khởi động hệ thống

```powershell
docker compose up -d --build
```

- **Lần đầu** mất khoảng 5–10 phút để tải và build image. Những lần sau chỉ mất vài giây.
- Khi chạy xong, kiểm tra bằng lệnh:

```powershell
docker compose ps
```

Kết quả đúng là có 4 container đều ở trạng thái `Up`, trong đó `amz-minio` và `amz-postgres` có thêm `(healthy)`:

```
amz-airflow    Up ...
amz-minio      Up ... (healthy)
amz-portal     Up ...
amz-postgres   Up ... (healthy)
```

> **Airflow cần thêm khoảng 1–2 phút** sau khi `Up` mới sẵn sàng. Trong lúc đó Portal có thể báo Airflow "lỗi"; đó là bình thường.

---

## Bước 4. Mở giao diện

| Mở trên trình duyệt | Dùng để | Đăng nhập |
|---|---|---|
| **http://localhost:8000** | **Portal: dùng chính, đủ mọi thứ** | không cần |
| http://localhost:8080 | Airflow UI (khi cần xem sâu) | `admin` / `admin` |
| http://localhost:9001 | MinIO Console (khi cần xem sâu) | `minioadmin` / `minioadmin123` |

Trên thanh trên cùng của Portal, ba mục **MinIO, PostgreSQL, Airflow** phải hiện ✓ **hoạt động**.

---

## Bước 5. Chạy pipeline

Ở lần khởi động đầu tiên, **DAG tự chạy một lần**. Muốn chạy lại thì:

1. Portal → tab **Pipeline** → bấm **▶ Chạy ngay**.
2. Theo dõi trên sơ đồ tác vụ: ô chuyển dần từ *Chưa chạy* sang *Đang chạy* rồi *Thành công*. Toàn bộ mất khoảng **2–4 phút**; lần đầu lâu hơn vì phải tải dữ liệu.
3. Bấm vào một ô tác vụ bất kỳ để xem **log** và **kết quả trả về (XCom)**.

Cùng lúc đó, bạn có thể xem kết quả ở các tab khác:

| Tab | Thấy gì |
|---|---|
| **Data Lake** | File mới hiện ngay trong khung *Sự kiện realtime* (raw → staging → curated). Bấm vào file để xem trước nội dung |
| **Kho dữ liệu** | Lược đồ hình sao, các biểu đồ OLAP, ô SQL (bấm một truy vấn mẫu để chạy thử) |
| **Khai phá dữ liệu** | So sánh Naive Bayes và Logistic Regression, ma trận nhầm lẫn, từ khóa quyết định, review bị dự đoán sai |
| **Tổng quan** | Tóm tắt toàn bộ hệ thống và báo cáo chất lượng dữ liệu |

**Kết quả đúng** sau khi chạy xong: kho có **104.777 review**; Logistic Regression đạt Macro-F1 khoảng **0,660**, Naive Bayes khoảng **0,651**.

---

## Bước 6 (khi cần). Huấn luyện LSTM trên Google Colab

1. Portal → **Data Lake** → bấm bucket **curated** → bấm file `ml/All_Beauty/sentiment_dataset.parquet` → **Tải về**.
2. Vào https://colab.research.google.com → *File → Upload notebook* → chọn `notebooks/train_lstm_colab.ipynb`.
3. *Runtime → Change runtime type* → chọn **GPU** (T4).
4. *Runtime → Run all* → khi notebook hỏi, chọn file `sentiment_dataset.parquet` vừa tải.
5. Chạy xong (ước tính 5–10 phút trên GPU; chưa đo thực tế), trình duyệt tự tải về file **`metrics.json`**.
6. Portal → **Data Lake** → khung **Tải file lên Data Lake**: Bucket = `curated`, Thư mục = `models/lstm`, chọn `metrics.json` → **Tải lên**.
7. Mở tab **Khai phá dữ liệu**: LSTM xuất hiện bên cạnh hai mô hình ML.

> Trong notebook, giữ `QUICK_TEST = False`. Nếu bật `True` (chạy thử nhanh), Portal sẽ gắn nhãn "(chạy thử)" và kết quả đó **không dùng để báo cáo** được.

---

## Dừng và chạy lại

```powershell
docker compose stop        # dừng, GIỮ dữ liệu (lần sau: docker compose start)
docker compose start       # bật lại
docker compose down        # xóa container, GIỮ dữ liệu
docker compose down -v     # xóa SẠCH cả dữ liệu MinIO + PostgreSQL (phải chạy lại pipeline)
```

DAG tự chạy **mỗi ngày lúc 07:00** (giờ Việt Nam) nếu máy đang bật. Muốn tắt: Portal → **Pipeline** → gạt công tắc **"Đang bật lịch"**.

---

## Gặp lỗi thì làm gì

| Hiện tượng | Cách xử lý |
|---|---|
| `failed to connect to the docker API` | Docker Desktop chưa bật hoặc chưa khởi động xong. Mở nó và chờ |
| `port is already allocated` (cổng 9000, 9001, 5432, 8000 hoặc 8080) | Có chương trình khác đang chiếm cổng. Trên máy này thường là container cũ của bài thực hành: `docker stop minio postgres superset` |
| `container name ... is already in use` | Dự án dùng tên `amz-*`; chạy `docker compose down` rồi `docker compose up -d` |
| Portal báo **Airflow lỗi** | Chờ 1–2 phút. Vẫn lỗi thì xem log: `docker logs --tail 50 amz-airflow` |
| Một tác vụ màu đỏ (**Thất bại**) | Portal → Pipeline → bấm vào ô đỏ để đọc lỗi trong log. Lỗi mạng khi tải dữ liệu thì chỉ cần **Chạy ngay** lại |
| Tab Kho dữ liệu hoặc Khai phá báo "chưa có dữ liệu" | Pipeline chưa chạy xong; chờ hoặc bấm **Chạy ngay** |
| Biểu đồ không hiện | Portal tải thư viện vẽ biểu đồ từ Internet; kiểm tra mạng rồi tải lại trang (F5) |
| Muốn làm lại từ đầu | `docker compose down -v` rồi `docker compose up -d --build` |

---

## Tùy chỉnh (không bắt buộc)

Sửa file `.env` rồi chạy `docker compose up -d`, sau đó **Chạy ngay** pipeline:

- `AMZ_CATEGORY=All_Beauty`: đổi danh mục sản phẩm, ví dụ `Video_Games`, `Gift_Cards`. Tên danh mục phải đúng như trên trang Amazon Reviews 2023.
- `SAMPLE_FRAC=0.15`: tỷ lệ review được lấy mẫu. Tăng lên thì nhiều dữ liệu hơn nhưng chạy lâu hơn và tốn RAM hơn.

Chi tiết kỹ thuật (MinIO, pipeline, kho, mô hình) xem trong `README.md` và `agent.md`.
