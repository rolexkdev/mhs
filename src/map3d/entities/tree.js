/**
 * tree.js — THỰC THỂ "Cây xanh" (model glTF).
 *
 * Tự chứa:
 *   - các loài cây (TREE_TYPES) + sinh số hiệu tự tăng
 *   - render mỗi cây bằng 1 model .glb
 *   - 2 công cụ đặt: Thêm 1 cây (placePoint) & Vẽ hàng cây (drawRow)
 *   - panel chú giải bên trái (đếm theo loài, nút +/≡, xóa tất cả)
 *   - editing: chọn / kéo di chuyển / xóa cây (editor.js gọi tới)
 */
import * as Cesium from "cesium";
import { registerCollection } from "../store.js";
import { distanceMeters, pointsAlongLine } from "../geo.js";
import { placePoint, drawRow } from "../interactions.js";
import { acquire } from "../interactionLock.js";
import { preloadImageHeights, scaleForMeters, VIEW_DISTANCE } from "../billboards.js";

// image = ảnh billboard 2.5D (PNG nền trong suốt) thay cho model glb nặng.
const TREE_TYPES = {
  "Cây Sao Đen": { color: "#1B5E20", trunkColor: "#4D3321", prefix: "SD",  image: "models/caysaoden.png" },
  "Cây Cau Vua": { color: "#2E7D32", trunkColor: "#9E9E9E", prefix: "CAU", image: "models/caycau.png" },
};

// ── State ───────────────────────────────────────────────────────────────────
let ctx = null;
let items = [];                       // mảng cây sống (cùng tham chiếu store)
const entities = new Map();           // soHieu → model entity

let addSpecies = null, rowSpecies = null, toolStop = null;

let selKey = null, selHnd = null, draggingTree = false;

function serialize(t) {
  const { soHieu, tenLoai, chieuCao, duongKinh, namTrong, trangThai, lon, lat } = t;
  return { soHieu, tenLoai, chieuCao, duongKinh, namTrong, trangThai, lon, lat };
}

// ── Render ──────────────────────────────────────────────────────────────────
function describe(p) {
  const cfg = TREE_TYPES[p.tenLoai] || {};
  const dot = cfg.color
    ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cfg.color};margin-right:6px;vertical-align:middle;border:1px solid rgba(0,0,0,.2)"></span>` : "";
  const sc = p.trangThai === "Tốt" ? "#2e7d32" : p.trangThai === "Cần chăm sóc" ? "#c62828" : "#e65100";
  return `<div style="font-family:system-ui;font-size:13px">
    <div style="background:#2e7d32;color:#fff;padding:8px 12px;margin:-8px -12px 10px;border-radius:4px 4px 0 0">${dot}<b>${p.tenLoai}</b></div>
    <table style="border-collapse:collapse">
      <tr><td style="color:#888;padding:3px 10px 3px 0">Số hiệu</td><td><b>${p.soHieu}</b></td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Chiều cao</td><td>${p.chieuCao} m</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Đường kính</td><td>${p.duongKinh} cm</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Năm trồng</td><td>${p.namTrong}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Trạng thái</td><td style="color:${sc};font-weight:600">${p.trangThai}</td></tr>
    </table></div>`;
}

