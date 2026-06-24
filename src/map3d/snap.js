/**
 * snap.js — BẮT ĐIỂM (snapping) dùng chung cho mọi công cụ vẽ.
 *
 * Mục tiêu: vẽ "dính tay" như SketchUp/CAD. Khi con trỏ tới gần một ĐỈNH có
 * sẵn (góc nhà xưởng…), tọa độ sẽ hít vào đúng đỉnh đó và hiện 1 chấm xanh ngọc
 * báo "đang bắt". Nhờ vậy các nhà vẽ kề nhau khít cạnh, không hở khe.
 *
 * Cách dùng:
 *   initSnap(ctx)                       — 1 lần, lúc dựng cảnh.
 *   registerSnapSource(() => [[lon,lat]…])  — entity góp các điểm có thể bắt.
 *   snapAt(windowPos, fallback)         — trả {lon,lat,snapped} cho 1 pixel.
 *   clearSnap()                         — ẩn chấm chỉ báo khi dừng công cụ.
 *
 * Bắt theo KHOẢNG CÁCH MÀN HÌNH (pixel) nên ổn định ở mọi mức zoom. v1 chỉ bắt
 * vào đỉnh (endpoint) — đủ cho phần lớn thao tác; bắt vào cạnh để dành sau.
 */
import * as Cesium from "cesium";

const SNAP_PX = 14; // bán kính hít (pixel)

let viewer = null;
let scene = null;
const sources = [];        // các hàm () => [[lon,lat]…]
let indicator = null;      // entity chấm chỉ báo
const scratch = new Cesium.Cartesian2();

export function initSnap(ctx) {
  viewer = ctx.viewer;
  scene = ctx.scene;
}

/** Entity góp điểm có thể bắt. fn trả mảng [[lon,lat]…] (đọc tại thời điểm gọi). */
export function registerSnapSource(fn) {
  if (typeof fn === "function") sources.push(fn);
}

function ensureIndicator() {
  if (indicator) return indicator;
  indicator = viewer.entities.add({
    show: false,
    point: {
      pixelSize: 16,
      color: Cesium.Color.CYAN.withAlpha(0.0),
      outlineColor: Cesium.Color.CYAN,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  return indicator;
}

function showIndicator(lon, lat) {
  const e = ensureIndicator();
  e.position = Cesium.Cartesian3.fromDegrees(lon, lat, 20);
  e.show = true;
}

/** Ẩn chấm chỉ báo (gọi khi công cụ dừng). */
export function clearSnap() {
  if (indicator) indicator.show = false;
}

/**
 * Bắt điểm cho 1 vị trí con trỏ (pixel).
 * @param windowPos  Cesium.Cartesian2 vị trí chuột.
 * @param fallback   {lon,lat} dùng khi không bắt được gì (vd ctx.pickGround).
 * @param exclude    (tùy chọn) [lon,lat] cần BỎ QUA (vd đỉnh đang kéo của chính nó).
 * @returns {{lon,lat,snapped:boolean}|null}
 */
export function snapAt(windowPos, fallback, exclude = null) {
  if (!scene) return fallback ? { ...fallback, snapped: false } : null;

  let best = null, bestD = SNAP_PX;
  for (const src of sources) {
    let pts;
    try { pts = src() || []; } catch { pts = []; }
    for (const [lon, lat] of pts) {
      if (exclude && lon === exclude[0] && lat === exclude[1]) continue;
      const world = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
      const win = Cesium.SceneTransforms.worldToWindowCoordinates(scene, world, scratch);
      if (!win) continue;
      const d = Math.hypot(win.x - windowPos.x, win.y - windowPos.y);
      if (d < bestD) { bestD = d; best = { lon, lat }; }
    }
  }

  if (best) { showIndicator(best.lon, best.lat); return { ...best, snapped: true }; }
  clearSnap();
  return fallback ? { ...fallback, snapped: false } : null;
}
