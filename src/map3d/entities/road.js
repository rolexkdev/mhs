/**
 * road.js — THỰC THỂ "Đường vẽ tay" (polyline bám mặt đất).
 *
 * Khác với roads.js (nạp đường nền từ GeoJSON, chỉ để xem): đây là đường do
 * người dùng VẼ và LƯU lại (khóa "roads" trong collections). Mỗi đường là một
 * mảng điểm { id, path: [[lon,lat], …] }.
 *
 * Đây cũng là VÍ DỤ MẪU cho thực thể dạng ĐƯỜNG (sau này: cột điện / dây điện…):
 *   tools() → drawLine (vẽ gấp khúc mở) · editing.tryDelete → xóa khi click.
 */
import * as Cesium from "cesium";
import { registerCollection } from "../store.js";
import { drawLine } from "../interactions.js";

const ROAD_COLOR = "#26C6DA";   // xanh ngọc — phân biệt với đường nền GeoJSON
const ROAD_WIDTH = 5;

let ctx = null;
let items = [];
const entities = new Map();      // id → entity
let dragId = null, dragging = false, moved = false, grabLL = null, basePath = null;   // kéo đường để di chuyển

function serialize(r) { const { id, path } = r; return { id, path }; }

/** Đường bám đất (GroundPolyline) build BẤT ĐỒNG BỘ → xin vẽ lại vài frame liên
 *  tiếp để khi primitive sẵn sàng là hiện ngay, khỏi phải zoom mới thấy. */
function renderBurst() {
  let n = 0;
  const tick = () => { ctx.render(); if (++n < 10) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function renderOne(r) {
  const positions = r.path.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(+lon, +lat));
  const e = ctx.viewer.entities.add({
    name: `Đường ${r.id}`,
    description: `<div style="font-family:system-ui;font-size:13px"><b>Đường</b> — ${r.id}<br>${r.path.length} điểm</div>`,
    polyline: {
      positions,
      width: ROAD_WIDTH,
      clampToGround: true,
      material: Cesium.Color.fromCssColorString(ROAD_COLOR),
    },
  });
  e._roadKey = r.id;
  entities.set(r.id, e);
}

/** Số hiệu kế tiếp không trùng (kể cả khi đã xóa). */
function nextId() {
  const max = items.reduce((m, r) => {
    const n = parseInt(r.id?.split("-").pop() ?? "0", 10);
    return n > m ? n : m;
  }, 0);
  return `D-${String(max + 1).padStart(3, "0")}`;
}

function deleteRoad(id) {
  const i = items.findIndex((r) => r.id === id);
  if (i >= 0) items.splice(i, 1);
  const e = entities.get(id);
  if (e) { ctx.viewer.entities.remove(e); entities.delete(id); }
  ctx.save();
}

/** Bật vẽ đường LIÊN TỤC (vẽ xong 1 đường vẽ tiếp được) — trả stop để editor dùng. */
function startDraw(onHint) {
  return drawLine(ctx, {
    onHint,
    onFinish: (verts) => {
      const r = { id: nextId(), path: verts };
      items.push(r); renderOne(r); ctx.save(); renderBurst();
      ctx.status(`Đã thêm đường: ${items.length} — vẽ tiếp hoặc Esc để dừng`);
    },
  });
}

export const road = {
  id: "road",
  label: "Đường",
  dataKey: "roads",

  init(context) {
    ctx = context;
    items = registerCollection("roads", serialize);
  },

  load(slice) {
    if (Array.isArray(slice)) for (const r of slice) items.push(r);
    return { needsSave: false };
  },

  renderAll() {
    for (const r of items) renderOne(r);
    renderBurst();
  },

  tools() {
    return [{ id: "road-draw", label: "🛣 Đường", title: "Vẽ đường: click từng điểm, double-click để hoàn thành", run: (onHint) => startDraw(onHint) }];
  },

  /** Đường phát sáng VÀNG, dày hơn — nổi bật trên nền đường teal khi chọn. */
  getHighlight(sel) {
    const id = sel?._roadKey; if (!id) return null;
    const r = items.find((x) => x.id === id); if (!r) return null;
    return {
      lines: [r.path.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))],
      clamp: true, width: 16, color: Cesium.Color.YELLOW,
    };
  },

  panel: null,

  editing: {
    /** LEFT_DOWN trúng đường → bắt đầu kéo cả đường. */
    beginDrag(picked, ll) {
      const id = picked?.id?._roadKey;
      if (!id || !ll) return false;
      const r = items.find((x) => x.id === id); if (!r) return false;
      dragId = id; dragging = true; moved = false;
      grabLL = { lon: ll.lon, lat: ll.lat };
      basePath = r.path.map((p) => [...p]);   // ảnh chụp để tính delta
      return true;
    },
    /** MOUSE_MOVE: dời mọi điểm của đường theo cùng 1 delta. */
    drag(ll) {
      if (!dragging || !ll) return;
      moved = true;
      const r = items.find((x) => x.id === dragId); if (!r) return;
      const dLon = ll.lon - grabLL.lon, dLat = ll.lat - grabLL.lat;
      r.path = basePath.map(([lon, lat]) => [lon + dLon, lat + dLat]);
      const e = entities.get(dragId);
      if (e) e.polyline.positions = r.path.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
    },
    /** LEFT_UP: kết thúc kéo. true nếu THỰC SỰ có di chuyển (caller sẽ save). */
    endDrag() { const was = dragging && moved; dragging = false; dragId = null; if (was) renderBurst(); return was; },

    /** Chế độ Xóa: xóa đường nếu điểm pick là đường. true nếu đã xử lý. */
    tryDelete(picked) {
      const id = picked?.id?._roadKey;
      if (id) { if (confirm("Xóa đoạn đường này?")) deleteRoad(id); return true; }
      return false;
    },
  },
};