/** Số hiệu kế tiếp không trùng (kể cả khi đã xóa). */
function nextSoHieu(species) {
  const prefix = TREE_TYPES[species]?.prefix ?? "XX";
  const max = items.reduce((m, t) => {
    if (t.tenLoai !== species) return m;
    const n = parseInt(t.soHieu?.split("-").pop() ?? "0", 10);
    return n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

// Render 1 cây bằng billboard 2.5D: ảnh PNG luôn quay về camera, cao đúng
// chieuCao mét, gốc chạm đất (BOTTOM + CLAMP_TO_GROUND). Vẫn pick/kéo như entity.
function renderOne(t) {
  const cfg = TREE_TYPES[t.tenLoai];
  if (!cfg?.image || !ctx) return;
  const h = t.chieuCao || 16;
  const e = ctx.viewer.entities.add({
    name: `${t.tenLoai} — ${t.soHieu}`,
    description: describe(t),
    position: Cesium.Cartesian3.fromDegrees(+t.lon, +t.lat, 0),
    billboard: {
      image: cfg.image,
      sizeInMeters: true,                 // kích thước theo mét → co giãn theo zoom
      scale: scaleForMeters(h, cfg.image),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, VIEW_DISTANCE),
    },
  });
  e._treeKey = t.soHieu;
  entities.set(t.soHieu, e);
}

function rerender(key) {
  const old = entities.get(key);
  if (old) { ctx.viewer.entities.remove(old); entities.delete(key); }
  const t = items.find((x) => x.soHieu === key);
  if (t) renderOne(t);
}

// ── Placement ───────────────────────────────────────────────────────────────
function exitTool() {
  if (toolStop) { toolStop(); toolStop = null; }
  addSpecies = null; rowSpecies = null;
}

/** Hủy công cụ cây (gọi khi Esc): dừng tool + reset + vẽ lại panel + trạng thái. */
function cancelTool() {
  exitTool();
  buildPanel();
  if (ctx) ctx.status(`3D: ${items.length} cây — click cây để xem thông tin`);
}

function placeOne(species, pos) {
  const t = {
    soHieu: nextSoHieu(species), tenLoai: species,
    chieuCao: 6, duongKinh: 2, namTrong: new Date().getFullYear(), trangThai: "Tốt",
    lon: pos.lon, lat: pos.lat,
  };
  items.push(t); renderOne(t); ctx.save();
}

function enterAddMode(species) {
  exitTool();
  addSpecies = species;
  toolStop = placePoint(ctx, {
    surface: true,
    onPlace: (pos, stop) => {
      placeOne(species, pos);
      stop(); toolStop = null; addSpecies = null;
      buildPanel(); ctx.status(`3D: ${items.length} cây — click cây để xem thông tin`);
    },
  });
  acquire("tree:add", cancelTool);   // Esc → cancelTool (reset + rebuild panel)
  buildPanel();
  ctx.status(`Đang thêm: ${species} — Click vào bản đồ để đặt cây. Nhấn Esc để hủy.`);
}

function placeRow(species, start, end) {
  const dist = distanceMeters(start, end);
  const raw = prompt(`Khoảng cách giữa cây (m)?\nTổng chiều dài hàng: ${dist.toFixed(0)} m`, "8");
  if (!raw) return;
  const spacing = parseFloat(raw);
  if (!spacing || spacing <= 0) return;
  const n = Math.max(1, Math.floor(dist / spacing) + 1);
  const now = new Date().getFullYear();
  for (const p of pointsAlongLine(start, end, n)) {
    const t = { soHieu: nextSoHieu(species), tenLoai: species, chieuCao: 6, duongKinh: 2, namTrong: now, trangThai: "Tốt", lon: p.lon, lat: p.lat };
    items.push(t); renderOne(t);
  }
  ctx.save(); buildPanel();
  ctx.status(`Đã thêm ${n} cây ${species} theo hàng`);
}

function enterRowMode(species) {
  exitTool();
  rowSpecies = species;
  toolStop = drawRow(ctx, {
    onHint: (msg) => ctx.status(`Hàng ${species}: ${msg}`),
    onFinish: (start, end, stop) => { stop(); rowSpecies = null; toolStop = null; placeRow(species, start, end); buildPanel(); },
  });
  acquire("tree:row", cancelTool);   // Esc → cancelTool
  buildPanel();
}

function clearAll() {
  if (!items.length) return;
  if (!confirm(`Xóa tất cả ${items.length} cây? Thao tác không thể hoàn tác.`)) return;
  for (const e of entities.values()) ctx.viewer.entities.remove(e);
  entities.clear();
  deselect();
  items.length = 0;
  buildPanel(); ctx.save();
  ctx.status("Đã xóa tất cả cây");
}

// ── Panel ───────────────────────────────────────────────────────────────────
function buildPanel() {
  let panel = document.getElementById("tree-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "tree-panel";
    document.getElementById("stage").appendChild(panel);
  }
  const total = items.length;
  const counts = Object.fromEntries(Object.keys(TREE_TYPES).map((k) => [k, 0]));
  items.forEach((t) => { if (counts[t.tenLoai] !== undefined) counts[t.tenLoai]++; });

  const rows = Object.entries(TREE_TYPES).map(([name, cfg]) => {
    const cnt = counts[name] || 0;
    const isAdd = addSpecies === name, isRow = rowSpecies === name;
    return `<div class="tp-item${(isAdd || isRow) ? " tp-item--active" : ""}">
      <span class="tp-dot" style="background:${cfg.color}"></span>
      <span class="tp-name">${name}</span>
      <span class="tp-count">${cnt}</span>
      <button class="tp-row${isRow ? " tp-row--active" : ""}" data-row="${name}" title="${isRow ? "Hủy vẽ hàng" : "Vẽ hàng cây"}">≡</button>
      <button class="tp-add${isAdd ? " tp-add--active" : ""}" data-sp="${name}" title="${isAdd ? "Hủy thêm" : "Thêm 1 cây"}">${isAdd ? "✕" : "+"}</button>
    </div>`;
  }).join("");

  const footerActive = addSpecies || rowSpecies;
  const footerMsg = addSpecies
    ? `🌱 Đang thêm: <b>${addSpecies}</b><br><small>Click bản đồ để đặt cây · Esc hủy</small>`
    : rowSpecies
      ? `📏 Hàng cây: <b>${rowSpecies}</b><br><small>Click điểm ĐẦU/CUỐI hàng · Esc hủy</small>`
      : `<b>+</b> thêm 1 cây &nbsp;·&nbsp; <b>≡</b> vẽ hàng cây`;

  panel.innerHTML = `
    <div class="tp-header">CHÚ GIẢI CÂY XANH<button class="tp-clear-btn" title="Xóa tất cả cây">🗑</button></div>
    <div class="tp-total">Tổng số cây: <b>${total}</b></div>
    <div class="tp-list">${rows}</div>
    <div class="tp-footer${footerActive ? " tp-footer--active" : ""}"><span>${footerMsg}</span></div>`;

  panel.querySelector(".tp-clear-btn").addEventListener("click", clearAll);
  panel.querySelectorAll(".tp-add").forEach((btn) => btn.addEventListener("click", () => {
    const sp = btn.dataset.sp;
    if (addSpecies === sp) { exitTool(); buildPanel(); } else enterAddMode(sp);
  }));
  panel.querySelectorAll(".tp-row").forEach((btn) => btn.addEventListener("click", () => {
    const sp = btn.dataset.row;
    if (rowSpecies === sp) { exitTool(); buildPanel(); } else enterRowMode(sp);
  }));

  panel.style.display = "flex";  // luôn hiện khi đang ở cảnh 3D
}

// ── Selection / drag / delete ────────────────────────────────────────────────
function selectTree(key) {
  deselect();
  selKey = key;
  const t = items.find((x) => x.soHieu === key);
  if (!t) return;
  selHnd = ctx.viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(t.lon, t.lat, (t.chieuCao || 16) + 4),
    point: { pixelSize: 14, color: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
  selHnd._isTreeHnd = true; selHnd._treeKey = key;
}

function deselect() {
  if (selHnd) { ctx.viewer.entities.remove(selHnd); selHnd = null; }
  selKey = null; draggingTree = false;
}

function deleteTree(key) {
  const e = entities.get(key);
  if (e) { ctx.viewer.entities.remove(e); entities.delete(key); }
  if (selHnd?._treeKey === key) { ctx.viewer.entities.remove(selHnd); selHnd = null; }
  const idx = items.findIndex((t) => t.soHieu === key);
  if (idx >= 0) items.splice(idx, 1);
  selKey = null; draggingTree = false;
  buildPanel(); ctx.save();
}

function moveTreeTo(key, lon, lat) {
  const t = items.find((x) => x.soHieu === key); if (!t) return;
  t.lon = lon; t.lat = lat;
  if (selHnd?._treeKey === key)
    selHnd.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(lon, lat, (t.chieuCao || 16) + 4));
}

// ── Public entity definition ─────────────────────────────────────────────────
export const tree = {
  id: "tree",
  label: "Cây xanh",
  dataKey: "trees",

  init(context) {
    ctx = context;
    items = registerCollection("trees", serialize);
  },

  /** slice: array (đã lưu) | null/undefined (chưa lưu → seed từ cay.geojson). */
  async load(slice) {
    if (Array.isArray(slice)) { for (const t of slice) items.push(t); return { needsSave: false }; }
    let data = [];
    try {
      const gj = await (await fetch("/data/cay.geojson")).json();
      data = gj.features.map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
    } catch (e) { console.warn("trees", e.message); }
    for (const t of data) items.push(t);
    return { needsSave: true };
  },

  async renderAll() {
    await preloadImageHeights(Object.values(TREE_TYPES).map((c) => c.image));
    for (const t of items) renderOne(t);
    ctx.scene.requestRender();
  },

  tools() { return []; },         // cây dùng panel riêng, không nằm trên toolbar nhà xưởng

  panel: { build: buildPanel, hide: hidePanel },

  // ── editing: editor.js gọi tới ────────────────────────────────────────────
  editing: {
    isDragging: () => draggingTree,
    selectedKey: () => selKey,
    select: selectTree,
    deselect,
    deleteTree,
    rerender,

    /** picked có phải model cây (không phải handle)? trả soHieu hoặc null. */
    pickKey(picked) {
      return (picked?.id?._treeKey && !picked.id._isTreeHnd) ? picked.id._treeKey : null;
    },
    /** LEFT_DOWN trên handle cây → bắt đầu kéo. */
    beginDrag(picked) {
      if (picked?.id?._isTreeHnd) { draggingTree = true; return true; }
      return false;
    },
    drag(pos) { if (draggingTree && selKey) moveTreeTo(selKey, pos.lon, pos.lat); },
    /** LEFT_UP: trả {wasDrag, key} để caller vẽ lại cây tại chỗ mới. */
    endDrag() { const was = draggingTree; const key = was ? selKey : null; draggingTree = false; return { wasDrag: was, key }; },
  },
};

function hidePanel() {
  const panel = document.getElementById("tree-panel");
  if (panel) panel.style.display = "none";
  exitTool();
  if (ctx) ctx.viewer.canvas.style.cursor = "";
}
