/**
 * interactionLock.js — Khóa tương tác toàn cục (1 nguồn sự thật).
 *
 * Tại 1 thời điểm chỉ có 1 "công cụ" được hoạt động: đặt điểm, vẽ polygon,
 * vẽ hàng, sửa, hay lấy tọa độ. Khi có công cụ đang chạy thì click nền KHÔNG
 * mở InfoBox. Mọi tool gọi acquire()/release(); viewer hỏi isInteracting().
 *
 * Mỗi tool đăng ký luôn cách tự HỦY (onCancel) → phím Esc chỉ cần gọi
 * cancelActive() là dừng đúng công cụ đang chạy, không cần biết là cái nào.
 */

let active = null;      // tên công cụ đang giữ khóa, hoặc null
let cancelFn = null;    // cách hủy công cụ đang giữ khóa

/** Chiếm khóa cho 1 công cụ. @param onCancel hàm hủy (gọi khi Esc). */
export function acquire(name, onCancel = null) { active = name; cancelFn = onCancel; }

/**
 * Nhả khóa. Vì tại 1 thời điểm chỉ có 1 công cụ hoạt động (loại trừ lẫn nhau),
 * ta nhả vô điều kiện — tránh kẹt khóa khi 1 công cụ được "mượn tên" lại
 * (vd editor/tree bọc lại cancel). Tham số name chỉ để dễ đọc/log.
 */
export function release(_name) { active = null; cancelFn = null; }

/** Có công cụ nào đang hoạt động không? */
export function isInteracting() { return active !== null; }

/** Tên công cụ đang giữ khóa (hoặc null). */
export function activeTool() { return active; }

/** Hủy công cụ đang chạy (gọi khi nhấn Esc). */
export function cancelActive() { if (cancelFn) cancelFn(); }
