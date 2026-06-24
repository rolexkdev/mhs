/**
 * editor.js — Điều phối CHỈNH SỬA trên cảnh 3D (lớp "nâng cao").
 *
 * Khác với interactions (đặt thực thể MỚI), file này lo việc SỬA thực thể đã có:
 *   - chế độ "Sửa": kéo-thả để DI CHUYỂN cả thực thể (nhà xưởng/cây/cột đèn/đường)
 *   - chế độ "Xóa": click để xóa
 *   - menu "＋ Vẽ ▾": gom công cụ vẽ của mọi entity
 *   - nút "Lấy tọa độ" (coordPicker)
 *
 * Cả Sửa lẫn Xóa đều DUYỆT ENTITY_TYPES và gọi editing.beginDrag/drag/endDrag/
 * tryDelete — nên thêm thực thể MỚI chỉ cần khai báo các hàm đó trong file entity,
 * KHÔNG phải đụng file này (xem _TEMPLATE.js).
 */
import * as Cesium from "cesium";
import { building } from "./entities/building.js";
import { ENTITY_TYPES } from "./entities/registry.js";
import { exportToFile } from "./store.js";
import { coordPicker } from "./interactions.js";
import { acquire, release, cancelActive, activeTool } from "./interactionLock.js";
import { undo, redo, canUndo, canRedo } from "./history.js";

let ctx = null, viewer = null, scene = null;
let edMode = null;        // 'edit' | 'delete' | <id tool vẽ> | null
let edHandler = null;     // handler cho edit/delete
let toolStop = null;      // stop của tool vẽ đang chạy
let mover = null;         // entity đang được kéo trong chế độ Sửa

const HINT = {
  edit: "Click và kéo một thực thể (nhà xưởng / cây / cột đèn / đường) để di chuyển",
  delete: "Click vào thực thể để xóa",
};

export function initEditor(context) {
  ctx = context; viewer = ctx.viewer; scene = ctx.scene;
  // Vẽ xong nhà xưởng → chuyển sang chế độ Sửa để kéo đặt vị trí.
  building.setOnAfterCreate(() => setEdMode("edit"));
}

/** Dựng DOM toolbar/hint/modal (1 lần) rồi hiển thị toolbar + nút tọa độ. */
export function mountEditor() {
  ensureUI();
  ensurePickButton();
  ensureKeyboard();
  ensureMenuDismiss();
  buildToolbar();
}

// ── Undo/redo: nút bấm + phím tắt ────────────────────────────────────────────
function doUndo() { if (canUndo()) { undo(); ctx.save(); } }
function doRedo() { if (canRedo()) { redo(); ctx.save(); } }

/** Bật/tắt nút hoàn tác theo trạng thái ngăn xếp (history.onChange gọi). */
export function refreshUndoButtons() {
  const u = document.getElementById("et-undo");
  const r = document.getElementById("et-redo");
  if (u) u.disabled = !canUndo();
  if (r) r.disabled = !canRedo();
}

let kbAttached = false;
function ensureKeyboard() {
  if (kbAttached) return;
  kbAttached = true;
  document.addEventListener("keydown", (e) => {
    // Chỉ khi đang ở tab 3D và không gõ trong ô nhập liệu.
    if (document.getElementById("cesium")?.style.display === "none") return;
    const t = e.target;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
  });
}

// ── Mode switching ───────────────────────────────────────────────────────────
function setEdMode(mode) {
  if (mover) { mover.editing.endDrag(); mover = null; }   // an toàn nếu đổi mode giữa lúc kéo
  scene.screenSpaceCameraController.enableRotate = true;
  scene.screenSpaceCameraController.enableZoom = true;
  if (toolStop) { toolStop(); toolStop = null; }
  if (edHandler) { edHandler.destroy(); edHandler = null; }
  release("editor");

  edMode = mode;
  if (mode) viewer.selectedEntity = undefined;   // bỏ chọn → ẩn InfoBox & viền sáng khi bắt đầu sửa/vẽ/xóa
  viewer.canvas.style.cursor = (mode === "delete") ? "crosshair" : "";
  buildToolbar();

  if (mode === "edit") { acquire("editor", () => setEdMode(null)); setupEditHandler(); showHint(HINT.edit); }
  else if (mode === "delete") { acquire("editor", () => setEdMode(null)); setupDeleteHandler(); showHint(HINT.delete); }
  else if (mode) {
    const tool = allTools().find((t) => t.id === mode);
    if (tool) { toolStop = tool.run(showHint); acquire("editor", () => setEdMode(null)); }
  } else {
    hideHint();
  }
}

/** Gom công cụ vẽ của MỌI entity → menu "Vẽ" tự có thực thể mới (chỉ cần khai báo tools()). */
function allTools() { return ENTITY_TYPES.flatMap((e) => e.tools?.() ?? []); }

