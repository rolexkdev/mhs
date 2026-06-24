/**
 * highlight.js — HIỆU ỨNG CHỌN ôm đúng hình thực thể.
 *
 * Thay cho khung xanh 2D mặc định của Cesium (SelectionIndicator — đã tắt trong
 * viewer.js), module này vẽ VIỀN PHÁT SÁNG bám sát hình thật khi click chọn:
 *   - nhà xưởng → khung dây 3D (đáy + mái + cạnh đứng) ôm cả khối
 *   - cây / cột đèn → vòng tròn sáng dưới chân
 *   - đường → đường phát sáng chạy theo tuyến
 *
 * Mỗi entity tự mô tả hình của mình qua getHighlight(selectedEntity) → trả
 *   { lines: Cesium.Cartesian3[][], clamp?, width?, color? }   (clamp=true → bám đất)
 * hoặc null nếu không phải của nó. Thêm thực thể mới chỉ cần khai báo
 * getHighlight, KHÔNG đụng file này.
 */
import * as Cesium from "cesium";
import { ENTITY_TYPES } from "./entities/registry.js";

let ctx = null;
let ents = [];   // các entity viền đang hiển thị
const mats = new Map();   // cache material theo màu

function glowFor(color) {
  const c = color || Cesium.Color.CYAN;
  const key = c.toCssColorString();
  if (!mats.has(key)) mats.set(key, new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: c }));
  return mats.get(key);
}

function clear() {
  for (const e of ents) ctx.viewer.entities.remove(e);
  ents = [];
}

function show(hl) {
  const material = glowFor(hl.color);
  for (const positions of hl.lines) {
    const e = ctx.viewer.entities.add({ polyline: { positions, width: hl.width || 10, material, clampToGround: !!hl.clamp } });
    e._isHighlight = true;       // viewer.js bỏ qua khi click (không tự chọn viền)
    ents.push(e);
  }
}

export function initHighlight(context) {
  ctx = context;
  ctx.viewer.selectedEntityChanged.addEventListener(() => {
    clear();
    const sel = ctx.viewer.selectedEntity;
    if (sel && !sel._isHighlight) {
      for (const ent of ENTITY_TYPES) {
        const hl = ent.getHighlight?.(sel);
        if (hl && hl.lines?.length) { show(hl); break; }
      }
    }
    ctx.scene.requestRender();
  });
}
