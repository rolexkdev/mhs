import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { ESRI_TERRAIN, CAMERA_3D } from "./config.js";

let viewer = null, loaded = false;
const status = () => document.getElementById("status");
const LAT_M = 111000;

const TREE_TYPES = {
  "Cây Kèn Hồng":       { color: "#E8709E", trunkColor: "#5D4037", prefix: "KH"  },
  "Cây Tràm Bông Vàng":  { color: "#C9A800", trunkColor: "#795548", prefix: "TBV" },
  "Cây Dầu":             { color: "#3B6B3B", trunkColor: "#3E2723", prefix: "CD"  },
  "Cây Bàng Lăng":       { color: "#B57BB5", trunkColor: "#6A1B9A", prefix: "BL"  },
  "Cây Viết":            { color: "#CC5533", trunkColor: "#BF360C", prefix: "CV"  },
  "Cây Bàng Đài Loan":   { color: "#5A9B5E", trunkColor: "#1B5E20", prefix: "BDL" },
  "Cây Osaka":           { color: "#D97899", trunkColor: "#880E4F", prefix: "OS"  },
};

// Companies with surveyed lot-boundary polygons — drawn from actual coordinates
// instead of the generic point-based box in addBuildings.
// polygon: array of [lon, lat] corners (any winding order).
const COMPANY_POLYGONS = [
  {
    tenCty: "CÔNG TY TNHH HAOHUA (VIỆT NAM)",
    loaiHinh: "Công ty sản xuất",
    loHang: "A17-A18",
    dienTich: 433593,
    dienThoai: "",
    polygon: [
      [106.5593721, 11.5098517],  // NW
      [106.5614315, 11.5117195],  // NE
      [106.5701497, 11.5039698],  // SE
      [106.5676383, 11.5015701],  // SW
    ],
  },
];

const ROOF_COLORS = {
  "Dệt may":            "#4FC3F7",
  "Sản xuất giấy":      "#81C784",
  "Cơ khí chính xác":   "#FFB74D",
  "Chế biến thực phẩm": "#F48FB1",
  "Nội thất":           "#A1887F",
  "Hạ tầng nước":       "#4DD0E1",
  "Vật liệu xây dựng":  "#90A4AE",
  "Bao bì":             "#AED581",
  "Năng lượng":         "#FFF176",
  "Công ty sản xuất":   "#E0E0E0",
  "Hạ tầng KCN":        "#BDBDBD",
};

let treesData = [];
let addModeSpecies = null;
let addHandler = null;
let escListenerAttached = false;
let treeEntities  = new Map(); // soHieu → [entity, ...]
let ptBuildings   = new Map(); // tenCty → { props, polygon, h, wall, roof }
let selTreeKey    = null;
let treeHndEnt    = null;
let isDraggingTree = false;

// ── Coordinate picker ─────────────────────────────────────────
let pickMode = false;
let pickHandler = null;
let pickedPoints = [];

function getMapPos(windowPos) {
  if (!viewer) return null;
  // pickEllipsoid cho kết quả lon/lat nhất quán bất kể góc camera
  const cart = viewer.camera.pickEllipsoid(windowPos, viewer.scene.globe.ellipsoid);
  if (!cart) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  return {
    lon: +Cesium.Math.toDegrees(c.longitude).toFixed(7),
    lat: +Cesium.Math.toDegrees(c.latitude).toFixed(7),
  };
}

function buildPickPanel() {
  let panel = document.getElementById("pick-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "pick-panel";
    document.getElementById("stage").appendChild(panel);
  }

  const rows = pickedPoints.map((p, i) =>
    `<div class="pp-row">
      <span class="pp-idx">${i + 1}</span>
      <span class="pp-coord">${p.lat}, ${p.lon}</span>
      <button class="pp-del" data-i="${i}" title="Xóa">✕</button>
    </div>`
  ).join("");

  const allText = pickedPoints.map(p => `${p.lat}, ${p.lon}`).join("\n");

  panel.innerHTML = `
    <div class="pp-header">
      LẤY TỌA ĐỘ
      <button id="pp-close" title="Đóng">✕</button>
    </div>
    <div id="pp-cursor" class="pp-cursor">Di chuyển chuột trên bản đồ…</div>
    <div class="pp-hint">Click để ghim điểm · Esc để thoát</div>
    <div class="pp-list">${rows || '<div class="pp-empty">Chưa có điểm nào</div>'}</div>
    ${pickedPoints.length ? `
    <div class="pp-actions">
      <button id="pp-copy">Copy tọa độ (${pickedPoints.length} điểm)</button>
      <button id="pp-clear">Xóa tất cả</button>
    </div>` : ""}
  `;

  panel.querySelector("#pp-close").addEventListener("click", exitPickMode);
  panel.querySelectorAll(".pp-del").forEach(btn => {
    btn.addEventListener("click", () => {
      pickedPoints.splice(+btn.dataset.i, 1);
      buildPickPanel();
    });
  });
  if (pickedPoints.length) {
    panel.querySelector("#pp-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(allText).then(() => {
        const btn = panel.querySelector("#pp-copy");
        btn.textContent = "Đã copy!";
        setTimeout(() => buildPickPanel(), 1200);
      });
    });
    panel.querySelector("#pp-clear").addEventListener("click", () => {
      pickedPoints = [];
      buildPickPanel();
    });
  }
}

