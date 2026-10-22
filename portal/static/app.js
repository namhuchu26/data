"use strict";
/* ============================================================================
   Sentiment Data Portal - giao diện tổng hợp
   Tabs: Tổng quan · Data Lake (realtime) · Pipeline (Airflow) · Kho dữ liệu · Khai phá
   ========================================================================== */

// ----------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const qs = (o) => new URLSearchParams(o).toString();

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = await r.text();
    try { msg = JSON.parse(msg).detail || msg; } catch (e) {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}
const postJSON = (path, body) => api(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

const NF = new Intl.NumberFormat("vi-VN");
const fmt = {
  int: (n) => (n == null ? "–" : NF.format(n)),
  dec: (n, d = 2) => (n == null ? "–" : new Intl.NumberFormat("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)),
  pct: (n, d = 1) => (n == null ? "–" : `${fmt.dec(n, d)}%`),
  compact: (n) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(n),
  bytes(b) {
    if (b == null) return "–";
    const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${fmt.dec(b, i ? 1 : 0)} ${u[i]}`;
  },
  // Số trong bảng: cột năm/quý/khóa giữ nguyên, số thập phân tối đa 3 chữ số
  cell(v, col = "") {
    if (v == null) return "–";
    if (/(^|_)(year|quarter|month|day|dow|key|id|bin)$/i.test(col)) return String(v);
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(v);
  },
  time: (iso) => (iso ? new Date(iso).toLocaleString("vi-VN") : "–"),
  ago(iso) {
    if (!iso) return "–";
    const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return `${s} giây trước`;
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    return new Date(iso).toLocaleDateString("vi-VN");
  },
  dur(sec) {
    if (sec == null || isNaN(sec)) return "–";
    if (sec < 60) return `${fmt.dec(sec, 1)} giây`;
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    if (m < 60) return `${m} phút ${s} giây`;
    return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
  },
};
const runSeconds = (r) => r.start_date
  ? ((r.end_date ? new Date(r.end_date) : new Date()) - new Date(r.start_date)) / 1000 : null;

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3500);
}

// ----------------------------------------------------------------- icons & status
const ICON = {
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5v9l7-4.5z"/></svg>',
  clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/></svg>',
  alert: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5l6 11H2z"/><path d="M8 7v3M8 12v.01"/></svg>',
  retry: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/></svg>',
  skip: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h8"/></svg>',
  dot: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>',
  minus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 8h9"/></svg>',
};
const STATES = {
  success: { label: "Thành công", color: "--good", icon: ICON.check },
  running: { label: "Đang chạy", color: "--accent", icon: ICON.play },
  queued: { label: "Đang xếp hàng", color: "--muted", icon: ICON.clock },
  scheduled: { label: "Đã lên lịch", color: "--muted", icon: ICON.clock },
  deferred: { label: "Tạm hoãn", color: "--muted", icon: ICON.clock },
  restarting: { label: "Khởi động lại", color: "--warning", icon: ICON.retry },
  up_for_retry: { label: "Chờ chạy lại", color: "--warning", icon: ICON.retry },
  up_for_reschedule: { label: "Chờ lên lịch lại", color: "--warning", icon: ICON.retry },
  upstream_failed: { label: "Lỗi từ tác vụ trước", color: "--serious", icon: ICON.alert },
  failed: { label: "Thất bại", color: "--critical", icon: ICON.x },
  skipped: { label: "Bỏ qua", color: "--muted", icon: ICON.skip },
  removed: { label: "Đã gỡ", color: "--muted", icon: ICON.skip },
  none: { label: "Chưa chạy", color: "--axis", icon: ICON.dot },
};
const st = (s) => STATES[s || "none"] || { label: s, color: "--muted", icon: ICON.dot };
const badge = (s) => {
  const x = st(s);
  return `<span class="badge"><span style="color:var(${x.color});display:inline-flex">${x.icon}</span>${esc(x.label)}</span>`;
};
const LABEL_VI = { negative: "Tiêu cực", neutral: "Trung tính", positive: "Tích cực" };
const LABEL_VAR = { negative: "--neg", neutral: "--neu", positive: "--pos" };
const labTag = (l) => `<span class="lab"><i style="background:var(${LABEL_VAR[l]})"></i>${LABEL_VI[l] || esc(l)}</span>`;
// Màu theo thực thể (mô hình), cố định - không đổi theo thứ hạng
const MODEL_VAR = { naive_bayes: "--s1", logistic_regression: "--s2", lstm: "--s3" };

// ----------------------------------------------------------------- charts
const CHARTS = {};
function theme() {
  return {
    ink: css("--ink"), ink2: css("--ink-2"), muted: css("--muted"), grid: css("--grid"),
    axis: css("--axis"), surface: css("--surface"), border: css("--border"),
    s1: css("--s1"), s2: css("--s2"), s3: css("--s3"),
    pos: css("--pos"), neu: css("--neu"), neg: css("--neg"),
  };
}
function wash(hex, a = 0.1) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function baseOptions(t, o = {}) {
  const horizontal = o.indexAxis === "y";
  const valueAxis = {
    stacked: !!o.stacked, min: o.min, max: o.max, suggestedMin: o.suggestedMin,
    grid: { color: t.grid, drawTicks: false }, border: { display: false },
    ticks: { color: t.muted, padding: 6, callback: o.tick || ((v) => fmt.compact(v)) },
    title: o.valueTitle ? { display: true, text: o.valueTitle, color: t.muted } : undefined,
  };
  const catAxis = {
    stacked: !!o.stacked, grid: { display: false }, border: { color: t.axis },
    ticks: { color: t.muted, maxRotation: 0, autoSkipPadding: 12, autoSkip: !horizontal },
  };
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    indexAxis: o.indexAxis || "x",
    interaction: { mode: "index", intersect: false, axis: horizontal ? "y" : "x" },
    plugins: {
      legend: {
        display: !!o.legend, position: "top", align: "start",
        labels: {
          color: t.ink2, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2, padding: 14,
          // ô chú giải của đường tô đặc bằng màu đường (mặc định là màu nền 10%)
          generateLabels: (ch) => Chart.defaults.plugins.legend.labels.generateLabels(ch).map((l) =>
            ch.data.datasets[l.datasetIndex]?.type === "line" ? { ...l, fillStyle: l.strokeStyle, lineWidth: 0 } : l),
        },
      },
      tooltip: {
        backgroundColor: t.surface, titleColor: t.ink, bodyColor: t.ink2, footerColor: t.muted,
        borderColor: t.axis, borderWidth: 1, padding: 10, boxPadding: 4, cornerRadius: 8,
        usePointStyle: true, callbacks: o.tooltip || {},
      },
    },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
  };
}
const barDs = (t, label, data, color, extra = {}) => ({
  type: "bar", label, data, backgroundColor: color, hoverBackgroundColor: color,
  maxBarThickness: 24, borderRadius: 4, borderSkipped: "start", ...extra,
});
const lineDs = (t, label, data, color, extra = {}) => ({
  type: "line", label, data, borderColor: color, backgroundColor: wash(color, 0.1),
  borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2,
  pointHoverBorderColor: t.surface, pointHoverBackgroundColor: color, tension: 0.25,
  borderCapStyle: "round", borderJoinStyle: "round", ...extra,
});
function chart(id, build) {
  CHARTS[id] = build;
  renderChart(id);
}
function renderChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas || !CHARTS[id]) return;
  Chart.getChart(canvas)?.destroy();
  const t = theme();
  Chart.defaults.font.family = css("--font");
  Chart.defaults.color = t.ink2;
  new Chart(canvas, CHARTS[id](t));
  const card = canvas.closest(".chart-card");
  if (card?.classList.contains("as-table")) renderChartTable(card);
}
function rerenderAllCharts() { Object.keys(CHARTS).forEach(renderChart); }
// Mỗi biểu đồ có "bảng" tương đương (đọc được giá trị không cần hover)
function setupChartTables() {
  $$(".chart-card").forEach((card) => {
    const head = $(".card-head", card);
    const btn = document.createElement("button");
    btn.className = "btn ghost small tv-btn"; btn.textContent = "Bảng";
    btn.setAttribute("aria-pressed", "false");
    btn.onclick = () => {
      const on = card.classList.toggle("as-table");
      btn.textContent = on ? "Biểu đồ" : "Bảng"; btn.setAttribute("aria-pressed", String(on));
      $(".chart-box", card).hidden = on;
      if (on) renderChartTable(card); else $(".table-wrap", card)?.remove();
    };
    head.appendChild(btn);
  });
}
function renderChartTable(card) {
  const ch = Chart.getChart($("canvas", card));
  if (!ch) return;
  let wrap = $(".table-wrap", card);
  if (!wrap) { wrap = document.createElement("div"); wrap.className = "table-wrap"; card.appendChild(wrap); }
  const ds = ch.data.datasets;
  wrap.innerHTML = `<table class="table"><thead><tr><th></th>${ds.map((d) => `<th class="num">${esc(d.label)}</th>`).join("")}</tr></thead><tbody>${
    ch.data.labels.map((l, i) => `<tr><td>${esc(l)}</td>${ds.map((d) => `<td class="num">${fmt.cell(d.data[i])}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;
}

// ----------------------------------------------------------------- config / health / theme
let CONFIG = {};
async function loadConfig() {
  CONFIG = await api("/api/config");
  $("#cfg-category").textContent = CONFIG.category;
  $("#minio-console").href = CONFIG.minio_console_url;
  $("#airflow-ui").href = CONFIG.airflow_url;
}
async function loadHealth() {
  const names = { minio: "MinIO", postgres: "PostgreSQL", airflow: "Airflow" };
  try {
    const h = await api("/api/health");
    $("#health").innerHTML = Object.entries(names).map(([k, n]) => {
      const ok = h[k]?.ok;
      return `<span class="pill" title="${esc(ok ? `${h[k].ms} ms` : h[k]?.error || "")}"><span class="ico" style="color:var(${ok ? "--good" : "--critical"})">${ok ? ICON.check : ICON.x}</span>${n}<span class="muted">${ok ? "hoạt động" : "lỗi"}</span></span>`;
    }).join("");
  } catch (e) {
    $("#health").innerHTML = `<span class="pill"><span class="ico" style="color:var(--critical)">${ICON.x}</span>Portal mất kết nối</span>`;
  }
}
function setupTheme() {
  $("#theme-btn").onclick = () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("portal-theme", next); } catch (e) {}
    rerenderAllCharts();
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerenderAllCharts);
}

// ----------------------------------------------------------------- router
const TABS = {};
let current = null, timer = null;
function route() {
  const name = (location.hash || "#overview").slice(1);
  const tab = TABS[name] ? name : "overview";
  $$(".tab").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  $$("#tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  current = tab;
  clearTimeout(timer);
  refresh();
}
async function refresh() {
  const tab = current;
  let next = 15000;
  try { next = (await TABS[tab].load()) || next; } catch (e) { console.error(e); }
  if (tab === current) { clearTimeout(timer); timer = setTimeout(refresh, next); }
}

// ----------------------------------------------------------------- realtime lake events (SSE)
const LAKE_EVENTS = [];
function eventItem(ev, isNew) {
  const created = ev.event.startsWith("ObjectCreated");
  return `<li class="${isNew ? "new" : ""}">
    <span class="badge"><span style="color:var(${created ? "--good" : "--critical"});display:inline-flex">${created ? ICON.plus : ICON.minus}</span>${created ? "Tạo mới" : "Xóa"}</span>
    <span class="ev-key">${esc(ev.bucket)}/${esc(ev.key)}</span>
    <span class="ev-meta">${created ? fmt.bytes(ev.size) + " · " : ""}<span data-ago="${esc(ev.time)}">${fmt.ago(ev.time)}</span></span>
  </li>`;
}
function renderEventLists(newCount = 0) {
  const empty = '<li class="empty" style="display:block">Chưa có sự kiện. Hãy chạy pipeline hoặc tải file lên.</li>';
  $("#lake-events").innerHTML = LAKE_EVENTS.length
    ? LAKE_EVENTS.slice(0, 100).map((e, i) => eventItem(e, i < newCount)).join("") : empty;
  $("#ov-events").innerHTML = LAKE_EVENTS.length
    ? LAKE_EVENTS.slice(0, 8).map((e, i) => eventItem(e, i < newCount)).join("") : empty;
}
let lakeDebounce = null;
function connectEvents() {
  const setLive = (on, text) => {
    $("#lake-live").classList.toggle("on", on);
    $("#lake-live span:last-child").textContent = text;
    $("#nav-live").classList.toggle("on", on);
  };
  const es = new EventSource("/api/lake/events");
  es.onopen = () => setLive(true, "Live");
  es.onerror = () => setLive(false, "Mất kết nối, đang thử lại…");
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    LAKE_EVENTS.unshift(ev);
    LAKE_EVENTS.length = Math.min(LAKE_EVENTS.length, 200);
    renderEventLists(1);
    const zone = $(`.zone[data-bucket="${ev.bucket}"]`);
    if (zone) { zone.classList.add("flash"); setTimeout(() => zone.classList.remove("flash"), 900); }
    clearTimeout(lakeDebounce);
    lakeDebounce = setTimeout(() => { if (current === "lake" || current === "overview") refresh(); }, 700);
  };
}
setInterval(() => $$("[data-ago]").forEach((el) => (el.textContent = fmt.ago(el.dataset.ago))), 5000);

/* =============================================================== TAB: TỔNG QUAN */
const QUALITY_LABELS = {
  reviews_raw_rows: "Review đọc từ nguồn", reviews_sampled: "Review lấy mẫu",
  dropped_missing: "Loại do thiếu giá trị", dropped_invalid_rating: "Loại do rating sai",
  dropped_duplicates: "Loại do trùng lặp", dropped_empty_text: "Loại do văn bản rỗng",
  reviews_clean: "Review sạch", meta_raw_rows: "Sản phẩm trong metadata", products: "Sản phẩm sau tích hợp",
  products_without_meta: "Sản phẩm thiếu metadata", products_missing_price_pct: "Sản phẩm thiếu giá (%)",
  products_unknown_brand_pct: "Sản phẩm không rõ thương hiệu (%)", users: "Người dùng",
  date_min: "Review sớm nhất", date_max: "Review muộn nhất", fx_years: "Số năm có tỷ giá",
  fx_snapshot_rate: "Tỷ giá quy đổi giá (2023)",
};
TABS.overview = {
  async load() {
    const [dw, lake, dags, models, recent] = await Promise.allSettled([
      api("/api/dw/overview"), api("/api/lake/summary"), api("/api/pipeline/dags"),
      api("/api/mining/models"), LAKE_EVENTS.length ? Promise.resolve(null) : api("/api/lake/events/recent"),
    ]);
    if (recent.value) { LAKE_EVENTS.push(...recent.value); renderEventLists(); }
    const d = dw.value?.ready ? dw.value : null;
    const ms = models.value || [];
    const best = ms.slice().sort((a, b) => b.f1_macro - a.f1_macro)[0];
    const tile = (label, value, note = "") =>
      `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${note ? `<div class="tile-note">${note}</div>` : ""}</div>`;
    $("#ov-tiles").innerHTML = [
      tile("Review trong kho", d ? fmt.int(d.kpi.reviews) : "–", d ? `${d.kpi.date_min} → ${d.kpi.date_max}` : "Chưa nạp kho"),
      tile("Sản phẩm", d ? fmt.int(d.kpi.products) : "–"),
      tile("Người dùng", d ? fmt.int(d.kpi.users) : "–"),
      tile("Rating trung bình", d ? `${fmt.dec(d.kpi.avg_rating, 2)} ★` : "–"),
      tile("Review tích cực", d ? fmt.pct(d.kpi.pct_positive) : "–", "4–5 sao"),
      tile("Macro-F1 tốt nhất", best ? fmt.dec(best.f1_macro, 3) : "–", best ? esc(best.display_name) : "Chưa có mô hình"),
    ].join("");

    const zones = lake.value?.zones || [];
    const z = (b) => zones.find((x) => x.bucket === b) || {};
    const dag = dags.value?.[0];
    const lr = dag?.last_run;
    const step = (href, kicker, title, lines) =>
      `<a class="flow-step" href="${href}"><div class="flow-kicker">${kicker}</div><div class="flow-title">${title}</div>${lines.map((l) => `<div class="flow-line">${l}</div>`).join("")}</a>`;
    $("#ov-flow").innerHTML = [
      step("#lake", "1 · Nguồn", "3 nguồn dữ liệu", ["Amazon Reviews (.jsonl.gz)", "Amazon Metadata (.jsonl.gz)", "World Bank API (JSON)"]),
      step("#pipeline", "2 · Điều phối", "Airflow DAG", lr ? [badge(lr.state), `Chạy ${fmt.ago(lr.start_date || lr.run_after)}`] : [dags.status === "rejected" ? "Không kết nối được Airflow" : "Chưa có lần chạy"]),
      step("#lake", "3 · Data Lake", "MinIO", [`raw ${fmt.int(z("raw").objects)} · staging ${fmt.int(z("staging").objects)} · curated ${fmt.int(z("curated").objects)} object`, fmt.bytes(zones.reduce((s, x) => s + x.bytes, 0))]),
      step("#dw", "4 · Kho dữ liệu", "PostgreSQL · Star Schema", d ? [`fact_reviews ${fmt.int(d.counts.fact_reviews)} dòng`, `3 bảng chiều · ${fmt.int(d.counts.dim_product + d.counts.dim_user + d.counts.dim_time)} dòng`] : ["Chưa nạp dữ liệu"]),
      step("#mining", "5 · Khai phá", "Mô hình cảm xúc", ms.length ? [`${ms.length} mô hình`, ms.map((m) => `${esc(m.display_name)}: F1 ${fmt.dec(m.f1_macro, 3)}`).join("<br>")] : ["Chưa huấn luyện"]),
    ].join("");

    // Lần chạy gần nhất
    if (lr) {
      let tasks = [];
      try { tasks = await api(`/api/pipeline/tasks?${qs({ dag_id: dag.dag_id, run_id: lr.dag_run_id })}`); } catch (e) {}
      const counts = {};
      tasks.forEach((t) => (counts[t.state || "none"] = (counts[t.state || "none"] || 0) + 1));
      const total = tasks.length || 1;
      $("#ov-run").innerHTML = `
        <div class="actions" style="justify-content:space-between">${badge(lr.state)}<span class="muted small">${esc(lr.run_type || "")}</span></div>
        <div class="key" style="font-family:var(--mono);font-size:12px;margin:8px 0;overflow-wrap:anywhere">${esc(lr.dag_run_id)}</div>
        <div class="dag-meta"><span>Bắt đầu: ${fmt.time(lr.start_date)}</span><span>Thời lượng: ${fmt.dur(runSeconds(lr))}</span></div>
        <div style="display:flex;gap:2px;height:10px;margin:14px 0 8px">${Object.entries(counts).map(([s, n]) =>
          `<div title="${st(s).label}: ${n}" style="flex:${n / total};background:var(${st(s).color});border-radius:3px"></div>`).join("")}</div>
        <div class="legend">${Object.entries(counts).map(([s, n]) => `<span><i style="background:var(${st(s).color})"></i>${st(s).label}: ${n}/${tasks.length}</span>`).join("")}</div>`;
    } else {
      $("#ov-run").innerHTML = `<p class="muted">${dags.status === "rejected" ? "Không kết nối được Airflow." : "DAG chưa chạy lần nào."}</p>`;
    }

    // Báo cáo chất lượng mới nhất
    try {
      const objs = (await api(`/api/lake/objects?${qs({ bucket: "staging", prefix: "_reports/" })}`)).objects;
      if (!objs.length) throw new Error("none");
      const p = await api(`/api/lake/preview?${qs({ bucket: "staging", key: objs[0].key })}`);
      const q = p.content;
      $("#ov-quality-key").textContent = `staging/${objs[0].key}`;
      $("#ov-quality").innerHTML = `<div class="table-wrap" style="max-height:330px"><table class="table"><tbody>${
        Object.entries(QUALITY_LABELS).filter(([k]) => q[k] != null).map(([k, l]) =>
          `<tr><td>${l}</td><td class="num">${typeof q[k] === "number" ? (Number.isInteger(q[k]) ? fmt.int(q[k]) : fmt.dec(q[k], 2)) : esc(q[k])}</td></tr>`).join("")
      }</tbody></table></div>`;
    } catch (e) {
      $("#ov-quality").innerHTML = '<p class="muted">Chưa có báo cáo. Báo cáo được ghi ở bước transform.</p>';
    }
    return 20000;
  },
};

/* =============================================================== TAB: DATA LAKE */
const lakeState = { bucket: "raw", selected: null };
TABS.lake = {
  async load() {
    const [sum, objs] = await Promise.all([
      api("/api/lake/summary"),
      api(`/api/lake/objects?${qs({ bucket: lakeState.bucket })}`),
    ]);
    if (!LAKE_EVENTS.length) {
      LAKE_EVENTS.push(...(await api("/api/lake/events/recent")));
      renderEventLists();
    }
    $("#lake-zones").innerHTML = sum.zones.map((z) => `
      <button class="zone ${z.bucket === lakeState.bucket ? "on" : ""}" data-bucket="${z.bucket}">
        <div class="zone-name">${z.bucket}/</div>
        <div class="zone-desc">${esc(z.description)}</div>
        <div class="zone-stats">
          <div><b>${fmt.int(z.objects)}</b><span>object</span></div>
          <div><b>${fmt.bytes(z.bytes)}</b><span>dung lượng</span></div>
          <div><b data-ago="${esc(z.last_modified || "")}">${z.last_modified ? fmt.ago(z.last_modified) : "–"}</b><span>cập nhật</span></div>
        </div>
      </button>`).join("");
    $$(".zone").forEach((b) => (b.onclick = () => selectBucket(b.dataset.bucket)));
    $("#lake-bucket-seg").innerHTML = sum.zones.map((z) =>
      `<button role="tab" class="${z.bucket === lakeState.bucket ? "on" : ""}" data-b="${z.bucket}">${z.bucket}</button>`).join("");
    $$("#lake-bucket-seg button").forEach((b) => (b.onclick = () => selectBucket(b.dataset.b)));
    lakeState.objects = objs.objects;
    renderObjects();
    return 30000;
  },
};
function selectBucket(b) { lakeState.bucket = b; refresh(); }
function renderObjects() {
  const f = $("#lake-prefix").value.trim().toLowerCase();
  const list = (lakeState.objects || []).filter((o) => o.key.toLowerCase().includes(f));
  $("#lake-objects").innerHTML = list.length ? `
    <thead><tr><th>Object</th><th>Định dạng</th><th class="num">Kích thước</th><th class="num">Cập nhật</th></tr></thead>
    <tbody>${list.map((o) => `
      <tr class="clickable ${lakeState.selected === o.key ? "sel" : ""}" data-key="${esc(o.key)}">
        <td class="key">${esc(o.key)}</td><td>${esc(o.type)}</td>
        <td class="num">${fmt.bytes(o.size)}</td><td class="num" title="${fmt.time(o.last_modified)}" data-ago="${esc(o.last_modified)}">${fmt.ago(o.last_modified)}</td>
      </tr>`).join("")}</tbody>`
    : `<tbody><tr><td class="empty">Bucket <code>${lakeState.bucket}</code> chưa có object${f ? " khớp bộ lọc" : ""}.</td></tr></tbody>`;
  $$("#lake-objects tr.clickable").forEach((tr) => (tr.onclick = () => previewObject(lakeState.bucket, tr.dataset.key)));
}
async function previewObject(bucket, key) {
  lakeState.selected = key; renderObjects();
  const card = $("#lake-preview-card"); card.hidden = false;
  $("#lake-preview-title").textContent = `${bucket}/${key}`;
  $("#lake-download").href = `/api/lake/download?${qs({ bucket, key })}`;
  $("#lake-preview").innerHTML = '<p class="muted">Đang đọc…</p>';
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    const p = await api(`/api/lake/preview?${qs({ bucket, key })}`);
    const meta = Object.entries(p.metadata || {}).map(([k, v]) => `<span>${esc(k.replace(/^x-amz-meta-/i, ""))}: ${esc(v)}</span>`).join("");
    let body = "";
    if (p.kind === "records") {
      const cols = [...new Set(p.rows.flatMap((r) => Object.keys(r)))];
      body = `${p.schema ? `<div class="schema">${p.schema.map((s) => `<span><b>${esc(s.name)}</b> ${esc(s.type)}</span>`).join("")}</div>` : ""}
        <div class="table-wrap"><table class="table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${p.rows.map((r) => `<tr>${cols.map((c) => `<td class="${String(r[c] ?? "").length > 40 ? "wrap" : ""}">${esc(typeof r[c] === "object" && r[c] !== null ? JSON.stringify(r[c]) : r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    } else if (p.kind === "json") {
      body = `<pre class="json">${esc(JSON.stringify(p.content, null, 2).slice(0, 20000))}</pre>`;
    } else {
      body = `<pre class="json">${esc(p.content)}</pre>`;
    }
    $("#lake-preview").innerHTML = `<div class="preview-meta"><span>${esc(p.type)}</span><span>${fmt.bytes(p.size)}</span>
      ${p.num_rows != null ? `<span>${fmt.int(p.num_rows)} dòng</span>` : ""}<span>${fmt.time(p.last_modified)}</span>${meta}</div>${body}`;
  } catch (e) {
    $("#lake-preview").innerHTML = `<p style="color:var(--critical-text)">Không đọc được: ${esc(e.message)}</p>`;
  }
}
function setupLake() {
  $("#lake-prefix").addEventListener("input", renderObjects);
  $("#lake-preview-close").onclick = () => { $("#lake-preview-card").hidden = true; lakeState.selected = null; renderObjects(); };
  $("#lake-upload").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = $("button", e.target); btn.disabled = true;
    try {
      const r = await api("/api/lake/upload", { method: "POST", body: fd });
      $("#lake-upload-msg").innerHTML = `<span style="color:var(--good-text)">Đã tải lên <code>${esc(r.bucket)}/${esc(r.key)}</code> (${fmt.bytes(r.size)})</span>`;
      e.target.reset();
    } catch (err) {
      $("#lake-upload-msg").innerHTML = `<span style="color:var(--critical-text)">Lỗi: ${esc(err.message)}</span>`;
    } finally { btn.disabled = false; }
  };
}

/* =============================================================== TAB: PIPELINE */
const pl = { dag: null, run: null, follow: true, graph: {}, task: null };
TABS.pipeline = {
  async load() {
    let dags;
    try { dags = await api("/api/pipeline/dags"); } catch (e) {
      $("#pl-dags").innerHTML = `<div class="card"><p style="color:var(--critical-text)">Không kết nối được Airflow: ${esc(e.message)}</p></div>`;
      return 10000;
    }
    if (!dags.length) { $("#pl-dags").innerHTML = '<div class="card"><p class="muted">Airflow chưa nạp DAG nào.</p></div>'; return 10000; }
    pl.dag = pl.dag && dags.some((d) => d.dag_id === pl.dag) ? pl.dag : dags[0].dag_id;
    $("#pl-dags").innerHTML = dags.map((d) => `
      <div class="card dag-card">
        <div>
          <div class="dag-id">${esc(d.dag_id)}</div>
          <div class="dag-sub">${esc(d.description || "")}</div>
          <div class="dag-meta"><span>Lịch: ${esc(d.schedule || "–")}</span><span>Lần kế tiếp: ${fmt.time(d.next_run)}</span>
            <span>Tag: ${d.tags.map(esc).join(", ") || "–"}</span><span>Lần gần nhất: ${d.last_run ? badge(d.last_run.state) : "–"}</span></div>
        </div>
        <div class="actions">
          <label class="switch"><input type="checkbox" data-pause="${esc(d.dag_id)}" ${d.is_paused ? "" : "checked"}>${d.is_paused ? "Đang tạm dừng" : "Đang bật lịch"}</label>
          <button class="btn" data-trigger="${esc(d.dag_id)}">▶ Chạy ngay</button>
        </div>
      </div>`).join("");
    $$("[data-trigger]").forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await postJSON("/api/pipeline/trigger", { dag_id: b.dataset.trigger });
        toast(`Đã kích hoạt ${r.dag_run_id}`); pl.follow = true; pl.run = null; refresh();
      } catch (e) { toast(`Lỗi: ${e.message}`); } finally { b.disabled = false; }
    }));
    $$("[data-pause]").forEach((c) => (c.onchange = async () => {
      try { await postJSON("/api/pipeline/pause", { dag_id: c.dataset.pause, paused: !c.checked }); refresh(); }
      catch (e) { toast(`Lỗi: ${e.message}`); }
    }));

    if (!pl.graph[pl.dag]) pl.graph[pl.dag] = await api(`/api/pipeline/graph?${qs({ dag_id: pl.dag })}`);
    const runs = await api(`/api/pipeline/runs?${qs({ dag_id: pl.dag })}`);
    if (pl.follow || !runs.some((r) => r.dag_run_id === pl.run)) pl.run = runs[0]?.dag_run_id || null;
    $("#pl-runs").innerHTML = runs.length ? runs.map((r) => `
      <li class="${r.dag_run_id === pl.run ? "sel" : ""}" data-run="${esc(r.dag_run_id)}">
        <span class="r-id">${esc(r.dag_run_id)}</span>${badge(r.state)}
        <span class="r-meta">${fmt.time(r.start_date || r.run_after)} · ${fmt.dur(runSeconds(r))} · ${esc(r.run_type || "")}</span>
      </li>`).join("") : '<li class="empty">Chưa có lần chạy.</li>';
    $$("#pl-runs li[data-run]").forEach((li) => (li.onclick = () => {
      pl.run = li.dataset.run; pl.follow = li === $("#pl-runs li[data-run]"); refresh();
    }));

    let tasks = [];
    if (pl.run) tasks = await api(`/api/pipeline/tasks?${qs({ dag_id: pl.dag, run_id: pl.run })}`);
    pl.tasks = tasks;
    renderGraph(pl.graph[pl.dag], tasks);
    renderTasks(tasks);
    if (pl.task && !$("#pl-log-card").hidden) loadLog(pl.task, true);
    const active = runs.some((r) => ["running", "queued"].includes(r.state));
    return active ? 4000 : 15000;
  },
};
function renderGraph(graph, tasks) {
  const state = Object.fromEntries(tasks.map((t) => [t.task_id, t.state]));
  // Độ sâu topo = đường dài nhất từ gốc -> cột hiển thị
  const up = {}; graph.forEach((t) => (up[t.task_id] = []));
  graph.forEach((t) => t.downstream.forEach((d) => up[d]?.push(t.task_id)));
  const depth = {};
  const dfs = (id) => (depth[id] ??= up[id].length ? 1 + Math.max(...up[id].map(dfs)) : 0);
  graph.forEach((t) => dfs(t.task_id));
  const cols = [];
  graph.forEach((t) => (cols[depth[t.task_id]] ||= []).push(t));
  $("#pl-graph-run").textContent = pl.run ? `Trạng thái theo lần chạy ${pl.run}` : "";
  $("#pl-graph").innerHTML = `<div class="dag-cols">${cols.map((c) => `<div class="dag-col">${c.map((t) => {
    const s = st(state[t.task_id]); const [g, n] = t.task_id.includes(".") ? t.task_id.split(/\.(.+)/) : ["", t.task_id];
    return `<button class="dag-node ${state[t.task_id] === "running" ? "running" : ""}" data-task="${esc(t.task_id)}" style="border-left-color:var(${s.color})">
      ${g ? `<div class="n-group">${esc(g)}</div>` : ""}<div class="n-name">${esc(n)}</div>
      <div class="n-state"><span style="color:var(${s.color});display:inline-flex">${s.icon}</span>${esc(s.label)}</div></button>`;
  }).join("")}</div>`).join("")}<svg class="dag-edges"></svg></div>`;
  const wrap = $("#pl-graph .dag-cols"), svg = $("#pl-graph svg.dag-edges"), box = wrap.getBoundingClientRect();
  svg.setAttribute("width", wrap.scrollWidth); svg.setAttribute("height", wrap.scrollHeight);
  const pos = (id) => $(`.dag-node[data-task="${CSS.escape(id)}"]`, wrap).getBoundingClientRect();
  svg.innerHTML = graph.flatMap((t) => t.downstream.map((d) => {
    const a = pos(t.task_id), b = pos(d);
    const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}"/>`;
  })).join("");
  $$("#pl-graph .dag-node").forEach((n) => (n.onclick = () => openTask(n.dataset.task)));
  const shown = ["success", "running", "queued", "up_for_retry", "upstream_failed", "failed", "none"];
  $("#pl-legend").innerHTML = shown.map((s) => `<span><span style="color:var(${st(s).color});display:inline-flex;width:12px">${st(s).icon}</span>${st(s).label}</span>`).join("");
}
function renderTasks(tasks) {
  $("#pl-run-id").textContent = pl.run || "";
  const max = Math.max(1, ...tasks.map((t) => t.duration || 0));
  const order = Object.fromEntries((pl.graph[pl.dag] || []).map((t, i) => [t.task_id, i]));
  tasks.sort((a, b) => (a.start_date || "9").localeCompare(b.start_date || "9") || order[a.task_id] - order[b.task_id]);
  $("#pl-tasks").innerHTML = tasks.length ? `
    <thead><tr><th>Tác vụ</th><th>Trạng thái</th><th class="num">Lần thử</th><th>Bắt đầu</th><th>Thời lượng</th></tr></thead>
    <tbody>${tasks.map((t) => `<tr class="clickable ${pl.task === t.task_id ? "sel" : ""}" data-task="${esc(t.task_id)}">
      <td class="key">${esc(t.task_id)}</td><td>${badge(t.state)}</td><td class="num">${t.try_number ?? "–"}</td>
      <td>${t.start_date ? new Date(t.start_date).toLocaleTimeString("vi-VN") : "–"}</td>
      <td><div class="dur">${t.duration ? `<div class="bar" style="width:${Math.round((t.duration / max) * 120)}px"></div>` : ""}<span class="small">${fmt.dur(t.duration)}</span></div></td>
    </tr>`).join("")}</tbody>` : '<tbody><tr><td class="empty">Chọn một lần chạy.</td></tr></tbody>';
  $$("#pl-tasks tr.clickable").forEach((tr) => (tr.onclick = () => openTask(tr.dataset.task)));
}
function openTask(taskId) { pl.task = taskId; $$("#pl-tasks tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.task === taskId)); loadLog(taskId); }
async function loadLog(taskId, silent) {
  const card = $("#pl-log-card"); card.hidden = false;
  $("#pl-log-title").textContent = `Log · ${taskId}`;
  if (!silent) { $("#pl-log").textContent = "Đang tải log…"; card.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  try {
    const tasks = await api(`/api/pipeline/tasks?${qs({ dag_id: pl.dag, run_id: pl.run })}`);
    const t = tasks.find((x) => x.task_id === taskId);
    if (!t || !t.try_number) { $("#pl-log").textContent = "Tác vụ chưa chạy."; $("#pl-xcom").innerHTML = ""; return; }
    const [log, xcom] = await Promise.all([
      api(`/api/pipeline/log?${qs({ dag_id: pl.dag, run_id: pl.run, task_id: taskId, try_number: t.try_number })}`),
      t.state === "success" ? api(`/api/pipeline/xcom?${qs({ dag_id: pl.dag, run_id: pl.run, task_id: taskId })}`) : Promise.resolve({ value: null }),
    ]);
    const pre = $("#pl-log"); const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
    pre.textContent = log.content || "(log trống)";
    if (!silent || atBottom) pre.scrollTop = pre.scrollHeight;
    $("#pl-xcom").innerHTML = xcom.value != null
      ? `<div class="xcom"><div class="muted small">Kết quả trả về (XCom)</div><pre class="json">${esc(JSON.stringify(xcom.value, null, 2))}</pre></div>` : "";
  } catch (e) { $("#pl-log").textContent = `Không tải được log: ${e.message}`; }
}

/* =============================================================== TAB: KHO DỮ LIỆU */
const STAR = {
  fact: { name: "fact_reviews", cols: [["review_key", "PK"], ["product_key", "FK"], ["user_key", "FK"], ["time_key", "FK"], ["rating"], ["sentiment_label"], ["sentiment_score"], ["sentiment_pred"], ["helpful_vote"], ["verified_purchase"], ["text_length · word_count"]] },
  product: { name: "dim_product", cols: [["product_key", "PK"], ["parent_asin"], ["title · brand · store"], ["main_category · categories"], ["price_usd · price_vnd"], ["price_segment"], ["average_rating · rating_number"]] },
  user: { name: "dim_user", cols: [["user_key", "PK"], ["user_id"], ["review_count"], ["first_review_date"]] },
  time: { name: "dim_time", cols: [["time_key", "PK"], ["full_date · day · month"], ["quarter · year · year_month"], ["day_of_week"], ["usd_vnd_rate", "World Bank"]] },
  text: { name: "review_text", cols: [["review_key", "PK/FK"], ["title · text_raw"], ["text_clean", "TF-IDF"], ["text_light", "LSTM"]] },
};
function renderStar(counts) {
  const el = $("#dw-star");
  el.innerHTML = Object.entries(STAR).map(([area, t]) => `
    <div class="tbl ${area === "fact" ? "fact" : ""}" style="grid-area:${area}" data-area="${area}">
      <div class="tbl-head"><span class="tname">${t.name}</span><span class="tcount">${fmt.int(counts[t.name])} dòng</span></div>
      <ul>${t.cols.map(([c, k]) => `<li class="${k === "PK" ? "pk" : ""}">${c}${k ? `<span class="k">${k}</span>` : ""}</li>`).join("")}</ul>
    </div>`).join("") + `<svg class="star-edges"></svg>`;
  drawStarLines();
}
function drawStarLines() {
  const el = $("#dw-star"), svg = $("svg.star-edges", el);
  if (!svg || getComputedStyle(svg).display === "none") return;
  const box = el.getBoundingClientRect(), f = $('[data-area="fact"]', el).getBoundingClientRect();
  const c = (r) => ({ x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top });
  const fc = c(f);
  svg.innerHTML = ["product", "user", "time", "text"].map((a) => {
    const r = $(`[data-area="${a}"]`, el).getBoundingClientRect(), p = c(r);
    let x1 = fc.x, y1 = fc.y, x2 = p.x, y2 = p.y;
    if (a === "product") { x1 = f.left - box.left; x2 = r.right - box.left; }
    if (a === "user") { x1 = f.right - box.left; x2 = r.left - box.left; }
    if (a === "time") { y1 = f.top - box.top; y2 = r.bottom - box.top; }
    if (a === "text") { y1 = f.bottom - box.top; y2 = r.top - box.top; }
    return `<path d="M${x1},${y1} L${x2},${y2}"/>`;
  }).join("");
}
let resizeT = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {  // chỉ vẽ lại đường nối, không gọi lại API
    drawStarLines();
    if (current === "pipeline" && pl.graph[pl.dag]) renderGraph(pl.graph[pl.dag], pl.tasks || []);
  }, 150);
});

const SQL_SAMPLES = [
  ["Roll-up: năm → quý", `SELECT t.year, t.quarter, count(*) AS reviews, round(avg(f.rating), 2) AS avg_rating
FROM fact_reviews f JOIN dim_time t USING (time_key)
GROUP BY ROLLUP (t.year, t.quarter)
ORDER BY t.year NULLS LAST, t.quarter NULLS LAST`],
  ["Drill-down: theo tháng của 1 năm", `SELECT t.year_month, count(*) AS reviews, round(avg(f.rating), 2) AS avg_rating,
       round(avg(f.sentiment_score), 3) AS avg_sentiment
FROM fact_reviews f JOIN dim_time t USING (time_key)
WHERE t.year = 2021
GROUP BY 1 ORDER BY 1`],
  ["Slice: năm 2022 theo thương hiệu", `SELECT p.brand, count(*) AS reviews, round(avg(f.rating), 2) AS avg_rating
FROM fact_reviews f
JOIN dim_product p USING (product_key)
JOIN dim_time t USING (time_key)
WHERE t.year = 2022 AND p.brand <> 'Unknown'
GROUP BY 1 ORDER BY 2 DESC LIMIT 20`],
  ["Dice: phân khúc giá × nhãn", `SELECT p.price_segment,
       count(*) FILTER (WHERE f.sentiment_label = 'negative') AS negative,
       count(*) FILTER (WHERE f.sentiment_label = 'neutral')  AS neutral,
       count(*) FILTER (WHERE f.sentiment_label = 'positive') AS positive,
       round(100.0 * avg((f.sentiment_label = 'negative')::int), 2) AS pct_negative
FROM fact_reviews f JOIN dim_product p USING (product_key)
GROUP BY 1 ORDER BY min(coalesce(p.price_vnd, 1e12))`],
  ["5★ nhưng lời lẽ tiêu cực", `SELECT f.rating, f.sentiment_score, left(t.text_raw, 220) AS text
FROM fact_reviews f JOIN review_text t USING (review_key)
WHERE f.rating = 5 AND f.sentiment_score < -0.5
ORDER BY f.sentiment_score LIMIT 20`],
  ["Người dùng tích cực nhất", `SELECT u.user_id, u.review_count, u.first_review_date,
       round(avg(f.rating), 2) AS avg_rating
FROM dim_user u JOIN fact_reviews f USING (user_key)
GROUP BY 1, 2, 3 ORDER BY 2 DESC LIMIT 15`],
];
function setupSql() {
  $("#dw-samples").innerHTML = SQL_SAMPLES.map(([l], i) => `<button class="chip" data-i="${i}">${esc(l)}</button>`).join("");
  $$("#dw-samples .chip").forEach((c) => (c.onclick = () => { $("#dw-sql").value = SQL_SAMPLES[c.dataset.i][1]; runSql(); }));
  $("#dw-sql").value = SQL_SAMPLES[0][1];
  $("#dw-run").onclick = runSql;
  $("#dw-sql").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runSql(); });
}
async function runSql() {
  $("#dw-sql-msg").textContent = "Đang chạy…";
  try {
    const r = await postJSON("/api/dw/query", { sql: $("#dw-sql").value });
    $("#dw-sql-msg").textContent = `${fmt.int(r.rows.length)} dòng · ${r.ms} ms${r.truncated ? " · đã cắt ở 500 dòng" : ""} · Ctrl+Enter để chạy`;
    const numCols = new Set(r.columns.filter((c) => r.rows.some((row) => typeof row[c] === "number")
      && r.rows.every((row) => row[c] == null || typeof row[c] === "number")));
    $("#dw-result").innerHTML = `<thead><tr>${r.columns.map((c) => `<th class="${numCols.has(c) ? "num" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${
      r.rows.map((row) => `<tr>${r.columns.map((c) => {
        const v = row[c]; const num = typeof v === "number";
        return `<td class="${num || numCols.has(c) ? "num" : String(v ?? "").length > 40 ? "wrap" : ""}">${v == null ? '<span class="muted">null</span>' : num ? fmt.cell(v, c) : esc(v)}</td>`;
      }).join("")}</tr>`).join("")}</tbody>`;
  } catch (e) {
    $("#dw-sql-msg").innerHTML = `<span style="color:var(--critical-text)">${esc(e.message)}</span>`;
    $("#dw-result").innerHTML = "";
  }
}
const DOW = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];
TABS.dw = {
  async load() {
    const ov = await api("/api/dw/overview");
    $("#dw-empty").hidden = ov.ready; $("#dw-body").hidden = !ov.ready;
    if (!ov.ready) {
      $("#dw-empty").innerHTML = `<div class="card notice">Kho dữ liệu chưa có dữ liệu. Hãy chạy DAG <code>amazon_reviews_pipeline</code> ở tab <a href="#pipeline">Pipeline</a>; bước <code>load_warehouse</code> sẽ tạo lược đồ hình sao và nạp dữ liệu.</div>`;
      return 15000;
    }
    const k = ov.kpi;
    const tile = (l, v, n = "") => `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">${v}</div>${n ? `<div class="tile-note">${n}</div>` : ""}</div>`;
    $("#dw-tiles").innerHTML = [
      tile("Review (fact_reviews)", fmt.int(k.reviews), `${k.date_min} → ${k.date_max}`),
      tile("Sản phẩm", fmt.int(k.products)), tile("Người dùng", fmt.int(k.users)),
      tile("Rating trung bình", `${fmt.dec(k.avg_rating, 2)} ★`),
      tile("Điểm cảm xúc TB", k.avg_sentiment == null ? "–" : fmt.dec(k.avg_sentiment, 3), "từ −1 đến 1"),
      tile("Lần nạp gần nhất", ov.load_log[0] ? fmt.ago(ov.load_log[0].loaded_at) : "–", ov.load_log[0] ? fmt.time(ov.load_log[0].loaded_at) : ""),
    ].join("");
    renderStar(ov.counts);
    if (TABS.dw._loadedAt === ov.load_log[0]?.loaded_at && CHARTS["dw-monthly"]) return 30000;
    TABS.dw._loadedAt = ov.load_log[0]?.loaded_at;

    const c = await api("/api/dw/charts");
    chart("dw-monthly", (t) => ({
      data: { labels: c.monthly.map((r) => r.period), datasets: [lineDs(t, "Số review", c.monthly.map((r) => r.reviews), t.s1, { fill: true })] },
      options: baseOptions(t),
    }));
    chart("dw-monthly-rating", (t) => ({
      data: { labels: c.monthly.map((r) => r.period), datasets: [lineDs(t, "Rating TB", c.monthly.map((r) => r.avg_rating), t.s1)] },
      options: baseOptions(t, { suggestedMin: 3, max: 5, tick: (v) => fmt.dec(v, 1),
        tooltip: { afterLabel: (ctx) => `Số review: ${fmt.int(c.monthly[ctx.dataIndex].reviews)}` } }),
    }));
    chart("dw-rating", (t) => ({
      data: { labels: c.rating_dist.map((r) => `${r.rating}★`), datasets: [barDs(t, "Số review", c.rating_dist.map((r) => r.n), t.s1)] },
      options: baseOptions(t),
    }));
    const years = [...new Set(c.yearly_labels.map((r) => r.year))];
    const byYear = (lab) => years.map((y) => c.yearly_labels.find((r) => r.year === y && r.label === lab)?.n || 0);
    chart("dw-labels", (t) => ({
      data: {
        labels: years, datasets: ["negative", "neutral", "positive"].map((lab, i, arr) => barDs(t, LABEL_VI[lab], byYear(lab), t[{ negative: "neg", neutral: "neu", positive: "pos" }[lab]], {
          borderColor: t.surface, borderWidth: { top: i ? 2 : 0 }, borderRadius: i === arr.length - 1 ? 4 : 0,
        })),
      },
      options: baseOptions(t, { stacked: true, legend: true }),
    }));
    chart("dw-brands", (t) => ({
      data: { labels: c.top_brands.map((r) => r.brand), datasets: [barDs(t, "Số review", c.top_brands.map((r) => r.reviews), t.s1)] },
      options: baseOptions(t, { indexAxis: "y", tooltip: {
        afterLabel: (ctx) => { const r = c.top_brands[ctx.dataIndex]; return `Rating TB: ${fmt.dec(r.avg_rating, 2)} · Cảm xúc TB: ${r.avg_sentiment == null ? "–" : fmt.dec(r.avg_sentiment, 3)}`; } } }),
    }));
    chart("dw-price", (t) => ({
      data: { labels: c.price_segments.map((r) => r.segment), datasets: [barDs(t, "Rating TB", c.price_segments.map((r) => r.avg_rating), t.s1)] },
      options: baseOptions(t, { min: 0, max: 5, tick: (v) => fmt.dec(v, 0),
        tooltip: { afterLabel: (ctx) => `Số review: ${fmt.int(c.price_segments[ctx.dataIndex].reviews)}` } }),
    }));
    chart("dw-weekday", (t) => ({
      data: { labels: c.weekday.map((r) => DOW[r.dow]), datasets: [barDs(t, "Số review", c.weekday.map((r) => r.reviews), t.s1)] },
      options: baseOptions(t, { tooltip: { afterLabel: (ctx) => `Rating TB: ${fmt.dec(c.weekday[ctx.dataIndex].avg_rating, 2)}` } }),
    }));
    chart("dw-fx", (t) => ({
      data: { labels: c.fx.map((r) => r.year), datasets: [lineDs(t, "VND / 1 USD", c.fx.map((r) => r.rate), t.s1, { pointRadius: 0 })] },
      options: baseOptions(t, { tick: (v) => fmt.compact(v), tooltip: { label: (ctx) => `${fmt.int(Math.round(ctx.raw))} VND / USD` } }),
    }));
    const vt = (v) => c.verified.find((r) => r.verified === v) || {};
    $("#dw-verified").innerHTML = [true, false].map((v) => `<div class="tile"><div class="tile-label">${v ? "Đã xác thực mua hàng" : "Chưa xác thực"}</div>
      <div class="tile-value">${vt(v).avg_rating == null ? "–" : `${fmt.dec(vt(v).avg_rating, 2)} ★`}</div><div class="tile-note">${fmt.int(vt(v).reviews)} review</div></div>`).join("");
    $("#dw-products").innerHTML = `<thead><tr><th>ASIN</th><th>Sản phẩm</th><th>Thương hiệu</th><th class="num">Giá (VND)</th><th class="num">Review</th><th class="num">Rating TB</th><th class="num">Cảm xúc TB</th></tr></thead>
      <tbody>${c.top_products.map((r) => `<tr><td class="key">${esc(r.parent_asin)}</td><td class="wrap">${esc(r.title || "–")}</td><td>${esc(r.brand)}</td>
      <td class="num">${r.price_vnd == null ? "–" : fmt.int(r.price_vnd)}</td><td class="num">${fmt.int(r.reviews)}</td><td class="num">${fmt.dec(r.avg_rating, 2)}</td>
      <td class="num">${r.avg_sentiment == null ? "–" : fmt.dec(r.avg_sentiment, 3)}</td></tr>`).join("")}</tbody>`;
    if (!$("#dw-result").innerHTML) runSql();
    return 30000;
  },
};

/* =============================================================== TAB: KHAI PHÁ */
const LABELS = ["negative", "neutral", "positive"];
function seqColor(v) {  // v ∈ [0,1] -> ramp xanh tuần tự (100 -> 700)
  const steps = ["--q100", "--q200", "--q300", "--q400", "--q500", "--q600", "--q700"].map(css);
  const i = Math.min(steps.length - 1, Math.round(v * (steps.length - 1)));
  return { bg: steps[i], fg: i >= 3 ? "#ffffff" : "#0b0b0b" };
}
TABS.mining = {
  async load() {
    const models = await api("/api/mining/models");
    const ml = models.filter((m) => m.model !== "lstm");
    $("#mn-empty").hidden = models.length > 0; $("#mn-body").hidden = !models.length;
    if (!models.length) {
      $("#mn-empty").innerHTML = `<div class="card notice">Chưa có mô hình. Chạy DAG ở tab <a href="#pipeline">Pipeline</a>; nhóm tác vụ <code>mining</code> sẽ huấn luyện Naive Bayes và Logistic Regression rồi ghi <code>metrics.json</code> vào <code>curated/models/</code>.</div>`;
      return 15000;
    }
    const sig = models.map((m) => m.trained_at).join("|");
    const best = models.slice().sort((a, b) => b.f1_macro - a.f1_macro)[0];
    const tile = (l, v, n = "") => `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">${v}</div>${n ? `<div class="tile-note">${n}</div>` : ""}</div>`;
    $("#mn-tiles").innerHTML = [
      tile("Mô hình tốt nhất (Macro-F1)", esc(best.display_name), best.family),
      tile("Macro-F1", fmt.dec(best.f1_macro, 3), "trung bình đều 3 lớp"),
      tile("Accuracy", fmt.pct(best.accuracy * 100)),
      tile("Mẫu kiểm thử", fmt.int(best.n_test), `train ${fmt.int(best.n_train)}`),
      tile("Số mô hình", fmt.int(models.length), models.map((m) => esc(m.display_name)).join(" · ")),
    ].join("");
    if (TABS.mining._sig === sig) return 30000;
    TABS.mining._sig = sig;

    const colorOf = (t, m) => t[(MODEL_VAR[m.model] || "--s3").slice(2)];
    const metricKeys = [["accuracy", "Accuracy"], ["precision_macro", "Precision (macro)"], ["recall_macro", "Recall (macro)"], ["f1_macro", "F1 (macro)"], ["f1_weighted", "F1 (weighted)"]];
    chart("mn-compare", (t) => ({
      data: { labels: metricKeys.map((x) => x[1]), datasets: models.map((m) => barDs(t, m.display_name, metricKeys.map(([k]) => m[k]), colorOf(t, m))) },
      options: baseOptions(t, { min: 0, max: 1, legend: true, tick: (v) => fmt.dec(v, 1), tooltip: { label: (ctx) => `${ctx.dataset.label}: ${fmt.dec(ctx.raw, 3)}` } }),
    }));
    chart("mn-perclass", (t) => ({
      data: { labels: LABELS.map((l) => LABEL_VI[l]), datasets: models.map((m) => barDs(t, m.display_name, LABELS.map((l) => m.per_class[l]?.f1), colorOf(t, m))) },
      options: baseOptions(t, { min: 0, max: 1, legend: true, tick: (v) => fmt.dec(v, 1),
        tooltip: { label: (ctx) => `${ctx.dataset.label}: ${fmt.dec(ctx.raw, 3)}`, footer: (items) => `Số mẫu: ${fmt.int(models[0].per_class[LABELS[items[0].dataIndex]]?.support)}` } }),
    }));

    // Ma trận nhầm lẫn (chuẩn hóa theo hàng)
    $("#mn-cms").innerHTML = models.map((m) => {
      const cm = m.confusion_matrix;
      return `<div class="cm"><h3><i style="background:var(${MODEL_VAR[m.model] || "--s3"})"></i>${esc(m.display_name)}</h3>
        <div class="cm-grid"><div></div>${LABELS.map((l) => `<div class="h">${LABEL_VI[l]}</div>`).join("")}
        ${cm.map((row, i) => { const tot = row.reduce((a, b) => a + b, 0) || 1; return `<div class="h row">${LABEL_VI[LABELS[i]]}</div>${row.map((v) => {
          const p = v / tot, c = seqColor(p);
          return `<div class="cm-cell" style="background:${c.bg};color:${c.fg}" title="${LABEL_VI[LABELS[i]]} → ${fmt.int(v)} mẫu (${fmt.pct(p * 100)})"><b>${fmt.dec(p * 100, 0)}%</b><span>${fmt.int(v)}</span></div>`;
        }).join("")}`; }).join("")}</div><div class="cm-axis">Dự đoán →</div></div>`;
    }).join("") + `<div class="scale"><span>0%</span><span class="ramp"></span><span>100% của hàng</span></div>`;

    // Từ khóa quyết định
    const lr = models.find((m) => m.top_terms);
    $("#mn-terms").innerHTML = lr ? LABELS.map((l) => {
      const terms = lr.top_terms[l] || []; const max = Math.max(...terms.map((x) => x[1]), 0.001);
      return `<div class="term-col"><h3><i style="background:var(${LABEL_VAR[l]})"></i>${LABEL_VI[l]}</h3>${terms.map(([w, v]) =>
        `<div class="term"><span class="w">${esc(w)}</span><span class="b" style="width:${Math.max(4, (v / max) * 100)}%;background:var(${LABEL_VAR[l]})"></span><span class="v">${fmt.dec(v, 2)}</span></div>`).join("")}</div>`;
    }).join("") : '<p class="muted">Chưa có.</p>';

    // Histogram điểm cảm xúc
    try {
      const h = await api("/api/mining/score-hist");
      const bins = Array.from({ length: 20 }, (_, i) => i + 1);
      const lbl = bins.map((b) => fmt.dec(-1 + (b - 0.5) * 0.1, 2));
      chart("mn-hist", (t) => ({
        data: { labels: lbl, datasets: LABELS.map((l, i, arr) => barDs(t, LABEL_VI[l], bins.map((b) => h.find((r) => r.label === l && r.bin === b)?.n || 0),
          t[{ negative: "neg", neutral: "neu", positive: "pos" }[l]], { borderColor: t.surface, borderWidth: { top: i ? 2 : 0 }, borderRadius: i === arr.length - 1 ? 4 : 0, barPercentage: 0.94, categoryPercentage: 0.94 })) },
        options: baseOptions(t, { stacked: true, legend: true, tooltip: { title: (items) => `Điểm ≈ ${items[0].label}` } }),
      }));
    } catch (e) {}

    renderLstm(models.find((m) => m.model === "lstm"));
    loadErrors();
    return 30000;
  },
};
function renderLstm(m) {
  const el = $("#mn-lstm");
  if (!m) {
    el.innerHTML = `<div class="card-head"><h2>Mô hình học sâu LSTM</h2></div>
      <div class="notice">Chưa có kết quả LSTM. Quy trình:
        <ol>
          <li>Ở tab <a href="#lake">Data Lake</a>, mở <code>curated/ml/${esc(CONFIG.category || "")}/sentiment_dataset.parquet</code> → <b>Tải về</b>.</li>
          <li>Mở <code>notebooks/train_lstm_colab.ipynb</code> trên Google Colab (GPU), tải file parquet lên và chạy hết các cell.</li>
          <li>Notebook xuất <code>metrics.json</code>; tải nó lên <code>curated/models/lstm/</code> bằng form ở tab Data Lake.</li>
          <li>Tab này sẽ tự cập nhật và so sánh LSTM với Naive Bayes, Logistic Regression.</li>
        </ol></div>`;
    delete CHARTS["mn-lstm-loss"];
    return;
  }
  el.innerHTML = `<div class="card-head"><h2>Mô hình học sâu LSTM · quá trình huấn luyện</h2><span class="muted small">${esc(m.trained_at || "")}</span></div>
    <div class="tiles inline" style="margin-bottom:12px">
      <div class="tile"><div class="tile-label">Macro-F1</div><div class="tile-value">${fmt.dec(m.f1_macro, 3)}</div></div>
      <div class="tile"><div class="tile-label">Accuracy</div><div class="tile-value">${fmt.pct(m.accuracy * 100)}</div></div>
      <div class="tile"><div class="tile-label">Số epoch</div><div class="tile-value">${m.history?.loss?.length ?? "–"}</div></div>
      <div class="tile"><div class="tile-label">Thời gian train</div><div class="tile-value">${fmt.dur(m.train_seconds)}</div></div>
    </div>
    ${m.history?.loss ? `<div class="chart-card" style="border:0;padding:0"><div class="card-head"><h2>Loss theo epoch</h2></div><div class="chart-box"><canvas id="mn-lstm-loss"></canvas></div></div>` : ""}`;
  if (m.history?.loss) {
    chart("mn-lstm-loss", (t) => ({
      data: {
        labels: m.history.loss.map((_, i) => `Epoch ${i + 1}`),
        datasets: [lineDs(t, "Train loss", m.history.loss, t.s1, { pointRadius: 4, pointBorderColor: t.surface, pointBorderWidth: 2, pointBackgroundColor: t.s1 }),
          ...(m.history.val_loss ? [lineDs(t, "Validation loss", m.history.val_loss, t.s2, { pointRadius: 4, pointBorderColor: t.surface, pointBorderWidth: 2, pointBackgroundColor: t.s2 })] : [])],
      },
      options: baseOptions(t, { legend: true, tick: (v) => fmt.cell(v) }),
    }));
  }
}
async function loadErrors() {
  try {
    const errs = await api("/api/mining/errors");
    $("#mn-errors").innerHTML = errs.length ? errs.map((e) => `<div class="err">
      <div class="err-head"><span>${"★".repeat(e.rating)}</span><span>Thật: ${labTag(e.actual)}</span><span>Dự đoán: ${labTag(e.predicted)}</span><span>Điểm ${fmt.dec(e.score, 2)}</span></div>
      <div>${esc(e.text.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))}</div></div>`).join("") : '<p class="muted">Chưa có dự đoán (chạy tác vụ mining.score_reviews).</p>';
  } catch (e) { $("#mn-errors").innerHTML = '<p class="muted">Chưa có dữ liệu.</p>'; }
}

// ----------------------------------------------------------------- init
(async function init() {
  setupTheme(); setupLake(); setupSql(); setupChartTables();
  $("#mn-err-refresh").onclick = loadErrors;
  $("#pl-log-close").onclick = () => { $("#pl-log-card").hidden = true; pl.task = null; };
  try { await loadConfig(); } catch (e) {}
  loadHealth(); setInterval(loadHealth, 10000);
  connectEvents();
  window.addEventListener("hashchange", route);
  route();
})();
