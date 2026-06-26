/**
 * more.js — Khai báo các thực thể "đơn giản" bằng factory (xem kinds.js).
 *
 * Mỗi loại chỉ là vài dòng config. Thêm loại mới (cùng kiểu) → thêm 1 dòng ở đây
 * rồi đưa vào registry.js. Loại cần ảnh billboard (cột điện, cây mới) hoặc hành vi
 * đặc thù (tường, dây điện nối cột) làm riêng — xem ghi chú cuối file.
 */
import { areaKind, lineKind } from "./kinds.js";

// Vùng phẳng bám đất ───────────────────────────────────────────────────────────
export const lake  = areaKind({ id: "lake",  label: "Hồ",       dataKey: "lakes",  prefix: "HO",  icon: "🟦", color: "#29B6F6", alpha: 0.45 });
export const grass = areaKind({ id: "grass", label: "Thảm cỏ",  dataKey: "grass",  prefix: "CO",  icon: "🟩", color: "#66BB6A", alpha: 0.55 });

// Đường bám đất ─────────────────────────────────────────────────────────────────
export const ditch = lineKind({ id: "ditch", label: "Mương thoát nước", dataKey: "ditches", prefix: "MUONG", icon: "💧", color: "#5D4037", width: 6 });

/*
 * SẮP TỚI (làm riêng vì cần thêm thứ):
 *   - Cột điện / cây loại mới → pointKind nhưng CẦN ẢNH PNG nền trong suốt đặt ở
 *     public/models/ (vd cotdien.png). Có ảnh thì:
 *       export const pole = pointKind({ id:"pole", label:"Cột điện", dataKey:"poles",
 *         prefix:"COTD", icon:"⚡", image:"models/cotdien.png", heightM:9, ringR:2 });
 *   - Tường → cần "wallKind" (dựng WallGeometry bất đồng bộ) — đang làm.
 *   - Dây điện → nối đỉnh 2 cột điện (catenary) — làm sau khi có Cột điện.
 */
