"""Sinh kien_truc.drawio: sơ đồ kiến trúc dạng cột (phong cách đơn giản, đen trắng) theo đúng luồng dự án."""
import sys
from xml.sax.saxutils import quoteattr

OUT = sys.argv[1] if len(sys.argv) > 1 else "kien_truc.drawio"
cells = []
_id = [1]


def nid():
    _id[0] += 1
    return f"n{_id[0]}"


def node(label, x, y, w, h, style):
    i = nid()
    cells.append(f'<mxCell id="{i}" value={quoteattr(label)} style="{style}" vertex="1" parent="1">'
                 f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return i


def edge(src, dst, label="", style=None, pts=None, ex=None, ey=None, nx=None, ny=None):
    i = nid()
    st = style or ARROW
    if ex is not None:
        st += f"exitX={ex};exitY={ey};exitDx=0;exitDy=0;"
    if nx is not None:
        st += f"entryX={nx};entryY={ny};entryDx=0;entryDy=0;"
    geo = '<mxGeometry relative="1" as="geometry"/>'
    if pts:
        geo = ('<mxGeometry relative="1" as="geometry"><Array as="points">'
               + "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts) + "</Array></mxGeometry>")
    cells.append(f'<mxCell id="{i}" value={quoteattr(label)} style="{st}" edge="1" parent="1" source="{src}" target="{dst}">{geo}</mxCell>')
    return i


F = "fontFamily=Arial;fontColor=#000000;"
LANE = ("swimlane;horizontal=1;collapsible=0;startSize=34;html=1;fontStyle=1;fontSize=13;" + F +
        "fillColor=#E6E6E6;swimlaneFillColor=#FFFFFF;strokeColor=#000000;rounded=0;")
BOX = "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#000000;fontSize=12;" + F
BOLD = BOX + "fontStyle=1;"
INNER = "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#000000;verticalAlign=top;fontStyle=1;fontSize=12;spacingTop=4;" + F
NOTE = "text;html=1;whiteSpace=wrap;align=center;verticalAlign=top;fontSize=10;" + F
ARROW = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontSize=10;labelBackgroundColor=#FFFFFF;" + F

TOP, H = 60, 470          # đầu cột và chiều cao cột
cols = [("Nguồn dữ liệu", 190), ("Thu thập (Airflow)", 180), ("Data Lake (MinIO)", 220),
        ("Kho dữ liệu (PostgreSQL)", 220), ("Khai phá dữ liệu", 250), ("Giao diện", 210)]
X = [20]
for _, w in cols:
    X.append(X[-1] + w)

node("KIẾN TRÚC HỆ THỐNG: DATA PIPELINE ĐA NGUỒN &amp; KHAI PHÁ CẢM XÚC ĐÁNH GIÁ SẢN PHẨM",
     X[0], 12, X[-1] - X[0], 36, "text;html=1;align=center;verticalAlign=middle;fontSize=18;fontStyle=1;" + F)
for (title, w), x in zip(cols, X):
    node(title, x, TOP, w, H, LANE)

# Ba hàng thẳng: trên (y=120), giữa (y=245), dưới (y=370); ô Extract và Portal cao phủ cả 3 hàng
ROW = {"top": 120, "mid": 245, "bot": 370}
BH = 64

# ---- cột 1: nguồn
s1 = node("<b>Amazon Reviews</b><br>701.528 review (.jsonl.gz)", X[0] + 20, ROW["top"], 150, BH, BOX)
s2 = node("<b>Item Metadata</b><br>112.590 sản phẩm (.jsonl.gz)", X[0] + 20, ROW["mid"], 150, BH, BOX)
s3 = node("<b>World Bank API</b><br>tỷ giá USD→VND (JSON)", X[0] + 20, ROW["bot"], 150, BH, BOX)

# ---- cột 2: thu thập (một ô)
ex = node("<b>Extract</b><br><br>extract_reviews<br>extract_metadata<br>extract_fx<br><br><i>chạy song song,<br>stream vào MinIO</i>",
          X[1] + 25, ROW["top"], 130, ROW["bot"] + BH - ROW["top"], BOX)
TALL = ROW["bot"] + BH - ROW["top"]
for s_, r in ((s1, "top"), (s2, "mid"), (s3, "bot")):
    edge(s_, ex, "", ex=1, ey=0.5, nx=0, ny=round((ROW[r] + BH / 2 - ROW["top"]) / TALL, 3))

# ---- cột 3: data lake
node("MinIO", X[2] + 15, 95, 190, 360, INNER)
raw = node("<b>Raw</b><br>file gốc, theo ngày nạp", X[2] + 35, ROW["top"] + 10, 150, 50, BOX)
stg = node("<b>Staging</b><br>Parquet đã làm sạch", X[2] + 35, ROW["mid"], 150, BH, BOX)
cur = node("<b>Curated</b><br>dataset ML + metrics.json", X[2] + 35, ROW["bot"], 150, BH, BOX)
edge(ex, raw, "", ex=1, ey=round((ROW["top"] + 35 - ROW["top"]) / TALL, 3), nx=0, ny=0.5)
edge(raw, stg, "Transform")

# ---- cột 4: kho
node("PostgreSQL (dwh)", X[3] + 15, 95, 190, 360, INNER)
node("<b>review_text</b> · <b>etl_load_log</b>", X[3] + 30, ROW["top"] + 10, 160, 50, BOX)
dw = node("<b>DW: Fact và Dimension</b><br>fact_reviews<br>dim_product · dim_user<br>dim_time", X[3] + 25, ROW["mid"] - 8, 170, 80, BOX)
node("Lược đồ hình sao", X[3] + 30, ROW["bot"], 160, 30, NOTE + "fontSize=11;")
edge(stg, dw, "Load")

# ---- cột 5: khai phá
ol = node("<b>OLAP / SQL</b><br>roll-up · drill-down · slice · dice", X[4] + 20, ROW["top"], 210, BH, BOX)
ml = node("<b>Học máy</b> (Airflow)<br>TF-IDF → Naive Bayes, Logistic Regression<br><i>ghi điểm cảm xúc vào kho</i>", X[4] + 20, ROW["mid"] - 8, 210, 80, BOX)
dl = node("<b>Học sâu</b> (Colab GPU)<br>BiLSTM · Macro-F1 0,706", X[4] + 20, ROW["bot"], 210, BH, BOX)
node("Dữ liệu huấn luyện lấy từ kho; dataset và kết quả mô hình lưu ở Curated", X[4] + 10, ROW["bot"] + BH + 8, 230, 30, NOTE)
edge(dw, ol, "", ex=1, ey=0.2, nx=0, ny=0.5)
edge(dw, ml, "", ex=1, ey=0.5, nx=0, ny=0.5)
edge(dw, dl, "", ex=1, ey=0.8, nx=0, ny=0.5)

# ---- cột 6: giao diện (một ô cao)
po = node("<b>Portal</b><br>FastAPI + Chart.js<br><br>Tổng quan<br>Data Lake<br>Pipeline<br>Kho dữ liệu<br>Khai phá dữ liệu",
          X[5] + 30, ROW["top"], 150, ROW["bot"] + BH - ROW["top"], BOX)
for src_, r in ((ol, "top"), (ml, "mid"), (dl, "bot")):
    edge(src_, po, "", ex=1, ey=0.5, nx=0, ny=round((ROW[r] + BH / 2 - ROW["top"]) / TALL, 3))

# ---- dải điều phối
node("Apache Airflow điều phối toàn bộ: extract → transform → load → học máy (chạy hằng ngày 07:00)",
     X[1], TOP + H + 12, X[5] - X[1], 30, BOX + "fontStyle=2;fillColor=#F2F2F2;")
node("Toàn bộ hệ thống chạy bằng Docker Compose: MinIO · PostgreSQL · Airflow · Portal",
     X[0], TOP + H + 50, X[-1] - X[0], 20, NOTE + "fontSize=11;")

xml = ('<mxfile host="app.diagrams.net"><diagram id="arch" name="Kiến trúc">'
       f'<mxGraphModel dx="1400" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" '
       f'page="1" pageScale="1" pageWidth="{X[-1] + 40}" pageHeight="{TOP + H + 100}" math="0" shadow="0"><root>'
       '<mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(cells) + "</root></mxGraphModel></diagram></mxfile>")
with open(OUT, "w", encoding="utf-8") as f:
    f.write(xml)
print("written", OUT, len(cells), "cells")
