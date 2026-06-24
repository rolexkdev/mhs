/**
 * measure.js — TOOLTIP SỐ ĐO realtime bám con trỏ khi đang vẽ.
 *
 * Dân kiến trúc cần thấy NGAY cạnh đang kéo dài bao nhiêu mét và quay góc bao
 * nhiêu độ — không phải vẽ xong mới đo. Module này là 1 ô nổi nhỏ chạy theo
 * chuột; công cụ vẽ chỉ việc gọi showMeasure(windowPos, text).
 *
 *   showMeasure(windowPos, text)  — hiện/di chuyển ô + đặt nội dung.
 *   hideMeasure()                 — ẩn khi dừng công cụ.
 *
 * Kèm vài helper tính toán THUẦN (mét, góc) để công cụ tạo chuỗi hiển thị:
 *   segMeters(a, b)               — chiều dài đoạn [lon,lat]→[lon,lat] (m).
 *   turnAngle(prev, cur, next)    — góc trong tại đỉnh cur (độ, 0–180).
 *   fmtLen(m)                     — "12.4 m" / "1.23 km".
 */
import { distanceMeters } from "./geo.js";

let el = null;

function ensureEl() {
  if (el) return el;
  el = document.createElement("div");
  el.id = "measure-tip";
  el.style.display = "none";
  (document.getElementById("stage") || document.body).appendChild(el);
  return el;
}

/** Hiện ô số đo tại pixel windowPos (Cartesian2 {x,y}) với nội dung HTML. */
export function showMeasure(windowPos, html) {
  const node = ensureEl();
  node.innerHTML = html;
  node.style.left = `${windowPos.x + 16}px`;
  node.style.top = `${windowPos.y + 16}px`;
  node.style.display = "block";
}

export function hideMeasure() {
  if (el) el.style.display = "none";
}

// ── Helper toán học (thuần) ───────────────────────────────────────────────────
const toLL = (p) => Array.isArray(p) ? { lon: p[0], lat: p[1] } : p;

/** Chiều dài đoạn (m). Nhận [lon,lat] hoặc {lon,lat}. */
export function segMeters(a, b) {
  return distanceMeters(toLL(a), toLL(b));
}

/** Góc trong (độ, 0–180) tại đỉnh `cur` giữa 2 cạnh prev→cur và cur→next. */
export function turnAngle(prev, cur, next) {
  const c = toLL(cur), p = toLL(prev), n = toLL(next);
  const cosLat = Math.cos((c.lat * Math.PI) / 180);
  const v1x = (p.lon - c.lon) * cosLat, v1y = p.lat - c.lat;
  const v2x = (n.lon - c.lon) * cosLat, v2y = n.lat - c.lat;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return 0;
  const a = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
  return +(a * 180 / Math.PI).toFixed(1);
}

/** Định dạng chiều dài thân thiện: "12.4 m" hoặc "1.23 km". */
export function fmtLen(m) {
  if (m >= 1000) return (m / 1000).toFixed(2) + " km";
  return m.toFixed(1) + " m";
}
