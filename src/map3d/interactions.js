/**
 * interactions.js — CÔNG CỤ ĐẶT THỰC THỂ DÙNG CHUNG.
 *
 * Đây là phần member sẽ tái dùng nhiều nhất. Mỗi "công cụ" là 1 hàm nhận `ctx`
 * + callback, trả về hàm stop() để dừng. Công cụ tự lo: chiếm/nhả khóa tương
 * tác (interactionLock), đổi con trỏ, vẽ marker/preview, dọn dẹp khi xong.
 *
 * QUY ƯỚC: callback LUÔN nhận `stop` ở cuối → caller tự quyết khi nào dừng.
 *   - Muốn đặt 1 lần rồi thôi  → gọi stop() trong callback.
 *   - Muốn đặt liên tục        → đừng gọi stop(); công cụ tự reset để vẽ tiếp.
 *
 *   placePoint  — click 1 điểm                       → onPlace({lon,lat}, stop)
 *   drawPolygon — click từng góc, double-click xong  → onFinish([[lon,lat]…], stop)
 *   drawRect    — click 2 điểm 1 cạnh + kéo bề sâu   → onFinish([[lon,lat]×4], stop)
 *   drawRow     — click điểm đầu & cuối              → onFinish(start, end, stop)
 *   coordPicker — bảng lấy tọa độ (ghim nhiều điểm)
 *
 * Tham số onHint(text) (tùy chọn) để caller hiển thị gợi ý trong UI của mình.
 */
import * as Cesium from "cesium";
import { acquire, release } from "./interactionLock.js";
import { rectCorners } from "./geo.js";
import { snapAt, clearSnap } from "./snap.js";
import { orthoSnap, isOrthoLock } from "./ortho.js";
import { showMeasure, hideMeasure, segMeters, turnAngle, fmtLen } from "./measure.js";

/**
 * Giải điểm con trỏ khi vẽ đa giác/đường: BẮT ĐỈNH trước (snap.js), không dính
 * đỉnh nào thì CĂN THẲNG (ortho.js). Trả {lon,lat,vsnap,ortho} hoặc null.
 */
function snapPoint(ctx, verts, windowPos) {
  const raw = ctx.pickGround(windowPos);
  if (!raw) return null;
  const v = snapAt(windowPos, raw);
  if (v && v.snapped) return { lon: v.lon, lat: v.lat, vsnap: true, ortho: false };
  const o = orthoSnap(verts, raw);
  return { lon: o.lon, lat: o.lat, vsnap: false, ortho: !!o.snapped };
}

/** Badge căn thẳng cho tooltip số đo (⟂ tự hít · 🔒 khóa Shift). */
function orthoBadge(p) {
  return p?.ortho ? `<span class="mt-ortho">⟂${isOrthoLock() ? " 🔒" : ""}</span>` : "";
}

const ORANGE = { pixelSize: 10, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 };
const LIME   = { pixelSize: 12, color: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 };

/** Thêm 1 chấm marker ở lon/lat, cao 20 m, luôn nổi trên mặt. */
function addDot(viewer, lon, lat, style) {
  const e = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 20),
    point: { ...style, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
  viewer.scene.requestRender();   // requestRenderMode: phải xin vẽ lại 1 frame
  return e;
}

/** Vẽ/cập nhật 1 polyline preview màu cam. Trả về entity để tái dùng. */
function previewLine(viewer, ent, corners, closed) {
  const positions = corners.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 20));
  if (closed && corners.length >= 3) positions.push(positions[0]);
  const out = ent
    ? (ent.polyline.positions = new Cesium.ConstantProperty(positions), ent)
    : viewer.entities.add({
        polyline: {
          positions: new Cesium.ConstantProperty(positions),
          width: 2.5,
          material: new Cesium.ColorMaterialProperty(Cesium.Color.ORANGE.withAlpha(0.85)),
        },
      });
  viewer.scene.requestRender();   // cập nhật preview liên tục khi kéo chuột
  return out;
}

