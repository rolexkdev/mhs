/**
 * building.js — THỰC THỂ "Nhà xưởng" (polygon khối 3D).
 *
 * Tự chứa mọi thứ về nhà xưởng:
 *   - dữ liệu mặc định + nạp/seed
 *   - render khối 3D (tường + mái) bằng primitive (xem building3d.js)
 *   - 2 công cụ vẽ: Hộp chữ nhật & Vẽ tự do (dùng interactions chung)
 *   - editor: chọn / kéo đỉnh / thêm-bớt đỉnh / sửa thuộc tính / xóa
 *   - modal nhập tên + ngành + chiều cao
 *
 * Phần render/serialize/tools là khuôn mẫu chuẩn của 1 entity (xem _TEMPLATE.js).
 * Phần `editing` chỉ dành cho thực thể có sửa hình phức tạp — editor.js gọi tới.
 */
import * as Cesium from "cesium";
import { addBuilding3D, removeBuilding3D } from "../../building3d.js";
import { registerCollection } from "../store.js";
import { centroid } from "../geo.js";
import { drawRect, drawPolygon } from "../interactions.js";
import { registerSnapSource } from "../snap.js";

// Màu mái theo ngành nghề.
const ROOF_COLORS = {
  "Dệt may":            "#4FC3F7",
  "Sản xuất giấy":      "#81C784",
  "Cơ khí chính xác":   "#FFB74D",
  "Chế biến thực phẩm": "#F48FB1",
  "Nội thất":           "#A1887F",
  "Hạ tầng nước":       "#4DD0E1",
  "Vật liệu xây dựng":  "#90A4AE",
  "Bao bì":             "#AED581",
  "Năng lượng":         "#FFF176",
  "Công ty sản xuất":   "#E0E0E0",
  "Hạ tầng KCN":        "#BDBDBD",
};

// Dữ liệu mặc định khi chưa có file (lô có tọa độ khảo sát thật).
const DEFAULT_BUILDINGS = [
  {
    tenCty: "CÔNG TY TNHH HAOHUA (VIỆT NAM)",
    loaiHinh: "Công ty sản xuất",
    loHang: "A17-A18",
    dienTich: 433593,
    dienThoai: "",
    polygon: [
      [106.5593721, 11.5098517],
      [106.5614315, 11.5117195],
      [106.5701497, 11.5039698],
      [106.5676383, 11.5015701],
    ],
  },
];

const WALL_COLOR = () => Cesium.Color.fromCssColorString("#F0F0F0").withAlpha(0.95);

// ── State ───────────────────────────────────────────────────────────────────
let ctx = null;
let items = [];                  // mảng building sống (cùng tham chiếu với store)
const handles = new Map();       // tenCty → {wallPrim, roofPrim, groundH} | null

// Editor state: kéo CẢ KHỐI để di chuyển (không sửa đỉnh).
let dragIdx = null, dragging = false, moved = false, grabLL = null, basePoly = null;
let dragPreview = null;   // entity khung viền nhẹ hiện khi đang kéo

function serialize(b) {
  const { tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon } = b;
  return { tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon };
}

/** Lưu DB + ghi 1 mốc undo (nếu history đã gắn vào ctx). */
function commit() { ctx.save(); ctx.recordHistory?.(); }

// ── Render ──────────────────────────────────────────────────────────────────
/** Popup InfoBox cho 1 building. */
function describe(p) {
  const dt = p.dienTich > 0 ? Number(p.dienTich).toLocaleString("vi-VN") + " m²" : "—";
  return `<div style="font-family:system-ui;font-size:13px;min-width:240px">
    <div style="background:#1565c0;color:#fff;padding:8px 12px;margin:-8px -12px 10px;border-radius:4px 4px 0 0">
      <b>${p.tenCty}</b>
    </div>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="color:#888;padding:3px 10px 3px 0;white-space:nowrap">Số lô</td><td><b>${p.loHang || "—"}</b></td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Ngành nghề</td><td>${p.loaiHinh}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Diện tích</td><td>${dt}</td></tr>
      <tr><td style="color:#888;padding:3px 10px 3px 0">Điện thoại</td><td>${p.dienThoai || "—"}</td></tr>
    </table>
  </div>`;
}

/** Vẽ (hoặc vẽ lại) 1 building. addBuilding3D bất đồng bộ (sample terrain). */
function render(data) {
  const key = data.tenCty;
  const old = handles.get(key);
  if (old) removeBuilding3D(ctx.scene, old);

  const roofColor = Cesium.Color.fromCssColorString(ROOF_COLORS[data.loaiHinh] || "#E0E0E0").withAlpha(0.97);

  handles.set(key, null); // sentinel chống race khi gọi 2 lần
  addBuilding3D(ctx.viewer, {
    polygon: data.polygon,
    height: data.height || 16,
    wallColor: WALL_COLOR(),
    roofColor,
    id: key, // click thẳng vào khối (tường/mái primitive) → nhận diện được công ty
  }).then((result) => {
    handles.set(key, result);
    // Entity trong suốt ở trọng tâm để click xem InfoBox.
    if (!data._clickEntity) {
      const [cLon, cLat] = centroid(data.polygon);
      data._clickEntity = ctx.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(cLon, cLat, (result.groundH || 0) + (data.height || 16) / 2),
        name: data.tenCty,
        description: describe(data),
        point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      data._clickEntity._polyKey = key;
    }
    ctx.scene.requestRender();   // requestRenderMode: hiện khối mới ngay, khỏi phải zoom
  }).catch((err) => console.error("[building.render]", key, err));
}

