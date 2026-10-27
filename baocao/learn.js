// Sinh tài liệu học learn.docx: giải thích toàn bộ dự án cho người mới bắt đầu
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, Footer, PageNumber, TableOfContents,
  LevelFormat, VerticalAlign,
} = require("docx");

const IMG = path.join(__dirname, "img");
const OUT = process.argv[2];
const FONT = "Calibri";
const CONTENT_W = 9638; // A4 11906 - lề 2 x 1134

// ------------------------------------------------------------------ helpers
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|~[^~]+~)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), ...base, font: "Consolas", size: (base.size || 24) - 2 }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text) => new Paragraph({ children: runs(text), spacing: { after: 140, line: 300 } });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const bullets = (items) => items.map((t) => new Paragraph({
  numbering: { reference: "bullets", level: 0 }, children: runs(t), spacing: { after: 70, line: 290 },
}));
let numRef = 0;
const steps = (items) => {
  const ref = `steps${numRef++ % 30}`;
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 70, line: 290 } }));
};
// Khung ghi chú màu (mẹo / ví dụ / lưu ý)
const BOX = { tip: ["EAF3FC", "2A78D6", "💡 "], ex: ["F3F2EE", "898781", "📌 Ví dụ: "], warn: ["FDF1E7", "EB6834", "⚠️ Lưu ý: "] };
const box = (kind, text) => {
  const [fill, line, prefix] = BOX[kind];
  return new Paragraph({
    children: [new TextRun({ text: prefix, bold: true }), ...runs(text)],
    shading: { type: ShadingType.CLEAR, color: "auto", fill },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: line, space: 8 } },
    indent: { left: 200, right: 120 }, spacing: { before: 80, after: 180, line: 290 },
  });
};
const code = (lines) => lines.split("\n").map((l, i, a) => new Paragraph({
  children: [new TextRun({ text: l || " ", font: "Consolas", size: 19 })],
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F2EE" },
  spacing: { before: i === 0 ? 60 : 0, after: i === a.length - 1 ? 180 : 0, line: 260 },
  indent: { left: 200, right: 200 },
}));
const caption = (t, before = false) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: before ? { before: 160, after: 80 } : { before: 60, after: 240 },
  children: [new TextRun({ text: t, italics: true, size: 20, color: "52514E" })],
});
function figure(name, cap) {
  const b = fs.readFileSync(path.join(IMG, name + ".png"));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const width = 620, height = Math.round((h / w) * width);
  return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 },
    children: [new ImageRun({ type: "png", data: b, transformation: { width, height } })] }), caption(cap)];
}
const bd = { style: BorderStyle.SINGLE, size: 4, color: "B5B3AB" };
const borders = { top: bd, bottom: bd, left: bd, right: bd };
function table(cap, headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map((x) => Math.round((x / total) * CONTENT_W));
  ws[ws.length - 1] += CONTENT_W - ws.reduce((a, b) => a + b, 0);
  const cell = (t, i, head) => new TableCell({
    width: { size: ws[i], type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "DCE6F2" } : undefined,
    children: String(t).split("\n").map((line) => new Paragraph({
      spacing: { after: 0, line: 260 },
      alignment: /^[-+−]?[\d.,]+%?$/.test(line.replace(/\*\*/g, "").trim()) && !head ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: runs(line, { size: 21, ...(head ? { bold: true } : {}) }),
    })),
  });
  return [
    cap ? new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 80 }, children: [new TextRun({ text: cap, italics: true, size: 20, color: "52514E" })] }) : new Paragraph({ spacing: { after: 60 }, children: [] }),
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: ws,
      rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}
const center = (t, size, opts = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: opts.after ?? 120 },
  children: [new TextRun({ text: t, size, bold: !!opts.bold, color: opts.color })] });

// ------------------------------------------------------------------ bìa
const cover = [
  new Paragraph({ spacing: { before: 2400 }, children: [] }),
  center("TÀI LIỆU HỌC", 28, { bold: true, color: "2A78D6", after: 300 }),
  center("Hiểu toàn bộ dự án", 52, { bold: true, after: 120 }),
  center("Data Pipeline đa nguồn & Khai phá cảm xúc", 32, { after: 80 }),
  center("đánh giá sản phẩm thương mại điện tử", 32, { after: 900 }),
  center("Dành cho người mới bắt đầu: không cần biết trước về", 24, { after: 40, color: "52514E" }),
  center("Kho dữ liệu, Khai phá dữ liệu hay Học máy", 24, { after: 1600, color: "52514E" }),
  center("Số liệu trong tài liệu lấy từ lần chạy thật với toàn bộ dữ liệu (100%), tháng 10/2026", 20, { color: "898781" }),
];

