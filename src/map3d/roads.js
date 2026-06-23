/**
 * roads.js — Nạp lớp đường (GeoJSON) bám mặt đất cho cảnh 3D.
 * Đường không phải thực thể chỉnh sửa được nên để riêng, đơn giản.
 */
import * as Cesium from "cesium";

const SOURCES = [
  ["/data/duong.geojson",   "#FFA726", 4],
  ["/data/vanhdai.geojson", "#FF1744", 3],
];

export async function addRoads(viewer) {
  for (const [url, color, width] of SOURCES) {
    try {
      const ds = await Cesium.GeoJsonDataSource.load(url, {
        clampToGround: true,
        stroke: Cesium.Color.fromCssColorString(color),
        strokeWidth: width,
      });
      viewer.dataSources.add(ds);
    } catch (e) { console.warn(url, e.message); }
  }
}