function remove(data) {
  const h = handles.get(data.tenCty);
  if (h) { removeBuilding3D(ctx.scene, h); handles.delete(data.tenCty); }
  if (data._clickEntity) { ctx.viewer.entities.remove(data._clickEntity); data._clickEntity = null; }
}

// ── Editor: kéo cả khối để di chuyển (xem `editing` ở cuối file) ──────────────
/** Dời _clickEntity (điểm pick InfoBox) về trọng tâm mới khi đang kéo. */
function moveClickEntity(data) {
  if (!data._clickEntity) return;
  const [cLon, cLat] = centroid(data.polygon);
  data._clickEntity.position = new Cesium.ConstantPositionProperty(
    Cesium.Cartesian3.fromDegrees(cLon, cLat, (data.height || 16) / 2));
}

/** Positions vòng kín của polygon ở độ cao h (m) — vẽ khung viền preview khi kéo. */
function ringPositions(poly, h) {
  const pos = poly.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, h));
  if (pos.length) pos.push(pos[0]);
  return pos;
}

function removeAt(idx) {
  const data = items[idx];
  remove(data);
  items.splice(idx, 1);
  commit();
}

/**
 * Thay TOÀN BỘ danh sách nhà xưởng (dùng cho undo/redo). Xóa render cũ, nạp lại
 * từ snapshot rồi vẽ lại. Giữ nguyên tham chiếu mảng `items` (store dùng chung).
 */
function replaceAll(arr) {
  for (const b of items) remove(b);
  items.length = 0;
  for (const b of arr) { if (!b.height) b.height = 16; items.push(b); }
  for (const b of items) render(b);
}

// ── Modal nhập thông tin nhà xưởng mới ───────────────────────────────────────
function openModal(verts) {
  const modal = document.getElementById("draw-modal");
  modal.style.display = "flex";
  modal.querySelector("#dm-name").focus();
  modal.querySelector("#dm-ok").onclick = () => {
    const name = modal.querySelector("#dm-name").value.trim();
    if (!name) { alert("Nhập tên công ty"); return; }
    const data = {
      tenCty: name,
      loaiHinh: modal.querySelector("#dm-ind").value,
      loHang: modal.querySelector("#dm-lot").value.trim(),
      dienTich: 0, dienThoai: "",
      height: +modal.querySelector("#dm-h").value || 16,
      polygon: verts,
    };
    items.push(data); render(data); commit();
    modal.style.display = "none";
    onAfterCreate && onAfterCreate(items.length - 1);
  };
  modal.querySelector("#dm-cancel").onclick = () => { modal.style.display = "none"; };
}

// Cho phép editor.js biết "vẽ xong → chuyển sang chế độ sửa & chọn building mới".
let onAfterCreate = null;

