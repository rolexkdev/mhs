/**
 * registry.js — DANH SÁCH các loại thực thể vẽ được lên map 3D.
 *
 * 👉 THÊM THỰC THỂ MỚI: tạo file entity (copy _TEMPLATE.js), rồi import & thêm
 *    vào mảng ENTITY_TYPES dưới đây. Orchestrator (index.js) sẽ tự động:
 *      init → load (nạp dữ liệu) → renderAll (vẽ) → panel.build (chú giải).
 *
 * Thứ tự trong mảng = thứ tự nạp/vẽ.
 */
import { building } from "./building.js";
import { tree } from "./tree.js";
import { lamp } from "./lamp.js";

export const ENTITY_TYPES = [building, tree, lamp];
