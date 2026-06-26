/**
 * kinds.js — "FACTORY" sinh thực thể theo KIỂU HÌNH HỌC, từ 1 config ngắn.
 *
 * Thay vì viết tay từng file entity gần giống nhau, ta khai báo:
 *   pointKind({ id, label, dataKey, image|color, … })   → điểm (cây/cột…)
 *   lineKind ({ id, label, dataKey, color, width, … })   → đường (mương/dây…)
 *   areaKind ({ id, label, dataKey, color, alpha })       → vùng phẳng (hồ/cỏ…)
 *
 * Mỗi factory trả về 1 object entity ĐẦY ĐỦ (init/load/renderAll/serialize/tools/
 * editing kéo-di-chuyển/getHighlight) hợp với registry — nên thêm 1 loại mới chỉ
 * còn vài dòng khai báo. Hành vi đặc thù (panel, khối 3D…) thì vẫn code tay như cũ.
 *
 * Mọi entity vẽ ra được gắn { _kind: <id loại>, _kid: <id instance> } để editor/
 * highlight nhận diện điểm pick.
 */
import * as Cesium from "cesium";
import { registerCollection } from "../store.js";
import { placePoint, drawLine, drawPolygon } from "../interactions.js";
import { circleLonLat } from "../geo.js";
import { preloadImageHeights, scaleForMeters, VIEW_DISTANCE } from "../billboards.js";

/** Sinh id kế tiếp không trùng (kể cả khi đã xóa). */
function nextId(items, prefix) {
  const max = items.reduce((m, p) => {
    const n = parseInt(String(p.id).split("-").pop() || "0", 10);
    return n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

const css = (c) => Cesium.Color.fromCssColorString(c);

// ════════════════════════════════════════════════════════════════════════════
//  KIỂU ĐIỂM — billboard ảnh (cây, cột đèn, cột điện…) hoặc chấm tròn
// ════════════════════════════════════════════════════════════════════════════
export function pointKind(cfg) {
  // cfg: { id, label, dataKey, prefix?, image?, heightM?, color?, ringR? }
  const prefix = cfg.prefix || cfg.id.toUpperCase().slice(0, 3);
  let ctx = null, items = [];
  const ents = new Map();
  let dragId = null, dragging = false, moved = false, grabLL = null, baseLL = null;

  const serialize = (p) => ({ id: p.id, lon: p.lon, lat: p.lat });

  function renderOne(p) {
    const gfx = cfg.image
      ? { billboard: {
          image: cfg.image, sizeInMeters: true, scale: scaleForMeters(cfg.heightM || 10, cfg.image),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, VIEW_DISTANCE) } }
      : { point: {
          pixelSize: 12, color: css(cfg.color || "#FFD54F"), outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND } };
    const e = ctx.viewer.entities.add({ name: cfg.label, position: Cesium.Cartesian3.fromDegrees(+p.lon, +p.lat, 0), ...gfx });
    e._kind = cfg.id; e._kid = p.id;
    ents.set(p.id, e);
  }

  function removeOne(id) {
    const e = ents.get(id); if (e) { ctx.viewer.entities.remove(e); ents.delete(id); }
    const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1);
  }

  function startPlacing() {
    return placePoint(ctx, {
      surface: true,
      onPlace: (pos) => {
        const p = { id: nextId(items, prefix), lon: pos.lon, lat: pos.lat };
        items.push(p); renderOne(p); ctx.save();
        ctx.status(`Đã đặt ${cfg.label}: ${items.length} — click tiếp, Esc để dừng`);
      },
    });
  }

  return {
    id: cfg.id, label: cfg.label, dataKey: cfg.dataKey,
    init(context) { ctx = context; items = registerCollection(cfg.dataKey, serialize); },
    load(slice) { if (Array.isArray(slice)) for (const p of slice) items.push(p); return { needsSave: false }; },
    async renderAll() {
      if (cfg.image) await preloadImageHeights([cfg.image]);
      for (const p of items) renderOne(p);
      ctx.render();
    },
    tools() {
      return [{ id: `${cfg.id}-add`, label: `${cfg.icon || "📍"} ${cfg.label}`,
        title: `Đặt ${cfg.label} — click liên tục, Esc để dừng`, run: () => startPlacing() }];
    },
    getHighlight(sel) {
      if (sel?._kind !== cfg.id) return null;
      const p = items.find((x) => x.id === sel._kid); if (!p) return null;
      const r = cfg.ringR || 2;
      return { lines: [circleLonLat(+p.lon, +p.lat, r).map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))], clamp: true };
    },
    editing: {
      beginDrag(picked, ll) {
        if (picked?.id?._kind !== cfg.id || !ll) return false;
        const p = items.find((x) => x.id === picked.id._kid); if (!p) return false;
        dragId = p.id; dragging = true; moved = false;
        grabLL = { lon: ll.lon, lat: ll.lat }; baseLL = { lon: +p.lon, lat: +p.lat };
        return true;
      },
      drag(ll) {
        if (!dragging || !ll) return;
        moved = true;
        const p = items.find((x) => x.id === dragId); if (!p) return;
        p.lon = baseLL.lon + (ll.lon - grabLL.lon);
        p.lat = baseLL.lat + (ll.lat - grabLL.lat);
        const e = ents.get(dragId);
        if (e) e.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0));
      },
      endDrag() { const was = dragging && moved; dragging = false; dragId = null; return was; },
      tryDelete(picked) {
        if (picked?.id?._kind !== cfg.id) return false;
        if (confirm(`Xóa ${cfg.label}?`)) { removeOne(picked.id._kid); ctx.save(); }
        return true;
      },
    },
    panel: null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  KIỂU ĐƯỜNG — polyline bám đất (mương, ranh…) hoặc trên cao (dây) nếu elevated
