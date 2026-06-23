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
import { preloadImageHeights, scaleForMeters, VIEW_DISTANCE } from "../billboards.js";

const LAMP_IMG = "models/cotden.png";
const LAMP_HEIGHT = 17;   // chiều cao cột đèn (m) — ~ngang cây Sao Đen

let ctx = null;
let items = [];
const entities = new Map(); // lp(object) → entity

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

  tools() { return []; },
  panel: null,

  editing: {
    /** Xóa cột đèn nếu điểm pick là cột. true nếu đã xử lý. */
    tryDelete(picked) {
      const lp = picked?.id?._lamp;
      if (lp) { if (confirm("Xóa cột đèn này?")) deleteLamp(lp); return true; }
      return false;
    },
  },
};
