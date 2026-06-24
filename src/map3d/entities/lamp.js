/**
 * lamp.js — THỰC THỂ "Cột đèn đường" (billboard ảnh).
 *
 * Ví dụ về 1 entity TỐI GIẢN: chỉ render + xóa, KHÔNG có công cụ đặt tay.
 * Vị trí cột đèn được sinh sẵn theo tim đường bởi scripts/gen-sao-den.mjs và
 * lưu trong khóa "lamps" của mhs_buildings.json. Mỗi cột chỉ là { lon, lat }.
 *
 * Xóa cột: trong chế độ "Sửa" (chuột phải) hoặc "Xóa" (click) — editor gọi
 * editing.tryDelete().
 */
import * as Cesium from "cesium";
import { registerCollection } from "../store.js";
import { placePoint } from "../interactions.js";
import { circleLonLat } from "../geo.js";
import { preloadImageHeights, scaleForMeters, VIEW_DISTANCE } from "../billboards.js";

const LAMP_IMG = "models/cotden.png";
const LAMP_HEIGHT = 17;   // chiều cao cột đèn (m) — ~ngang cây Sao Đen

let ctx = null;
let items = [];
const entities = new Map(); // lp(object) → entity
let dragLp = null, dragging = false, moved = false, grabLL = null, baseLL = null;   // kéo cột đèn để di chuyển

function serialize(lp) { const { lon, lat } = lp; return { lon, lat }; }

function renderOne(lp) {
  const e = ctx.viewer.entities.add({
    name: "Cột đèn đường",
    position: Cesium.Cartesian3.fromDegrees(+lp.lon, +lp.lat, 0),
    billboard: {
      image: LAMP_IMG,
      sizeInMeters: true,
      scale: scaleForMeters(LAMP_HEIGHT, LAMP_IMG),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, VIEW_DISTANCE),
    },
  });
  e._lamp = lp;
  entities.set(lp, e);
}

function deleteLamp(lp) {
  const i = items.indexOf(lp);
  if (i >= 0) items.splice(i, 1);
  const e = entities.get(lp);
  if (e) { ctx.viewer.entities.remove(e); entities.delete(lp); }
  ctx.save();
}

/** Bật đặt cột đèn LIÊN TỤC — trả stop để editor dùng (placePoint tự quản khóa). */
function startPlacing() {
  return placePoint(ctx, {
    surface: true,
    onPlace: (pos) => {
      const lp = { lon: pos.lon, lat: pos.lat };
      items.push(lp); renderOne(lp); ctx.save();
      ctx.status(`Đã đặt cột đèn: ${items.length} — click tiếp, Esc để dừng`);
    },
  });
}

export const lamp = {
  id: "lamp",
  label: "Cột đèn",
  dataKey: "lamps",

  init(context) {
    ctx = context;
    items = registerCollection("lamps", serialize);
  },

  load(slice) {
    if (Array.isArray(slice)) for (const lp of slice) items.push(lp);
    return { needsSave: false };
  },

  async renderAll() {
    await preloadImageHeights([LAMP_IMG]);
    for (const lp of items) renderOne(lp);
    ctx.scene.requestRender();
  },

  tools() {
    return [{ id: "lamp-add", label: "💡 Cột đèn", title: "Đặt cột đèn — click liên tục, Esc để dừng", run: () => startPlacing() }];
  },

  /** Vòng tròn sáng dưới chân cột — cho hiệu ứng chọn. */
  getHighlight(sel) {
    const lp = sel?._lamp; if (!lp) return null;
    return { lines: [circleLonLat(+lp.lon, +lp.lat, 2).map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))], clamp: true };
  },

  panel: null,

  editing: {
    /** LEFT_DOWN trúng cột đèn → bắt đầu kéo. */
    beginDrag(picked, ll) {
      const lp = picked?.id?._lamp;
      if (!lp || !ll) return false;
      dragLp = lp; dragging = true; moved = false;
      grabLL = { lon: ll.lon, lat: ll.lat };
      baseLL = { lon: +lp.lon, lat: +lp.lat };
      return true;
    },
    /** MOUSE_MOVE: dời cột đèn theo delta con trỏ. */
    drag(ll) {
      if (!dragging || !ll) return;
      moved = true;
      dragLp.lon = baseLL.lon + (ll.lon - grabLL.lon);
      dragLp.lat = baseLL.lat + (ll.lat - grabLL.lat);
      const e = entities.get(dragLp);
      if (e) e.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(dragLp.lon, dragLp.lat, 0));
    },
    /** LEFT_UP: kết thúc kéo. true nếu THỰC SỰ có di chuyển (caller sẽ save). */
    endDrag() { const was = dragging && moved; dragging = false; dragLp = null; return was; },

    /** Chế độ Xóa: xóa cột đèn nếu điểm pick là cột. true nếu đã xử lý. */
    tryDelete(picked) {
      const lp = picked?.id?._lamp;
      if (lp) { if (confirm("Xóa cột đèn này?")) deleteLamp(lp); return true; }
      return false;
    },
  },
};
