/**
 * context.js — Gói "ctx" dùng chung, tiêm vào mọi entity & interaction.
 *
 * Thay vì để mỗi module tự giữ tham chiếu `viewer`, ta gom các dịch vụ hay dùng
 * vào 1 object và truyền xuống. Entity/interaction chỉ cần nhận `ctx`:
 *
 *   ctx.viewer        Cesium.Viewer
 *   ctx.scene         viewer.scene
 *   ctx.status(msg)   ghi dòng trạng thái dưới đáy
 *   ctx.render()      yêu cầu vẽ lại 1 frame (vì requestRenderMode bật)
 *   ctx.pickGround(p) pixel → {lon,lat} bám ellipsoid (nhất quán)
 *   ctx.pickSurface(p) pixel → {lon,lat} bám terrain
 *   ctx.save()        lưu toàn bộ dữ liệu
 */
import { pickGround, pickSurface } from "./coords.js";
import { save } from "./store.js";

const statusEl = () => document.getElementById("status");

/** Dựng ctx từ 1 viewer đã tạo. */
export function createContext(viewer) {
  return {
    viewer,
    scene: viewer.scene,
    status: (msg) => { const el = statusEl(); if (el) el.textContent = msg; },
    render: () => viewer.scene.requestRender(),
    pickGround: (windowPos) => pickGround(viewer, windowPos),
    pickSurface: (windowPos) => pickSurface(viewer, windowPos),
    save,
  };
}