// ── "Sửa": KÉO-THẢ để di chuyển cả thực thể (chung cho mọi entity) ────────────
function setupEditHandler() {
  edHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  edHandler.setInputAction((evt) => {
    const picked = scene.pick(evt.position);
    const ll = ctx.pickGround(evt.position);
    if (!ll) return;
    for (const e of ENTITY_TYPES) {
      if (e.editing?.beginDrag?.(picked, ll)) {
        mover = e;
        scene.screenSpaceCameraController.enableRotate = false;
        scene.screenSpaceCameraController.enableZoom = false;
        break;
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  edHandler.setInputAction((evt) => {
    if (!mover) return;
    const ll = ctx.pickGround(evt.endPosition);
    if (ll) { mover.editing.drag(ll); ctx.render(); }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  edHandler.setInputAction(() => {
    if (!mover) return;
    const moved = mover.editing.endDrag();
    mover = null;
    scene.screenSpaceCameraController.enableRotate = true;
    scene.screenSpaceCameraController.enableZoom = true;
    if (moved) { ctx.save(); ctx.recordHistory?.(); }
  }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

// ── "Xóa": click vào thực thể để xóa (chung cho mọi entity) ───────────────────
function setupDeleteHandler() {
  edHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  edHandler.setInputAction((evt) => {
    const picked = scene.pick(evt.position);
    for (const e of ENTITY_TYPES) { if (e.editing?.tryDelete?.(picked)) return; }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// ── Toolbar / hint / DOM ─────────────────────────────────────────────────────
let menuOpen = false;     // menu "Vẽ ▾" đang mở?

function buildToolbar() {
  const tb = document.getElementById("ed-toolbar"); if (!tb) return;
  tb.style.display = "flex";

  // Menu "Vẽ": nhóm theo entity, mỗi nhóm là các tool của entity đó.
  const drawActive = allTools().some((t) => t.id === edMode);
  const groups = ENTITY_TYPES.map((e) => {
    const tools = e.tools?.() ?? [];
    if (!tools.length) return "";
    const mItems = tools.map((t) =>
      `<button class="et-mi${edMode === t.id ? " et-mi--on" : ""}" data-tool="${t.id}" title="${t.title}">${t.label}</button>`).join("");
    return `<div class="et-mgroup"><div class="et-mhead">${e.label}</div>${mItems}</div>`;
  }).join("");

  tb.innerHTML = `
    <span class="et-label">Bản đồ 3D</span>
    <button class="et-btn${edMode === "edit" ? " et-on" : ""}" data-mode="edit" title="Chọn & kéo đỉnh để sửa hình">↗ Sửa</button>
    <div class="et-draw">
      <button class="et-btn${(drawActive || menuOpen) ? " et-on" : ""}" id="et-draw-btn" title="Chọn thực thể để vẽ">＋ Vẽ ▾</button>
      <div class="et-menu" id="et-menu" style="display:${menuOpen ? "block" : "none"}">${groups}</div>
    </div>
    <button class="et-btn${edMode === "delete" ? " et-on et-danger" : ""}" data-mode="delete" title="Click để xóa nhà xưởng / cây / cột đèn / đường">🗑</button>
    <div class="et-sep"></div>
    <button class="et-btn" id="et-undo" title="Hoàn tác (Ctrl+Z)">↶</button>
    <button class="et-btn" id="et-redo" title="Làm lại (Ctrl+Shift+Z)">↷</button>
    <div class="et-sep"></div>
    <button class="et-btn" id="et-export" title="Tải xuống JSON">⬇ JSON</button>`;

  tb.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { menuOpen = false; setEdMode(edMode === b.dataset.mode ? null : b.dataset.mode); });
  tb.querySelector("#et-draw-btn").onclick = (ev) => { ev.stopPropagation(); menuOpen = !menuOpen; buildToolbar(); };
  tb.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => { menuOpen = false; setEdMode(edMode === b.dataset.tool ? null : b.dataset.tool); });
  document.getElementById("et-undo").onclick = doUndo;
  document.getElementById("et-redo").onclick = doRedo;
  document.getElementById("et-export").onclick = exportToFile;
  refreshUndoButtons();
}

let menuDismissAttached = false;
/** Click ra ngoài menu "Vẽ" → đóng menu. */
function ensureMenuDismiss() {
  if (menuDismissAttached) return;
  menuDismissAttached = true;
  document.addEventListener("click", (e) => {
    if (!menuOpen) return;
    if (e.target.closest?.(".et-draw")) return;   // click trong vùng nút/menu thì bỏ qua
    menuOpen = false; buildToolbar();
  });
}

function showHint(text) { const h = document.getElementById("ed-hint"); if (h) { h.textContent = text; h.style.display = "block"; } }
function hideHint() { const h = document.getElementById("ed-hint"); if (h) h.style.display = "none"; }

function ensureUI() {
  if (document.getElementById("ed-toolbar")) return;
  const stage = document.getElementById("stage");
  const tb = document.createElement("div"); tb.id = "ed-toolbar"; stage.appendChild(tb);
  const hint = document.createElement("div"); hint.id = "ed-hint"; hint.style.display = "none"; stage.appendChild(hint);

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
