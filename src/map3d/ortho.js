/**
 * ortho.js — CĂN THẲNG (ortho / angle-snap) khi vẽ đa giác & đường.
 *
 * Khi kéo đoạn mới, tự "hít" hướng đoạn về bội số 45° để vẽ thẳng/vuông góc:
 *   - so với hướng Bắc/Đông (45° tuyệt đối: N · NE · E …)
 *   - so với HƯỚNG ĐOẠN TRƯỚC (đi thẳng tiếp, hoặc bẻ vuông 90°)
 *
 * Hai chế độ (dùng đồng thời):
 *   - TỰ HÍT: góc lệch ≤ TOL_AUTO° thì tự nắn về đúng mốc (không cần phím).
 *   - KHÓA CỨNG: giữ Shift → luôn nắn về mốc 45° gần nhất.
 *
 * Ưu tiên THẤP HƠN bắt-đỉnh (snap.js): công cụ vẽ thử bắt đỉnh trước, không
 * dính đỉnh nào mới gọi orthoSnap. Toán học làm trong khung phẳng cục bộ
 * (nhân cosLat) — nhất quán với measure.js/geo.js.
 */

const STEP = 45;       // bước góc căn (độ)
const TOL_AUTO = 7;    // dung sai tự hít khi KHÔNG giữ Shift (độ)

let shift = false;
let attached = false;
function ensureShiftTracker() {
  if (attached) return;
  attached = true;
  window.addEventListener("keydown", (e) => { if (e.key === "Shift") shift = true; });
  window.addEventListener("keyup", (e) => { if (e.key === "Shift") shift = false; });
  window.addEventListener("blur", () => { shift = false; });
}

/** Đang giữ Shift (khóa cứng góc)? — công cụ dùng để hiển thị badge 🔒. */
export function isOrthoLock() { return shift; }

/** Sai khác góc về khoảng (-180,180]. */
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;

/**
 * Nắn điểm con trỏ về góc thẳng so với đỉnh cuối đã đặt.
 * @param verts  [[lon,lat]…] các đỉnh ĐÃ đặt (đỉnh cuối = mỏ neo). Rỗng → bỏ qua.
 * @param cur    {lon,lat} điểm con trỏ trên mặt đất.
 * @returns {{lon,lat,snapped:boolean}}  snapped=true nếu đã căn thẳng.
 */
export function orthoSnap(verts, cur) {
  ensureShiftTracker();
  if (!cur || !verts || !verts.length) return cur ? { ...cur, snapped: false } : null;

  const last = verts[verts.length - 1];
  const cosLat = Math.cos(last[1] * Math.PI / 180) || 1e-9;
  const dx = (cur.lon - last[0]) * cosLat;
  const dy = cur.lat - last[1];
  const r = Math.hypot(dx, dy);
  if (r < 1e-12) return { ...cur, snapped: false };
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;   // 0 = Đông

  // Mốc căn: 45° tuyệt đối + (nếu có) theo hướng đoạn trước.
  const bases = [0];
  if (verts.length >= 2) {
    const p = verts[verts.length - 2];
    bases.push(Math.atan2(last[1] - p[1], (last[0] - p[0]) * cosLat) * 180 / Math.PI);
  }

  let bestCand = null, bestErr = Infinity;
  for (const base of bases) {
    const cand = base + Math.round((ang - base) / STEP) * STEP;
    const err = Math.abs(angDiff(ang, cand));
    if (err < bestErr) { bestErr = err; bestCand = cand; }
  }

  if (!shift && bestErr > TOL_AUTO) return { ...cur, snapped: false };

  const sr = bestCand * Math.PI / 180;
  return {
    lon: last[0] + Math.cos(sr) * r / cosLat,
    lat: last[1] + Math.sin(sr) * r,
    snapped: true,
  };
}
