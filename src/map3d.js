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
  const h = p.chieuCao || 6;

  // Seeded PRNG from coordinates — stable positions across reloads
  const seed = (Math.abs(Math.round(lon * 1e5)) * 31337 + Math.abs(Math.round(lat * 1e5)) * 7919) >>> 0;
  const rng = n => { const x = Math.sin((seed + n) * 127.1 + 1) * 43758.5453; return x - Math.floor(x); };

  const trunkLen = h * 0.40;
  const cosLat   = Math.cos(lat * Math.PI / 180);

  // Trunk
  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, trunkLen / 2),
    cylinder: {
      length: trunkLen,
      topRadius: 0.13,
      bottomRadius: 0.30,
      material: new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString(cfg.trunkColor).withAlpha(0.97)
      ),
      shadows: Cesium.ShadowMode.ENABLED,
    },
  });

  // Multi-sphere canopy — 8 overlapping ellipsoids, Cesium's own lighting/shadows
  // create the dark gaps between lobes automatically
  const spread  = Math.max(2.6, h * 0.33);   // horizontal spread
  const canopyH = h * 0.62;                   // centre height
  const color   = Cesium.Color.fromCssColorString(cfg.color);
  const name    = `${p.tenLoai} — ${p.soHieu}`;
  const descHtml = treeDesc(p);

  // cluster layout: [0] = centre (largest), [1-7] = satellites
  for (let i = 0; i < 8; i++) {
    const isCenter = i === 0;
    const angle = rng(i)      * Math.PI * 2;
    const dist  = rng(i + 10) * spread * (isCenter ? 0 : 0.72);
    const offLon = isCenter ? 0 : (dist * Math.cos(angle)) / (LAT_M * cosLat);
    const offLat = isCenter ? 0 : (dist * Math.sin(angle)) / LAT_M;
    const offH   = isCenter ? 0 : (rng(i + 20) - 0.38) * h * 0.36;
    const r      = spread * (isCenter ? 0.88 : (0.52 + rng(i + 30) * 0.34));

    viewer.entities.add({
      name,
      description: descHtml,
      position: Cesium.Cartesian3.fromDegrees(lon + offLon, lat + offLat, canopyH + offH),
      ellipsoid: {
        radii: new Cesium.Cartesian3(r, r, r * 0.80),
        material: new Cesium.ColorMaterialProperty(color.withAlpha(0.94)),
        shadows: Cesium.ShadowMode.ENABLED,
      },
    });
  }
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

async function addBuildings(v) {
  const gj = await (await fetch("/data/cty.geojson")).json();
  const feats = gj.features.filter(f => f.properties.loaiHinh !== "Hạ tầng KCN");

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

    // Walls
    v.entities.add({
      name: p.tenCty,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(
          Cesium.Cartesian3.fromDegreesArray([
            lon - dLon, lat - dLat,
            lon + dLon, lat - dLat,
            lon + dLon, lat + dLat,
            lon - dLon, lat + dLat,
          ])
        ),
        height: 0,
        extrudedHeight: h,
        material: new Cesium.ColorMaterialProperty(wallColor),
        outline: true,
        outlineColor: new Cesium.ConstantProperty(Cesium.Color.fromCssColorString("#757575")),
        outlineWidth: 1.5,
        shadows: Cesium.ShadowMode.ENABLED,
        closeTop: false,
        closeBottom: true,
      },
      description: desc(p),
    });

    // Roof (coloured by industry)
    v.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(
          Cesium.Cartesian3.fromDegreesArray([
            lon - dLon, lat - dLat,
            lon + dLon, lat - dLat,
            lon + dLon, lat + dLat,
            lon - dLon, lat + dLat,
          ])
        ),
        height: h,
        extrudedHeight: h + 1.5,
        material: new Cesium.ColorMaterialProperty(roofColor.withAlpha(0.96)),
        outline: false,
        shadows: Cesium.ShadowMode.ENABLED,
      },
    });
  }
  return feats.length;
}

async function addTrees() {
  try {
    const gj = await (await fetch("/data/cay.geojson")).json();
    for (const f of gj.features) {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      treesData.push({ ...p, lon, lat });
      renderTree(lon, lat, p);
    }
  } catch (e) {
    console.warn("trees", e.message);
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

export async function load3D() {
  document.getElementById("map").style.display    = "none";
  document.getElementById("side").style.display   = "none";
  document.getElementById("cesium").style.display = "block";
  document.querySelectorAll(".banner").forEach(b => b.remove());
  status().textContent = "Đang dựng cảnh 3D…";

  if (!escListenerAttached) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && addModeSpecies) exitAddMode();
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
      const bCount = await addBuildings(viewer);
      await addTrees();
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
