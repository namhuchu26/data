"""Sinh file flow.drawio: sơ đồ luồng toàn bộ dự án (mở bằng draw.io / diagrams.net)."""
import sys
from xml.sax.saxutils import quoteattr

OUT = sys.argv[1] if len(sys.argv) > 1 else "flow.drawio"
cells = []
_id = [1]


def nid():
    _id[0] += 1
    return f"n{_id[0]}"


def node(label, x, y, w, h, style, parent="1"):
    i = nid()
    cells.append(f'<mxCell id="{i}" value={quoteattr(label)} style="{style}" vertex="1" parent="{parent}">'
                 f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return i


def edge(src, dst, label="", style="", parent="1", pts=None, ports=""):
    i = nid()
    geo = '<mxGeometry relative="1" as="geometry"/>'
    if pts:
        geo = ('<mxGeometry relative="1" as="geometry"><Array as="points">'
               + "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts) + '</Array></mxGeometry>')
    cells.append(f'<mxCell id="{i}" value={quoteattr(label)} style="{style}{ports}" edge="1" parent="{parent}" source="{src}" target="{dst}">'
                 f'{geo}</mxCell>')
    return i


def port(ex=None, ey=None, nx=None, ny=None):
    out = ""
    if ex is not None:
        out += f"exitX={ex};exitY={ey};exitDx=0;exitDy=0;"
    if nx is not None:
        out += f"entryX={nx};entryY={ny};entryDx=0;entryDy=0;"
    return out


FONT = "fontFamily=Arial;fontSize=12;fontColor=#000000;"
GROUP = ("rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;align=left;spacingLeft=10;spacingTop=4;"
         "fontStyle=1;fontSize=13;fontFamily=Arial;fillColor=none;strokeColor=#999999;dashed=1;")
BOX = "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#000000;" + FONT
SRC = TASK = ML = BOX
DB = DW = "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=10;fillColor=#FFFFFF;strokeColor=#000000;" + FONT
PORTAL = "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#000000;align=left;spacingLeft=10;" + FONT
NOTE = "text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontFamily=Arial;fontSize=11;fontColor=#333333;"
FLOW = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Arial;fontSize=10;"
DATA = "edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=8;html=1;endArrow=block;endFill=1;dashed=1;strokeColor=#000000;strokeWidth=1;fontFamily=Arial;fontSize=10;fontColor=#000000;labelBackgroundColor=#FFFFFF;"
READ = "edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=8;html=1;endArrow=open;dashed=1;dashPattern=1 3;strokeColor=#777777;strokeWidth=1;fontFamily=Arial;fontSize=10;fontColor=#555555;labelBackgroundColor=#FFFFFF;"

# ------------------------------------------------------------------ tiêu đề
node("<b>Luồng dữ liệu của dự án</b>: Data Pipeline đa nguồn &amp; Khai phá cảm xúc đánh giá sản phẩm (Amazon Reviews 2023, All_Beauty, 100% dữ liệu)",
     20, 10, 1600, 30, "text;html=1;align=left;verticalAlign=middle;fontFamily=Arial;fontSize=16;")

# ------------------------------------------------------------------ 1. nguồn
node("1. NGUỒN DỮ LIỆU", 20, 60, 240, 440, GROUP)
s1 = node("<b>Amazon Reviews</b><br>All_Beauty.jsonl.gz<br>701.528 review · 90 MB", 40, 110, 200, 80, SRC)
s2 = node("<b>Item Metadata</b><br>meta_All_Beauty.jsonl.gz<br>112.590 sản phẩm · 38 MB", 40, 240, 200, 80, SRC)
s3 = node("<b>World Bank API</b><br>REST · JSON<br>Tỷ giá USD→VND 1995–2024", 40, 370, 200, 80, SRC)

# ------------------------------------------------------------------ 2. airflow
g_af = node("2. APACHE AIRFLOW: DAG amazon_reviews_pipeline (chạy @daily 07:00, thử lại 1 lần, tối đa 1 lần chạy cùng lúc)",
     290, 60, 1020, 440, GROUP)
e1 = node("<b>extract_reviews</b><br>stream file vào raw", 320, 120, 170, 60, TASK)
e2 = node("<b>extract_metadata</b><br>stream file vào raw", 320, 250, 170, 60, TASK)
e3 = node("<b>extract_fx</b><br>gọi API, lưu JSON", 320, 380, 170, 60, TASK)
tr = node("<b>transform</b><br>lấy mẫu · làm sạch · NLP<br>ghép nguồn · quy đổi VND", 540, 235, 190, 90, TASK)
ld = node("<b>load_warehouse</b><br>tạo lược đồ hình sao<br>nạp bằng COPY", 780, 240, 170, 80, TASK)
bd = node("<b>mining.build_dataset</b><br>trích từ kho<br>chia 80/20 (stratify)", 990, 240, 160, 80, TASK)
tb = node("<b>mining.train_baselines</b><br>TF-IDF + Naive Bayes,<br>Logistic Regression", 1150, 110, 150, 80, TASK)
sr = node("<b>mining.score_reviews</b><br>điểm cảm xúc<br>out-of-fold 5-fold", 1150, 370, 150, 80, TASK)
for a in (e1, e2, e3):
    edge(a, tr, "", FLOW)
edge(tr, ld, "", FLOW)
edge(ld, bd, "", FLOW)
edge(bd, tb, "", FLOW)
edge(bd, sr, "", FLOW)
# nguồn -> extract
edge(s1, e1, "HTTP", FLOW)
edge(s2, e2, "HTTP", FLOW)
edge(s3, e3, "REST", FLOW)

# ------------------------------------------------------------------ 3. minio
g_lake = node("3. DATA LAKE: MinIO (S3)", 290, 560, 640, 230, GROUP)
raw = node("<b>raw/</b><br>file gốc nguyên vẹn<br>phân vùng ingest_date", 320, 610, 170, 150, DB)
stg = node("<b>staging/</b><br>reviews_clean.parquet<br>products_clean.parquet<br>fx_usd_vnd.parquet<br>_reports/quality_*.json", 520, 610, 190, 150, DB)
cur = node("<b>curated/</b><br>sentiment_dataset.parquet<br>predictions_oof.parquet<br>models/*/metrics.json", 740, 610, 170, 150, DB)

# ------------------------------------------------------------------ 4. kho
g_dw = node("4. KHO DỮ LIỆU: PostgreSQL (dwh)", 960, 560, 350, 230, GROUP)
dw = node("<b>Lược đồ hình sao</b><br>fact_reviews (691.806)<br>dim_product · dim_user · dim_time<br>review_text · etl_load_log", 990, 610, 290, 150, DW)

# ------------------------------------------------------------------ 5. colab
node("5. HỌC SÂU (ngoài Airflow)", 290, 830, 640, 150, GROUP)
cb = node("<b>Google Colab · GPU T4</b><br>notebooks/train_lstm_colab.ipynb<br>BiLSTM · 175 giây · Macro-F1 0,706", 320, 880, 300, 80, ML)
node("Tải sentiment_dataset.parquet về → chạy notebook → tải metrics.json lên curated/models/lstm/ (qua Portal)",
     560, 838, 360, 36, NOTE)

# ------------------------------------------------------------------ 6. portal
node("6. PORTAL · http://localhost:8000<br><span style=\"font-weight:normal\">FastAPI + Chart.js</span>",
     1350, 60, 270, 730, GROUP)
p_ov = node("<b>Tổng quan</b><br>chỉ số chính · báo cáo chất lượng", 1370, 130, 230, 60, PORTAL)
p_lk = node("<b>Data Lake</b><br>duyệt file · sự kiện realtime", 1370, 230, 230, 60, PORTAL)
p_pl = node("<b>Pipeline</b><br>sơ đồ DAG · log · chạy ngay", 1370, 330, 230, 60, PORTAL)
p_dw = node("<b>Kho dữ liệu</b><br>hình sao · OLAP · SQL", 1370, 610, 230, 60, PORTAL)
p_mn = node("<b>Khai phá dữ liệu</b><br>so sánh NB · LR · BiLSTM", 1370, 700, 230, 60, PORTAL)

# ------------------------------------------------------------------ đọc / ghi lưu trữ
edge(e3, raw, "3 task extract ghi file gốc", DATA, ports=port(0.5, 1, 0.5, 0))
edge(raw, tr, "đọc tuần tự", DATA, pts=[(456, 520), (575, 520)], ports=port(0.8, 0, 0.18, 1))
edge(tr, stg, "Parquet sạch", DATA, ports=port(0.7, 1, 0.8, 0))
edge(stg, ld, "đọc", DATA, pts=[(700, 530), (810, 530)], ports=port(0.95, 0, 0.18, 1))
edge(ld, dw, "COPY vào 5 bảng", DATA, pts=[(933, 545), (1040, 545)], ports=port(0.9, 1, 0.17, 0))
edge(dw, bd, "SELECT", DATA, pts=[(1325, 662), (1325, 280)], ports=port(1, 0.35, 1, 0.5))
edge(bd, cur, "dataset", DATA, pts=[(1102, 515), (870, 515)], ports=port(0.7, 1, 0.76, 0))
edge(tb, cur, "metrics.json", DATA, pts=[(760, 150)], ports=port(0, 0.5, 0.12, 0))
edge(sr, dw, "sentiment_score", DATA, ports=port(0.5, 1, 0.81, 0))
edge(cur, cb, "tải về", DATA, pts=[(782, 905)], ports=port(0.25, 1, 1, 0.31))
edge(cb, cur, "metrics.json", DATA, pts=[(850, 935)], ports=port(1, 0.69, 0.65, 1))

# ------------------------------------------------------------------ portal đọc
edge(p_lk, g_lake, "đọc MinIO", READ, pts=[(1340, 260), (1340, 810), (610, 810)], ports=port(0, 0.5, 0.5, 1))
edge(p_pl, g_af, "REST API v2", READ, ports=port(0, 0.5, 1, 0.68))
edge(p_dw, dw, "SQL", READ, ports=port(0, 0.5, 1, 0.2))

# ------------------------------------------------------------------ chú giải
node("<b>Chú giải</b>", 20, 560, 240, 30, "text;html=1;fontFamily=Arial;fontSize=12;align=left;fontStyle=1;")
lg1 = node("", 30, 600, 1, 1, "point;")
lg1b = node("thứ tự xử lý / luồng điều khiển", 120, 590, 140, 20, NOTE)
edge(lg1, lg1b, "", FLOW)
lg2 = node("", 30, 640, 1, 1, "point;")
lg2b = node("đọc / ghi dữ liệu", 120, 630, 140, 20, NOTE)
edge(lg2, lg2b, "", DATA)
lg3 = node("", 30, 680, 1, 1, "point;")
lg3b = node("Portal đọc để hiển thị", 120, 670, 140, 20, NOTE)
edge(lg3, lg3b, "", READ)
node("Tất cả chạy trong Docker Compose: amz-minio (9000/9001), amz-postgres (5432), amz-airflow (8080), amz-portal (8000).",
     20, 720, 240, 80, NOTE)

xml = ('<mxfile host="app.diagrams.net"><diagram id="flow" name="Luồng dự án">'
       '<mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" '
       'fold="1" page="1" pageScale="1" pageWidth="1660" pageHeight="1020" math="0" shadow="0"><root>'
       '<mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(cells) +
       '</root></mxGraphModel></diagram></mxfile>')
with open(OUT, "w", encoding="utf-8") as f:
    f.write(xml)
print("written", OUT, len(cells), "cells")