// ------------------------------------------------------------------ nội dung
const body = [
  center("MỤC LỤC", 30, { bold: true, after: 240 }),
  new TableOfContents("Mục lục", { hyperlink: true, headingStyleRange: "1-2" }),

  // =============================================================== 0
  H1("Cách đọc tài liệu này"),
  P("Tài liệu này giúp bạn hiểu **toàn bộ dự án từ con số 0**: dự án làm gì, mỗi thuật ngữ nghĩa là gì, dữ liệu đi qua những bước nào, kết quả nói lên điều gì, và tự tay thử nghiệm được."),
  ...bullets([
    "**Phần 1** cho bạn bức tranh lớn trong 5 phút. Đọc phần này trước.",
    "**Phần 2** giải thích các khái niệm nền tảng bằng ví dụ đời thường. Gặp từ lạ ở các phần sau, quay lại đây.",
    "**Phần 3** đi theo hành trình của **một review có thật** từ Internet tới mô hình.",
    "**Phần 4** đọc và hiểu kết quả. **Phần 5** chỉ file code nào làm gì.",
    "**Phần 6** là bài thực hành tự làm. **Phần 7** là câu hỏi hay gặp khi bảo vệ đồ án. **Phần 8** là bảng thuật ngữ.",
  ]),
  box("tip", "Không cần hiểu hết ngay. Hãy đọc Phần 1, thử mở web Portal (http://localhost:8000) và đối chiếu với từng phần. Nhìn tận mắt sẽ dễ hiểu hơn đọc chay rất nhiều."),

  // =============================================================== 1
  H1("Phần 1. Dự án này làm gì? (đọc trong 5 phút)"),
  H2("1.1. Bài toán"),
  P("Trên Amazon, mỗi sản phẩm có hàng trăm, hàng nghìn **đánh giá (review)** của người mua: một số sao từ 1 đến 5 kèm một đoạn văn bản. Không ai đọc tay nổi vài trăm nghìn review. Dự án xây dựng một hệ thống để:"),
  ...steps([
    "**Tự động thu thập** dữ liệu review, thông tin sản phẩm và tỷ giá USD→VND từ Internet.",
    "**Cất giữ, làm sạch và sắp xếp** dữ liệu để dễ phân tích (ví dụ: thương hiệu nào được khen nhiều, giá cao có được đánh giá tốt hơn không).",
    "**Dạy máy tính đọc hiểu cảm xúc**: đọc một đoạn review và đoán người viết đang **Tiêu cực**, **Trung tính** hay **Tích cực**.",
    "**Hiển thị tất cả** trên một trang web duy nhất.",
  ]),
  H2("1.2. Hình dung dự án như một nhà máy"),
  P("Cách dễ nhất để hiểu là tưởng tượng một **nhà máy chế biến thực phẩm**:"),
  ...table("Bảng 1.1. Dự án dưới góc nhìn nhà máy", ["Trong nhà máy", "Trong dự án", "Công cụ dùng"], [
    ["Nguyên liệu thô từ các nhà cung cấp", "Dữ liệu từ 3 nguồn trên Internet", "Amazon Reviews, World Bank"],
    ["Nhà kho chứa nguyên liệu (cả đồ chưa sơ chế)", "**Data Lake** (hồ dữ liệu)", "MinIO"],
    ["Dây chuyền sơ chế, đóng gói", "**ETL**: trích xuất, làm sạch, nạp", "Python"],
    ["Siêu thị: hàng đã sắp lên kệ, dễ tìm", "**Data Warehouse** (kho dữ liệu)", "PostgreSQL"],
    ["Quản đốc điều phối các công đoạn theo lịch", "**Bộ điều phối pipeline**", "Apache Airflow"],
    ["Chuyên viên phân tích doanh số", "**OLAP**, truy vấn phân tích", "SQL"],
    ["Robot đọc phản hồi khách hàng", "**Mô hình học máy / học sâu**", "scikit-learn, TensorFlow"],
    ["Phòng điều khiển có màn hình", "**Portal** (trang web tổng hợp)", "FastAPI + Chart.js"],
    ["Nhà xưởng đóng gói sẵn, dựng ở đâu cũng được", "**Container**", "Docker"],
  ], [3.2, 3, 2.6]),
  ...figure("fig_arch", "Hình 1.1. Kiến trúc thật của dự án: dữ liệu chảy từ trái sang phải"),
  H2("1.3. Kết quả cuối cùng trong 4 dòng"),
  ...bullets([
    "Thu thập **701.528 review** sản phẩm làm đẹp (danh mục All_Beauty) giai đoạn 2000–2023; sau khi làm sạch còn **691.806 review**.",
    "Kho dữ liệu có 112.385 sản phẩm, 629.831 người dùng; phân tích được theo thời gian, thương hiệu, mức giá (quy đổi VND).",
    "Ba mô hình đoán cảm xúc; tốt nhất là **BiLSTM** (học sâu), đoán đúng **82,6%** review, điểm Macro-F1 **0,706**.",
    "Mọi thứ chạy bằng một lệnh, tự động hằng ngày, xem được trên web http://localhost:8000.",
  ]),

  // =============================================================== 2
  H1("Phần 2. Kiến thức nền tảng (giải thích từ số 0)"),

  H2("2.1. Dữ liệu và ba kiểu cấu trúc"),
  P("**Dữ liệu** là thông tin được ghi lại. Người ta chia dữ liệu theo mức độ \"ngăn nắp\":"),
  ...table(null, ["Kiểu", "Giống như", "Ví dụ trong dự án"], [
    ["**Có cấu trúc**", "Bảng Excel: hàng, cột, kiểu rõ ràng", "Bảng `fact_reviews` trong kho: cột rating là số 1–5"],
    ["**Bán cấu trúc**", "Tờ khai có nhãn nhưng không cố định số ô", "File JSON: mỗi review có các trường tên rõ ràng, nhưng có review thiếu trường, có trường lồng nhau"],
    ["**Phi cấu trúc**", "Một lá thư viết tay", "Nội dung review: câu chữ tự do, máy không hiểu ngay được"],
  ], [1.8, 3.2, 4.6]),
  P("Một review gốc trong file của Amazon trông như sau. Đây là định dạng **JSON**: các cặp `\"tên\": giá trị` nằm trong ngoặc nhọn:"),
  ...code(`{"rating": 5.0, "title": "Such a lovely scent but not overpowering.",
 "text": "This spray is really nice. It smells really good, ...",
 "parent_asin": "B00YQ6X8EO", "user_id": "AGKHLEW2SOWHNMFQIJGBECAF7INQ",
 "timestamp": 1588687728923, "helpful_vote": 0, "verified_purchase": true}`),
  ...bullets([
    "**JSON Lines (.jsonl)**: file mà mỗi dòng là một JSON, tức mỗi dòng là một review. Đọc từng dòng một nên không cần nạp cả file vào bộ nhớ.",
    "**.gz**: file đã được nén (giống .zip) cho nhẹ. File review nén còn 90 MB.",
    "**Parquet**: định dạng lưu bảng **theo cột** thay vì theo hàng. Muốn tính trung bình cột rating thì chỉ cần đọc mỗi cột đó, nhanh và gọn hơn nhiều so với CSV.",
    "**timestamp 1588687728923**: số mili giây tính từ 1/1/1970, tức ngày 05/05/2020. Máy tính hay lưu thời gian kiểu này.",
  ]),

  H2("2.2. Data Lake (hồ dữ liệu) và MinIO"),
  P("**Data Lake** là nơi cất **mọi loại dữ liệu ở dạng gốc**, giống một nhà kho lớn: hàng nhập về cứ để nguyên thùng, chưa cần sắp xếp. Ưu điểm: không mất gì, sau này muốn xử lý lại cách khác vẫn còn bản gốc."),
  P("Dự án chia hồ thành **3 vùng (zone)**, giống 3 khu trong nhà kho:"),
  ...table(null, ["Vùng", "Giống như", "Chứa gì trong dự án"], [
    ["`raw` (thô)", "Khu nhận hàng: nguyên đai nguyên kiện", "File gốc tải từ Amazon, World Bank; không ai được sửa"],
    ["`staging` (sơ chế)", "Khu sơ chế: rửa, cắt, phân loại", "Dữ liệu đã làm sạch, tích hợp (Parquet), báo cáo chất lượng"],
    ["`curated` (thành phẩm)", "Khu thành phẩm, sẵn sàng dùng", "Tập dữ liệu cho mô hình, kết quả mô hình (`metrics.json`)"],
  ], [2, 3.4, 4.2]),
  P("**MinIO** là phần mềm làm nhà kho đó. Nó nói chuyện theo chuẩn **S3** của Amazon, nên code viết cho MinIO cũng chạy được trên đám mây Amazon. Ba khái niệm cần nhớ:"),
  ...bullets([
    "**Bucket**: một thùng chứa lớn, như một ổ đĩa. Dự án có 3 bucket: `raw`, `staging`, `curated`.",
    "**Object**: một file bất kỳ cất trong bucket.",
    "**Key**: \"địa chỉ\" của file, ví dụ `amazon/reviews/All_Beauty/ingest_date=2026-10-25/All_Beauty.jsonl.gz`. Dấu `/` tạo cảm giác như thư mục.",
  ]),
  box("tip", "`ingest_date=2026-10-25` là ngày nạp dữ liệu. Mỗi ngày chạy lưu một bản riêng, nên có thể xem lại dữ liệu của ngày bất kỳ. Kỹ thuật này gọi là **phân vùng theo ngày (partition)**."),

  H2("2.3. Data Warehouse (kho dữ liệu) và PostgreSQL"),
  P("Nếu Data Lake là nhà kho, thì **Data Warehouse** là **siêu thị**: hàng đã được làm sạch, dán nhãn, xếp lên đúng kệ, để người phân tích tìm và tổng hợp thật nhanh. Kho dữ liệu dùng **bảng** (như Excel) và ngôn ngữ truy vấn **SQL**."),
  ...table(null, ["", "Data Lake", "Data Warehouse"], [
    ["Dữ liệu", "Mọi dạng, nguyên gốc", "Đã làm sạch, có cấu trúc bảng"],
    ["Mục đích", "Lưu trữ an toàn, xử lý lại khi cần", "Phân tích, báo cáo nhanh"],
    ["Trong dự án", "MinIO", "PostgreSQL (database tên `dwh`)"],
  ], [2, 3.8, 3.8]),
  P("**PostgreSQL** là hệ quản trị cơ sở dữ liệu mã nguồn mở rất phổ biến. Bạn hỏi nó bằng SQL, nó trả lời bằng bảng kết quả."),

  H2("2.4. ETL: quy trình đưa dữ liệu vào kho"),
  P("**ETL** viết tắt của 3 bước, giống nấu một món ăn:"),
  ...table(null, ["Bước", "Nghĩa", "Như nấu ăn", "Trong dự án"], [
    ["**E**xtract", "Trích xuất", "Đi chợ mua nguyên liệu", "Tải 3 nguồn dữ liệu vào vùng raw"],
    ["**T**ransform", "Biến đổi", "Nhặt rau, rửa, thái", "Bỏ dữ liệu lỗi, bỏ trùng, chuẩn hóa văn bản, ghép nguồn"],
    ["**L**oad", "Nạp", "Bày ra đĩa", "Ghi vào các bảng của kho PostgreSQL"],
  ], [1.4, 1.6, 2.6, 4]),

  H2("2.5. Lược đồ hình sao (Star Schema)"),
  P("Đây là cách **thiết kế bảng** trong kho dữ liệu. Hãy nghĩ tới một **hóa đơn siêu thị**:"),
  ...bullets([
    "Mỗi **dòng hàng** trên hóa đơn là một **sự kiện (fact)**: mua 2 hộp sữa, 30.000 đồng. Đây là những con số đo được.",
    "Để biết đầy đủ, cần các **chiều (dimension)** mô tả bối cảnh: *ai* mua, mua *sản phẩm gì*, mua *khi nào*.",
  ]),
  P("Bảng sự kiện nằm ở giữa, các bảng chiều xếp xung quanh như cánh sao, nên gọi là **hình sao**. Trong dự án:"),
  ...table(null, ["Bảng", "Loại", "Một dòng là", "Ví dụ cột", "Số dòng"], [
    ["`fact_reviews`", "Sự kiện", "Một review", "rating, nhãn cảm xúc, điểm cảm xúc, số lượt hữu ích", "691.806"],
    ["`dim_product`", "Chiều", "Một sản phẩm", "tên, thương hiệu, giá USD, giá VND, phân khúc giá", "112.385"],
    ["`dim_user`", "Chiều", "Một người dùng", "mã người dùng, số review đã viết", "629.831"],
    ["`dim_time`", "Chiều", "Một ngày", "ngày, tháng, quý, năm, thứ, tỷ giá năm đó", "6.557"],
    ["`review_text`", "Phụ trợ", "Văn bản của một review", "nội dung gốc và 2 bản đã xử lý", "691.806"],
  ], [2, 1.2, 2.2, 4.2, 1.4]),
  P("Bảng sự kiện **không chép lại** tên sản phẩm hay tên người dùng. Nó chỉ giữ **khóa** (một con số như `product_key = 1532`) trỏ sang bảng chiều. Khi cần, ta **nối (JOIN)** các bảng lại. Cách này tiết kiệm chỗ và tránh sai lệch dữ liệu."),
  ...figure("fig_star", "Hình 2.1. Lược đồ hình sao của dự án trên Portal (tab Kho dữ liệu)"),

  H2("2.6. SQL và OLAP: hỏi kho dữ liệu"),
  P("**SQL** là ngôn ngữ để hỏi cơ sở dữ liệu. Chỉ cần nhớ vài từ khóa:"),
  ...code(`SELECT   p.brand, count(*) AS so_review   -- lấy cột nào
FROM     fact_reviews f                      -- từ bảng nào
JOIN     dim_product p USING (product_key)   -- nối với bảng nào
WHERE    f.rating = 5                        -- lọc dòng nào
GROUP BY p.brand                             -- gom nhóm theo gì
ORDER BY so_review DESC LIMIT 10;            -- sắp xếp, lấy 10 dòng`),
  P("**OLAP** (phân tích trực tuyến) là các thao tác \"xoay\" dữ liệu để nhìn từ nhiều góc. Hãy hình dung dữ liệu là một **khối Rubik** với 3 trục: thời gian × sản phẩm × cảm xúc:"),
  ...table(null, ["Thao tác", "Nghĩa", "Ví dụ trong dự án"], [
    ["**Roll-up** (cuộn lên)", "Gộp lên mức tổng quát hơn", "Từ số review theo quý → theo năm"],
    ["**Drill-down** (khoan xuống)", "Đi xuống chi tiết hơn", "Năm 2021 → từng tháng của 2021"],
    ["**Slice** (cắt lát)", "Cố định một chiều", "Chỉ xem năm 2022"],
    ["**Dice** (cắt khối)", "Chọn khối con theo nhiều chiều", "Phân khúc giá × nhãn cảm xúc"],
  ], [2.6, 2.8, 4.2]),
  box("tip", "Tab **Kho dữ liệu** trên Portal có sẵn ô gõ SQL và 6 nút truy vấn mẫu cho đúng 4 thao tác này. Bấm thử là hiểu ngay."),

  H2("2.7. Pipeline và Airflow: tự động hóa các bước"),
  P("**Pipeline** (đường ống) là chuỗi các bước xử lý nối tiếp nhau, đầu ra bước trước là đầu vào bước sau. Làm tay từng bước mỗi ngày thì mệt và dễ quên, nên ta dùng **Apache Airflow** làm \"quản đốc\":"),
  ...bullets([
    "**DAG**: bản vẽ các bước và thứ tự của chúng (giống công thức nấu ăn: bước 3 chỉ làm khi bước 1 và 2 đã xong). DAG của dự án tên `amazon_reviews_pipeline`, có 8 bước (gọi là **task**).",
    "**Lịch chạy**: tự chạy mỗi ngày lúc 7:00 sáng (giờ Việt Nam).",
    "**Thử lại**: một bước lỗi (ví dụ rớt mạng) sẽ tự chạy lại 1 lần.",
    "**Log**: mỗi bước ghi nhật ký, lỗi ở đâu xem được ngay.",
    "**Chạy song song**: 3 bước tải dữ liệu độc lập với nhau nên chạy cùng lúc cho nhanh.",
  ]),
  ...figure("fig_dag", "Hình 2.2. DAG của dự án trên Portal: 8 task, màu xanh là đã chạy thành công"),

  H2("2.8. Docker: đóng gói phần mềm"),
  P("Dự án dùng 4 phần mềm lớn (MinIO, PostgreSQL, Airflow, Portal). Cài từng cái lên Windows rất mất công và dễ xung đột. **Docker** giải quyết bằng **container**: mỗi phần mềm được đóng trong một \"hộp\" riêng, có sẵn mọi thứ nó cần, chạy giống hệt nhau trên mọi máy."),
  ...bullets([
    "**Image**: bản đóng gói (như file cài đặt).",
    "**Container**: image đang chạy (như chương trình đang mở). Dự án có 4 container tên `amz-minio`, `amz-postgres`, `amz-airflow`, `amz-portal`.",
    "**Docker Compose**: file `docker-compose.yml` mô tả cả 4 container; chỉ cần lệnh `docker compose up -d` là dựng xong toàn bộ.",
    "**Cổng (port)**: số \"cửa\" để vào từng dịch vụ: 8000 (Portal), 8080 (Airflow), 9001 (MinIO), 5432 (PostgreSQL).",
  ]),

  H2("2.9. Học máy (Machine Learning) cơ bản"),
  P("**Học máy** là cho máy tính **học từ ví dụ** thay vì viết luật bằng tay. Ta đưa cho máy hàng trăm nghìn review **kèm đáp án** (review này tích cực, review kia tiêu cực). Máy tự tìm ra quy luật, rồi dùng quy luật đó đoán review mới."),
  ...bullets([
    "**Nhãn (label)**: đáp án. Dự án lấy nhãn từ số sao: 1–2★ là **Tiêu cực**, 3★ là **Trung tính**, 4–5★ là **Tích cực**.",
    "**Đặc trưng (feature)**: thông tin đưa vào để máy học, ở đây là các từ trong review (đã đổi thành số).",
    "**Tập huấn luyện (train) và tập kiểm thử (test)**: như ôn thi và thi thật. Máy học trên 80% dữ liệu (553.444 review), rồi làm bài kiểm tra trên 20% còn lại (138.362 review) mà nó **chưa từng thấy**. Điểm thi mới phản ánh đúng năng lực.",
    "**Quá khớp (overfitting)**: giống **học tủ**. Học thuộc bài ôn rất giỏi nhưng gặp đề lạ thì kém. Dấu hiệu là điểm trên tập ôn tiếp tục tăng còn điểm trên tập kiểm tra lại giảm.",
  ]),
  box("warn", "Nhãn suy từ số sao không phải lúc nào cũng khớp lời văn: có người cho 5★ nhưng viết toàn chê. Đây là \"nhiễu\" có sẵn trong dữ liệu thật."),

  H2("2.10. Xử lý ngôn ngữ tự nhiên (NLP): làm sạch văn bản"),
  P("Máy tính chỉ làm việc với con số, nên văn bản phải được **chuẩn hóa** rồi **đổi thành số**. Các bước chính:"),
  ...table(null, ["Bước", "Làm gì", "Ví dụ"], [
    ["Chữ thường", "Đổi hết sang chữ thường", "\"Great\" → \"great\""],
    ["Bỏ rác", "Xóa thẻ HTML, đường link, dấu câu", "\"good!!<br/>\" → \"good\""],
    ["Tách phủ định", "\"n't\" → \" not\"", "\"wouldn't\" → \"would not\""],
    ["Tách từ (tokenize)", "Cắt câu thành từng từ", "\"not good\" → [not, good]"],
    ["Bỏ từ dừng (stopword)", "Bỏ từ quá phổ biến, ít nghĩa", "bỏ \"the\", \"is\", \"and\"…"],
    ["Đưa về gốc (lemmatize)", "Đưa từ về dạng gốc", "\"returned\" → \"return\", \"smells\" → \"smell\""],
  ], [2.4, 3.4, 3.8]),
  box("warn", "Danh sách từ dừng chuẩn có chứa \"not\", \"no\", \"never\". Nếu xóa chúng thì \"not good\" thành \"good\": nghĩa đảo ngược! Dự án **giữ lại các từ phủ định**. Đây là một quyết định quan trọng, và kết quả cho thấy rất nhiều từ khóa quyết định của mô hình là cụm phủ định (\"not worth\", \"not disappoint\")."),
  P("Dự án tạo **2 phiên bản** văn bản cho 2 loại mô hình:"),
  ...bullets([
    "`text_light` (nhẹ): chỉ chữ thường, bỏ rác, tách phủ định; **giữ nguyên thứ tự và mọi từ**. Dùng cho BiLSTM vì mô hình này cần ngữ cảnh.",
    "`text_clean` (sạch): thêm bỏ từ dừng và đưa về gốc. Dùng cho Naive Bayes và Logistic Regression.",
  ]),

  H2("2.11. TF-IDF: đổi văn bản thành con số"),
  P("**TF-IDF** chấm điểm mức độ quan trọng của một từ trong một review:"),
  ...bullets([
    "**TF** (tần suất từ): từ xuất hiện càng nhiều trong review này thì càng quan trọng với review này.",
    "**IDF** (độ hiếm): từ xuất hiện trong càng **ít** review khác thì càng có giá trị phân biệt. Từ \"product\" có ở khắp nơi nên điểm thấp; từ \"refund\" (hoàn tiền) hiếm nên điểm cao, và thường báo hiệu khách không hài lòng.",
  ]),
  P("Kết quả: mỗi review thành một dãy 50.000 con số (mỗi số ứng với một từ hoặc **cụm 2 từ** như \"not worth\"). Dùng cụm 2 từ (**bigram**) giúp máy hiểu \"not worth\" khác hẳn \"worth\"."),

  H2("2.12. Ba mô hình được dùng"),
  ...table(null, ["Mô hình", "Ý tưởng dễ hiểu", "Ưu điểm", "Nhược điểm"], [
    ["**Naive Bayes**", "Đếm xác suất: từ \"worst\" xuất hiện trong review tiêu cực nhiều gấp bao nhiêu lần review tích cực, rồi nhân các xác suất lại", "Cực nhanh (5 giây)", "Coi các từ độc lập, bỏ qua thứ tự"],
    ["**Logistic Regression**", "Mỗi từ có một \"điểm cộng/trừ\" cho mỗi lớp; cộng tất cả lại, lớp nào điểm cao nhất thì chọn", "Nhanh, dễ giải thích (xem được từ nào quyết định)", "Vẫn bỏ qua thứ tự từ"],
    ["**BiLSTM** (học sâu)", "Mạng nơ-ron đọc từng từ **theo thứ tự**, có \"trí nhớ\" về các từ trước; đọc cả xuôi lẫn ngược (**Bi**-directional)", "Hiểu ngữ cảnh, câu phức tạp", "Cần nhiều dữ liệu, cần GPU, khó giải thích"],
  ], [2, 3.8, 2, 2.2]),
  ...bullets([
    "**Embedding**: thay vì 1 từ = 1 cột riêng như TF-IDF, BiLSTM học cho mỗi từ một vector 128 số sao cho các từ nghĩa gần nhau (\"great\", \"excellent\") có vector gần nhau.",
    "**GPU**: chip đồ họa tính được hàng nghìn phép toán cùng lúc. Trên GPU của Google Colab, BiLSTM học xong trong 175 giây; trên CPU máy cá nhân mất khoảng 44 phút (chậm hơn khoảng 15 lần).",
    "**Epoch**: một lượt học hết toàn bộ dữ liệu huấn luyện. BiLSTM học tối đa 8 lượt; tự dừng sớm (**EarlyStopping**) khi thấy không tiến bộ nữa để tránh học tủ.",
  ]),

  H2("2.13. Đánh giá mô hình: đọc các con số"),
  P("Giả sử có 100 review trung tính thật. Mô hình đoán 120 review là \"trung tính\", trong đó đúng 60:"),
  ...table(null, ["Chỉ số", "Câu hỏi nó trả lời", "Ví dụ trên"], [
    ["**Precision** (độ chính xác)", "Khi mô hình nói \"trung tính\", nó đúng bao nhiêu phần?", "60 / 120 = 0,50"],
    ["**Recall** (độ phủ)", "Trong các review trung tính thật, mô hình tìm ra được bao nhiêu?", "60 / 100 = 0,60"],
    ["**F1**", "Điểm cân bằng giữa Precision và Recall", "2 × 0,5 × 0,6 / (0,5 + 0,6) ≈ 0,545"],
    ["**Accuracy**", "Trên toàn bộ review, đoán đúng bao nhiêu phần?", ""],
  ], [2.6, 4.6, 2.4]),
  P("**Ma trận nhầm lẫn (confusion matrix)** là bảng đếm: hàng là đáp án thật, cột là đáp án mô hình đoán. Đường chéo là các ô đoán đúng; ô ngoài đường chéo cho biết mô hình hay nhầm lớp nào sang lớp nào."),
  box("warn", "Vì sao không chỉ dùng Accuracy? Trong dữ liệu, **71% review là Tích cực**. Một mô hình \"lười\" luôn đoán Tích cực cũng đạt Accuracy 71%, nhưng hoàn toàn vô dụng vì không bao giờ phát hiện được review chê. Đây gọi là **mất cân bằng lớp**."),
  P("Vì vậy dự án dùng **Macro-F1** làm chỉ số chính: tính F1 riêng cho từng lớp (Tiêu cực, Trung tính, Tích cực) rồi lấy trung bình cộng, **mỗi lớp nặng như nhau**. Lớp nhỏ mà làm kém sẽ kéo điểm xuống rõ rệt. Ngoài ra dự án còn:"),
  ...bullets([
    "**Trọng số lớp cân bằng (class_weight)**: phạt nặng hơn khi đoán sai lớp hiếm, để mô hình không bỏ quên chúng.",
    "**Chia tập phân tầng (stratify)**: tập train và tập test có cùng tỷ lệ 3 lớp như dữ liệu gốc.",
    "**Kiểm định chéo (cross-validation)**: chia dữ liệu làm 5 phần, lần lượt lấy 4 phần học và 1 phần chấm. Nhờ vậy mọi review đều được chấm bởi một mô hình **chưa từng thấy nó** (gọi là dự đoán **out-of-fold**), dùng để tính \"điểm cảm xúc\" cho cả kho mà không gian lận.",
  ]),

  // =============================================================== 3
  H1("Phần 3. Hành trình của một review qua hệ thống"),
  P("Ta theo dấu **một review có thật** trong dữ liệu, viết về chai xịt tóc *Herbivore Sea Mist Texturizing Salt Spray*, từ lúc nằm trên máy chủ Amazon tới khi thành con số trong kho."),
  H2("Bước 0. Khởi động hệ thống"),
  P("Lệnh `docker compose up -d` dựng 4 container. Airflow thấy hôm nay chưa chạy nên **tự chạy pipeline** (mỗi ngày một lần, khoảng 10 phút với toàn bộ dữ liệu)."),
  H2("Bước 1. Extract: tải dữ liệu về vùng raw"),
  ...table(null, ["Nguồn", "Lấy bằng cách", "Kết quả"], [
    ["Review Amazon (All_Beauty)", "Tải file thẳng từ máy chủ McAuley Lab (UCSD) vào MinIO", "File 90,1 MB nén, 701.528 review"],
    ["Thông tin sản phẩm", "Như trên", "File 38,0 MB nén, 112.590 sản phẩm"],
    ["Tỷ giá USD→VND", "Gọi API của Ngân hàng Thế giới (World Bank)", "Tỷ giá trung bình từng năm 1995–2024"],
  ], [2.6, 4, 3]),
  P("Review của chúng ta nằm đâu đó trong file 90 MB đó, ở dạng JSON như mục 2.1. Dữ liệu được **truyền thẳng** vào MinIO mà không lưu tạm ra ổ đĩa, và file gốc được giữ nguyên."),
  box("tip", "Vì sao cần nguồn thứ 3 (tỷ giá)? Đề tài là \"đa nguồn\". Hai nguồn Amazon thực ra cùng một bộ dữ liệu, nên thêm một nguồn khác hẳn (đơn vị khác, cách lấy khác) giúp đề tài thuyết phục hơn, đồng thời cho phép quy đổi giá sang VND."),
  H2("Bước 2. Transform: làm sạch và chuẩn hóa"),
  P("Chương trình đọc **tuần tự từng dòng** của file nén (không nạp cả file vào bộ nhớ). Với mỗi review:"),
  ...steps([
    "**Lấy mẫu**: giữ review với xác suất `SAMPLE_FRAC`. Hiện đặt bằng 1,0 nên giữ tất cả. Khi phát triển từng dùng 0,15 (giữ 15%) để chạy cho nhanh.",
    "**Kiểm tra lỗi**: bỏ review thiếu thông tin quan trọng, số sao ngoài khoảng 1–5, hoặc bị trùng. Kết quả: bỏ **7.276** review trùng và **2.446** review có nội dung rỗng, còn **691.806**.",
    "**Đổi thời gian**: 1588687728923 mili giây → ngày **05/05/2020**.",
    "**Xử lý văn bản**: tạo 2 phiên bản (xem bên dưới).",
    "**Ghép sản phẩm**: tìm sản phẩm có mã `B00YQ6X8EO` trong file thông tin sản phẩm → thương hiệu **HERBIVORE**. Sản phẩm này không có giá, nên phân khúc giá là \"Không rõ\".",
  ]),
  P("Đây là văn bản thật của review qua từng bước:"),
  ...table(null, ["Phiên bản", "Nội dung (rút gọn)"], [
    ["Gốc", "This spray is really nice. It smells really good, goes on really fine, and does the trick. … I'm gonna stick with this. Try it!"],
    ["`text_light` (cho BiLSTM)", "this spray is really nice it smells really good goes on really fine and does the trick … i m gonna stick with this try it"],
    ["`text_clean` (cho TF-IDF)", "spray really nice smell really good go really fine **doe** trick … gonna stick try"],
  ], [2.4, 7.2]),
  box("ex", "Để ý \"does\" bị đổi thành \"**doe**\" (con hươu cái)! Bộ chuẩn hóa từ WordNet nhầm \"does\" là danh từ số nhiều của \"doe\". Tương tự \"hoping\" bị đổi thành \"hop\". Đây là **hạn chế có thật** của công cụ, đã ghi trong báo cáo. Nó ảnh hưởng nhẹ vì mô hình vẫn học được \"doe trick\" ≈ \"does the trick\"."),
  P("Với sản phẩm có giá, giá được quy đổi: ví dụ một sản phẩm giá **$9,99** × tỷ giá năm 2023 (**23.787,32**) ≈ **237.600 đồng** (làm tròn trăm đồng), thuộc phân khúc \"200K – 500K\". Mỗi lần chạy, bước này ghi một **báo cáo chất lượng dữ liệu** (xem ở tab Tổng quan)."),
  H2("Bước 3. Load: nạp vào kho hình sao"),
  P("Review được tách thành nhiều mảnh nằm ở các bảng khác nhau, nối với nhau bằng khóa:"),
  ...table(null, ["Bảng", "Review của chúng ta trở thành"], [
    ["`fact_reviews`", "review_key = 1; rating = **5**; nhãn = **positive**; helpful_vote = 0; đã xác thực mua = có; 62 từ; time_key = 20200505"],
    ["`dim_product`", "B00YQ6X8EO · Herbivore - Natural Sea Mist Texturizing Salt Spray · HERBIVORE · giá: không rõ"],
    ["`dim_user`", "AGKHLEW2SOWHNMFQIJGBECAF7INQ"],
    ["`dim_time`", "05/05/2020 · quý 2 · năm 2020 · tỷ giá năm 2020: 23.208,37 VND/USD"],
    ["`review_text`", "tiêu đề + 3 phiên bản văn bản ở trên"],
  ], [2, 7.6]),
  H2("Bước 4. Khai phá: dạy máy đọc cảm xúc"),
  ...steps([
    "Trích dữ liệu **từ kho** (không phải từ file thô), chia 80% học / 20% kiểm tra.",
    "Huấn luyện Naive Bayes và Logistic Regression ngay trong Airflow.",
    "Chấm **điểm cảm xúc** cho mọi review: `điểm = P(tích cực) − P(tiêu cực)`, từ −1 (rất tiêu cực) tới +1 (rất tích cực). Review của chúng ta được **+0,38**, mô hình đoán **Tích cực** (đúng). Điểm không quá cao vì review có câu hơi chê \"you need a lot of it\".",
    "BiLSTM được huấn luyện riêng bằng notebook trên Google Colab (vì cần GPU), rồi tải kết quả lên vùng curated để so sánh.",
  ]),
  box("ex", "Hai review 2★ khác trong kho: \"A total waste of money…\" được điểm **−0,996** (rất tiêu cực, đoán đúng); còn \"I'm a little disappointed the black paint had already started to chip off\" được **−0,14**, bị đoán là Trung tính. Lời văn nhẹ nhàng nên máy thấy chưa đủ tiêu cực."),
  H2("Bước 5. Hiển thị trên Portal"),
  P("Trang web http://localhost:8000 đọc trực tiếp từ MinIO, PostgreSQL và Airflow, rồi hiển thị trên 5 tab:"),
  ...table(null, ["Tab", "Xem được gì"], [
    ["Tổng quan", "Các con số chính, luồng dữ liệu 5 bước, báo cáo chất lượng"],
    ["Data Lake", "File trong 3 vùng; bấm vào xem nội dung; file mới hiện ra **ngay lập tức** khi pipeline ghi"],
    ["Pipeline", "Sơ đồ 8 bước của Airflow, trạng thái, thời gian, log; nút chạy lại"],
    ["Kho dữ liệu", "Lược đồ hình sao, 8 biểu đồ phân tích, ô gõ SQL"],
    ["Khai phá dữ liệu", "So sánh 3 mô hình, ma trận nhầm lẫn, từ khóa quyết định, review bị đoán sai"],
  ], [2.4, 7.2]),

  // =============================================================== 4
  H1("Phần 4. Đọc và hiểu kết quả"),
  H2("4.1. Những điều kho dữ liệu cho biết"),
  ...bullets([
    "**Khách hàng chủ yếu hài lòng**: 60% review là 5★, 71,3% là tích cực, rating trung bình 3,96★.",
    "**Đỉnh số review** là tháng 3/2021 (13.885 review trong một tháng), có thể liên quan tới mua sắm trực tuyến tăng trong dịch COVID-19.",
    "**Giá cao chưa chắc tốt hơn**: phân khúc 1–2 triệu đồng được chấm cao nhất (4,24★), nhưng trên 2 triệu lại giảm (4,08★); dưới 200 nghìn thấp nhất (3,96★).",
    "**Điều bất ngờ**: review **đã xác thực mua hàng** chấm thấp hơn (3,95★) so với review **chưa xác thực** (4,08★). Có thể người chưa thật sự mua dễ khen hơn.",
    "**Hạn chế dữ liệu**: 84% sản phẩm không có giá trong dữ liệu gốc, nên phân tích theo giá chỉ dựa trên khoảng 26% review.",
  ]),
  H2("4.2. So sánh ba mô hình"),
  ...table("Bảng 4.1. Kết quả trên 138.362 review kiểm thử", ["Mô hình", "Accuracy", "Macro-F1", "F1 Trung tính", "Thời gian học"], [
    ["Naive Bayes", "77,0%", "0,648", "0,335", "5 giây"],
    ["Logistic Regression", "81,1%", "0,673", "0,351", "204 giây"],
    ["**BiLSTM**", "**82,6%**", "**0,706**", "**0,406**", "175 giây (GPU)"],
  ], [3, 1.6, 1.6, 1.8, 2]),
  P("Cách đọc: **BiLSTM thắng ở mọi chỉ số.** Cả 3 mô hình đều đoán tốt review Tích cực (F1 khoảng 0,9) và Tiêu cực (khoảng 0,75), nhưng **lớp Trung tính khó nhất** (F1 chỉ 0,34–0,41)."),
  ...figure("fig_mn_cm", "Hình 4.1. Ma trận nhầm lẫn của 3 mô hình (% theo hàng; ô càng đậm càng nhiều)"),
  P("Vì sao Trung tính khó? Review 3★ thường **vừa khen vừa chê** (\"đẹp nhưng nhanh hỏng\"), nên ranh giới với hai lớp kia mờ. Lớp này cũng ít mẫu (chỉ 8%). Ma trận cho thấy BiLSTM tìm ra 66% review trung tính, nhưng cũng kéo nhầm nhiều review tích cực sang trung tính."),
  H2("4.3. Phát hiện quan trọng nhất: học sâu cần nhiều dữ liệu"),
  ...table("Bảng 4.2. Macro-F1 khi học trên 15% và 100% dữ liệu", ["Mô hình", "15% dữ liệu", "100% dữ liệu", "Thay đổi"], [
    ["Naive Bayes", "0,651", "0,648", "−0,003"],
    ["Logistic Regression", "**0,660** (tốt nhất)", "0,673", "+0,013"],
    ["BiLSTM", "0,649", "**0,706** (tốt nhất)", "**+0,057**"],
  ], [3, 2.2, 2.2, 1.8]),
  P("Khi chỉ có 15% dữ liệu, mô hình truyền thống (Logistic Regression) thắng. Khi có đủ dữ liệu, BiLSTM tăng mạnh nhất và vượt lên. Đây là bài học kinh điển: **mô hình học sâu mạnh hơn nhưng \"đói\" dữ liệu**; ít dữ liệu thì mô hình đơn giản an toàn hơn."),
  box("tip", "Bản BiLSTM chạy trên CPU máy cá nhân cho Macro-F1 0,704, gần như trùng bản GPU (0,706). Điều đó chứng tỏ kết quả **ổn định, không phải ăn may**."),
  H2("4.4. Mô hình học được gì?"),
  P("Logistic Regression cho xem trọng số từng từ. Các từ/cụm quyết định mạnh nhất:"),
  ...table(null, ["Lớp", "Từ khóa quyết định"], [
    ["Tiêu cực", "not recommend, worst, disappoint, not worth, not happy"],
    ["Trung tính", "not worst, not amaze, better worse, not best"],
    ["Tích cực", "not disappoint, perfect, best, amaze, great"],
  ], [2, 7.6]),
  P("Rất nhiều cụm có \"not\": nếu xóa từ phủ định như cách làm thông thường, mô hình đã mất những tín hiệu này. Để ý \"amaze\" là \"amazing\" đã được đưa về gốc."),

  // =============================================================== 5
  H1("Phần 5. Bản đồ mã nguồn"),
  P("Thư mục dự án `cuoiki/`. Không cần đọc hết code; chỉ cần biết **file nào làm việc gì**:"),
  ...table(null, ["File / thư mục", "Vai trò"], [
    ["`docker-compose.yml`", "Mô tả 4 container và cách chúng nối với nhau"],
    ["`.env`", "Cấu hình: tài khoản, danh mục sản phẩm (`AMZ_CATEGORY`), tỷ lệ lấy mẫu (`SAMPLE_FRAC`)"],
    ["`airflow/dags/amazon_reviews_pipeline.py`", "Bản vẽ DAG: 8 task và thứ tự"],
    ["`pipeline/amz/extract.py`", "Bước 1: tải 3 nguồn vào vùng raw"],
    ["`pipeline/amz/transform.py`", "Bước 2: lấy mẫu, làm sạch, NLP, ghép nguồn, quy đổi giá"],
    ["`pipeline/amz/load.py`", "Bước 3: nạp vào các bảng hình sao"],
    ["`pipeline/amz/mining.py`", "Bước 4: chia tập, TF-IDF, Naive Bayes, Logistic Regression, điểm cảm xúc"],
    ["`pipeline/amz/lake.py`, `config.py`", "Hàm đọc/ghi MinIO; các hằng số cấu hình"],
    ["`sql/dw_schema.sql`", "Lệnh tạo các bảng của kho dữ liệu"],
    ["`notebooks/train_lstm_colab.ipynb`", "Huấn luyện BiLSTM (chạy trên Colab)"],
    ["`portal/app.py`", "Phần máy chủ của trang web: lấy dữ liệu từ 3 hệ thống"],
    ["`portal/static/`", "Phần giao diện: HTML, CSS, JavaScript, biểu đồ"],
    ["`BaoCao_DoAn.docx`, `detai_capnhat.docx`", "Báo cáo đồ án và đề tài cập nhật"],
    ["`agent.md`", "Hồ sơ toàn bộ dự án và tiến độ (gửi cho người khác hoặc AI là đủ)"],
    ["`huongdanchay.md`, `README.md`", "Hướng dẫn chạy; tài liệu kỹ thuật"],
  ], [3.8, 5.8]),
  H2("Muốn thay đổi X thì sửa ở đâu?"),
  ...table(null, ["Muốn…", "Sửa ở"], [
    ["Lấy ít hoặc nhiều dữ liệu hơn", "`SAMPLE_FRAC` trong `.env` (sau đó `docker compose up -d` và chạy lại pipeline; nhớ train lại BiLSTM)"],
    ["Đổi sang danh mục sản phẩm khác", "`AMZ_CATEGORY` trong `.env` (ví dụ `Video_Games`)"],
    ["Đổi cách làm sạch văn bản", "`pipeline/amz/transform.py` (hàm `clean_light`, `clean_full`)"],
    ["Đổi tham số mô hình", "`pipeline/amz/mining.py`; BiLSTM trong notebook"],
    ["Thêm biểu đồ trên web", "`portal/app.py` (lấy dữ liệu) và `portal/static/app.js` (vẽ)"],
    ["Đổi giờ chạy tự động", "`schedule=` trong file DAG"],
  ], [3.6, 6]),

  // =============================================================== 6
  H1("Phần 6. Tự thực hành"),
  P("Bật Docker Desktop, chạy `docker compose up -d` trong thư mục dự án, mở http://localhost:8000 rồi làm lần lượt:"),
  H3("Bài 1. Đi một vòng Portal (10 phút)"),
  ...steps([
    "Tab **Tổng quan**: tìm số review trong kho và Macro-F1 tốt nhất. Đối chiếu với Phần 1.",
    "Tab **Data Lake**: bấm bucket `raw`, mở file `.jsonl.gz`, xem vài review gốc. Sau đó mở `staging` → `reviews_clean.parquet` để thấy dữ liệu đã làm sạch.",
    "Tab **Pipeline**: bấm vào ô `transform` để đọc log; xem kết quả trả về (XCom) có bao nhiêu review sạch.",
  ]),
  H3("Bài 2. Truy vấn kho dữ liệu"),
  P("Vào tab **Kho dữ liệu**, kéo xuống ô SQL, dán từng câu rồi bấm **Chạy truy vấn**:"),
  ...code(`-- a) Đếm review theo số sao
SELECT rating, count(*) FROM fact_reviews GROUP BY rating ORDER BY rating;

-- b) Tìm lại review trong Phần 3 và điểm cảm xúc của nó
SELECT f.rating, f.sentiment_score, f.sentiment_pred, left(t.text_raw, 120)
FROM fact_reviews f JOIN review_text t USING (review_key)
WHERE f.review_key = 1;

-- c) 10 thương hiệu được khen nhiều nhất (ít nhất 300 review)
SELECT p.brand, count(*) AS n, round(avg(f.rating), 2) AS sao_tb
FROM fact_reviews f JOIN dim_product p USING (product_key)
WHERE p.brand <> 'Unknown'
GROUP BY p.brand HAVING count(*) >= 300
ORDER BY sao_tb DESC LIMIT 10;

-- d) Review 5 sao nhưng lời lẽ rất tiêu cực (nhiễu nhãn)
SELECT f.sentiment_score, left(t.text_raw, 150)
FROM fact_reviews f JOIN review_text t USING (review_key)
WHERE f.rating = 5 AND f.sentiment_score < -0.8 LIMIT 10;`),
  P("Câu hỏi tự kiểm tra: câu (c) là thao tác OLAP nào? (Gợi ý: gom nhóm theo thương hiệu là roll-up theo chiều sản phẩm, còn lọc `rating = 5` ở câu (d) là slice.)"),
  H3("Bài 3. Xem trực tiếp bằng công cụ gốc"),
  ...bullets([
    "**MinIO Console**: http://localhost:9001 (minioadmin / minioadmin123): duyệt file như trong File Explorer.",
    "**Airflow UI**: http://localhost:8080 (admin / admin): giao diện gốc của Airflow.",
    "**PostgreSQL** bằng dòng lệnh: `docker exec -it amz-postgres psql -U dw -d dwh`, gõ `\\dt` để liệt kê bảng, `\\q` để thoát.",
  ]),
  H3("Bài 4. Đọc ma trận nhầm lẫn"),
  P("Vào tab **Khai phá dữ liệu**, nhìn ma trận của BiLSTM. Trả lời: trong các review thật sự Tích cực, bao nhiêu phần trăm bị đoán nhầm sang Trung tính? Vì sao mô hình hay nhầm như vậy? (Gợi ý: xem lại mục 2.13 về trọng số lớp.)"),

  // =============================================================== 7
  H1("Phần 7. Câu hỏi thường gặp khi bảo vệ đồ án"),
  ...[
    ["Vì sao cần cả Data Lake lẫn Data Warehouse, không dùng một cái?", "Lake giữ bản gốc nguyên vẹn, rẻ, chứa được mọi định dạng, nên có thể xử lý lại khi đổi cách làm sạch. Warehouse đã sắp xếp sẵn theo bảng nên truy vấn phân tích nhanh. Hai cái bổ sung cho nhau."],
    ["Dự án \"đa nguồn\" ở chỗ nào?", "Ba nguồn độc lập: review Amazon (file JSON Lines), thông tin sản phẩm (file JSON Lines riêng), và tỷ giá từ API của World Bank (khác đơn vị cung cấp, khác cách lấy). Tỷ giá dùng để quy đổi giá sang VND và gắn vào chiều thời gian."],
    ["Vì sao chọn lược đồ hình sao?", "Đơn giản, ít phép nối, rất nhanh cho các truy vấn tổng hợp (đếm, trung bình theo thời gian/sản phẩm). Đây là thiết kế chuẩn của Kimball cho kho dữ liệu."],
    ["Vì sao dùng Macro-F1 thay vì Accuracy?", "Dữ liệu mất cân bằng (71% tích cực). Mô hình luôn đoán \"tích cực\" vẫn đạt 71% Accuracy nhưng vô dụng. Macro-F1 cho mỗi lớp trọng số bằng nhau nên phản ánh đúng khả năng nhận diện lớp hiếm."],
    ["Vì sao không xóa từ \"not\"?", "Xóa thì \"not good\" thành \"good\", đảo nghĩa. Kết quả xác nhận: nhiều từ khóa quyết định nhất là cụm phủ định như \"not worth\", \"not disappoint\"."],
    ["Nhãn lấy từ đâu? Có đáng tin không?", "Suy từ số sao (1–2, 3, 4–5). Đây là cách phổ biến khi không có người gán nhãn tay. Có nhiễu (5★ mà chê), đã phân tích trong phần review bị đoán sai."],
    ["Làm sao tránh mô hình \"học tủ\"?", "Chia tập train/test riêng; BiLSTM có 10% dữ liệu kiểm định và EarlyStopping (dừng khi điểm kiểm định không còn tăng, giữ bản tốt nhất); Dropout; điểm cảm xúc tính bằng dự đoán out-of-fold."],
    ["Vì sao BiLSTM tốt hơn, nhưng khi ít dữ liệu lại thua?", "BiLSTM có khoảng 3,95 triệu tham số, cần nhiều ví dụ để học đúng; ít dữ liệu thì dễ học tủ. Với 15% dữ liệu nó thua Logistic Regression, với 100% thì thắng (Macro-F1 0,706 so với 0,673)."],
    ["Lớp Trung tính vì sao kém?", "Review 3★ vừa khen vừa chê, ranh giới mờ, và chỉ chiếm 8% dữ liệu. Hướng cải thiện: embedding tiền huấn luyện, Transformer (DistilBERT), chỉnh ngưỡng."],
    ["Pipeline có chạy lại được không? Có ra cùng kết quả không?", "Có. Lệnh `docker compose up -d` dựng lại toàn bộ; mọi bước ngẫu nhiên dùng hạt giống cố định (42), kho được nạp lại toàn bộ mỗi lần, nên chạy lại cho cùng số liệu (đã kiểm chứng)."],
    ["Vì sao dùng MinIO mà không dùng AWS S3?", "MinIO tương thích chuẩn S3 nhưng chạy miễn phí trên máy cá nhân bằng Docker; code chuyển sang S3 thật chỉ cần đổi địa chỉ."],
    ["Điểm cảm xúc (sentiment_score) tính thế nào?", "Bằng xác suất tích cực trừ xác suất tiêu cực do Logistic Regression dự đoán, trong khoảng −1 đến +1, tính out-of-fold nên mỗi review được chấm bởi mô hình chưa từng thấy nó."],
  ].flatMap(([q, a]) => [
    new Paragraph({ children: [new TextRun({ text: "Hỏi: ", bold: true, color: "2A78D6" }), new TextRun({ text: q, bold: true })], spacing: { before: 160, after: 40 } }),
    new Paragraph({ children: [new TextRun({ text: "Đáp: ", bold: true }), ...runs(a)], spacing: { after: 100, line: 290 } }),
  ]),

  // =============================================================== 8
  H1("Phần 8. Bảng thuật ngữ"),
  ...table(null, ["Thuật ngữ", "Giải thích ngắn"], [
    ["Accuracy", "Tỷ lệ đoán đúng trên tổng số"],
    ["Airflow", "Phần mềm điều phối và lập lịch các bước xử lý dữ liệu"],
    ["API", "Cổng để chương trình này hỏi dữ liệu từ chương trình khác qua mạng"],
    ["BiLSTM", "Mạng nơ-ron hồi quy đọc văn bản theo cả hai chiều, có trí nhớ ngữ cảnh"],
    ["Bucket / Object / Key", "Thùng chứa / file / địa chỉ file trong MinIO"],
    ["Class imbalance", "Mất cân bằng lớp: một lớp chiếm tỷ lệ áp đảo"],
    ["class_weight", "Trọng số phạt nặng hơn khi đoán sai lớp hiếm"],
    ["Confusion matrix", "Ma trận nhầm lẫn: đếm cặp (đáp án thật, đáp án đoán)"],
    ["Container / Image", "Phần mềm đóng hộp đang chạy / bản đóng gói của nó (Docker)"],
    ["Cross-validation", "Kiểm định chéo: chia dữ liệu nhiều phần, lần lượt học và chấm"],
    ["DAG / Task", "Sơ đồ các bước có thứ tự / một bước trong đó"],
    ["Data Lake", "Hồ dữ liệu: lưu dữ liệu mọi dạng ở dạng gốc"],
    ["Data Warehouse", "Kho dữ liệu: dữ liệu đã làm sạch, sắp theo bảng để phân tích"],
    ["Dimension / Fact", "Bảng chiều (bối cảnh: ai, gì, khi nào) / bảng sự kiện (con số đo)"],
    ["Docker Compose", "Công cụ dựng nhiều container cùng lúc từ một file cấu hình"],
    ["Embedding", "Vector số biểu diễn nghĩa của một từ"],
    ["Epoch", "Một lượt học hết dữ liệu huấn luyện"],
    ["EarlyStopping", "Tự dừng huấn luyện khi không còn tiến bộ"],
    ["ETL", "Extract – Transform – Load: trích xuất, biến đổi, nạp"],
    ["F1 / Macro-F1", "Điểm cân bằng Precision và Recall / trung bình F1 các lớp, mỗi lớp nặng như nhau"],
    ["GPU", "Chip tính song song, giúp huấn luyện học sâu nhanh hơn nhiều"],
    ["JOIN", "Nối hai bảng theo cột khóa chung"],
    ["JSON / JSON Lines", "Định dạng dữ liệu dạng \"tên: giá trị\" / mỗi dòng một JSON"],
    ["Label", "Nhãn: đáp án đúng để máy học"],
    ["Lemmatization", "Đưa từ về dạng gốc (returned → return)"],
    ["Logistic Regression", "Mô hình cộng điểm từng từ để chọn lớp có điểm cao nhất"],
    ["MinIO", "Phần mềm lưu trữ file kiểu S3, làm Data Lake"],
    ["Naive Bayes", "Mô hình xác suất đếm từ, rất nhanh"],
    ["NLP", "Xử lý ngôn ngữ tự nhiên: cho máy làm việc với văn bản"],
    ["OLAP", "Phân tích nhiều chiều: roll-up, drill-down, slice, dice"],
    ["Out-of-fold", "Dự đoán bởi mô hình chưa từng học trên mẫu đó"],
    ["Overfitting", "Quá khớp, \"học tủ\": giỏi bài ôn, kém bài mới"],
    ["Parquet", "Định dạng lưu bảng theo cột, nhanh và gọn"],
    ["Pipeline", "Chuỗi bước xử lý dữ liệu nối tiếp nhau"],
    ["Portal", "Trang web tổng hợp của dự án (http://localhost:8000)"],
    ["PostgreSQL", "Hệ quản trị cơ sở dữ liệu, dùng làm kho dữ liệu"],
    ["Precision / Recall", "Khi nói X thì đúng bao nhiêu / tìm ra được bao nhiêu phần X thật"],
    ["SAMPLE_FRAC", "Tỷ lệ review được lấy (1,0 = 100%)"],
    ["SQL", "Ngôn ngữ truy vấn cơ sở dữ liệu"],
    ["Star schema", "Lược đồ hình sao: bảng sự kiện ở giữa, bảng chiều xung quanh"],
    ["Stopword", "Từ dừng: từ quá phổ biến, ít mang nghĩa (the, is, and)"],
    ["Stratify", "Chia tập giữ nguyên tỷ lệ các lớp"],
    ["TF-IDF", "Cách chấm điểm từ: nhiều trong review này, hiếm trong toàn bộ"],
    ["Train / Test", "Tập học / tập kiểm tra (chưa từng thấy)"],
  ], [2.8, 6.8]),
];

// ------------------------------------------------------------------ document
const stepConfigs = Array.from({ length: 30 }, (_, i) => ({ reference: `steps${i}`, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }));
const doc = new Document({
  creator: "Nhóm đồ án", title: "Tài liệu học: hiểu toàn bộ dự án",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 36, bold: true, color: "14213D" },
        paragraph: { spacing: { before: 120, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: "2A6BC2" },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 25, bold: true, color: "14213D" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ...stepConfigs,
  ] },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: cover },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, pageNumbers: { start: 1 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20, color: "898781" })] })] }) },
      children: body },
  ],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("written", OUT, buf.length); });