function enterPickMode() {
  pickMode = true;
  pickedPoints = [];
  if (viewer) viewer.canvas.style.cursor = "crosshair";
  buildPickPanel();
  document.getElementById("pick-panel").style.display = "flex";

  // Mouse-move: update cursor display
  pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  pickHandler.setInputAction((evt) => {
    const pos = getMapPos(evt.endPosition);
    const el = document.getElementById("pp-cursor");
    if (el) el.textContent = pos ? `${pos.lat}, ${pos.lon}` : "—";
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Click: pin a point
  pickHandler.setInputAction((evt) => {
    const pos = getMapPos(evt.position);
    if (!pos) return;
    pickedPoints.push(pos);
    buildPickPanel();
    document.getElementById("pick-panel").style.display = "flex";
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function exitPickMode() {
  pickMode = false;
  if (pickHandler) { pickHandler.destroy(); pickHandler = null; }
  if (viewer) viewer.canvas.style.cursor = "";
  const panel = document.getElementById("pick-panel");
  if (panel) panel.style.display = "none";
}

export function togglePickMode() {
  if (pickMode) exitPickMode();
  else enterPickMode();
}


function seededRand(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function desc(p) {
  const dt = p.dienTich > 0 ? Number(p.dienTich).toLocaleString("vi-VN") + " m²" : "—";
  return `<div style="font-family:system-ui;font-size:13px;min-width:240px">
    <div style="background:#1565c0;color:#fff;padding:8px 12px;margin:-8px -12px 10px;border-radius:4px 4px 0 0">
      <b>${p.tenCty}</b>
    </div>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="color:#888;padding:3px 10px 3px 0;white-space:nowrap">Số lô</td>
          <td><b>${p.loHang || "—"}</b></td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Ngành nghề</td>
          <td>${p.loaiHinh}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Diện tích</td>
          <td>${dt}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Điện thoại</td>
          <td>${p.dienThoai || "—"}</td></tr>
    </table>
  </div>`;
}

function treeDesc(p) {
  const cfg = TREE_TYPES[p.tenLoai] || {};
  const dot = cfg.color
    ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cfg.color};margin-right:6px;vertical-align:middle;border:1px solid rgba(0,0,0,.2)"></span>`
    : "";
  const statusColor = p.trangThai === "Tốt" ? "#2e7d32" : p.trangThai === "Cần chăm sóc" ? "#c62828" : "#e65100";
  return `<div style="font-family:system-ui;font-size:13px">
    <div style="background:#2e7d32;color:#fff;padding:8px 12px;margin:-8px -12px 10px;border-radius:4px 4px 0 0">
      ${dot}<b>${p.tenLoai}</b>
    </div>
    <table style="border-collapse:collapse">
      <tr><td style="color:#888;padding:3px 10px 3px 0">Số hiệu</td><td><b>${p.soHieu}</b></td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Chiều cao</td><td>${p.chieuCao} m</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Đường kính</td><td>${p.duongKinh} cm</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Năm trồng</td><td>${p.namTrong}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Trạng thái</td>
          <td style="color:${statusColor};font-weight:600">${p.trangThai}</td></tr>
    </table>
  </div>`;
}

function renderTree(lon, lat, p) {
  const cfg = TREE_TYPES[p.tenLoai] || { color: "#4E7C4E", trunkColor: "#5D4037" };
  const h   = p.chieuCao || 6;
  const key = p.soHieu;
  const ents = [];

  const seed = (Math.abs(Math.round(lon * 1e5)) * 31337 + Math.abs(Math.round(lat * 1e5)) * 7919) >>> 0;
  const rng  = n => { const x = Math.sin((seed + n) * 127.1 + 1) * 43758.5453; return x - Math.floor(x); };

  const trunkLen = h * 0.40;
  const cosLat   = Math.cos(lat * Math.PI / 180);

  const trunk = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, trunkLen / 2),
    cylinder: { length: trunkLen, topRadius: 0.13, bottomRadius: 0.30,
      material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(cfg.trunkColor).withAlpha(0.97)),
      shadows: Cesium.ShadowMode.ENABLED },
  });
  trunk._treeKey = key; ents.push(trunk);

  const spread  = Math.max(2.6, h * 0.33);
  const canopyH = h * 0.62;
  const color   = Cesium.Color.fromCssColorString(cfg.color);
  const name    = `${p.tenLoai} — ${p.soHieu}`;
  const descHtml = treeDesc(p);

  for (let i = 0; i < 8; i++) {
    const isCenter = i === 0;
    const angle  = rng(i)      * Math.PI * 2;
    const dist   = rng(i + 10) * spread * (isCenter ? 0 : 0.72);
    const offLon = isCenter ? 0 : (dist * Math.cos(angle)) / (LAT_M * cosLat);
    const offLat = isCenter ? 0 : (dist * Math.sin(angle)) / LAT_M;
    const offH   = isCenter ? 0 : (rng(i + 20) - 0.38) * h * 0.36;
    const r      = spread * (isCenter ? 0.88 : (0.52 + rng(i + 30) * 0.34));
    const e = viewer.entities.add({
      name, description: descHtml,
      position: Cesium.Cartesian3.fromDegrees(lon + offLon, lat + offLat, canopyH + offH),
      ellipsoid: { radii: new Cesium.Cartesian3(r, r, r * 0.80),
        material: new Cesium.ColorMaterialProperty(color.withAlpha(0.94)),
        shadows: Cesium.ShadowMode.ENABLED },
    });
    e._treeKey = key; ents.push(e);
  }
  treeEntities.set(key, ents);
}

function getTreeCount(species) {
  return treesData.filter(t => t.tenLoai === species).length;
}

function buildTreePanel() {
  let panel = document.getElementById("tree-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "tree-panel";
    document.getElementById("stage").appendChild(panel);
  }

  const total = treesData.length;
  const counts = Object.fromEntries(Object.keys(TREE_TYPES).map(k => [k, 0]));
  treesData.forEach(t => { if (counts[t.tenLoai] !== undefined) counts[t.tenLoai]++; });

  const rows = Object.entries(TREE_TYPES).map(([name, cfg]) => {
    const cnt = counts[name] || 0;
    const isActive = addModeSpecies === name;
    return `<div class="tp-item${isActive ? " tp-item--active" : ""}">
      <span class="tp-dot" style="background:${cfg.color}"></span>
      <span class="tp-name">${name}</span>
      <span class="tp-count">${cnt}</span>
      <button class="tp-add${isActive ? " tp-add--active" : ""}" data-sp="${name}" title="${isActive ? "Hủy thêm" : "Thêm cây vào bản đồ"}">${isActive ? "✕" : "+"}</button>
    </div>`;
  }).join("");

  panel.innerHTML = `
    <div class="tp-header">CHÚ GIẢI CÂY XANH</div>
    <div class="tp-total">Tổng số cây: <b>${total}</b></div>
    <div class="tp-list">${rows}</div>
    <div class="tp-footer${addModeSpecies ? " tp-footer--active" : ""}">
      ${addModeSpecies
        ? `<span>🌱 Đang thêm: <b>${addModeSpecies}</b><br><small>Click trên bản đồ để đặt cây · Esc để hủy</small></span>`
        : `<span>Nhấn <b>+</b> để thêm cây lên bản đồ</span>`}
    </div>
  `;

  panel.querySelectorAll(".tp-add").forEach(btn => {
    btn.addEventListener("click", () => {
      const sp = btn.dataset.sp;
      if (addModeSpecies === sp) exitAddMode();
      else enterAddMode(sp);
    });
  });
}

function enterAddMode(species) {
  addModeSpecies = species;
  if (viewer) viewer.canvas.style.cursor = "crosshair";

  if (addHandler) { addHandler.destroy(); addHandler = null; }

  addHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  addHandler.setInputAction((evt) => {
    let cartesian = viewer.scene.pickPosition(evt.position);
    if (!cartesian) {
      cartesian = viewer.camera.pickEllipsoid(evt.position, viewer.scene.globe.ellipsoid);
    }
    if (!cartesian) return;

    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);

    const cfg = TREE_TYPES[species];
    const count = getTreeCount(species) + 1;
    const soHieu = `${cfg.prefix}-${String(count).padStart(3, "0")}`;

    const p = {
      soHieu,
      tenLoai: species,
      chieuCao: 6,
      duongKinh: 2,
      namTrong: new Date().getFullYear(),
      trangThai: "Tốt",
    };
    treesData.push({ ...p, lon, lat });
    renderTree(lon, lat, p);
    exitAddMode();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  buildTreePanel();
  status().textContent = `Đang thêm: ${species} — Click vào bản đồ để đặt cây. Nhấn Esc để hủy.`;
}

function exitAddMode() {
  addModeSpecies = null;
  if (addHandler) { addHandler.destroy(); addHandler = null; }
  if (viewer) viewer.canvas.style.cursor = "";
  buildTreePanel();
  status().textContent = `3D: ${treesData.length} cây — click cây để xem thông tin`;
}

// ── Editable polygon buildings ────────────────────────────────
let polyBuildings = [];
let polyEntities  = new Map(); // tenCty → { wall, roof }
let deletedNames  = new Set(); // tên công ty đã xóa — không re-import từ cty.geojson

async function loadData() {
  const parse = raw => Array.isArray(raw)
    ? { buildings: raw, trees: [], deleted: [] }
    : { buildings: raw.buildings || [], trees: raw.trees || [], deleted: raw.deleted || [] };

  try {
    const r = await fetch("/data/mhs_buildings.json?t=" + Date.now());
    if (r.ok) return parse(await r.json());
  } catch (e) {}
  try {
    const s = localStorage.getItem("mhs_buildings");
    if (s) return parse(JSON.parse(s));
  } catch (e) {}
  return { buildings: COMPANY_POLYGONS.map(c => ({ ...c, height: 16 })), trees: [], deleted: [] };
}

async function saveData() {
  const payload = {
    buildings: polyBuildings.map(({ tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon }) =>
      ({ tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon })
    ),
    trees: treesData.map(({ soHieu, tenLoai, chieuCao, duongKinh, namTrong, trangThai, lon, lat }) =>
      ({ soHieu, tenLoai, chieuCao, duongKinh, namTrong, trangThai, lon, lat })
    ),
    deleted: [...deletedNames],
  };
  try {
    const r = await fetch("/api/save", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload) });
    if (r.ok) return;
  } catch (e) {}
  try { localStorage.setItem("mhs_buildings", JSON.stringify(payload)); } catch (e) {}
}

