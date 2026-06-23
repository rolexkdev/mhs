/**
 * selection.js — Khi click nền (không ở chế độ vẽ/sửa), chọn entity nào để mở InfoBox.
 *
 * - Click trúng 1 Entity thường (cây, cột, điểm info) → chính nó.
 * - Click trúng khối primitive (tường/mái nhà) → picked.id là string; hỏi từng
 *   entity type qua resolvePick() để tìm entity tương ứng (xem building.resolvePick).
 */
import * as Cesium from "cesium";
import { ENTITY_TYPES } from "./entities/registry.js";

export function resolveSelection(picked) {
  if (picked && picked.id instanceof Cesium.Entity) return picked.id;
  for (const e of ENTITY_TYPES) {
    const r = e.resolvePick?.(picked);
    if (r) return r;
  }
  return undefined;
}
