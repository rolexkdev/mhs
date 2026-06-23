/**
 * editor.js — Điều phối CHỈNH SỬA trên cảnh 3D (lớp "nâng cao").
 *
 * Khác với interactions (đặt thực thể MỚI), file này lo việc SỬA thực thể đã có:
 *   - toolbar "Nhà xưởng": Sửa · ▭ Hộp · ＋ Vẽ · 🗑 · ⬇ JSON
 *   - chế độ "Sửa": 1 handler chung điều phối kéo đỉnh nhà / di chuyển cây
 *     bằng cách gọi entity.editing.* (xem building.js & tree.js)
 *   - chế độ "Xóa": click để xóa nhà/cây
 *   - nút "Lấy tọa độ" (coordPicker)
 *
 * Vì việc sửa hình vốn gắn chặt với từng loại, editor gọi trực tiếp building &
 * tree (không qua registry). Thêm thực thể MỚI thì KHÔNG cần đụng file này —
 * chỉ cần khai báo render/serialize/tools trong file entity (xem _TEMPLATE.js).
 */
import * as Cesium from "cesium";
import { building } from "./entities/building.js";
import { tree } from "./entities/tree.js";
import { lamp } from "./entities/lamp.js";
import { exportToFile } from "./store.js";
import { coordPicker } from "./interactions.js";
import { acquire, release, cancelActive, activeTool } from "./interactionLock.js";

let ctx = null, viewer = null, scene = null;
let edMode = null;        // 'edit' | 'rect' | 'draw' | 'delete' | null
let edHandler = null;     // handler cho edit/delete
let toolStop = null;      // stop của tool rect/draw đang chạy

const HINT = {
  edit: "Click nhà xưởng/cây để chọn → kéo để di chuyển · Điểm xanh = thêm góc · Chuột phải = xóa đỉnh/cây",
  delete: "Click vào nhà xưởng hoặc cây để xóa",
};

export function initEditor(context) {
  ctx = context; viewer = ctx.viewer; scene = ctx.scene;
  // Vẽ xong nhà xưởng → chuyển sang chế độ Sửa & chọn cái vừa tạo.
  building.setOnAfterCreate((idx) => { setEdMode("edit"); building.editing.showHandles(idx); });
}

/** Dựng DOM toolbar/hint/props/modal (1 lần) rồi hiển thị toolbar + nút tọa độ. */
export function mountEditor() {
  ensureUI();
  ensurePickButton();
  buildToolbar();
}

// ── Mode switching ───────────────────────────────────────────────────────────
function setEdMode(mode) {
  if (edMode === "edit") { building.editing.clearHandles(); tree.editing.deselect(); }
  if (toolStop) { toolStop(); toolStop = null; }
  if (edHandler) { edHandler.destroy(); edHandler = null; }
  release("editor");

  edMode = mode;
  viewer.canvas.style.cursor = (mode === "delete") ? "crosshair" : "";
  buildToolbar();

  if (mode === "edit") { acquire("editor", () => setEdMode(null)); setupEditHandler(); showHint(HINT.edit); }
  else if (mode === "delete") { acquire("editor", () => setEdMode(null)); setupDeleteHandler(); showHint(HINT.delete); }
  else if (mode) {
    const tool = building.tools().find((t) => t.id === mode);
    if (tool) { toolStop = tool.run(showHint); acquire("editor", () => setEdMode(null)); }
  } else {
    hideHint();
  }
}