// ── Public entity definition ─────────────────────────────────────────────────
export const building = {
  id: "building",
  label: "Nhà xưởng",
  dataKey: "buildings",

  init(context) {
    ctx = context;
    items = registerCollection("buildings", serialize);
    // Góp các đỉnh nhà cho công cụ bắt điểm (snap) dùng chung.
    registerSnapSource(() => items.flatMap((b) => b.polygon));
  },

  // ── Undo/redo: ảnh chụp & khôi phục toàn bộ nhà xưởng (history.js dùng) ──────
  getState() { return items.map(serialize); },
  setState(arr) { replaceAll(Array.isArray(arr) ? arr : []); },

  /** Nạp dữ liệu đã lưu (slice = mảng | undefined nếu chưa từng lưu). */
  load(slice) {
    const source = Array.isArray(slice) ? slice : DEFAULT_BUILDINGS;
    for (const b of source) { if (!b.height) b.height = 16; items.push(b); }
    return { needsSave: false };
  },

  /** Vẽ toàn bộ building polygon (vẽ tay). */
  renderAll() {
    for (const b of items) render(b);
  },

  /**
   * Công cụ vẽ hiển thị trên toolbar editor. Mỗi tool: run(onHint) → stop.
   * Không tự dừng sau khi vẽ xong (cho vẽ liên tiếp); editor dừng khi đổi mode
   * hoặc khi tạo xong building (onAfterCreate → chuyển sang chế độ Sửa).
   */
  tools() {
    return [
      {
        id: "rect", label: "▭ Nhà xưởng (hộp)",
        title: "Vẽ hộp chữ nhật: click 2 điểm 1 cạnh rồi kéo bề sâu — luôn vuông góc",
        run: (onHint) => drawRect(ctx, { onHint, onFinish: (corners) => openModal(corners) }),
      },
      {
        id: "draw", label: "✐ Nhà xưởng (tự do)", title: "Vẽ nhà xưởng tự do từng góc",
        run: (onHint) => drawPolygon(ctx, { onHint, onFinish: (verts) => openModal(verts) }),
      },
    ];
  },

  panel: null,

  /** Danh sách <option> ngành nghề cho dropdown (editor dùng cho modal). */
  industryOptions() {
    return Object.keys(ROOF_COLORS).map((k) => `<option value="${k}">${k}</option>`).join("");
  },

  /** Đăng ký callback sau khi tạo building mới (editor: chuyển sang chế độ Sửa). */
  setOnAfterCreate(fn) { onAfterCreate = fn; },

  /** Khung dây 3D (đáy + mái + cạnh đứng) ôm cả khối — cho hiệu ứng chọn. */
  getHighlight(sel) {
    const key = sel?._polyKey; if (!key) return null;
    const data = items.find((b) => b.tenCty === key); if (!data) return null;
    const base = handles.get(key)?.groundH || 0;
    const top = base + (data.height || 16);
    const ring = (z) => {
      const r = data.polygon.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, z));
      if (r.length) r.push(r[0]);
      return r;
    };
    const lines = [ring(base), ring(top)];
    for (const [lon, lat] of data.polygon)
      lines.push([Cesium.Cartesian3.fromDegrees(lon, lat, base), Cesium.Cartesian3.fromDegrees(lon, lat, top)]);
    return { lines, clamp: false };   // khung dây 3D — không bám đất
  },

  /**
   * Khi click trúng khối primitive, scene.pick trả picked.id = key (string).
   * Trả về entity ẩn ở trọng tâm để mở InfoBox của công ty đó.
   */
  resolvePick(picked) {
    if (typeof picked?.id === "string") {
      return items.find((x) => x.tenCty === picked.id)?._clickEntity || undefined;
    }
    return undefined;
  },

  // ── editing: editor.js gọi tới — chỉ KÉO CẢ KHỐI để di chuyển + xóa ─────────
  editing: {
    /** Tìm index building từ điểm pick (khối primitive = id chuỗi, hoặc điểm InfoBox = _polyKey). */
    _idxOf(picked) {
      const e = picked?.id;
      const key = typeof e === "string" ? e : e?._polyKey;
      return key ? items.findIndex((b) => b.tenCty === key) : -1;
    },

    /** LEFT_DOWN: ghi nhận bắt đầu kéo nếu click trúng nhà xưởng (chưa đụng khối). */
    beginDrag(picked, ll) {
      if (!ll) return false;
      const idx = this._idxOf(picked);
      if (idx < 0) return false;
      dragIdx = idx; dragging = true; moved = false;
      grabLL = { lon: ll.lon, lat: ll.lat };
      basePoly = items[idx].polygon.map((p) => [...p]);   // ảnh chụp để tính delta
      return true;
    },
    /** MOUSE_MOVE: dời mọi đỉnh theo cùng 1 delta. Lần kéo ĐẦU mới gỡ khối nặng,
     *  thay bằng KHUNG VIỀN nhẹ → kéo mượt, không dựng lại liên tục, không rớt khung. */
    drag(ll) {
      if (!dragging || !ll) return;
      const data = items[dragIdx];
      if (!moved) {
        moved = true;
        const h = handles.get(data.tenCty);
        if (h) { removeBuilding3D(ctx.scene, h); handles.delete(data.tenCty); }
        dragPreview = ctx.viewer.entities.add({
          polyline: {
            positions: ringPositions(basePoly, data.height || 16),
            width: 2.5,
            material: new Cesium.ColorMaterialProperty(Cesium.Color.GOLD),
          },
        });
      }
      const dLon = ll.lon - grabLL.lon, dLat = ll.lat - grabLL.lat;
      data.polygon = basePoly.map(([lon, lat]) => [lon + dLon, lat + dLat]);
      if (dragPreview) dragPreview.polyline.positions = ringPositions(data.polygon, data.height || 16);
      moveClickEntity(data);
    },
    /** LEFT_UP: bỏ khung viền, dựng lại khối 3D tại vị trí cuối (đúng 1 lần). */
    endDrag() {
      const was = dragging && moved;
      if (dragPreview) { ctx.viewer.entities.remove(dragPreview); dragPreview = null; }
      if (was && dragIdx != null) render(items[dragIdx]);
      dragging = false; dragIdx = null; basePoly = null;
      return was;
    },

    /** Chế độ Xóa: xóa building theo điểm pick. true nếu xử lý. */
    tryDelete(picked) {
      const idx = this._idxOf(picked);
      if (idx >= 0) { if (confirm(`Xóa "${items[idx].tenCty}"?`)) removeAt(idx); return true; }
      return false;
    },
  },
};
