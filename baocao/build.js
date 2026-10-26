// Sinh báo cáo đồ án (.docx) bằng thư viện docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, PageBreak, Footer, PageNumber, TableOfContents,
  LevelFormat, VerticalAlign,
} = require("docx");

const IMG = path.join(__dirname, "img");
const OUT = process.argv[2];
const FONT = "Times New Roman";
const CONTENT_W = 9072; // A4 rộng 11906 - lề trái 1701 (3cm) - lề phải 1134 (2cm) ≈ 9071 DXA

// ------------------------------------------------------------------ helpers
function runs(text, base = {}) {
  // **đậm**, `mã`, _nghiêng_
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|~[^~]+~)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: (base.size || 26) - 4, ...base, ...{ font: "Consolas" } }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, opts = {}) => new Paragraph({
  children: runs(text), alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: 120, line: 312 }, indent: opts.noIndent ? undefined : { firstLine: 567 }, ...opts.p,
});
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const bullets = (items, level = 0) => items.map((t) => new Paragraph({
  numbering: { reference: "bullets", level }, children: runs(t), alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 60, line: 300 },
}));
const numbered = (items, ref = "num1") => items.map((t) => new Paragraph({
  numbering: { reference: ref, level: 0 }, children: runs(t), alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 60, line: 300 },
}));
const code = (lines) => lines.split("\n").map((l, i, a) => new Paragraph({
  children: [new TextRun({ text: l || " ", font: "Consolas", size: 18 })],
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F2EE" },
  spacing: { before: i === 0 ? 60 : 0, after: i === a.length - 1 ? 160 : 0, line: 260 },
  indent: { left: 200, right: 200 },
}));
const caption = (t, before = false) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: before ? { before: 160, after: 80 } : { before: 60, after: 240 },
  children: [new TextRun({ text: t, italics: true, size: 22 })],
});
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}
function figure(name, cap, maxW = 600) {
  const { w, h, data } = pngSize(path.join(IMG, name + ".png"));
  const width = Math.min(maxW, 600), height = Math.round((h / w) * width);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 },
      children: [new ImageRun({ type: "png", data, transformation: { width, height } })] }),
    caption(cap),
  ];
}
const border = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" };
const borders = { top: border, bottom: border, left: border, right: border };
function table(cap, headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map((x) => Math.round((x / total) * CONTENT_W));
  ws[ws.length - 1] += CONTENT_W - ws.reduce((a, b) => a + b, 0);
  const cell = (t, i, head) => new TableCell({
    width: { size: ws[i], type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "DCE6F2" } : undefined,
    children: String(t).split("\n").map((line) => new Paragraph({
      spacing: { after: 0, line: 264 },
      alignment: /^[-+−]?[\d.,]+%?$/.test(line.replace(/\*\*/g, "").trim()) && !head ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: runs(line, { size: 22, ...(head ? { bold: true } : {}) }),
    })),
  });
  return [
    caption(cap, true),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: ws,
      rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}
const center = (t, size, bold = false, after = 120) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after },
  children: [new TextRun({ text: t, size, bold })],
});

// ------------------------------------------------------------------ bìa
const cover = [
  center("[TÊN TRƯỜNG ĐẠI HỌC]", 28, true, 60),
  center("[TÊN KHOA]", 28, true, 60),
  center("──────────────", 26, false, 1400),
  center("BÁO CÁO ĐỒ ÁN CUỐI KỲ", 36, true, 200),
  center("Môn học: Kho dữ liệu và Khai phá dữ liệu", 28, false, 600),
  center("ĐỀ TÀI", 28, true, 120),
  center("XÂY DỰNG DATA PIPELINE ĐA NGUỒN VÀ ỨNG DỤNG", 32, true, 60),
  center("HỌC MÁY / HỌC SÂU TRONG KHAI PHÁ CẢM XÚC", 32, true, 60),
  center("ĐÁNH GIÁ SẢN PHẨM THƯƠNG MẠI ĐIỆN TỬ", 32, true, 1200),
  new Paragraph({ indent: { left: 2600 }, spacing: { after: 100 }, children: runs("**Giảng viên hướng dẫn:** [Họ và tên]", { size: 26 }) }),
  new Paragraph({ indent: { left: 2600 }, spacing: { after: 100 }, children: runs("**Nhóm thực hiện:** [Tên nhóm]", { size: 26 }) }),
  new Paragraph({ indent: { left: 2600 }, spacing: { after: 100 }, children: runs("[Họ tên – MSSV thành viên 1]", { size: 26 }) }),
  new Paragraph({ indent: { left: 2600 }, spacing: { after: 100 }, children: runs("[Họ tên – MSSV thành viên 2]", { size: 26 }) }),
  new Paragraph({ indent: { left: 2600 }, spacing: { after: 1600 }, children: runs("[Họ tên – MSSV thành viên 3]", { size: 26 }) }),
  center("[Địa điểm], tháng 10 năm 2026", 26, false, 0),
];

