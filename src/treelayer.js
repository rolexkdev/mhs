/**
 * treelayer.js — Render TẤT CẢ cây bằng MỘT Primitive batch (gộp draw call).
 *
 * Vì sao: mỗi cây là 1 Entity glTF model → 1 draw call. Vài trăm cây = vài trăm
 * draw call + cập nhật entity mỗi frame → lag nặng. Gộp toàn bộ hình học cây
 * (thân + 2 tán hình nón) thành GeometryInstance trong 1 Primitive duy nhất →
 * chỉ 1 draw call. Mỗi instance mang id = soHieu nên vẫn pick được để xem thông tin.
 *
 * Hình nón = CylinderGeometry với topRadius ≈ 0. Cylinder nằm dọc trục Z cục bộ,
 * tâm tại gốc → dịch lên theo khung ENU (đông-bắc-lên) tại lon/lat/độ-cao-đất.
 */
import * as Cesium from "cesium";

let primitive = null;
const groundCache = new Map(); // "lon,lat" → terrain height (m)

const key = (t) => `${(+t.lon).toFixed(7)},${(+t.lat).toFixed(7)}`;

/** Lấy độ cao terrain cho các cây chưa có trong cache (1 lần gọi batch). */
export async function ensureHeights(scene, trees) {
  const need = trees.filter((t) => !groundCache.has(key(t)));
  if (!need.length) return;
  const tp = scene.terrainProvider;
  if (!tp || tp instanceof Cesium.EllipsoidTerrainProvider) {
    need.forEach((t) => groundCache.set(key(t), 0));
    return;
  }
  try {
    const cartos = need.map((t) => Cesium.Cartographic.fromDegrees(+t.lon, +t.lat));
    const res = await Cesium.sampleTerrainMostDetailed(tp, cartos);
    res.forEach((c, i) => groundCache.set(key(need[i]), c.height ?? 0));
  } catch (e) {
    need.forEach((t) => groundCache.set(key(t), 0));
  }
}

export function groundHeightOf(t) {
  return groundCache.get(key(t)) ?? 0;
}

function coneInstance(enu, baseZ, length, radius, color, id) {
  const m = Cesium.Matrix4.multiplyByTranslation(
    enu, new Cesium.Cartesian3(0, 0, baseZ + length / 2), new Cesium.Matrix4()
  );
  return new Cesium.GeometryInstance({
    geometry: new Cesium.CylinderGeometry({
      length,
      topRadius: Math.max(0.01, radius * 0.02),
      bottomRadius: radius,
      slices: 8,
      vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
    modelMatrix: m,
    id,
    attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
  });
}

function trunkInstance(enu, length, radius, color, id) {
  const m = Cesium.Matrix4.multiplyByTranslation(
    enu, new Cesium.Cartesian3(0, 0, length / 2), new Cesium.Matrix4()
  );
  return new Cesium.GeometryInstance({
    geometry: new Cesium.CylinderGeometry({
      length,
      topRadius: radius * 0.7,
      bottomRadius: radius,
      slices: 6,
      vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
    modelMatrix: m,
    id,
    attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
  });
}

/**
 * Dựng lại Primitive cây từ toàn bộ mảng trees.
 * Gọi ensureHeights() trước để cây ngồi đúng trên mặt đất.
 */
export function rebuildTrees(scene, trees, TREE_TYPES) {
  if (primitive) { scene.primitives.remove(primitive); primitive = null; }
  if (!trees.length) return null;

  const instances = [];
  for (const t of trees) {
    const cfg = TREE_TYPES[t.tenLoai];
    if (!cfg) continue;
    const h = t.chieuCao || 6;
    const g = groundHeightOf(t);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(+t.lon, +t.lat, g)
    );
    const canopy = Cesium.Color.fromCssColorString(cfg.color);
    const trunkC = Cesium.Color.fromCssColorString(cfg.trunkColor || "#5D4037");

    if (cfg.shape === "palm") {
      // Cau vua: thân cao mảnh (xám) + tán xòe gọn ở đỉnh.
      const trunkH = h * 0.78;
      const trunkR = Math.max(0.10, h * 0.018);
      instances.push(trunkInstance(enu, trunkH, trunkR, trunkC, t.soHieu));
      const canR = h * 0.26;
      instances.push(coneInstance(enu, trunkH * 0.96, h * 0.12, canR,        canopy, t.soHieu)); // tán dưới xòe
      instances.push(coneInstance(enu, trunkH * 0.96 + h * 0.06, h * 0.20, canR * 0.5, canopy, t.soHieu)); // chóp nhọn
    } else {
      // Tán nón nhiều tầng (sao đen…)
      const trunkH = h * 0.30;
      const trunkR = Math.max(0.12, h * 0.03);
      instances.push(trunkInstance(enu, trunkH, trunkR, trunkC, t.soHieu));
      const canR = h * 0.22;
      instances.push(coneInstance(enu, trunkH * 0.75, h * 0.55, canR,        canopy, t.soHieu));
      instances.push(coneInstance(enu, trunkH * 0.75 + h * 0.40, h * 0.42, canR * 0.6, canopy, t.soHieu));
    }
  }

  primitive = scene.primitives.add(new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
    asynchronous: true,
    releaseGeometryInstances: true,
  }));
  return primitive;
}

export function removeTrees(scene) {
  if (primitive) { scene.primitives.remove(primitive); primitive = null; }
}

/** picked.id từ scene.pick() có phải là cây không? Trả về soHieu hoặc null. */
export function pickedTreeId(picked) {
  return (picked && typeof picked.id === "string" && picked.primitive === primitive)
    ? picked.id : null;
}
