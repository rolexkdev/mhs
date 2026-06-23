/**
 * coords.js — Chuyển vị trí con trỏ (pixel) → tọa độ địa lý {lon, lat}.
 *
 * Có 2 cách "bắn tia" xuống mặt đất, dùng cho mục đích khác nhau:
 *   - pickGround : bắn xuống mặt ellipsoid → kết quả NHẤT QUÁN ở mọi góc camera,
 *                  làm tròn 7 số lẻ. Dùng cho: vẽ hàng, lấy tọa độ, kéo chỉnh.
 *   - pickSurface: ưu tiên pickPosition (theo địa hình/terrain), fallback ellipsoid.
 *                  Dùng khi đặt 1 điểm cần bám sát bề mặt thực.
 */
import * as Cesium from "cesium";

/** Bắn xuống ellipsoid. @returns {{lon,lat}|null} (đã làm tròn 7 số lẻ). */
export function pickGround(viewer, windowPos) {
  if (!viewer) return null;
  const cart = viewer.camera.pickEllipsoid(windowPos, viewer.scene.globe.ellipsoid);
  if (!cart) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  return {
    lon: +Cesium.Math.toDegrees(c.longitude).toFixed(7),
    lat: +Cesium.Math.toDegrees(c.latitude).toFixed(7),
  };
}

/** Ưu tiên bề mặt (terrain), fallback ellipsoid. @returns {{lon,lat}|null} (không làm tròn). */
export function pickSurface(viewer, windowPos) {
  if (!viewer) return null;
  let cartesian = viewer.scene.pickPosition(windowPos);
  if (!cartesian) {
    cartesian = viewer.camera.pickEllipsoid(windowPos, viewer.scene.globe.ellipsoid);
  }
  if (!cartesian) return null;
  const c = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
  };
}
