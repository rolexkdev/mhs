import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { ESRI_TERRAIN, CAMERA_3D } from "./config.js";

let viewer = null, loaded = false;
const status = () => document.getElementById("status");

const LAT_M = 111000;

// Màu mái nhà theo loại ngành
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
  return `<div style="font-family:system-ui;font-size:13px">
    <div style="background:#2e7d32;color:#fff;padding:8px 12px;margin:-8px -12px 10px;border-radius:4px 4px 0 0">
      🌸 <b>${p.tenLoai}</b>
    </div>
    <table style="border-collapse:collapse">
      <tr><td style="color:#888;padding:3px 10px 3px 0">Số hiệu</td><td>${p.soHieu}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Chiều cao</td><td>${p.chieuCao} m</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Đường kính</td><td>${p.duongKinh} cm</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Năm trồng</td><td>${p.namTrong}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Trạng thái</td>
          <td style="color:${p.trangThai==='Tốt'?'#2e7d32':'#e65100'}">${p.trangThai}</td></tr>
    </table>
  </div>`;
}

// Seed PRNG cho kích thước nhà xưởng ổn định (không đổi mỗi lần load)
function seededRand(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

async function addBuildings(v) {
  const gj = await (await fetch("/data/cty.geojson")).json();
  let count = 0;

  for (let i = 0; i < gj.features.length; i++) {
    const f = gj.features[i];
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties;
    if (p.loaiHinh === "Hạ tầng KCN") continue;

    // Kích thước từ diện tích thực (PDF) — coverage 65%, aspect ratio 1.5
    const r1 = seededRand(i * 3);
    const r3 = seededRand(i * 3 + 2);
    const area = (p.dienTich > 0 ? p.dienTich : 25000) * 0.65;
    const aspect = 1.3 + r1 * 0.8;
    const w = Math.min(Math.sqrt(area * aspect), 350);
    const d = Math.min(area / Math.max(w, 30), 300);
    const h = 10 + r3 * 12;

    const dLon = (w / 2) / (LAT_M * Math.cos((lat * Math.PI) / 180));
    const dLat = (d / 2) / LAT_M;

    const roofColor = Cesium.Color.fromCssColorString(ROOF_COLORS[p.loaiHinh] || "#E0E0E0");
    const wallColor = Cesium.Color.fromCssColorString("#F5F5F5").withAlpha(0.92);

    // Tường (polygon full height, màu trắng xám)
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
        outlineColor: new Cesium.ConstantProperty(Cesium.Color.fromCssColorString("#616161")),
        outlineWidth: 2,
        shadows: Cesium.ShadowMode.ENABLED,
        closeTop: false,   // mái riêng bên dưới
        closeBottom: true,
      },
      description: desc(p),
    });

    // Mái (polygon mỏng ở đỉnh, màu theo ngành)
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
        extrudedHeight: h + 1.2,
        material: new Cesium.ColorMaterialProperty(roofColor.withAlpha(0.95)),
        outline: false,
        shadows: Cesium.ShadowMode.ENABLED,
      },
    });

    count++;
  }
  return count;
}

async function addTrees(v) {
  try {
    const gj = await (await fetch("/data/cay.geojson")).json();
    const TRUNK  = Cesium.Color.fromCssColorString("#5D4037");
    const CANOPY = Cesium.Color.fromCssColorString("#FF69B4").withAlpha(0.88);
    for (const f of gj.features) {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      const h = p.chieuCao || 6;
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, h * 0.25),
        cylinder: { length: h * 0.5, topRadius: 0.1, bottomRadius: 0.18,
          material: new Cesium.ColorMaterialProperty(TRUNK) },
      });
      v.entities.add({
        name: `${p.tenLoai} — ${p.soHieu}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, h * 0.78),
        ellipsoid: {
          radii: new Cesium.Cartesian3(3.2, 3.2, h * 0.52),
          material: new Cesium.ColorMaterialProperty(CANOPY),
        },
        description: treeDesc(p),
      });
    }
  } catch (e) { console.warn("trees", e.message); }
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

export async function load3D() {
  document.getElementById("map").style.display    = "none";
  document.getElementById("side").style.display   = "none";
  document.getElementById("cesium").style.display = "block";
  document.querySelectorAll(".banner").forEach(b => b.remove());
  status().textContent = "Đang dựng cảnh 3D…";

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
      await addTrees(viewer);
      loaded = true;
      status().textContent =
        `3D: ${bCount} nhà xưởng + 30 Cây Kèn Hồng — click để xem thông tin`;
    }
  } catch (err) {
    status().textContent = "Lỗi 3D: " + err.message;
    console.error(err);
  }
}