function renderPolyBuilding(data) {
  const key = data.tenCty;
  const old = polyEntities.get(key);
  if (old) { viewer.entities.remove(old.wall); viewer.entities.remove(old.roof); }

  const h = data.height || 16;
  const coords = data.polygon.flatMap(([lon, lat]) => [lon, lat]);
  const wallColor = Cesium.Color.fromCssColorString("#F0F0F0").withAlpha(0.93);
  const roofColor = Cesium.Color.fromCssColorString(ROOF_COLORS[data.loaiHinh] || "#E0E0E0");

  const wall = viewer.entities.add({
    name: data.tenCty, description: desc(data),
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(coords)),
      height: 0, extrudedHeight: h,
      material: new Cesium.ColorMaterialProperty(wallColor),
      outline: true,
      outlineColor: new Cesium.ConstantProperty(Cesium.Color.fromCssColorString("#757575")),
      outlineWidth: 2, shadows: Cesium.ShadowMode.ENABLED,
      closeTop: false, closeBottom: true,
    },
  });
  wall._polyKey = key;

  const roof = viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(coords)),
      height: h, extrudedHeight: h + 2,
      material: new Cesium.ColorMaterialProperty(roofColor.withAlpha(0.96)),
      outline: false, shadows: Cesium.ShadowMode.ENABLED,
    },
  });
  roof._polyKey = key;

  polyEntities.set(key, { wall, roof });
}