// ── "Sửa": kéo đỉnh nhà / di chuyển cây + chọn / thêm-bớt đỉnh ────────────────
function setupEditHandler() {
  edHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  edHandler.setInputAction((evt) => {
    const picked = scene.pick(evt.position);
    if (building.editing.beginDrag(picked) || tree.editing.beginDrag(picked)) {
      scene.screenSpaceCameraController.enableRotate = false;
      scene.screenSpaceCameraController.enableZoom = false;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  edHandler.setInputAction((evt) => {
    if (building.editing.isDragging()) { const p = ctx.pickGround(evt.endPosition); if (p) building.editing.drag(p); }
    else if (tree.editing.isDragging()) { const p = ctx.pickGround(evt.endPosition); if (p) tree.editing.drag(p); }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  edHandler.setInputAction(() => {
    const bWas = building.editing.endDrag();
    const { wasDrag: tWas, key } = tree.editing.endDrag();
    scene.screenSpaceCameraController.enableRotate = true;
    scene.screenSpaceCameraController.enableZoom = true;
    if (key) tree.editing.rerender(key);
    if (bWas || tWas) ctx.save();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  edHandler.setInputAction((evt) => {
    const picked = scene.pick(evt.position);
    const pos = ctx.pickGround(evt.position);
    const treeKey = tree.editing.pickKey(picked);
    if (treeKey) { building.editing.clearHandles(); tree.editing.select(treeKey); return; }
    if (!picked?.id) { building.editing.clearHandles(); tree.editing.deselect(); return; }
    if (building.editing.tryAddVertex(picked, pos)) return;
    if (building.editing.selectByPick(picked)) { tree.editing.deselect(); return; }
    const e = picked.id;
    if (!e._isHnd && !e._isTreeHnd) { building.editing.clearHandles(); tree.editing.deselect(); }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  edHandler.setInputAction((evt) => {
    const picked = scene.pick(evt.position);
    const treeKey = tree.editing.pickKey(picked);
    if (treeKey || tree.editing.selectedKey()) {
      const key = treeKey || tree.editing.selectedKey();
      if (key && confirm(`Xóa cây "${key}"?`)) tree.editing.deleteTree(key);
      return;
    }
    if (!picked?.id) return;
    if (lamp.editing.tryDelete(picked)) return;
    if (building.editing.tryDeleteVertex(picked)) return;
    if (picked.id._isTreeHnd) {
      const key = picked.id._treeKey || tree.editing.selectedKey();
      if (key && confirm(`Xóa cây "${key}"?`)) tree.editing.deleteTree(key);
    }
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

// ── "Xóa": click để xóa nhà/cây ──────────────────────────────────────────────
function setupDeleteHandler() {
  edHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  edHandler.setInputAction((evt) => {
    const picked = scene.pick(evt.position);
    const treeId = picked?.id?._treeKey || null;
    if (treeId) { if (confirm(`Xóa cây "${treeId}"?`)) tree.editing.deleteTree(treeId); return; }
    if (lamp.editing.tryDelete(picked)) return;
    building.editing.tryDelete(picked);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// ── Toolbar / hint / DOM ─────────────────────────────────────────────────────
function buildToolbar() {
  const tb = document.getElementById("ed-toolbar"); if (!tb) return;
  tb.style.display = "flex";
  const toolBtns = building.tools().map((t) =>
    `<button class="et-btn${edMode === t.id ? " et-on" : ""}" data-tool="${t.id}" title="${t.title}">${t.label}</button>`).join("");
  tb.innerHTML = `
    <span class="et-label">${building.label}</span>
    <button class="et-btn${edMode === "edit" ? " et-on" : ""}" data-mode="edit" title="Chọn & kéo đỉnh để sửa hình">↗ Sửa</button>
    ${toolBtns}
    <button class="et-btn${edMode === "delete" ? " et-on et-danger" : ""}" data-mode="delete" title="Xóa nhà xưởng">🗑</button>
    <div class="et-sep"></div>
    <button class="et-btn" id="et-export" title="Tải xuống JSON">⬇ JSON</button>`;
  tb.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => setEdMode(edMode === b.dataset.mode ? null : b.dataset.mode));
  tb.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => setEdMode(edMode === b.dataset.tool ? null : b.dataset.tool));
  document.getElementById("et-export").onclick = exportToFile;
}

function showHint(text) { const h = document.getElementById("ed-hint"); if (h) { h.textContent = text; h.style.display = "block"; } }
function hideHint() { const h = document.getElementById("ed-hint"); if (h) h.style.display = "none"; }

function ensureUI() {
  if (document.getElementById("ed-toolbar")) return;
  const stage = document.getElementById("stage");
  const tb = document.createElement("div"); tb.id = "ed-toolbar"; stage.appendChild(tb);
  const hint = document.createElement("div"); hint.id = "ed-hint"; hint.style.display = "none"; stage.appendChild(hint);
  const props = document.createElement("div"); props.id = "ed-props"; props.style.display = "none"; stage.appendChild(props);

  const modal = document.createElement("div"); modal.id = "draw-modal"; modal.style.display = "none";
  modal.innerHTML = `<div class="dm-box">
    <div class="dm-title">Nhà xưởng mới</div>
    <label>Tên công ty<input id="dm-name" placeholder="CÔNG TY ABC"/></label>
    <label>Ngành nghề<select id="dm-ind"></select></label>
    <label>Chiều cao (m)<input id="dm-h" type="number" value="16" min="4" max="60"/></label>
    <label>Số lô<input id="dm-lot" placeholder="B12"/></label>
    <div class="dm-btns"><button id="dm-ok">Lưu</button><button id="dm-cancel">Hủy</button></div>
  </div>`;
  stage.appendChild(modal);
  // building cung cấp danh sách ngành để fill <select>
  modal.querySelector("#dm-ind").innerHTML = building.industryOptions();
}

// ── Nút lấy tọa độ ───────────────────────────────────────────────────────────
let pickBtn = null;
function ensurePickButton() {
  if (pickBtn) return;
  pickBtn = document.createElement("button");
  pickBtn.id = "pick-btn";
  pickBtn.title = "Bật/tắt lấy tọa độ từ bản đồ";
  pickBtn.textContent = "Lấy tọa độ";
  pickBtn.addEventListener("click", () => {
    if (activeTool() === "coordPicker") { cancelActive(); }
    else { coordPicker(ctx); }
    refreshButtons();
  });
  document.getElementById("stage").appendChild(pickBtn);
}

/** Đồng bộ trạng thái nút sau khi Esc/thay đổi tool. */
export function refreshButtons() {
  if (pickBtn) pickBtn.classList.toggle("active", activeTool() === "coordPicker");
}
