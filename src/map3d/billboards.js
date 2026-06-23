/**
 * billboards.js — Tiện ích vẽ thực thể bằng BILLBOARD ảnh 2.5D (sprite).
 *
 * Vì sao billboard thay cho model .glb: mỗi cây/cột chỉ là 1 tấm ảnh PNG luôn
 * quay về camera → 1 quad/đối tượng thay vì hàng trăm nghìn tam giác. Nhẹ hơn
 * rất nhiều khi có hàng trăm–nghìn đối tượng, vẫn pick/kéo/xem info như thường.
 *
 * Để ảnh cao đúng `h` mét, ta cần biết chiều cao thật (pixel) của ảnh → preload
 * 1 lần rồi cache. scale = h / imageHeight.
 */

/** Ảnh ở xa hơn ngưỡng này (m) sẽ không vẽ — cắt draw call khi zoom out. */
export const VIEW_DISTANCE = 4000.0;

const heightCache = new Map(); // src → naturalHeight (px)

/** Preload chiều cao (px) cho danh sách ảnh. Gọi trước khi render. */
export function preloadImageHeights(srcs) {
  const need = [...new Set(srcs.filter(Boolean))].filter((s) => !heightCache.has(s));
  return Promise.all(need.map((src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { heightCache.set(src, im.naturalHeight); res(); };
    im.onerror = () => { heightCache.set(src, 1536); res(); }; // thiếu ảnh → dùng mặc định
    im.src = src;
  })));
}

/** Chiều cao ảnh (px), mặc định 1536 nếu chưa preload. (nội bộ) */
function imageHeight(src) {
  return heightCache.get(src) || 1536;
}

/** scale để ảnh cao đúng `meters` mét. */
export function scaleForMeters(meters, src) {
  return meters / imageHeight(src);
}
