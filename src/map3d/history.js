/**
 * history.js — UNDO / REDO cho thao tác vẽ-sửa nhà xưởng.
 *
 * Vẽ nhanh thì sai cũng nhanh — phải có Ctrl+Z. Module này giữ 2 ngăn xếp
 * (undo/redo) chứa các "ảnh chụp" trạng thái nhà xưởng. Nó KHÔNG biết nhà
 * xưởng được vẽ thế nào: chỉ cần 2 hàm bơm vào lúc khởi tạo —
 *   getState() → snapshot (object/array thuần, sẽ được deep-clone)
 *   setState(snapshot) → khôi phục & vẽ lại
 *
 * Quy ước: gọi record() SAU mỗi thay đổi (tạo/kéo/thêm-bớt đỉnh/xóa/sửa). undo()
 * và redo() tự khôi phục, KHÔNG sinh thêm bản ghi mới (cờ `restoring`).
 *
 * Phạm vi v1: chỉ nhà xưởng (thứ member vẽ tay nhiều nhất). Cây/cột đèn chưa
 * nằm trong undo — mở rộng sau bằng cách gộp state nhiều entity.
 */
const LIMIT = 50;

let getState = null, setState = null, onChange = null;
let undoStack = [], redoStack = [];
let present = null;        // ảnh chụp trạng thái hiện tại
let restoring = false;     // chặn record() khi đang undo/redo

const clone = (x) =>
  (typeof structuredClone === "function") ? structuredClone(x) : JSON.parse(JSON.stringify(x));

/**
 * Khởi tạo. Gọi 1 lần sau khi nạp dữ liệu xong.
 * @param opts.getState  () => snapshot
 * @param opts.setState  (snapshot) => void
 * @param opts.onChange  () => void  (tùy chọn) cập nhật trạng thái nút undo/redo
 */
export function initHistory({ getState: g, setState: s, onChange: c }) {
  getState = g; setState = s; onChange = c || null;
  undoStack = []; redoStack = [];
  present = clone(getState());
  onChange?.();
}

/** Ghi 1 mốc lịch sử SAU khi đã thay đổi xong. */
export function record() {
  if (restoring || !getState) return;
  undoStack.push(present);
  if (undoStack.length > LIMIT) undoStack.shift();
  present = clone(getState());
  redoStack = [];
  onChange?.();
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(present);
  present = undoStack.pop();
  restore(present);
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(present);
  present = redoStack.pop();
  restore(present);
}

function restore(snapshot) {
  restoring = true;
  try { setState(clone(snapshot)); }
  finally { restoring = false; }
  onChange?.();
}
