# Quy tắc làm việc cho AI agent trong dự án này

- Trả lời người dùng bằng **tiếng Việt**.
- `agent.md` là **nguồn sự thật duy nhất** về dự án: mô tả toàn bộ hệ thống, số liệu và tiến độ. Nội dung của nó được nạp ở cuối file này, nên hãy đọc trước khi làm việc.
- Nếu `agent.md` không tồn tại hoặc bị trống: đọc toàn bộ dự án (code, cấu hình, `README.md`, `detai.docx`), sau đó tạo lại `agent.md` với đủ các mục: cách dùng file, dự án là gì, tiến độ, kiến trúc, cấu trúc thư mục, dữ liệu, data lake, pipeline, tiền xử lý, kho dữ liệu, khai phá, LSTM, portal, cách chạy, quyết định thiết kế, hạn chế, môi trường, việc cần làm tiếp, nhật ký thay đổi.
- **Cập nhật `agent.md` ngay trong phiên làm việc** mỗi khi có thay đổi đáng kể: thêm/sửa/xóa file hoặc tính năng, chạy pipeline có số liệu mới, huấn luyện mô hình, ra quyết định thiết kế, phát hiện hoặc sửa lỗi, đổi cấu hình. Lần nào cũng phải sửa:
  - dòng *Cập nhật lần cuối*,
  - mục **Tiến độ**, **Việc cần làm tiếp**, **Nhật ký thay đổi** (ngày `YYYY-MM-DD`, mới nhất ở trên),
  - và các mục chi tiết bị ảnh hưởng.
- Chỉ ghi số liệu đã chạy hoặc đo thật; chưa chạy thì ghi "chưa chạy". Giữ `agent.md` tự đứng được, vì người dùng sẽ gửi riêng file này cho bạn cùng nhóm hoặc chatbot trên web.
- Container cũ `minio`/`postgres`/`superset` thuộc bài thực hành khác: không xóa. Dự án này dùng container tên `amz-*`.

@agent.md