// ── placePoint ────────────────────────────────────────────────────────────────
/** Click để đặt 1 điểm. surface=true bám terrain, false bám ellipsoid. */
export function placePoint(ctx, { onPlace, surface = false }) {
  const { viewer } = ctx;
  viewer.canvas.style.cursor = "crosshair";
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  const stop = () => { handler.destroy(); viewer.canvas.style.cursor = ""; release("placePoint"); };
  acquire("placePoint", stop);

  handler.setInputAction((evt) => {
    const pos = surface ? ctx.pickSurface(evt.position) : ctx.pickGround(evt.position);
    if (!pos) return;
    onPlace(pos, stop);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return stop;
}

// ── drawPolygon ─────────────────────────────────────────────────────────────
/** Vẽ đa giác tự do: click từng góc, double-click để hoàn thành (≥3 góc). */
export function drawPolygon(ctx, { onFinish, onHint }) {
  const { viewer } = ctx;
  let verts = [], dots = [], line = null;
  viewer.canvas.style.cursor = "crosshair";
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  const reset = () => {
    dots.forEach((d) => viewer.entities.remove(d));
    if (line) viewer.entities.remove(line);
    verts = []; dots = []; line = null;
    clearSnap(); hideMeasure();
  };
  const stop = () => { handler.destroy(); viewer.canvas.style.cursor = ""; reset(); release("drawPolygon"); };
  acquire("drawPolygon", stop);

  const preview = (mouse) => {
    const v = mouse ? [...verts, [mouse.lon, mouse.lat]] : [...verts];
    if (v.length < 2) return;
    line = previewLine(viewer, line, v, v.length >= 3);
  };
  const hint = () => {
    if (!onHint) return;
    const n = verts.length;
    onHint(n === 0 ? "Click để đặt góc đầu tiên"
      : n < 3 ? `${n} góc — cần thêm ${3 - n} góc nữa · Esc hủy`
      : `${n} góc — Double-click để hoàn thành · Esc hủy`);
  };

  handler.setInputAction((evt) => {
    const pos = snapAt(evt.position, ctx.pickGround(evt.position)); if (!pos) return;
    verts.push([pos.lon, pos.lat]);
    dots.push(addDot(viewer, pos.lon, pos.lat, ORANGE));
    preview(); hint();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction(() => {
    // double-click vừa tạo thêm 1 góc ở single-click trước → bỏ góc dư đó
    if (verts.length > 0) { verts.pop(); const d = dots.pop(); if (d) viewer.entities.remove(d); }
    if (verts.length >= 3) { const result = [...verts]; reset(); hint(); onFinish(result, stop); }
    else hint();
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  handler.setInputAction((evt) => {
    const pos = snapAt(evt.endPosition, ctx.pickGround(evt.endPosition));
    if (!pos) return;
    if (verts.length === 0) { hideMeasure(); return; }
    preview(pos);
    // Số đo: chiều dài cạnh đang kéo + góc tại đỉnh trước (nếu có).
    const last = verts[verts.length - 1];
    const len = segMeters(last, [pos.lon, pos.lat]);
    let html = `<b>${fmtLen(len)}</b>`;
    if (verts.length >= 2) {
      const a = turnAngle(verts[verts.length - 2], last, [pos.lon, pos.lat]);
      html += `<span class="mt-ang">${a}°</span>`;
    }
    showMeasure(evt.endPosition, html);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  hint();
  return stop;
}

// ── drawLine ────────────────────────────────────────────────────────────────
/** Vẽ đường gấp khúc MỞ: click từng điểm, double-click để hoàn thành (≥2 điểm). */
export function drawLine(ctx, { onFinish, onHint }) {
  const { viewer } = ctx;
  let verts = [], dots = [], line = null;
  viewer.canvas.style.cursor = "crosshair";
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  const reset = () => {
    dots.forEach((d) => viewer.entities.remove(d));
    if (line) viewer.entities.remove(line);
    verts = []; dots = []; line = null;
    clearSnap(); hideMeasure();
  };
  const stop = () => { handler.destroy(); viewer.canvas.style.cursor = ""; reset(); release("drawLine"); };
  acquire("drawLine", stop);

  const preview = (mouse) => {
    const v = mouse ? [...verts, [mouse.lon, mouse.lat]] : [...verts];
    if (v.length < 2) return;
    line = previewLine(viewer, line, v, false);   // false = đường mở, không khép kín
  };
  const hint = () => {
    if (!onHint) return;
    const n = verts.length;
    onHint(n === 0 ? "Click điểm đầu của đường · Giữ Shift = căn thẳng/90°"
      : n < 2 ? "Click điểm tiếp theo · Shift căn thẳng · Esc hủy"
      : `${n} điểm — Double-click để hoàn thành · Shift căn thẳng · Esc hủy`);
  };

  handler.setInputAction((evt) => {
    const pos = snapPoint(ctx, verts, evt.position); if (!pos) return;
    verts.push([pos.lon, pos.lat]);
    dots.push(addDot(viewer, pos.lon, pos.lat, ORANGE));
    preview(); hint();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction(() => {
    // double-click vừa thêm 1 điểm ở single-click trước → bỏ điểm dư đó
    if (verts.length > 0) { verts.pop(); const d = dots.pop(); if (d) viewer.entities.remove(d); }
    if (verts.length >= 2) { const result = [...verts]; reset(); hint(); onFinish(result, stop); }
    else hint();
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  handler.setInputAction((evt) => {
    const pos = snapPoint(ctx, verts, evt.endPosition);
    if (!pos) return;
    if (verts.length === 0) { hideMeasure(); return; }
    preview(pos);
    const last = verts[verts.length - 1];
    showMeasure(evt.endPosition, `<b>${fmtLen(segMeters(last, [pos.lon, pos.lat]))}</b>${orthoBadge(pos)}`);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  hint();
  return stop;
}

// ── drawRect ────────────────────────────────────────────────────────────────
/** Vẽ hộp chữ nhật: click 2 điểm của 1 cạnh, rồi kéo bề sâu → click chốt. */
export function drawRect(ctx, { onFinish, onHint }) {
  const { viewer } = ctx;
  let p1 = null, p2 = null, dots = [], line = null;
  viewer.canvas.style.cursor = "crosshair";
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  const reset = () => {
    dots.forEach((d) => viewer.entities.remove(d));
    if (line) viewer.entities.remove(line);
    p1 = null; p2 = null; dots = []; line = null;
    clearSnap(); hideMeasure();
  };
  const stop = () => { handler.destroy(); viewer.canvas.style.cursor = ""; reset(); release("drawRect"); };
  acquire("drawRect", stop);

  const hint = () => onHint && onHint(
    !p1 ? "Hộp chữ nhật: click GÓC 1 của một cạnh"
    : !p2 ? "Click GÓC 2 (xong 1 cạnh)"
    : "Di chuột kéo ra BỀ SÂU → click để tạo hộp · Esc hủy"
  );

  handler.setInputAction((evt) => {
    const pos = snapAt(evt.position, ctx.pickGround(evt.position)); if (!pos) return;
    if (!p1)      { p1 = pos; dots.push(addDot(viewer, pos.lon, pos.lat, ORANGE)); }
    else if (!p2) { p2 = pos; dots.push(addDot(viewer, pos.lon, pos.lat, ORANGE)); }
    else          { const corners = rectCorners(p1, p2, pos); reset(); onFinish(corners, stop); return; }
    hint();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction((evt) => {
    const pos = snapAt(evt.endPosition, ctx.pickGround(evt.endPosition)); if (!pos) return;
    if (p1 && !p2) {
      line = previewLine(viewer, line, [[p1.lon, p1.lat], [pos.lon, pos.lat]], false);
      showMeasure(evt.endPosition, `Cạnh <b>${fmtLen(segMeters(p1, pos))}</b>`);
    } else if (p1 && p2) {
      const corners = rectCorners(p1, p2, pos);
      line = previewLine(viewer, line, corners, true);
      const w = segMeters(corners[0], corners[1]);
      const d = segMeters(corners[1], corners[2]);
      showMeasure(evt.endPosition, `<b>${fmtLen(w)}</b> × <b>${fmtLen(d)}</b>`);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  hint();
  return stop;
}

// ── drawRow ─────────────────────────────────────────────────────────────────
/** Vẽ hàng: click điểm ĐẦU rồi điểm CUỐI → onFinish(start, end, stop). */
export function drawRow(ctx, { onFinish, onHint }) {
  const { viewer } = ctx;
  let start = null, startEnt = null;
  viewer.canvas.style.cursor = "crosshair";
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  const clearStart = () => { if (startEnt) { viewer.entities.remove(startEnt); startEnt = null; } start = null; };
  const stop = () => { handler.destroy(); viewer.canvas.style.cursor = ""; clearStart(); release("drawRow"); };
  acquire("drawRow", stop);

  handler.setInputAction((evt) => {
    const pos = ctx.pickGround(evt.position); if (!pos) return;
    if (!start) {
      start = pos;
      startEnt = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 2),
        point: { ...LIME, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      onHint && onHint("click điểm CUỐI · Esc hủy");
    } else {
      const s = start; clearStart(); onFinish(s, pos, stop);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  onHint && onHint("click điểm ĐẦU hàng · Esc hủy");
  return stop;
}

// ── coordPicker ─────────────────────────────────────────────────────────────
/** Bảng "Lấy tọa độ": di chuột xem tọa độ, click để ghim, copy nhiều điểm. */
export function coordPicker(ctx) {
  const { viewer } = ctx;
  let points = [];

  let panel = document.getElementById("pick-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "pick-panel";
    document.getElementById("stage").appendChild(panel);
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  const stop = () => {
    handler.destroy();
    viewer.canvas.style.cursor = "";
    panel.style.display = "none";
    release("coordPicker");
  };
  acquire("coordPicker", stop);

  function build() {
    const rows = points.map((p, i) =>
      `<div class="pp-row">
        <span class="pp-idx">${i + 1}</span>
        <span class="pp-coord">${p.lat}, ${p.lon}</span>
        <button class="pp-del" data-i="${i}" title="Xóa">✕</button>
      </div>`).join("");
    const allText = points.map((p) => `${p.lat}, ${p.lon}`).join("\n");

    panel.innerHTML = `
      <div class="pp-header">LẤY TỌA ĐỘ<button id="pp-close" title="Đóng">✕</button></div>
      <div id="pp-cursor" class="pp-cursor">Di chuyển chuột trên bản đồ…</div>
      <div class="pp-hint">Click để ghim điểm · Esc để thoát</div>
      <div class="pp-list">${rows || '<div class="pp-empty">Chưa có điểm nào</div>'}</div>
      ${points.length ? `
      <div class="pp-actions">
        <button id="pp-copy">Copy tọa độ (${points.length} điểm)</button>
        <button id="pp-clear">Xóa tất cả</button>
      </div>` : ""}`;

    panel.querySelector("#pp-close").addEventListener("click", stop);
    panel.querySelectorAll(".pp-del").forEach((btn) =>
      btn.addEventListener("click", () => { points.splice(+btn.dataset.i, 1); build(); }));
    if (points.length) {
      panel.querySelector("#pp-copy").addEventListener("click", () => {
        navigator.clipboard.writeText(allText).then(() => {
          panel.querySelector("#pp-copy").textContent = "Đã copy!";
          setTimeout(build, 1200);
        });
      });
      panel.querySelector("#pp-clear").addEventListener("click", () => { points = []; build(); });
    }
  }

  viewer.canvas.style.cursor = "crosshair";
  build();
  panel.style.display = "flex";

  handler.setInputAction((evt) => {
    const pos = ctx.pickGround(evt.endPosition);
    const el = document.getElementById("pp-cursor");
    if (el) el.textContent = pos ? `${pos.lat}, ${pos.lon}` : "—";
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((evt) => {
    const pos = ctx.pickGround(evt.position);
    if (!pos) return;
    points.push(pos); build();
    panel.style.display = "flex";
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return stop;
}