// ════════════════════════════════════════════════════════════════════════════
export function lineKind(cfg) {
  // cfg: { id, label, dataKey, prefix?, color, width?, elevated? }
  const prefix = cfg.prefix || cfg.id.toUpperCase().slice(0, 3);
  const H = cfg.elevated || 0;
  const clamp = !cfg.elevated;
  let ctx = null, items = [];
  const ents = new Map();
  let dragId = null, dragging = false, moved = false, grabLL = null, basePath = null;

  const serialize = (r) => ({ id: r.id, path: r.path });
  const toPos = (path) => path.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, H));

  function renderOne(r) {
    const e = ctx.viewer.entities.add({
      name: `${cfg.label} ${r.id}`,
      polyline: { positions: toPos(r.path), width: cfg.width || 5, material: css(cfg.color), clampToGround: clamp },
    });
    e._kind = cfg.id; e._kid = r.id;
    ents.set(r.id, e);
  }

  function removeOne(id) {
    const e = ents.get(id); if (e) { ctx.viewer.entities.remove(e); ents.delete(id); }
    const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1);
  }

  function startDraw(onHint) {
    return drawLine(ctx, {
      onHint,
      onFinish: (verts) => {
        const r = { id: nextId(items, prefix), path: verts };
        items.push(r); renderOne(r); ctx.save();
        ctx.status(`Đã thêm ${cfg.label}: ${items.length} — vẽ tiếp hoặc Esc để dừng`);
      },
    });
  }

  return {
    id: cfg.id, label: cfg.label, dataKey: cfg.dataKey,
    init(context) { ctx = context; items = registerCollection(cfg.dataKey, serialize); },
    load(slice) { if (Array.isArray(slice)) for (const r of slice) items.push(r); return { needsSave: false }; },
    renderAll() { for (const r of items) renderOne(r); ctx.render(); },
    tools() {
      return [{ id: `${cfg.id}-draw`, label: `${cfg.icon || "〰"} ${cfg.label}`,
        title: `Vẽ ${cfg.label}: click từng điểm, double-click để xong`, run: (onHint) => startDraw(onHint) }];
    },
    getHighlight(sel) {
      if (sel?._kind !== cfg.id) return null;
      const r = items.find((x) => x.id === sel._kid); if (!r) return null;
      return { lines: [toPos(r.path)], clamp, width: (cfg.width || 5) + 8, color: Cesium.Color.YELLOW };
    },
    editing: {
      beginDrag(picked, ll) {
        if (picked?.id?._kind !== cfg.id || !ll) return false;
        const r = items.find((x) => x.id === picked.id._kid); if (!r) return false;
        dragId = r.id; dragging = true; moved = false;
        grabLL = { lon: ll.lon, lat: ll.lat }; basePath = r.path.map((p) => [...p]);
        return true;
      },
      drag(ll) {
        if (!dragging || !ll) return;
        moved = true;
        const r = items.find((x) => x.id === dragId); if (!r) return;
        const dLon = ll.lon - grabLL.lon, dLat = ll.lat - grabLL.lat;
        r.path = basePath.map(([lon, lat]) => [lon + dLon, lat + dLat]);
        const e = ents.get(dragId);
        if (e) e.polyline.positions = toPos(r.path);
      },
      endDrag() { const was = dragging && moved; dragging = false; dragId = null; return was; },
      tryDelete(picked) {
        if (picked?.id?._kind !== cfg.id) return false;
        if (confirm(`Xóa ${cfg.label}?`)) { removeOne(picked.id._kid); ctx.save(); }
        return true;
      },
    },
    panel: null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  KIỂU VÙNG PHẲNG — polygon phủ trên địa hình (hồ, thảm cỏ…)
// ════════════════════════════════════════════════════════════════════════════
export function areaKind(cfg) {
  // cfg: { id, label, dataKey, prefix?, color, alpha? }
  const prefix = cfg.prefix || cfg.id.toUpperCase().slice(0, 3);
  let ctx = null, items = [];
  const ents = new Map();
  let dragId = null, dragging = false, moved = false, grabLL = null, basePoly = null;

  const serialize = (a) => ({ id: a.id, polygon: a.polygon });
  const hier = (poly) => new Cesium.PolygonHierarchy(poly.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)));

  function renderOne(a) {
    const e = ctx.viewer.entities.add({
      name: `${cfg.label} ${a.id}`,
      polygon: { hierarchy: hier(a.polygon), material: css(cfg.color).withAlpha(cfg.alpha ?? 0.5),
        classificationType: Cesium.ClassificationType.TERRAIN },   // phủ sát địa hình
    });
    e._kind = cfg.id; e._kid = a.id;
    ents.set(a.id, e);
  }

  function removeOne(id) {
    const e = ents.get(id); if (e) { ctx.viewer.entities.remove(e); ents.delete(id); }
    const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1);
  }

  function startDraw(onHint) {
    return drawPolygon(ctx, {
      onHint,
      onFinish: (verts) => {
        const a = { id: nextId(items, prefix), polygon: verts };
        items.push(a); renderOne(a); ctx.save();
        ctx.status(`Đã thêm ${cfg.label}: ${items.length} — vẽ tiếp hoặc Esc để dừng`);
      },
    });
  }

  return {
    id: cfg.id, label: cfg.label, dataKey: cfg.dataKey,
    init(context) { ctx = context; items = registerCollection(cfg.dataKey, serialize); },
    load(slice) { if (Array.isArray(slice)) for (const a of slice) items.push(a); return { needsSave: false }; },
    renderAll() { for (const a of items) renderOne(a); ctx.render(); },
    tools() {
      return [{ id: `${cfg.id}-draw`, label: `${cfg.icon || "▱"} ${cfg.label}`,
        title: `Vẽ ${cfg.label}: click từng góc, double-click để xong`, run: (onHint) => startDraw(onHint) }];
    },
    getHighlight(sel) {
      if (sel?._kind !== cfg.id) return null;
      const a = items.find((x) => x.id === sel._kid); if (!a) return null;
      const ring = a.polygon.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
      if (ring.length) ring.push(ring[0]);
      return { lines: [ring], clamp: true };
    },
    editing: {
      beginDrag(picked, ll) {
        if (picked?.id?._kind !== cfg.id || !ll) return false;
        const a = items.find((x) => x.id === picked.id._kid); if (!a) return false;
        dragId = a.id; dragging = true; moved = false;
        grabLL = { lon: ll.lon, lat: ll.lat }; basePoly = a.polygon.map((p) => [...p]);
        return true;
      },
      drag(ll) {
        if (!dragging || !ll) return;
        moved = true;
        const a = items.find((x) => x.id === dragId); if (!a) return;
        const dLon = ll.lon - grabLL.lon, dLat = ll.lat - grabLL.lat;
        a.polygon = basePoly.map(([lon, lat]) => [lon + dLon, lat + dLat]);
        const e = ents.get(dragId);
        if (e) e.polygon.hierarchy = hier(a.polygon);
      },
      endDrag() { const was = dragging && moved; dragging = false; dragId = null; return was; },
      tryDelete(picked) {
        if (picked?.id?._kind !== cfg.id) return false;
        if (confirm(`Xóa ${cfg.label}?`)) { removeOne(picked.id._kid); ctx.save(); }
        return true;
      },
    },
    panel: null,
  };
}