// ------------------------------------------------------------------ nội dung
const body = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: "MỤC LỤC", bold: true, size: 32 })] }),
  new TableOfContents("Mục lục", { hyperlink: true, headingStyleRange: "1-3" }),

  // ---------------- Danh mục viết tắt
  H1("DANH MỤC TỪ VIẾT TẮT"),
  ...table("Bảng 0.1. Các từ viết tắt", ["Viết tắt", "Diễn giải"], [
    ["ETL", "Extract – Transform – Load (Trích xuất – Biến đổi – Tải)"],
    ["DAG", "Directed Acyclic Graph – đồ thị tác vụ có hướng không chu trình (Airflow)"],
    ["DW", "Data Warehouse – Kho dữ liệu"],
    ["OLAP", "Online Analytical Processing – xử lý phân tích trực tuyến"],
    ["NLP", "Natural Language Processing – xử lý ngôn ngữ tự nhiên"],
    ["TF-IDF", "Term Frequency – Inverse Document Frequency"],
    ["NB / LR", "Naive Bayes / Logistic Regression"],
    ["LSTM / BiLSTM", "Long Short-Term Memory / LSTM hai chiều"],
    ["OOF", "Out-of-fold – dự đoán trên phần dữ liệu mô hình không được huấn luyện"],
    ["SSE", "Server-Sent Events – cơ chế đẩy sự kiện từ máy chủ tới trình duyệt"],
    ["S3", "Simple Storage Service – giao thức lưu trữ đối tượng (MinIO tương thích)"],
  ], [2, 7]),

  // ================================================================ CHƯƠNG 1
  H1("CHƯƠNG 1. TỔNG QUAN ĐỀ TÀI"),
  H2("1.1. Bối cảnh và lý do chọn đề tài"),
  P("Thương mại điện tử tạo ra khối lượng lớn đánh giá (review) của người mua. Mỗi review gồm điểm số có cấu trúc (1–5 sao) và nội dung văn bản tự do, phi cấu trúc. Văn bản này chứa thông tin về trải nghiệm thực tế mà con số đánh giá không thể hiện hết. Việc tự động nhận diện cảm xúc (tích cực, trung tính, tiêu cực) giúp doanh nghiệp theo dõi chất lượng sản phẩm, phát hiện vấn đề sớm và hỗ trợ ra quyết định."),
  P("Để khai thác dữ liệu này một cách đáng tin cậy, cần hai thành phần. Thứ nhất là một **hạ tầng dữ liệu**: thu thập từ nhiều nguồn, lưu trữ dữ liệu gốc, làm sạch, tích hợp và tổ chức thành kho dữ liệu phục vụ phân tích. Thứ hai là các **mô hình khai phá**: học máy và học sâu để phân loại cảm xúc. Đề tài kết hợp cả hai, bám sát nội dung môn Kho dữ liệu và Khai phá dữ liệu."),
  H2("1.2. Mục tiêu"),
  ...bullets([
    "Xây dựng **data pipeline đa nguồn** tự động: thu thập 3 nguồn độc lập (review, metadata sản phẩm, tỷ giá USD→VND), lưu dữ liệu gốc vào **Data Lake** (MinIO), làm sạch, tích hợp rồi nạp vào **kho dữ liệu** (PostgreSQL) theo lược đồ hình sao.",
    "Điều phối toàn bộ quy trình bằng **Apache Airflow**, có lịch chạy, cơ chế thử lại và theo dõi trạng thái từng tác vụ.",
    "Khai thác kho bằng các **truy vấn OLAP** (roll-up, drill-down, slice, dice) và biểu đồ phân tích.",
    "Huấn luyện và so sánh mô hình **học máy** (Naive Bayes, Logistic Regression) với mô hình **học sâu** (LSTM) cho bài toán phân loại cảm xúc 3 lớp.",
    "Xây dựng **giao diện tổng hợp (Portal)** quản lý tập trung: Data Lake theo thời gian thực, pipeline, dashboard kho dữ liệu và kết quả khai phá.",
  ]),
  H2("1.3. Phạm vi"),
  ...bullets([
    "Dữ liệu: bộ **Amazon Reviews 2023** (McAuley Lab, UCSD), **toàn bộ danh mục All_Beauty** (701.528 review gốc, 112.590 sản phẩm); cùng chuỗi tỷ giá năm từ World Bank. Giai đoạn phát triển dùng mẫu 15% để thử nghiệm nhanh; bản cuối chạy 100%.",
    "Ngôn ngữ văn bản: tiếng Anh (ngôn ngữ của bộ dữ liệu).",
    "Triển khai: chạy cục bộ bằng Docker Compose; mô hình BiLSTM huấn luyện bằng notebook TensorFlow trên Google Colab (GPU T4).",
  ]),
  H2("1.4. Kết quả chính đạt được"),
  ...bullets([
    "Hệ thống chạy trọn vẹn từ nguồn dữ liệu đến dashboard; kiểm thử dựng lại từ đầu: **8/8 tác vụ thành công**. Với toàn bộ dữ liệu, một lần chạy pipeline mất khoảng 10 phút.",
    "Kho dữ liệu chứa **691.806 review**, 112.385 sản phẩm, 629.831 người dùng, giai đoạn 2000–2023.",
    "Mô hình tốt nhất là **BiLSTM** với **Macro-F1 = 0,706**, Accuracy = 82,6% trên 138.362 mẫu kiểm thử, vượt Logistic Regression (0,673) và Naive Bayes (0,648). Với mẫu 15%, thứ tự ngược lại (Logistic Regression tốt nhất), cho thấy học sâu cần nhiều dữ liệu.",
    "Portal 5 tab tích hợp MinIO, Airflow và PostgreSQL trong một giao diện; sự kiện Data Lake hiển thị theo thời gian thực.",
  ]),
  H2("1.5. Cấu trúc báo cáo"),
  P("Chương 2 trình bày cơ sở lý thuyết. Chương 3 mô tả dữ liệu. Chương 4 trình bày kiến trúc và triển khai hệ thống. Chương 5 đi sâu vào quy trình ETL. Chương 6 khai thác kho dữ liệu bằng OLAP. Chương 7 trình bày phần khai phá dữ liệu và kết quả mô hình. Chương 8 giới thiệu Portal tổng hợp. Chương 9 đánh giá mức độ hoàn thành, hạn chế và hướng phát triển."),

  // ================================================================ CHƯƠNG 2
  H1("CHƯƠNG 2. CƠ SỞ LÝ THUYẾT"),
  H2("2.1. Data Lake và phân vùng dữ liệu"),
  P("**Data Lake** là kho lưu trữ dữ liệu ở dạng nguyên bản, chấp nhận mọi cấu trúc (có cấu trúc, bán cấu trúc, phi cấu trúc), thường xây dựng trên lưu trữ đối tượng (object storage) như Amazon S3. Dữ liệu được tổ chức thành các **vùng (zone)** theo mức độ xử lý:"),
  ...bullets([
    "**Raw zone**: dữ liệu gốc, không chỉnh sửa, bảo đảm tính toàn vẹn và cho phép xử lý lại khi cần.",
    "**Staging zone**: dữ liệu đã làm sạch, chuẩn hóa định dạng, tích hợp.",
    "**Curated zone**: dữ liệu sẵn sàng cho mục đích sử dụng cụ thể (tập huấn luyện mô hình, kết quả phân tích).",
  ]),
  P("**MinIO** là hệ thống lưu trữ đối tượng mã nguồn mở, tương thích giao thức S3. Dữ liệu được tổ chức theo **bucket** (thùng chứa) và **object** (tệp) với **key** dạng đường dẫn; dấu `/` trong key tạo ra cấu trúc thư mục logic (prefix). MinIO hỗ trợ **Bucket Notification**: phát sự kiện khi object được tạo hoặc xóa, cho phép theo dõi Data Lake theo thời gian thực."),
  H2("2.2. Kho dữ liệu, ETL và lược đồ hình sao"),
  P("**Kho dữ liệu** là cơ sở dữ liệu hướng chủ đề, tích hợp, ổn định theo thời gian, phục vụ phân tích và ra quyết định. Dữ liệu được đưa vào kho qua quy trình **ETL**: ~Extract~ (trích xuất từ nguồn), ~Transform~ (làm sạch, chuẩn hóa, tích hợp) và ~Load~ (nạp vào kho)."),
  P("**Lược đồ hình sao (Star Schema)** theo phương pháp Kimball gồm một **bảng sự kiện (fact)** ở trung tâm, chứa các độ đo định lượng và khóa ngoại, liên kết tới các **bảng chiều (dimension)** mô tả ngữ cảnh (sản phẩm, người dùng, thời gian). Lược đồ này đơn giản, ít phép nối, tối ưu cho truy vấn tổng hợp."),
  P("Các phép toán **OLAP** cơ bản: **Roll-up** (gộp lên mức tổng hợp cao hơn, ví dụ quý → năm), **Drill-down** (đi xuống mức chi tiết hơn, ví dụ năm → tháng), **Slice** (cố định một chiều, ví dụ chỉ năm 2022) và **Dice** (chọn khối con theo nhiều chiều, ví dụ phân khúc giá × nhãn cảm xúc)."),
  H2("2.3. Điều phối luồng dữ liệu với Apache Airflow"),
  P("**Apache Airflow** mô tả quy trình xử lý dưới dạng **DAG**: đồ thị có hướng không chu trình, mỗi nút là một tác vụ (task), cạnh biểu diễn quan hệ phụ thuộc. Airflow lập lịch chạy, thực thi song song các tác vụ độc lập, tự thử lại khi lỗi, lưu log và cho phép các tác vụ trao đổi kết quả nhỏ qua **XCom**. Phiên bản 3 cung cấp REST API (v2) dùng để tích hợp với hệ thống bên ngoài."),
  H2("2.4. Tiền xử lý văn bản và TF-IDF"),
  P("Văn bản cần được chuẩn hóa trước khi đưa vào mô hình: chuyển chữ thường, loại bỏ HTML, URL và dấu câu; **tách từ (tokenization)**; loại bỏ **từ dừng (stopword)**, tức những từ xuất hiện nhiều nhưng ít mang nghĩa; và **lemmatization**, đưa từ về dạng gốc (ví dụ ~returned~ → ~return~). Với bài toán cảm xúc, cần **giữ lại từ phủ định** (not, no, never…), vì việc loại bỏ chúng làm đảo nghĩa câu (\"not good\" thành \"good\")."),
  P("**TF-IDF** biểu diễn văn bản thành vector, trong đó trọng số của từ t trong văn bản d là tf(t, d) × idf(t), với idf(t) = log(N / df(t)): N là số văn bản, df(t) là số văn bản chứa t. Từ xuất hiện nhiều trong một văn bản nhưng hiếm trong toàn bộ tập sẽ có trọng số cao. Đề tài dùng thêm n-gram (1–2) để bắt được cụm như \"not worth\"."),
  H2("2.5. Các mô hình phân loại"),
  ...bullets([
    "**Naive Bayes đa thức (Multinomial NB)**: mô hình xác suất dựa trên định lý Bayes với giả định độc lập có điều kiện giữa các đặc trưng; nhanh, phù hợp làm mốc cơ sở (baseline) cho phân loại văn bản.",
    "**Logistic Regression** (đa lớp): mô hình tuyến tính ước lượng xác suất mỗi lớp qua hàm softmax; hệ số của từng từ cho biết mức độ đóng góp vào mỗi lớp, nên dễ diễn giải.",
    "**LSTM**: mạng nơ-ron hồi quy có các cổng (quên, vào, ra) giúp ghi nhớ phụ thuộc dài trong chuỗi, xử lý được thứ tự từ và ngữ cảnh. **BiLSTM** đọc chuỗi theo cả hai chiều. Đầu vào là chuỗi chỉ số từ qua lớp **Word Embedding** (vector dày học được).",
  ]),
  H2("2.6. Độ đo đánh giá"),
  P("Với mỗi lớp: Precision = TP / (TP + FP), Recall = TP / (TP + FN), F1 = 2 × Precision × Recall / (Precision + Recall). **Macro-F1** là trung bình F1 của các lớp với trọng số bằng nhau, phản ánh đúng chất lượng trên các lớp thiểu số. **Weighted-F1** lấy trọng số theo số mẫu mỗi lớp. **Ma trận nhầm lẫn** (confusion matrix) thể hiện số mẫu của từng cặp (nhãn thật, nhãn dự đoán)."),
  P("Khi dữ liệu **mất cân bằng lớp** (đề tài: 71% tích cực), Accuracy có thể cao dù mô hình bỏ quên lớp thiểu số. Do đó đề tài dùng **Macro-F1 làm chỉ số chính**, chia tập có **phân tầng (stratify)** và gán **trọng số lớp cân bằng** (class_weight = balanced). Để chấm điểm cảm xúc cho toàn bộ dữ liệu mà không rò rỉ, đề tài dùng **dự đoán out-of-fold** qua kiểm định chéo 5-fold: mỗi review được chấm bởi mô hình không được huấn luyện trên chính nó."),

  // ================================================================ CHƯƠNG 3
  H1("CHƯƠNG 3. DỮ LIỆU"),
  H2("3.1. Tổng quan các nguồn dữ liệu"),
  P("Hệ thống tích hợp **ba nguồn độc lập**, khác nhau về đơn vị cung cấp, phương thức thu thập và cấu trúc:"),
  ...table("Bảng 3.1. Ba nguồn dữ liệu của hệ thống", ["#", "Nguồn", "Phương thức", "Định dạng", "Quy mô"], [
    ["1", "Amazon Reviews 2023 – User Reviews (All_Beauty)", "Tải file qua HTTP (stream)", ".jsonl.gz – bán cấu trúc", "701.528 review, 90,1 MB nén"],
    ["2", "Amazon Reviews 2023 – Item Metadata (All_Beauty)", "Tải file qua HTTP (stream)", ".jsonl.gz – bán cấu trúc", "112.590 sản phẩm, 38,0 MB nén"],
    ["3", "World Bank API – chỉ số PA.NUS.FCRF", "Gọi REST API", "JSON", "Tỷ giá VND/USD theo năm, 1995–2024"],
  ], [0.4, 3.2, 2, 2, 2.6]),
  H2("3.2. Nguồn 1 – Đánh giá người dùng (dữ liệu động)"),
  ...table("Bảng 3.2. Các trường được sử dụng từ nguồn 1", ["Trường", "Kiểu", "Ý nghĩa"], [
    ["rating", "số thực 1–5", "Điểm đánh giá – dùng để gán nhãn cảm xúc"],
    ["title, text", "văn bản", "Tiêu đề và nội dung review (dữ liệu phi cấu trúc)"],
    ["parent_asin", "chuỗi", "Mã sản phẩm – khóa tích hợp với nguồn 2"],
    ["user_id", "chuỗi", "Mã người dùng"],
    ["timestamp", "số nguyên (ms)", "Thời điểm đánh giá – sinh chiều thời gian"],
    ["helpful_vote, verified_purchase", "số, logic", "Số lượt hữu ích, đã xác thực mua hàng"],
  ], [3, 2, 5]),
  H2("3.3. Nguồn 2 – Siêu dữ liệu sản phẩm (dữ liệu tĩnh)"),
  P("Các trường dùng: `parent_asin`, `title`, `main_category`, `categories`, `store`, `details`, `price`, `average_rating`, `rating_number`. Trong bản 2023, **thương hiệu không phải trường cấp 1** mà nằm trong `details.Brand` hoặc suy ra từ `store`; trường `price` thường rỗng (84,28% sản phẩm không có giá)."),
  H2("3.4. Nguồn 3 – Tỷ giá USD→VND (World Bank)"),
  P("Chỉ số ~Official exchange rate (LCU per US$, period average)~ cho Việt Nam, trả về dạng JSON theo năm. Tỷ giá được dùng để quy đổi giá sản phẩm sang VND và gắn vào chiều thời gian, phục vụ phân tích theo bối cảnh Việt Nam. Ví dụ năm 2023: 23.787,32 VND/USD."),
  H2("3.5. Đặc tả đa cấu trúc"),
  P("Dữ liệu gốc ở dạng **bán cấu trúc** (JSON Lines, JSON). Sau xử lý, hệ thống tách thành dữ liệu **có cấu trúc** (rating, giá, thương hiệu, thời gian – nạp vào các bảng của kho) và dữ liệu **phi cấu trúc** (văn bản review – lưu ở bảng `review_text` và dùng cho NLP)."),
  H2("3.6. Quy mô dữ liệu và lấy mẫu"),
  P("Toàn bộ Amazon Reviews 2023 có khoảng 571 triệu review, vượt quá khả năng xử lý của máy cá nhân, nên đề tài chọn một danh mục là All_Beauty. Hệ thống hỗ trợ **lấy mẫu ngẫu nhiên** trong quá trình đọc tuần tự (mỗi dòng được giữ với xác suất `SAMPLE_FRAC`, hạt giống cố định = 42 để tái lập). Giai đoạn phát triển dùng `SAMPLE_FRAC = 0,15` (khoảng 105 nghìn review) để thử nghiệm nhanh; **bản cuối dùng `SAMPLE_FRAC = 1,0`, tức toàn bộ 701.528 review của danh mục**. Tỷ lệ và danh mục được cấu hình qua biến môi trường `SAMPLE_FRAC`, `AMZ_CATEGORY`."),

  // ================================================================ CHƯƠNG 4
  H1("CHƯƠNG 4. THIẾT KẾ VÀ TRIỂN KHAI HỆ THỐNG"),
  H2("4.1. Kiến trúc tổng thể"),
  P("Hình 4.1 mô tả kiến trúc hệ thống. Airflow điều phối việc thu thập 3 nguồn vào vùng raw của Data Lake, biến đổi sang vùng staging, nạp vào kho dữ liệu, rồi trích dữ liệu từ kho để huấn luyện mô hình; kết quả mô hình được lưu về vùng curated. Portal đọc trực tiếp từ MinIO, PostgreSQL và Airflow để hiển thị tập trung."),
  ...figure("fig_arch", "Hình 4.1. Kiến trúc tổng thể của hệ thống"),
  H2("4.2. Công nghệ sử dụng"),
  ...table("Bảng 4.1. Công nghệ và vai trò", ["Thành phần", "Công nghệ / phiên bản", "Vai trò"], [
    ["Data Lake", "MinIO (image pgsty/minio, bản 2026-08-04)", "Lưu dữ liệu gốc và trung gian theo 3 vùng"],
    ["Kho dữ liệu", "PostgreSQL 16", "Lược đồ hình sao; đồng thời lưu metadata của Airflow"],
    ["Điều phối", "Apache Airflow 3.3.2 (Python 3.13), LocalExecutor", "Lập lịch, thực thi DAG ETL + khai phá"],
    ["Xử lý dữ liệu", "pandas, pyarrow, requests, minio, psycopg2", "Đọc/ghi Data Lake, biến đổi, nạp kho (COPY)"],
    ["NLP & học máy", "NLTK (WordNet), scikit-learn", "Tiền xử lý văn bản, TF-IDF, NB, LR, kiểm định chéo"],
    ["Học sâu", "TensorFlow 2.x / Keras trên Google Colab (GPU T4)", "Huấn luyện BiLSTM"],
    ["Giao diện", "FastAPI, HTML/CSS/JavaScript, Chart.js 4.4.1", "Portal tổng hợp 5 tab"],
    ["Triển khai", "Docker Desktop, Docker Compose", "Đóng gói và chạy 4 dịch vụ"],
  ], [2, 3.6, 4]),
  H2("4.3. Triển khai bằng Docker Compose"),
  ...table("Bảng 4.2. Các dịch vụ trong docker-compose.yml", ["Container", "Cổng", "Chức năng"], [
    ["amz-minio", "9000 (S3 API), 9001 (Console)", "Data Lake"],
    ["amz-postgres", "5432", "Kho dữ liệu `dwh` + metadata Airflow"],
    ["amz-airflow", "8080", "Airflow chế độ standalone (api-server, scheduler, dag-processor, triggerer)"],
    ["amz-portal", "8000", "Portal tổng hợp"],
  ], [2.2, 3, 5]),
  P("Đo thực tế ở cấu hình mẫu 15%: toàn hệ thống dùng khoảng 3 GB RAM lúc cao điểm (Airflow khoảng 2,8 GB khi huấn luyện mô hình); cấu hình 100% chạy thành công trong giới hạn 7,6 GB của Docker trên máy. Mã nguồn pipeline được gắn (mount) vào container Airflow, nên sửa code không cần build lại image."),
  P("Trong quá trình triển khai, nhóm phát hiện image chính thức `minio/minio` đã bị gỡ khỏi Docker Hub và `quay.io/minio/minio` từ chối truy cập. Hệ thống dùng bản fork cộng đồng `pgsty/minio`, giữ nguyên API S3, Console và công cụ `mc`, và cố định phiên bản để bảo đảm tái lập."),
  H2("4.4. Tổ chức Data Lake trên MinIO"),
  ...table("Bảng 4.3. Bố cục các vùng dữ liệu (cấu hình 100%, ngày 25/10/2026)", ["Bucket", "Object (key)", "Kích thước"], [
    ["raw", "amazon/reviews/All_Beauty/ingest_date=YYYY-MM-DD/All_Beauty.jsonl.gz", "90,1 MB"],
    ["raw", "amazon/meta/All_Beauty/ingest_date=YYYY-MM-DD/meta_All_Beauty.jsonl.gz", "38,0 MB"],
    ["raw", "worldbank/usd_vnd/ingest_date=YYYY-MM-DD/PA.NUS.FCRF_HHMMSS.json", "7,9 KB"],
    ["staging", "amazon/All_Beauty/reviews_clean.parquet", "212,8 MB"],
    ["staging", "amazon/All_Beauty/products_clean.parquet", "10,4 MB"],
    ["staging", "worldbank/fx_usd_vnd.parquet; _reports/quality_*.json", "< 3 KB"],
    ["curated", "ml/All_Beauty/sentiment_dataset.parquet", "104,8 MB"],
    ["curated", "ml/All_Beauty/predictions_oof.parquet", "4,4 MB"],
    ["curated", "models/naive_bayes/, models/logistic_regression/, models/lstm/ (metrics.json)", "< 4 KB"],
  ], [1.3, 6.5, 1.5]),
  P("Vùng raw được **phân vùng theo ngày nạp** (`ingest_date=`), giữ nguyên file gốc và lưu URL nguồn trong metadata của object. Vùng staging dùng định dạng cột **Parquet** để đọc nhanh và tiết kiệm dung lượng."),
  ...figure("fig_lake", "Hình 4.2. Tab Data Lake: 3 vùng dữ liệu, trình duyệt object và luồng sự kiện realtime"),
  H2("4.5. Pipeline điều phối bằng Airflow"),
  P("DAG `amazon_reviews_pipeline` gồm 8 tác vụ chia 3 nhóm (Hình 4.3). Ba tác vụ trích xuất chạy song song; nhóm khai phá chạy sau khi kho đã được nạp. DAG chạy theo lịch hằng ngày (07:00 giờ Việt Nam), tối đa 1 lần chạy đồng thời, mỗi tác vụ được thử lại 1 lần nếu lỗi."),
  ...figure("fig_dag", "Hình 4.3. Sơ đồ DAG và trạng thái các tác vụ trên Portal"),
  ...table("Bảng 4.4. Thời gian chạy các tác vụ: mẫu 15% (dựng lại từ đầu, có tải dữ liệu) và toàn bộ dữ liệu (100%)", ["Tác vụ", "Nội dung", "15% (21/10)", "100% (25/10)"], [
    ["extract.extract_reviews", "Stream file review vào raw", "110 s", "6,9 s (*)"],
    ["extract.extract_metadata", "Stream file metadata vào raw", "74 s", "6,6 s (*)"],
    ["extract.extract_fx", "Gọi World Bank API, lưu JSON vào raw", "10,5 s", "6,1 s"],
    ["transform", "Lấy mẫu, làm sạch, NLP, tích hợp, quy đổi giá → staging", "19,3 s", "42,1 s"],
    ["load_warehouse", "Tạo lược đồ, nạp 5 bảng bằng COPY", "9,3 s", "53,0 s"],
    ["mining.build_dataset", "Trích dữ liệu từ kho, chia train/test → curated", "3,2 s", "7,6 s"],
    ["mining.train_baselines", "TF-IDF + Naive Bayes, Logistic Regression", "76,7 s", "269,1 s"],
    ["mining.score_reviews", "Điểm cảm xúc out-of-fold, ghi ngược vào kho", "105 s", "482,4 s"],
  ], [3.2, 4.4, 1.4, 1.4]),
  P("Với mẫu 15%, toàn bộ DAG mất khoảng **4 phút 20 giây** khi dựng lại từ đầu. Với toàn bộ dữ liệu, DAG mất khoảng **10 phút**; hai bước huấn luyện chiếm phần lớn thời gian. (*) Ở lần chạy 100%, file gốc trong ngày đã có sẵn trong Data Lake nên bước trích xuất bỏ qua việc tải lại."),

  // ================================================================ CHƯƠNG 5
  H1("CHƯƠNG 5. QUY TRÌNH ETL"),
  H2("5.1. Trích xuất (Extract)"),
  P("Các file .jsonl.gz được **stream trực tiếp từ HTTP vào MinIO** (multipart upload, mỗi phần 16 MB) mà không ghi ra ổ đĩa trung gian, giữ nguyên file nén gốc. Nếu trong ngày đã có object cùng dung lượng thì bỏ qua để tránh tải lặp. Ba tác vụ trích xuất chạy song song; lỗi tranh chấp khi cùng tạo bucket (race condition) đã được xử lý bằng cách bỏ qua lỗi `BucketAlreadyOwnedByYou`."),
  H2("5.2. Biến đổi (Transform)"),
  H3("5.2.1. Đọc tuần tự và lấy mẫu"),
  P("File review được đọc **tuần tự từng dòng JSON** từ MinIO qua luồng giải nén gzip (không nạp toàn bộ file vào RAM), đúng với yêu cầu \"chunking\" trong đề cương. Mỗi dòng được giữ với xác suất `SAMPLE_FRAC` (bản cuối: 1,0, tức giữ toàn bộ)."),
  H3("5.2.2. Làm sạch cấu trúc"),
  ...bullets([
    "Loại bản ghi thiếu một trong các trường bắt buộc: rating, text, parent_asin, user_id, timestamp.",
    "Chỉ giữ rating trong khoảng 1–5; loại bản ghi trùng theo bộ (user_id, parent_asin, timestamp).",
    "Chuyển timestamp (mili giây) thành thời điểm; điền giá trị mặc định: helpful_vote = 0, verified_purchase = False.",
  ]),
  H3("5.2.3. Tiền xử lý văn bản (NLP)"),
  P("Hệ thống tạo **hai phiên bản văn bản** cho hai họ mô hình khác nhau:"),
  ...bullets([
    "`text_light` (cho LSTM): giải mã ký tự HTML, bỏ thẻ HTML và URL, chuyển chữ thường, tách \"n't\" thành \" not\", bỏ ký tự không phải chữ cái. **Giữ stopword và thứ tự từ** để mạng học ngữ cảnh.",
    "`text_clean` (cho TF-IDF): từ `text_light`, loại stopword (danh sách của scikit-learn **trừ các từ phủ định** not, no, nor, never, none, nothing, nobody, neither, nowhere, cannot, without), bỏ từ 1 ký tự, lemmatize bằng WordNet (danh từ rồi động từ).",
  ]),
  P("Ví dụ: câu ~\"I was hoping it wouldn't break, but it's not good\"~ được biến đổi thành `hop not break not good`. Các cụm phủ định được giữ nguyên ý nghĩa. Đồng thời ví dụ cũng cho thấy một hạn chế của WordNet: ~hoping~ bị đưa về ~hop~ thay vì ~hope~."),
  H3("5.2.4. Tích hợp đa nguồn"),
  ...bullets([
    "Metadata chỉ giữ các sản phẩm có trong mẫu review; thương hiệu lấy từ `details.Brand`, nếu không có thì dùng `store`, cuối cùng là \"Unknown\".",
    "Review **LEFT JOIN** metadata theo khóa `parent_asin`; sản phẩm thiếu metadata được thêm bản ghi \"Unknown\" (lần chạy này: 0 sản phẩm).",
    "Giá quy đổi: `price_vnd = price_usd × tỷ giá năm 2023` (làm tròn đến trăm đồng), vì giá trong metadata là ảnh chụp tại thời điểm thu thập năm 2023. Phân khúc giá: < 200K, 200K–500K, 500K–1 triệu, 1–2 triệu, > 2 triệu, Không rõ.",
  ]),
  H2("5.3. Báo cáo chất lượng dữ liệu"),
  P("Mỗi lần chạy, bước transform ghi một báo cáo chất lượng (JSON) vào `staging/_reports/`. Kết quả lần chạy toàn bộ dữ liệu ngày 25/10/2026:"),
  ...table("Bảng 5.1. Báo cáo chất lượng dữ liệu", ["Chỉ tiêu", "Giá trị"], [
    ["Review đọc từ nguồn", "701.528"], ["Review được giữ lại (SAMPLE_FRAC = 1,0)", "701.528"],
    ["Loại do thiếu giá trị / rating sai", "0 / 0"], ["Loại do trùng lặp", "7.276"],
    ["Loại do văn bản rỗng sau tiền xử lý", "2.446"], ["**Review sạch**", "**691.806**"],
    ["Sản phẩm trong metadata / sau tích hợp", "112.590 / 112.385"],
    ["Sản phẩm thiếu giá", "84,28%"], ["Sản phẩm không rõ thương hiệu", "9,94%"],
    ["Người dùng", "629.831"], ["Khoảng thời gian review", "01/11/2000 – 09/09/2023"],
    ["Phân bố nhãn (tích cực / tiêu cực / trung tính)", "493.060 / 143.138 / 55.608"],
  ], [6, 3.5]),
  H2("5.4. Tải (Load) vào kho dữ liệu"),
  P("Bước load đọc dữ liệu từ staging, sinh khóa thay thế (surrogate key) cho các bảng chiều, sau đó nạp bằng lệnh `COPY` của PostgreSQL (nhanh hơn nhiều so với INSERT từng dòng). Chiến lược nạp là **full refresh** (TRUNCATE rồi nạp lại), bảo đảm chạy lại DAG nhiều lần vẫn cho cùng kết quả. Mỗi lần nạp ghi một dòng vào bảng `etl_load_log`."),
  ...figure("fig_star", "Hình 5.1. Lược đồ hình sao của kho dữ liệu (số dòng thực tế)"),
  ...table("Bảng 5.2. Các bảng trong kho dữ liệu", ["Bảng", "Loại", "Cột chính", "Số dòng"], [
    ["fact_reviews", "Sự kiện", "review_key; product_key, user_key, time_key (FK); rating, sentiment_label, sentiment_score, sentiment_pred, helpful_vote, verified_purchase, text_length, word_count", "691.806"],
    ["dim_product", "Chiều", "product_key; parent_asin, title, brand, store, main_category, categories, price_usd, price_vnd, price_segment, average_rating, rating_number", "112.385"],
    ["dim_user", "Chiều", "user_key; user_id, review_count, first_review_date", "629.831"],
    ["dim_time", "Chiều", "time_key (yyyymmdd); full_date, day, month, quarter, year, year_month, day_of_week, usd_vnd_rate", "6.557"],
    ["review_text", "Phụ trợ", "review_key; title, text_raw, text_clean, text_light", "691.806"],
  ], [2, 1.2, 6, 1.3]),

  // ================================================================ CHƯƠNG 6
  H1("CHƯƠNG 6. KHAI THÁC KHO DỮ LIỆU (OLAP)"),
  H2("6.1. Chỉ số tổng quan"),
  ...table("Bảng 6.1. Các chỉ số tổng quan từ kho", ["Chỉ số", "Giá trị"], [
    ["Số review", "691.806"], ["Rating trung bình", "3,96 sao"], ["Tỷ lệ review tích cực (4–5 sao)", "71,3%"],
    ["Điểm cảm xúc trung bình (−1 đến 1)", "0,380"], ["Tỷ lệ đã xác thực mua hàng", "90,51%"],
  ], [6, 3.5]),
  ...figure("fig_overview", "Hình 6.1. Tab Tổng quan: chỉ số chính và luồng dữ liệu 5 bước"),
  H2("6.2. Phân tích theo thời gian"),
  P("Số review tăng mạnh từ 2014, đạt đỉnh vào tháng 3/2021 (13.885 review), sau đó giảm (dữ liệu kết thúc tháng 9/2023). Rating trung bình theo tháng dao động quanh 3,8–4,2. Hình 6.2 cho thấy số review và rating trung bình theo tháng; hai đại lượng được vẽ ở hai biểu đồ riêng để không gây hiểu nhầm về tương quan."),
  ...figure("fig_dw_time", "Hình 6.2. Số review và rating trung bình theo tháng"),
  H2("6.3. Phân tích theo rating, nhãn, thương hiệu và giá"),
  ...figure("fig_dw_grid", "Hình 6.3. Phân bố số sao, nhãn cảm xúc theo năm, top thương hiệu và rating theo phân khúc giá"),
  ...table("Bảng 6.2. Rating trung bình theo phân khúc giá (VND)", ["Phân khúc", "Số review", "Rating TB", "Điểm cảm xúc TB"], [
    ["< 200K", "33.587", "3,96", "0,361"], ["200K – 500K", "88.345", "4,12", "0,435"],
    ["500K – 1 triệu", "44.583", "4,17", "0,453"], ["1 – 2 triệu", "11.186", "4,24", "0,491"],
    ["> 2 triệu", "5.254", "4,08", "0,421"], ["Không rõ giá", "508.851", "3,91", "0,362"],
  ], [3, 2, 2, 2.5]),
  P("Một số nhận xét: (1) phân bố số sao **lệch mạnh về 5 sao** (414.655 review 5★, chiếm 60%), nên đây là dữ liệu mất cân bằng; (2) sản phẩm giá 1–2 triệu đồng có rating và điểm cảm xúc cao nhất, sản phẩm giá thấp (< 200K) thấp hơn; (3) điều bất ngờ là review **đã xác thực mua hàng** có rating trung bình (3,95; 626.122 review) **thấp hơn** review chưa xác thực (4,08; 65.684 review), gợi ý review chưa xác thực có xu hướng khen nhiều hơn; (4) thương hiệu nhiều review nhất là PHILIPS (2.938), Segbeauty (2.761), SALUX (2.167). Các xu hướng (1)–(3) giống với kết quả trên mẫu 15%, cho thấy mẫu ngẫu nhiên đại diện tốt cho toàn bộ dữ liệu."),
  H2("6.4. Truy vấn OLAP mẫu"),
  P("Portal cung cấp ô SQL chỉ đọc (giao dịch read-only, giới hạn 15 giây và 500 dòng) với các truy vấn mẫu. Ví dụ **Roll-up** theo năm và quý:"),
  ...code(`SELECT t.year, t.quarter, count(*) AS reviews, round(avg(f.rating), 2) AS avg_rating
FROM fact_reviews f JOIN dim_time t USING (time_key)
GROUP BY ROLLUP (t.year, t.quarter)
ORDER BY t.year NULLS LAST, t.quarter NULLS LAST;`),
  P("Ví dụ **Dice** theo hai chiều phân khúc giá và nhãn cảm xúc:"),
  ...code(`SELECT p.price_segment,
       count(*) FILTER (WHERE f.sentiment_label = 'negative') AS negative,
       count(*) FILTER (WHERE f.sentiment_label = 'neutral')  AS neutral,
       count(*) FILTER (WHERE f.sentiment_label = 'positive') AS positive
FROM fact_reviews f JOIN dim_product p USING (product_key)
GROUP BY 1 ORDER BY min(coalesce(p.price_vnd, 1e12));`),
  P("Ngoài ra còn các truy vấn: **Drill-down** theo tháng của một năm, **Slice** năm 2022 theo thương hiệu, tìm review 5 sao nhưng lời lẽ tiêu cực (dựa trên điểm cảm xúc), và người dùng tích cực nhất."),
  ...figure("fig_dw_sql", "Hình 6.4. Ô truy vấn OLAP trên Portal (kết quả Roll-up)"),

  // ================================================================ CHƯƠNG 7
  H1("CHƯƠNG 7. KHAI PHÁ DỮ LIỆU – PHÂN TÍCH CẢM XÚC"),
  H2("7.1. Chuẩn bị dữ liệu"),
  P("Dữ liệu chuẩn hóa được **trích từ kho** (`fact_reviews` nối `review_text`), đúng như thiết kế của đề tài. Nhãn được ánh xạ từ rating: **Tiêu cực** (1–2 sao), **Trung tính** (3 sao), **Tích cực** (4–5 sao). Tập dữ liệu chia 80/20 có phân tầng (hạt giống 42): **553.444 mẫu huấn luyện, 138.362 mẫu kiểm thử**. Tập kiểm thử dùng chung cho mọi mô hình, kể cả BiLSTM, để so sánh công bằng."),
  ...table("Bảng 7.1. Phân bố nhãn trên tập kiểm thử", ["Nhãn", "Số mẫu", "Tỷ lệ"], [
    ["Tiêu cực", "28.628", "20,7%"], ["Trung tính", "11.122", "8,0%"], ["Tích cực", "98.612", "71,3%"],
  ], [3, 3, 3]),
  H2("7.2. Trích xuất đặc trưng"),
  P("Đặc trưng **TF-IDF** trên `text_clean`: n-gram (1, 2), bỏ từ xuất hiện ít hơn 3 văn bản (min_df = 3), tối đa 50.000 đặc trưng, dùng tf dạng log (sublinear_tf). Bộ vector hóa chỉ học trên tập huấn luyện để tránh rò rỉ thông tin."),
  H2("7.3. Mô hình học máy"),
  ...bullets([
    "**Multinomial Naive Bayes**: alpha = 0,3; fit_prior = False (prior đều giữa các lớp để giảm thiên lệch về lớp đa số).",
    "**Logistic Regression**: C = 2,0; class_weight = balanced; max_iter = 2000 (solver lbfgs, đa lớp softmax).",
  ]),
  H2("7.4. Mô hình học sâu BiLSTM"),
  ...table("Bảng 7.2. Kiến trúc và tham số BiLSTM", ["Thành phần", "Cấu hình"], [
    ["Đầu vào", "text_light → TextVectorization (từ điển 30.000 từ, độ dài chuỗi 150)"],
    ["Embedding", "128 chiều, mask_zero = True"],
    ["Lớp hồi quy", "Bidirectional(LSTM 64 đơn vị)"],
    ["Phân loại", "Dropout 0,3 → Dense 64 (ReLU) → Dropout 0,3 → Dense 3 (softmax)"],
    ["Huấn luyện", "Adam (lr = 0,001), batch 256, tối đa 8 epoch, EarlyStopping (val_loss, patience 2), class_weight = balanced, 10% train làm validation"],
    ["Số tham số", "khoảng 3,95 triệu"],
  ], [2.5, 7]),
  P("Mô hình được huấn luyện bằng notebook `train_lstm_colab.ipynb` trên **Google Colab (GPU T4)**, với 498.099 mẫu (90% tập huấn luyện; 10% còn lại làm validation), mất **175 giây** cho 4 epoch. Để so sánh, cùng notebook chạy song song trên CPU của máy cá nhân (TensorFlow trong container Docker) mất 2.626 giây (khoảng 44 phút), tức **chậm hơn khoảng 15 lần**, nhưng cho kết quả gần như trùng (Macro-F1 0,704 so với 0,706), xác nhận kết quả ổn định. Kết quả xuất ra `metrics.json` cùng định dạng với các mô hình học máy và được tải lên `curated/models/lstm/` để Portal so sánh."),
  H2("7.5. Kết quả"),
  ...table("Bảng 7.3. So sánh các mô hình trên tập kiểm thử (138.362 mẫu, toàn bộ dữ liệu)", ["Mô hình", "Accuracy", "Precision (macro)", "Recall (macro)", "F1 (macro)", "F1 (weighted)", "Thời gian train"], [
    ["Naive Bayes", "0,7702", "0,6463", "0,7065", "0,6480", "0,8032", "5,2 s"],
    ["Logistic Regression", "0,8112", "0,6640", "0,7122", "0,6732", "0,8328", "204 s"],
    ["**BiLSTM**", "**0,8264**", "**0,7015**", "**0,7610**", "**0,7061**", "**0,8509**", "175 s (GPU)"],
  ], [2.6, 1.4, 1.6, 1.5, 1.4, 1.5, 1.5]),
  ...table("Bảng 7.4. F1 theo từng lớp", ["Mô hình", "Tiêu cực", "Trung tính", "Tích cực"], [
    ["Naive Bayes", "0,733", "0,335", "0,876"], ["Logistic Regression", "0,761", "0,351", "0,908"], ["**BiLSTM**", "**0,794**", "**0,406**", "**0,917**"],
  ], [3, 2, 2, 2]),
  ...figure("fig_mn_compare", "Hình 7.1. So sánh mô hình, F1 theo lớp và phân bố điểm cảm xúc theo nhãn thật"),
  P("**BiLSTM tốt nhất ở mọi chỉ số tổng hợp**: Macro-F1 0,706 (cao hơn Logistic Regression 0,033 và Naive Bayes 0,058), Accuracy 82,6%, Recall macro 0,761, và có F1 cao nhất ở cả 3 lớp. Logistic Regression đứng thứ hai; Naive Bayes thứ ba nhưng huấn luyện nhanh nhất (5 giây). Cả ba mô hình đạt tốt ở lớp Tích cực (F1 0,88–0,92) và Tiêu cực (0,73–0,79), nhưng **lớp Trung tính vẫn khó nhất** (F1 0,34–0,41)."),
  ...figure("fig_mn_cm", "Hình 7.2. Ma trận nhầm lẫn (chuẩn hóa theo hàng)"),
  P("Ma trận nhầm lẫn của Logistic Regression: trong 11.122 review trung tính, 5.797 (52%) được đoán đúng, 3.206 bị đoán là tiêu cực và 2.119 bị đoán là tích cực; đồng thời 10.390 review tích cực (10,5%) bị kéo về trung tính. Điều này phản ánh bản chất của review 3 sao: thường vừa khen vừa chê, ranh giới với hai lớp còn lại không rõ ràng."),
  P("BiLSTM nhận đúng **7.340/11.122 review trung tính (66%)**, nhiều hơn Logistic Regression 1.543 review, đồng thời đoán đúng nhiều hơn ở cả lớp Tiêu cực (21.700 so với 21.621) và Tích cực (85.304 so với 84.825). Điểm yếu còn lại là Precision lớp Trung tính chỉ 0,294: mô hình vẫn kéo 11.484 review tích cực và 6.172 review tiêu cực sang trung tính, do trọng số lớp cân bằng khuyến khích dự đoán lớp thiểu số."),
  P("Hình 7.3 cho thấy quá trình huấn luyện BiLSTM: loss trên tập huấn luyện giảm đều qua 4 epoch (0,628 → 0,431), trong khi loss trên tập validation thấp nhất ở epoch 2 (0,445) rồi tăng lại (0,500 ở epoch 4), là dấu hiệu bắt đầu quá khớp (overfitting). Cơ chế EarlyStopping dừng sau 2 epoch không cải thiện và khôi phục trọng số tốt nhất của epoch 2."),
  ...figure("fig_mn_lstm", "Hình 7.3. Quá trình huấn luyện BiLSTM: loss trên tập huấn luyện và validation theo epoch"),
  H2("7.6. Diễn giải mô hình và phân tích lỗi"),
  P("Hệ số của Logistic Regression cho biết những từ quyết định từng lớp (Hình 7.4). Lớp Tiêu cực: ~not recommend, worst, disappoint, not worth, not happy~; lớp Trung tính: ~not worst, not amaze, better worse, not best~; lớp Tích cực: ~not disappoint, perfect, best, amaze, great~. Rất nhiều cụm phủ định (~not worth~, ~not disappoint~, ~not amaze~) nằm trong danh sách, xác nhận quyết định **giữ lại từ phủ định** là đúng."),
  ...figure("fig_mn_terms", "Hình 7.4. Từ khóa có trọng số cao nhất theo từng lớp (Logistic Regression)"),
  P("**Điểm cảm xúc** của mỗi review được định nghĩa là sentiment_score = P(tích cực) − P(tiêu cực), nằm trong khoảng [−1, 1], lấy từ dự đoán out-of-fold 5-fold. Accuracy out-of-fold trên toàn bộ 691.806 review đạt 0,8112, tương đương kết quả trên tập kiểm thử, chứng tỏ mô hình ổn định. Điểm này được ghi ngược vào `fact_reviews`, nhờ đó có thể truy vấn OLAP theo cảm xúc (ví dụ tìm review 5 sao nhưng lời lẽ tiêu cực)."),
  ...figure("fig_mn_errors", "Hình 7.5. Một số review bị dự đoán sai"),
  P("Phân tích các review bị dự đoán sai cho thấy những nguyên nhân thường gặp: review ngắn và mơ hồ; review vừa khen vừa chê; rating không khớp nội dung (5 sao nhưng phàn nàn); và lỗi chính tả hoặc văn phong không chuẩn. Đây là giới hạn của biểu diễn túi từ (bag-of-words), là lý do để thử mô hình học sâu có khả năng nắm bắt ngữ cảnh."),
  H2("7.7. Thảo luận: học máy so với học sâu"),
  P("Bảng 7.5 so sánh kết quả khi huấn luyện trên mẫu 15% và trên toàn bộ dữ liệu (mỗi cấu hình đánh giá trên tập kiểm thử của chính nó)."),
  ...table("Bảng 7.5. Macro-F1 theo lượng dữ liệu huấn luyện", ["Mô hình", "Mẫu 15% (≈84 nghìn mẫu train)", "100% (≈553 nghìn mẫu train)", "Thay đổi"], [
    ["Naive Bayes", "0,651", "0,648", "−0,003"], ["Logistic Regression", "0,660", "0,673", "+0,013"], ["BiLSTM", "0,649", "**0,706**", "**+0,057**"],
  ], [3, 2.5, 2.5, 1.5]),
  ...bullets([
    "**Học sâu cần nhiều dữ liệu:** với mẫu 15%, BiLSTM (0,649) còn thua Logistic Regression (0,660); với toàn bộ dữ liệu, BiLSTM tăng mạnh nhất (+0,057) và vượt lên dẫn đầu. Naive Bayes gần như không cải thiện, Logistic Regression cải thiện nhẹ.",
    "**Lớp Trung tính:** BiLSTM nắm bắt ngữ cảnh tốt hơn (F1 0,406 so với 0,351 của Logistic Regression), nhưng Precision lớp này vẫn thấp (0,294), đây là điểm cần cải thiện tiếp.",
    "**Quá khớp:** BiLSTM đạt tốt nhất ở epoch 2 rồi bắt đầu quá khớp; EarlyStopping là cần thiết. Embedding vẫn học từ đầu, chưa dùng vector tiền huấn luyện.",
    "**Chi phí tính toán:** trên GPU (Colab T4), BiLSTM huấn luyện trong 175 giây, tương đương Logistic Regression trên CPU (204 giây); trên CPU máy cá nhân, BiLSTM mất khoảng 44 phút. GPU là điều kiện thực tế để dùng học sâu.",
    "**Kết luận thực nghiệm:** với đủ dữ liệu và GPU, BiLSTM là lựa chọn tốt nhất; khi dữ liệu ít hoặc chỉ có CPU, TF-IDF + Logistic Regression là baseline mạnh, nhanh và dễ diễn giải.",
  ]),

  // ================================================================ CHƯƠNG 8
  H1("CHƯƠNG 8. PORTAL TỔNG HỢP"),
  H2("8.1. Mục tiêu"),
  P("Thay vì quản lý rời rạc (luồng xử lý trên Airflow UI, dữ liệu trên MinIO Console, biểu đồ trên một công cụ BI riêng), nhóm xây dựng một **Portal duy nhất** (FastAPI + HTML/JavaScript) đọc trực tiếp từ cả ba hệ thống và hiển thị tập trung."),
  H2("8.2. Chức năng"),
  ...table("Bảng 8.1. Các tab của Portal", ["Tab", "Chức năng chính"], [
    ["Tổng quan", "Chỉ số chính, luồng 5 bước có số liệu thật, lần chạy pipeline gần nhất, báo cáo chất lượng dữ liệu, sự kiện Data Lake mới nhất"],
    ["Data Lake", "Thống kê 3 vùng; duyệt, lọc, xem trước (JSON Lines, Parquet kèm schema, JSON), tải về, tải lên object; luồng sự kiện realtime"],
    ["Pipeline", "Bật/tắt lịch, chạy DAG; sơ đồ tác vụ tô màu theo trạng thái; lịch sử lần chạy; bảng tác vụ kèm thời lượng; xem log (kèm lỗi) và XCom"],
    ["Kho dữ liệu", "Lược đồ hình sao kèm số dòng; 8 biểu đồ OLAP; bảng top sản phẩm; ô SQL chỉ đọc với truy vấn mẫu"],
    ["Khai phá dữ liệu", "So sánh mô hình, F1 theo lớp, phân bố điểm cảm xúc, ma trận nhầm lẫn, từ khóa quyết định, khu vực LSTM, phân tích lỗi"],
  ], [2.2, 7.5]),
  ...figure("fig_tasks", "Hình 8.1. Bảng tác vụ của một lần chạy, kèm thời lượng", 430),
  H2("8.3. Cơ chế cập nhật thời gian thực"),
  P("Backend của Portal đăng ký nhận **Bucket Notification** của MinIO cho cả 3 bucket (API `listen_bucket_notification`). Mỗi khi một object được tạo hoặc xóa, sự kiện được đẩy tới trình duyệt qua **Server-Sent Events**. Nhờ đó, khi pipeline chạy, người dùng thấy từng file mới xuất hiện trong Data Lake ngay lập tức. Trạng thái Airflow được cập nhật 4 giây/lần khi có DAG đang chạy, 15 giây/lần khi không có. Giao diện hỗ trợ chế độ sáng/tối và màn hình điện thoại; mỗi biểu đồ có chế độ xem dạng bảng."),
  H2("8.4. Tích hợp với Airflow"),
  P("Portal gọi **Airflow REST API v2**: lấy token qua `POST /auth/token`, sau đó đọc danh sách DAG, lần chạy, tác vụ, log, XCom, kích hoạt lần chạy mới và bật/tắt lịch. Log có cấu trúc của Airflow 3 được chuyển thành văn bản, kèm thông tin lỗi (exception và vị trí dòng mã) khi tác vụ thất bại."),

  // ================================================================ CHƯƠNG 9
  H1("CHƯƠNG 9. ĐÁNH GIÁ, HẠN CHẾ VÀ HƯỚNG PHÁT TRIỂN"),
  H2("9.1. Mức độ hoàn thành"),
  ...table("Bảng 9.1. Mức độ hoàn thành theo hạng mục (tại ngày 25/10/2026)", ["Hạng mục", "Trạng thái", "Mức độ"], [
    ["Hạ tầng Docker, Data Lake MinIO", "Hoàn thành, kiểm thử dựng lại từ đầu", "100%"],
    ["Pipeline ETL đa nguồn (Airflow)", "Hoàn thành, 8/8 tác vụ thành công", "100%"],
    ["Kho dữ liệu hình sao + OLAP", "Hoàn thành", "100%"],
    ["Học máy (NB, LR) + điểm cảm xúc OOF", "Hoàn thành", "100%"],
    ["Học sâu (BiLSTM)", "Hoàn thành: huấn luyện trên toàn bộ dữ liệu (Colab GPU), là mô hình tốt nhất", "100%"],
    ["Portal tổng hợp", "Hoàn thành", "100%"],
    ["Tài liệu (README, hướng dẫn chạy, báo cáo, đề tài cập nhật)", "Hoàn thành; thông tin nhóm trên bìa do nhóm tự điền", "100%"],
  ], [4, 4.5, 1.2]),
  H2("9.2. Hạn chế"),
  ...bullets([
    "Lớp Trung tính có F1 thấp (0,34–0,41) do bản chất mơ hồ của review 3 sao và số mẫu ít (8%).",
    "84% sản phẩm không có giá, nên phân tích theo giá chỉ dựa trên khoảng 26% review.",
    "Hầu hết người dùng chỉ có 1 review (629.831 người dùng / 691.806 review), nên phân tích theo người dùng còn hạn chế.",
    "Kho nạp theo kiểu full refresh, chưa hỗ trợ nạp tăng dần (incremental) và theo dõi thay đổi bảng chiều (SCD).",
    "Lịch chạy hằng ngày tải lại khoảng 134 MB dữ liệu gốc mỗi ngày; chưa có chính sách dọn dữ liệu cũ trong vùng raw.",
    "Lemmatizer WordNet đôi khi đưa từ về gốc sai (hoping → hop).",
    "BiLSTM cần GPU để huấn luyện nhanh (CPU chậm hơn khoảng 15 lần), bắt đầu quá khớp sau epoch 2; Precision lớp Trung tính thấp (0,294).",
    "Hệ thống chạy ở chế độ phát triển (Airflow standalone, tài khoản mặc định), chưa phù hợp môi trường sản xuất.",
  ]),
  H2("9.3. Hướng phát triển"),
  ...bullets([
    "Dùng embedding tiền huấn luyện (GloVe, fastText) hoặc mô hình Transformer (DistilBERT) trên GPU; điều chỉnh trọng số lớp hoặc ngưỡng phân loại để cân bằng giữa Recall lớp Trung tính và Accuracy.",
    "Thử LinearSVC, tinh chỉnh siêu tham số, điều chỉnh ngưỡng phân loại cho lớp thiểu số.",
    "Nạp tăng dần, mở rộng sang nhiều danh mục sản phẩm, bổ sung chính sách vòng đời dữ liệu cho Data Lake.",
    "Thu thập thêm review tiếng Việt (ví dụ từ sàn thương mại điện tử trong nước) để áp dụng vào bối cảnh Việt Nam.",
  ]),

  // ================================================================ KẾT LUẬN
  H1("KẾT LUẬN"),
  P("Đề tài đã xây dựng một hệ thống dữ liệu hoàn chỉnh cho bài toán khai phá cảm xúc đánh giá sản phẩm: thu thập ba nguồn dữ liệu độc lập, lưu trữ có phân vùng trên Data Lake MinIO, làm sạch và tích hợp qua pipeline Airflow, tổ chức kho dữ liệu PostgreSQL theo lược đồ hình sao, khai thác bằng OLAP và huấn luyện mô hình phân loại cảm xúc. Toàn bộ được quản lý tập trung trên một Portal duy nhất với cập nhật thời gian thực."),
  P("Về khai phá dữ liệu, trên toàn bộ 691.806 review, mô hình học sâu **BiLSTM đạt kết quả tốt nhất** với Macro-F1 0,706 và Accuracy 82,6%, vượt Logistic Regression (0,673) và Naive Bayes (0,648), và có F1 cao nhất ở cả 3 lớp. So sánh với lần huấn luyện trên mẫu 15% (khi Logistic Regression còn dẫn đầu) cho thấy học sâu cần nhiều dữ liệu và GPU để phát huy ưu thế. Việc giữ từ phủ định và xử lý mất cân bằng lớp là cần thiết; thách thức lớn nhất vẫn là lớp Trung tính."),
  P("Hệ thống có tính tái lập cao: chỉ với một lệnh `docker compose up`, toàn bộ quy trình tự chạy và cho cùng kết quả; quá trình kiểm thử dựng lại từ đầu đã xác nhận điều này."),

  // ================================================================ TÀI LIỆU THAM KHẢO
  H1("TÀI LIỆU THAM KHẢO"),
  ...numbered([
    "Hou, Y., Li, J., He, Z., Yan, A., Chen, X., & McAuley, J. (2024). Bridging Language and Items for Retrieval and Recommendation. arXiv:2403.03952. (Bộ dữ liệu Amazon Reviews 2023.)",
    "World Bank. Official exchange rate (LCU per US$, period average) – PA.NUS.FCRF. World Development Indicators. https://data.worldbank.org/",
    "Kimball, R., & Ross, M. (2013). The Data Warehouse Toolkit: The Definitive Guide to Dimensional Modeling (3rd ed.). Wiley.",
    "Han, J., Kamber, M., & Pei, J. (2011). Data Mining: Concepts and Techniques (3rd ed.). Morgan Kaufmann.",
    "Manning, C. D., Raghavan, P., & Schütze, H. (2008). Introduction to Information Retrieval. Cambridge University Press.",
    "Pedregosa, F. et al. (2011). Scikit-learn: Machine Learning in Python. Journal of Machine Learning Research, 12, 2825–2830.",
    "Hochreiter, S., & Schmidhuber, J. (1997). Long Short-Term Memory. Neural Computation, 9(8), 1735–1780.",
    "Bird, S., Klein, E., & Loper, E. (2009). Natural Language Processing with Python. O'Reilly Media.",
    "Apache Software Foundation. Apache Airflow Documentation. https://airflow.apache.org/docs/",
    "MinIO. MinIO Object Storage Documentation. https://min.io/docs/",
  ], "refs"),

  // ================================================================ PHỤ LỤC
  H1("PHỤ LỤC"),
  H2("A. Hướng dẫn cài đặt và chạy"),
  ...numbered([
    "Cài Docker Desktop, bật và chờ trạng thái \"Engine running\".",
    "Mở thư mục dự án, chạy `docker compose up -d --build` (lần đầu khoảng 5–10 phút).",
    "Mở Portal tại http://localhost:8000; lần khởi động đầu tiên DAG tự chạy (khoảng 4 phút).",
    "Chạy lại pipeline: tab Pipeline → nút \"Chạy ngay\".",
    "Huấn luyện LSTM: tải `sentiment_dataset.parquet` từ tab Data Lake, chạy notebook (máy cá nhân hoặc Colab), tải `metrics.json` lên `curated/models/lstm/`.",
  ], "num1"),
  P("Chi tiết xem file `huongdanchay.md` và `README.md` trong mã nguồn.", { noIndent: true }),
  H2("B. Cấu trúc mã nguồn"),
  ...code(`cuoiki/
├── docker-compose.yml, .env          # 4 dịch vụ, cấu hình
├── airflow/dags/amazon_reviews_pipeline.py   # DAG
├── pipeline/amz/                     # extract, transform, load, mining, lake, config
├── sql/dw_schema.sql                 # lược đồ hình sao
├── portal/app.py, portal/static/     # Portal (FastAPI + HTML/JS)
├── notebooks/train_lstm_colab.ipynb  # BiLSTM (TensorFlow)
└── README.md, huongdanchay.md, agent.md`),
  H2("C. Bảng phân công công việc"),
  ...table("Bảng C.1. Phân công công việc", ["Thành viên", "Nhiệm vụ", "Mức độ hoàn thành"], [
    ["[Họ tên]", "[Nhiệm vụ]", "[%]"], ["[Họ tên]", "[Nhiệm vụ]", "[%]"], ["[Họ tên]", "[Nhiệm vụ]", "[%]"],
  ], [3, 5, 2]),
];

// ------------------------------------------------------------------ document
const doc = new Document({
  creator: "Nhóm đồ án", title: "Báo cáo đồ án – Data Pipeline đa nguồn và khai phá cảm xúc",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 26 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 30, bold: true, color: "000000" },
        paragraph: { spacing: { before: 120, after: 240 }, alignment: AlignmentType.CENTER, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: "000000" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 26, bold: true, italics: true, color: "000000" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
      ] },
      { reference: "num1", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "refs", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "[%1]", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 560 } } } }] },
    ],
  },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
      children: cover },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 }, pageNumbers: { start: 1 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 24 })] })] }) },
      children: body },
  ],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("written", OUT, buf.length, "bytes"); });