function updatePolyGeometry(idx) {
  const data = polyBuildings[idx];
  const ents = polyEntities.get(data.tenCty);
  if (!ents) { renderPolyBuilding(data); return; }
  const h = data.height || 16;
  const coords = data.polygon.flatMap(([lon, lat]) => [lon, lat]);
  const hier = () => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(coords));
  ents.wall.polygon.hierarchy    = new Cesium.ConstantProperty(hier());
  ents.wall.polygon.extrudedHeight = new Cesium.ConstantProperty(h);
  ents.roof.polygon.hierarchy    = new Cesium.ConstantProperty(hier());
  ents.roof.polygon.height       = new Cesium.ConstantProperty(h);
  ents.roof.polygon.extrudedHeight = new Cesium.ConstantProperty(h + 2);
  ents.roof.polygon.material = new Cesium.ColorMaterialProperty(
    Cesium.Color.fromCssColorString(ROOF_COLORS[data.loaiHinh] || "#E0E0E0").withAlpha(0.96)
  );
}

function removePolyBuilding(idx) {
  const data = polyBuildings[idx];
  const ents = polyEntities.get(data.tenCty);
  if (ents) { viewer.entities.remove(ents.wall); viewer.entities.remove(ents.roof); polyEntities.delete(data.tenCty); }
  deletedNames.add(data.tenCty);
  polyBuildings.splice(idx, 1);
  saveData();
}

function addAllPolyBuildings(buildings, deleted = []) {
  polyBuildings = buildings;
  deleted.forEach(n => deletedNames.add(n));
  for (const data of polyBuildings) {
    if (!data.height) data.height = 16;
    renderPolyBuilding(data);
  }
  return new Set(polyBuildings.map(c => c.tenCty));
}

// ── Editor ────────────────────────────────────────────────────
let edMode    = null;  // 'draw' | 'edit' | 'delete'
let edHandler = null;
let drawVerts = [], drawDots = [], drawLineEnt = null;
let selIdx    = null;
let hndEnts   = [];
let dragHnd   = null, isDragging = false;

function selectTree(key) {
  deselectTree();
  selTreeKey = key;
  const t = treesData.find(t => t.soHieu === key);
  if (!t) return;
  treeHndEnt = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(t.lon, t.lat, (t.chieuCao || 6) + 7),
    point: { pixelSize: 14, color: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
  treeHndEnt._isTreeHnd = true; treeHndEnt._treeKey = key;
}

function deselectTree() {
  if (treeHndEnt) { viewer.entities.remove(treeHndEnt); treeHndEnt = null; }
  selTreeKey = null; isDraggingTree = false;
}

function deleteTree(key) {
  const ents = treeEntities.get(key);
  if (ents) { ents.forEach(e => viewer.entities.remove(e)); treeEntities.delete(key); }
  if (treeHndEnt?._treeKey === key) { viewer.entities.remove(treeHndEnt); treeHndEnt = null; }
  const idx = treesData.findIndex(t => t.soHieu === key);
  if (idx >= 0) treesData.splice(idx, 1);
  selTreeKey = null; isDraggingTree = false;
  buildTreePanel(); saveData();
}

function moveTreeTo(key, lon, lat) {
  const idx = treesData.findIndex(t => t.soHieu === key); if (idx < 0) return;
  const t = treesData[idx];
  const ents = treeEntities.get(key);
  if (ents) { ents.forEach(e => viewer.entities.remove(e)); treeEntities.delete(key); }
  t.lon = lon; t.lat = lat;
  renderTree(lon, lat, t);
  if (treeHndEnt?._treeKey === key)
    treeHndEnt.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(lon, lat, (t.chieuCao || 6) + 7)
    );
}

function convertPtToPolyBuilding(key) {
  const pt = ptBuildings.get(key); if (!pt) return;
  viewer.entities.remove(pt.wall); viewer.entities.remove(pt.roof);
  ptBuildings.delete(key);
  const newData = {
    tenCty: pt.props.tenCty, loaiHinh: pt.props.loaiHinh,
    loHang: pt.props.loHang || "", dienTich: pt.props.dienTich || 0,
    dienThoai: pt.props.dienThoai || "", height: Math.round(pt.h),
    polygon: pt.polygon,
  };
  polyBuildings.push(newData);
  renderPolyBuilding(newData);
  saveData();
  showHandles(polyBuildings.length - 1);
}

function clearHandles() {
  hndEnts.forEach(h => viewer.entities.remove(h));
  hndEnts = [];
  selIdx = null;
  const p = document.getElementById("ed-props");
  if (p) p.style.display = "none";
}

function showHandles(idx) {
  clearHandles();
  selIdx = idx;
  const data = polyBuildings[idx];
  const alt  = (data.height || 16) + 5;
  const n    = data.polygon.length;

  data.polygon.forEach(([lon, lat], i) => {
    const e = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
      point: { pixelSize: 14, color: Cesium.Color.GOLD, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    e._isHnd = true; e._hndType = "vert"; e._vi = i; e._pi = idx;
    hndEnts.push(e);
  });

  data.polygon.forEach(([lon, lat], i) => {
    const [lon2, lat2] = data.polygon[(i + 1) % n];
    const e = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees((lon + lon2) / 2, (lat + lat2) / 2, alt),
      point: { pixelSize: 9, color: Cesium.Color.DEEPSKYBLUE, outlineColor: Cesium.Color.WHITE, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    e._isHnd = true; e._hndType = "mid"; e._ei = i; e._pi = idx;
    hndEnts.push(e);
  });

  buildEdProps(idx);
}

function buildEdProps(idx) {
  const panel = document.getElementById("ed-props");
  if (!panel) return;
  const data = polyBuildings[idx];
  panel.innerHTML = `
    <div class="ep-name">${data.tenCty}</div>
    <label>Chiều cao (m)<input id="ep-h" type="number" value="${data.height || 16}" min="4" max="60"/></label>
    <label>Ngành nghề<select id="ep-ind">
      ${Object.keys(ROOF_COLORS).map(k => `<option value="${k}"${k === data.loaiHinh ? " selected" : ""}>${k}</option>`).join("")}
    </select></label>
    <label>Tên công ty<input id="ep-name" value="${data.tenCty}"/></label>
    <div class="ep-btns">
      <button id="ep-apply">Áp dụng</button>
      <button id="ep-del" class="ep-del-btn">Xóa</button>
    </div>`;
  panel.style.display = "flex";

  document.getElementById("ep-apply").onclick = () => {
    const newName = document.getElementById("ep-name").value.trim() || data.tenCty;
    const oldKey = data.tenCty;
    data.height   = +document.getElementById("ep-h").value || 16;
    data.loaiHinh = document.getElementById("ep-ind").value;
    if (newName !== oldKey) {
      const ents = polyEntities.get(oldKey);
      if (ents) { ents.wall.name = newName; ents.wall._polyKey = newName; ents.roof._polyKey = newName; }
      polyEntities.set(newName, polyEntities.get(oldKey));
      polyEntities.delete(oldKey);
      data.tenCty = newName;
    }
    updatePolyGeometry(idx);
    showHandles(idx);
    saveData();
  };
  document.getElementById("ep-del").onclick = () => {
    if (!confirm(`Xóa "${data.tenCty}"?`)) return;
    removePolyBuilding(idx);
    clearHandles();
  };
}

function setEdMode(mode) {
  if (edMode === "edit") { clearHandles(); deselectTree(); }
  if (edMode === "draw") clearDrawing();
  edMode = mode;
  if (edHandler) { edHandler.destroy(); edHandler = null; }
  if (viewer) viewer.canvas.style.cursor = (mode === "draw" || mode === "delete") ? "crosshair" : "";
  buildEdToolbar();
  buildEdHint();
  if (mode) setupEdHandler();
}

function setupEdHandler() {
  edHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  if (edMode === "edit") {
    edHandler.setInputAction(evt => {
      const p = viewer.scene.pick(evt.position); if (!p?.id) return;
      const e = p.id;
      if (e._isHnd && e._hndType === "vert") {
        dragHnd = e; isDragging = true;
        viewer.scene.screenSpaceCameraController.enableRotate = false;
        viewer.scene.screenSpaceCameraController.enableZoom   = false;
      } else if (e._isTreeHnd) {
        isDraggingTree = true;
        viewer.scene.screenSpaceCameraController.enableRotate = false;
        viewer.scene.screenSpaceCameraController.enableZoom   = false;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    edHandler.setInputAction(evt => {
      if (isDragging && dragHnd) {
        const pos = getMapPos(evt.endPosition); if (!pos) return;
        polyBuildings[dragHnd._pi].polygon[dragHnd._vi] = [pos.lon, pos.lat];
        dragHnd.position = new Cesium.ConstantPositionProperty(
          Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, (polyBuildings[dragHnd._pi].height || 16) + 5)
        );
        updatePolyGeometry(dragHnd._pi);
        const data = polyBuildings[dragHnd._pi]; const n = data.polygon.length;
        hndEnts.filter(e => e._hndType === "mid" && e._pi === dragHnd._pi).forEach(e => {
          const [lo, la] = data.polygon[e._ei % n]; const [lo2, la2] = data.polygon[(e._ei + 1) % n];
          e.position = new Cesium.ConstantPositionProperty(
            Cesium.Cartesian3.fromDegrees((lo + lo2) / 2, (la + la2) / 2, (data.height || 16) + 5)
          );
        });
      } else if (isDraggingTree && selTreeKey) {
        const pos = getMapPos(evt.endPosition); if (!pos) return;
        moveTreeTo(selTreeKey, pos.lon, pos.lat);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    edHandler.setInputAction(() => {
      const wasDrag = isDragging || isDraggingTree;
      isDragging = false; dragHnd = null;
      isDraggingTree = false;
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableZoom   = true;
      if (wasDrag) saveData();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    edHandler.setInputAction(evt => {
      if (isDragging || isDraggingTree) return;
      const p = viewer.scene.pick(evt.position);
      if (!p?.id) { clearHandles(); deselectTree(); return; }
      const e = p.id;
      if (e._isHnd && e._hndType === "mid") {
        const pos = getMapPos(evt.position); if (!pos) return;
        polyBuildings[e._pi].polygon.splice(e._ei + 1, 0, [pos.lon, pos.lat]);
        updatePolyGeometry(e._pi); showHandles(e._pi); saveData();
      } else if (e._polyKey) {
        deselectTree();
        const idx = polyBuildings.findIndex(b => b.tenCty === e._polyKey);
        if (idx >= 0) showHandles(idx);
      } else if (e._treeKey && !e._isTreeHnd) {
        clearHandles(); selectTree(e._treeKey);
      } else if (e._ptKey) {
        clearHandles(); deselectTree(); convertPtToPolyBuilding(e._ptKey);
      } else if (!e._isHnd && !e._isTreeHnd) {
        clearHandles(); deselectTree();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    edHandler.setInputAction(evt => {
      const p = viewer.scene.pick(evt.position); if (!p?.id) return;
      const e = p.id;
      if (e._isHnd && e._hndType === "vert") {
        const { _vi, _pi } = e;
        if (polyBuildings[_pi].polygon.length <= 3) return;
        polyBuildings[_pi].polygon.splice(_vi, 1);
        updatePolyGeometry(_pi); showHandles(_pi); saveData();
      } else if (e._isTreeHnd || e._treeKey) {
        const key = e._treeKey || selTreeKey;
        if (key && confirm(`Xóa cây "${key}"?`)) deleteTree(key);
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  if (edMode === "draw") {
    edHandler.setInputAction(evt => {
      const pos = getMapPos(evt.position); if (!pos) return;
      drawVerts.push([pos.lon, pos.lat]);
      const dot = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 20),
        point: { pixelSize: 10, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      drawDots.push(dot);
      updateDrawPreview(); buildEdHint();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    edHandler.setInputAction(() => {
      if (drawVerts.length > 0) { drawVerts.pop(); const d = drawDots.pop(); if (d) viewer.entities.remove(d); }
      if (drawVerts.length >= 3) finishDraw(); else buildEdHint();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    edHandler.setInputAction(evt => {
      if (drawVerts.length === 0) return;
      const pos = getMapPos(evt.endPosition); if (pos) updateDrawPreview(pos);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  if (edMode === "delete") {
    edHandler.setInputAction(evt => {
      const p = viewer.scene.pick(evt.position); if (!p?.id) return;
      const e = p.id;
      if (e._polyKey) {
        const idx = polyBuildings.findIndex(b => b.tenCty === e._polyKey);
        if (idx >= 0 && confirm(`Xóa "${polyBuildings[idx].tenCty}"?`)) { removePolyBuilding(idx); clearHandles(); }
      } else if (e._ptKey) {
        const pt = ptBuildings.get(e._ptKey);
        if (pt && confirm(`Xóa "${e._ptKey}"?`)) {
          viewer.entities.remove(pt.wall); viewer.entities.remove(pt.roof);
          ptBuildings.delete(e._ptKey); saveData();
        }
      } else if (e._treeKey) {
        if (confirm(`Xóa cây "${e._treeKey}"?`)) deleteTree(e._treeKey);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

function updateDrawPreview(mousePos) {
  const verts = mousePos ? [...drawVerts, [mousePos.lon, mousePos.lat]] : [...drawVerts];
  if (verts.length < 2) return;
  const positions = verts.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 20));
  if (verts.length >= 3) positions.push(positions[0]);
  if (drawLineEnt) {
    drawLineEnt.polyline.positions = new Cesium.ConstantProperty(positions);
  } else {
    drawLineEnt = viewer.entities.add({
      polyline: { positions: new Cesium.ConstantProperty(positions), width: 2.5, material: new Cesium.ColorMaterialProperty(Cesium.Color.ORANGE.withAlpha(0.85)) },
    });
  }
}

function clearDrawing() {
  drawVerts = [];
  drawDots.forEach(d => viewer.entities.remove(d)); drawDots = [];
  if (drawLineEnt) { viewer.entities.remove(drawLineEnt); drawLineEnt = null; }
  buildEdHint();
}

function finishDraw() {
  const verts = [...drawVerts];
  clearDrawing();
  const modal = document.getElementById("draw-modal");
  modal.style.display = "flex";
  modal.querySelector("#dm-name").focus();
  modal.querySelector("#dm-ok").onclick = () => {
    const name = modal.querySelector("#dm-name").value.trim();
    if (!name) { alert("Nhập tên công ty"); return; }
    const newData = {
      tenCty: name,
      loaiHinh: modal.querySelector("#dm-ind").value,
      loHang: modal.querySelector("#dm-lot").value.trim(),
      dienTich: 0, dienThoai: "",
      height: +modal.querySelector("#dm-h").value || 16,
      polygon: verts,
    };
    polyBuildings.push(newData);
    renderPolyBuilding(newData);
    saveData();
    modal.style.display = "none";
    setEdMode("edit");
    showHandles(polyBuildings.length - 1);
  };
  modal.querySelector("#dm-cancel").onclick = () => { modal.style.display = "none"; };
}

function buildEdToolbar() {
  const tb = document.getElementById("ed-toolbar"); if (!tb) return;
  tb.style.display = "flex";
  tb.innerHTML = `
    <span class="et-label">Nhà xưởng</span>
    <button class="et-btn${edMode === "edit"   ? " et-on" : ""}" id="et-edit" title="Chọn & kéo đỉnh để sửa hình">↗ Sửa</button>
    <button class="et-btn${edMode === "draw"   ? " et-on" : ""}" id="et-draw" title="Vẽ nhà xưởng mới">＋ Vẽ</button>
    <button class="et-btn${edMode === "delete" ? " et-on et-danger" : ""}" id="et-del"  title="Xóa nhà xưởng">🗑</button>
    <div class="et-sep"></div>
    <button class="et-btn" id="et-export" title="Tải xuống JSON">⬇ JSON</button>`;
  document.getElementById("et-edit").onclick   = () => setEdMode(edMode === "edit"   ? null : "edit");
  document.getElementById("et-draw").onclick   = () => setEdMode(edMode === "draw"   ? null : "draw");
  document.getElementById("et-del").onclick    = () => setEdMode(edMode === "delete" ? null : "delete");
  document.getElementById("et-export").onclick = exportBuildings;
}

function buildEdHint() {
  const hint = document.getElementById("ed-hint"); if (!hint) return;
  if (edMode === "draw") {
    const n = drawVerts.length;
    hint.textContent = n === 0 ? "Click để đặt góc đầu tiên"
      : n < 3 ? `${n} góc — cần thêm ${3 - n} góc nữa · Esc hủy`
      : `${n} góc — Double-click để hoàn thành · Esc hủy`;
    hint.style.display = "block";
  } else if (edMode === "edit") {
    hint.textContent = "Click nhà xưởng/cây để chọn → kéo để di chuyển · Điểm xanh = thêm góc · Chuột phải = xóa đỉnh/cây · Click công ty cũ để chuyển sang polygon";
    hint.style.display = "block";
  } else if (edMode === "delete") {
    hint.textContent = "Click vào nhà xưởng hoặc cây để xóa";
    hint.style.display = "block";
  } else {
    hint.style.display = "none";
  }
}

async function exportBuildings() {
  await saveData();
  const payload = {
    buildings: polyBuildings.map(({ tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon }) =>
      ({ tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon })
    ),
    trees: treesData.map(({ soHieu, tenLoai, chieuCao, duongKinh, namTrong, trangThai, lon, lat }) =>
      ({ soHieu, tenLoai, chieuCao, duongKinh, namTrong, trangThai, lon, lat })
    ),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "mhs_buildings.json" });
  a.click(); URL.revokeObjectURL(a.href);
}

function ensureEditorUI() {
  if (document.getElementById("ed-toolbar")) { buildEdToolbar(); return; }
  const stage = document.getElementById("stage");

  const tb = document.createElement("div"); tb.id = "ed-toolbar"; stage.appendChild(tb);
  const hint = document.createElement("div"); hint.id = "ed-hint"; hint.style.display = "none"; stage.appendChild(hint);
  const props = document.createElement("div"); props.id = "ed-props"; props.style.display = "none"; stage.appendChild(props);

  const modal = document.createElement("div"); modal.id = "draw-modal"; modal.style.display = "none";
  modal.innerHTML = `<div class="dm-box">
    <div class="dm-title">Nhà xưởng mới</div>
    <label>Tên công ty<input id="dm-name" placeholder="CÔNG TY ABC"/></label>
    <label>Ngành nghề<select id="dm-ind">${Object.keys(ROOF_COLORS).map(k => `<option value="${k}">${k}</option>`).join("")}</select></label>
    <label>Chiều cao (m)<input id="dm-h" type="number" value="16" min="4" max="60"/></label>
    <label>Số lô<input id="dm-lot" placeholder="B12"/></label>
    <div class="dm-btns"><button id="dm-ok">Lưu</button><button id="dm-cancel">Hủy</button></div>
  </div>`;
  stage.appendChild(modal);

  buildEdToolbar();
}

async function addBuildings(v, excludeNames = new Set()) {
  const gj = await (await fetch("/data/cty.geojson")).json();
  const feats = gj.features.filter(f =>
    f.properties.loaiHinh !== "Hạ tầng KCN" && !excludeNames.has(f.properties.tenCty)
  );

  // Pre-compute nearest-neighbour distance for every company so buildings
  // never overflow into adjacent lots. Two buildings each at 42% of nn_dist
  // from their own centre → 16% gap (~road + setback) between them.
  const avgCosLat = Math.cos(11.51 * Math.PI / 180);
  const coords = feats.map(f => f.geometry.coordinates);
  const nnDist = coords.map((c, i) => {
    let best = Infinity;
    for (let j = 0; j < coords.length; j++) {
      if (i === j) continue;
      const dx = (coords[j][0] - c[0]) * LAT_M * avgCosLat;
      const dy = (coords[j][1] - c[1]) * LAT_M;
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
    return best;
  });

  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties;

    const r1 = seededRand(i * 3);
    const r3 = seededRand(i * 3 + 2);

    // Max half-width: 42% of nearest-neighbour distance, hard cap 100 m
    const maxHalf = Math.min(nnDist[i] * 0.42, 100);

    const lotArea  = p.dienTich > 0 ? p.dienTich : 20000;
    const coverage = 0.60;
    const aspect   = 1.25 + r1 * 0.60;   // factory shapes: 1.25 – 1.85

    const rawW = Math.sqrt(lotArea * coverage * aspect);
    const rawD = (lotArea * coverage) / rawW;

    const w = Math.min(rawW, maxHalf * 2);
    const d = Math.min(rawD, maxHalf * 2);
    const h = 9 + r3 * 11;               // 9 – 20 m

    const dLon = (w / 2) / (LAT_M * Math.cos((lat * Math.PI) / 180));
    const dLat = (d / 2) / LAT_M;

    const roofColor = Cesium.Color.fromCssColorString(ROOF_COLORS[p.loaiHinh] || "#E0E0E0");
    const wallColor = Cesium.Color.fromCssColorString("#F0F0F0").withAlpha(0.93);

    const ptPolygon = [
      [lon - dLon, lat - dLat], [lon + dLon, lat - dLat],
      [lon + dLon, lat + dLat], [lon - dLon, lat + dLat],
    ];
    const degArr = ptPolygon.flatMap(([lo, la]) => [lo, la]);

    const wall = v.entities.add({
      name: p.tenCty,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(degArr)),
        height: 0, extrudedHeight: h,
        material: new Cesium.ColorMaterialProperty(wallColor),
        outline: true,
        outlineColor: new Cesium.ConstantProperty(Cesium.Color.fromCssColorString("#757575")),
        outlineWidth: 1.5, shadows: Cesium.ShadowMode.ENABLED,
        closeTop: false, closeBottom: true,
      },
      description: desc(p),
    });
    wall._ptKey = p.tenCty;

    const roof = v.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(degArr)),
        height: h, extrudedHeight: h + 1.5,
        material: new Cesium.ColorMaterialProperty(roofColor.withAlpha(0.96)),
        outline: false, shadows: Cesium.ShadowMode.ENABLED,
      },
    });
    roof._ptKey = p.tenCty;
    ptBuildings.set(p.tenCty, { props: p, polygon: ptPolygon, h, wall, roof });
  }
  return feats.length;
}

async function addTrees(savedTrees) {
  let data = savedTrees?.length ? savedTrees : null;
  if (!data) {
    try {
      const gj = await (await fetch("/data/cay.geojson")).json();
      data = gj.features.map(f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
    } catch (e) { console.warn("trees", e.message); data = []; }
  }
  for (const t of data) {
    treesData.push(t);
    renderTree(t.lon, t.lat, t);
  }
}

async function addRoads(v) {
  const loads = [
    ["/data/duong.geojson",   "#FFA726", 4],
    ["/data/vanhdai.geojson", "#FF1744", 3],
  ];
  for (const [url, color, w] of loads) {
    try {
      const ds = await Cesium.GeoJsonDataSource.load(url, {
        clampToGround: true,
        stroke: Cesium.Color.fromCssColorString(color),
        strokeWidth: w,
      });
      v.dataSources.add(ds);
    } catch (e) { console.warn(url, e.message); }
  }
}

export function hideTreePanel() {
  const panel = document.getElementById("tree-panel");
  if (panel) panel.style.display = "none";
  addModeSpecies = null;
  if (addHandler) { addHandler.destroy(); addHandler = null; }
  if (viewer) viewer.canvas.style.cursor = "";
}

function ensurePickBtn() {
  if (document.getElementById("pick-btn")) return;
  const btn = document.createElement("button");
  btn.id = "pick-btn";
  btn.title = "Bật/tắt lấy tọa độ từ bản đồ";
  btn.textContent = "Lấy tọa độ";
  btn.addEventListener("click", () => {
    togglePickMode();
    btn.classList.toggle("active", pickMode);
  });
  document.getElementById("stage").appendChild(btn);
}

export async function load3D() {
  document.getElementById("map").style.display    = "none";
  document.getElementById("side").style.display   = "none";
  document.getElementById("cesium").style.display = "block";
  document.querySelectorAll(".banner").forEach(b => b.remove());
  ensureEditorUI();
  ensurePickBtn();
  status().textContent = "Đang dựng cảnh 3D…";

  if (!escListenerAttached) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (addModeSpecies) exitAddMode();
        if (pickMode) exitPickMode();
        if (edMode) setEdMode(null);
      }
    });
    escListenerAttached = true;
  }

  try {
    if (!viewer) {
      viewer = new Cesium.Viewer("cesium", {
        baseLayer: false, baseLayerPicker: false, geocoder: false,
        timeline: false, animation: false, sceneModePicker: false,
        navigationHelpButton: false, homeButton: false, infoBox: true,
        shadows: true,
      });
      viewer.imageryLayers.add(new Cesium.ImageryLayer(
        new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })
      ));
      try {
        viewer.terrainProvider =
          await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ESRI_TERRAIN);
      } catch (e) { console.warn("terrain", e.message); }

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          CAMERA_3D.lon, CAMERA_3D.lat, CAMERA_3D.height
        ),
        orientation: {
          heading: Cesium.Math.toRadians(CAMERA_3D.heading),
          pitch:   Cesium.Math.toRadians(CAMERA_3D.pitch),
        },
      });
    }

    if (!loaded) {
      status().textContent = "Đang render nhà xưởng…";
      await addRoads(viewer);
      const savedData = await loadData();
      addAllPolyBuildings(savedData.buildings, savedData.deleted);
      await addTrees(savedData.trees);
      loaded = true;
      buildTreePanel();
      status().textContent = `3D: ${treesData.length} cây — click cây để xem thông tin`;
    } else {
      const panel = document.getElementById("tree-panel");
      if (panel) panel.style.display = "flex";
      buildTreePanel();
    }
  } catch (err) {
    status().textContent = "Lỗi 3D: " + err.message;
    console.error(err);
  }
}
