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

// Editor state
let selIdx = null;               // index building đang chọn
let hndEnts = [];                // entity handle (đỉnh vàng + giữa cạnh xanh)
let dragHnd = null, dragging = false;

function serialize(b) {
  const { tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon } = b;
  return { tenCty, loaiHinh, loHang, dienTich, dienThoai, height, polygon };
}

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
  }).catch((err) => console.error("[building.render]", key, err));
}

function remove(data) {
  const h = handles.get(data.tenCty);
  if (h) { removeBuilding3D(ctx.scene, h); handles.delete(data.tenCty); }
  if (data._clickEntity) { ctx.viewer.entities.remove(data._clickEntity); data._clickEntity = null; }
}

// ── Editor: handles & properties ────────────────────────────────────────────
function clearHandles() {
  hndEnts.forEach((h) => ctx.viewer.entities.remove(h));
  hndEnts = [];
  selIdx = null;
  const p = document.getElementById("ed-props");
  if (p) p.style.display = "none";
}

function showHandles(idx) {
  clearHandles();
  selIdx = idx;
  const data = items[idx];
  const alt = (data.height || 16) + 5;
  const n = data.polygon.length;

  data.polygon.forEach(([lon, lat], i) => {
    const e = ctx.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
      point: { pixelSize: 14, color: Cesium.Color.GOLD, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    e._isHnd = true; e._hndType = "vert"; e._vi = i; e._pi = idx;
    hndEnts.push(e);
  });
  data.polygon.forEach(([lon, lat], i) => {
    const [lon2, lat2] = data.polygon[(i + 1) % n];
    const e = ctx.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees((lon + lon2) / 2, (lat + lat2) / 2, alt),
      point: { pixelSize: 9, color: Cesium.Color.DEEPSKYBLUE, outlineColor: Cesium.Color.WHITE, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    e._isHnd = true; e._hndType = "mid"; e._ei = i; e._pi = idx;
    hndEnts.push(e);
  });

  buildProps(idx);
}

function buildProps(idx) {
  const panel = document.getElementById("ed-props");
  if (!panel) return;
  const data = items[idx];
  panel.innerHTML = `
    <div class="ep-name">${data.tenCty}</div>
    <label>Chiều cao (m)<input id="ep-h" type="number" value="${data.height || 16}" min="4" max="60"/></label>
    <label>Ngành nghề<select id="ep-ind">
      ${Object.keys(ROOF_COLORS).map((k) => `<option value="${k}"${k === data.loaiHinh ? " selected" : ""}>${k}</option>`).join("")}
    </select></label>
    <label>Tên công ty<input id="ep-name" value="${data.tenCty}"/></label>
    <div class="ep-btns"><button id="ep-apply">Áp dụng</button><button id="ep-del" class="ep-del-btn">Xóa</button></div>`;
  panel.style.display = "flex";

  document.getElementById("ep-apply").onclick = () => {
    const newName = document.getElementById("ep-name").value.trim() || data.tenCty;
    const oldKey = data.tenCty;
    data.height = +document.getElementById("ep-h").value || 16;
    data.loaiHinh = document.getElementById("ep-ind").value;
    if (newName !== oldKey) {
      const ents = handles.get(oldKey);
      if (ents) { ents.wall && (ents.wall.name = newName); }
      if (data._clickEntity) { data._clickEntity.name = newName; data._clickEntity._polyKey = newName; data._clickEntity.description = describe({ ...data, tenCty: newName }); }
      handles.set(newName, handles.get(oldKey));
      handles.delete(oldKey);
      data.tenCty = newName;
    }
    render(data); showHandles(idx); ctx.save();
  };
  document.getElementById("ep-del").onclick = () => {
    if (!confirm(`Xóa "${data.tenCty}"?`)) return;
    removeAt(idx); clearHandles();
  };
}

function removeAt(idx) {
  const data = items[idx];
  remove(data);
  items.splice(idx, 1);
  ctx.save();
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
    items.push(data); render(data); ctx.save();
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
  },

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
        id: "rect", label: "▭ Hộp",
        title: "Vẽ hộp chữ nhật: click 2 điểm 1 cạnh rồi kéo bề sâu — luôn vuông góc",
        run: (onHint) => drawRect(ctx, { onHint, onFinish: (corners) => openModal(corners) }),
      },
      {
        id: "draw", label: "＋ Vẽ", title: "Vẽ tự do từng góc",
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

  // ── editing: editor.js gọi tới (xem editor.js) ────────────────────────────
  editing: {
    showHandles, clearHandles,
    isDragging: () => dragging,

    /** LEFT_DOWN: bắt đầu kéo đỉnh? */
    beginDrag(picked) {
      const e = picked?.id;
      if (e && e._isHnd && e._hndType === "vert") { dragHnd = e; dragging = true; return true; }
      return false;
    },
    /** MOUSE_MOVE khi đang kéo đỉnh. */
    drag(pos) {
      if (!dragging || !dragHnd) return;
      const data = items[dragHnd._pi];
      data.polygon[dragHnd._vi] = [pos.lon, pos.lat];
      dragHnd.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, (data.height || 16) + 5));
      render(data);
      const n = data.polygon.length;
      hndEnts.filter((e) => e._hndType === "mid" && e._pi === dragHnd._pi).forEach((e) => {
        const [lo, la] = data.polygon[e._ei % n], [lo2, la2] = data.polygon[(e._ei + 1) % n];
        e.position = new Cesium.ConstantPositionProperty(
          Cesium.Cartesian3.fromDegrees((lo + lo2) / 2, (la + la2) / 2, (data.height || 16) + 5));
      });
    },
    /** LEFT_UP: kết thúc kéo. true nếu vừa kéo (caller sẽ save). */
    endDrag() { const was = dragging; dragging = false; dragHnd = null; return was; },

    /** Đỉnh giữa cạnh → chèn đỉnh mới. true nếu xử lý. */
    tryAddVertex(picked, pos) {
      const e = picked?.id;
      if (e && e._isHnd && e._hndType === "mid" && pos) {
        items[e._pi].polygon.splice(e._ei + 1, 0, [pos.lon, pos.lat]);
        render(items[e._pi]); showHandles(e._pi); ctx.save();
        return true;
      }
      return false;
    },
    /** Click vào thân building → chọn. true nếu xử lý. */
    selectByPick(picked) {
      const e = picked?.id;
      if (e && e._polyKey) {
        const idx = items.findIndex((b) => b.tenCty === e._polyKey);
        if (idx >= 0) { showHandles(idx); return true; }
      }
      return false;
    },
    /** RIGHT_CLICK trên đỉnh → xóa đỉnh (giữ tối thiểu 3). true nếu xử lý. */
    tryDeleteVertex(picked) {
      const e = picked?.id;
      if (e && e._isHnd && e._hndType === "vert") {
        const { _vi, _pi } = e;
        if (items[_pi].polygon.length <= 3) return true;
        items[_pi].polygon.splice(_vi, 1);
        render(items[_pi]); showHandles(_pi); ctx.save();
        return true;
      }
      return false;
    },
    /** DELETE mode: xóa building theo điểm pick. true nếu xử lý. */
    tryDelete(picked) {
      const e = picked?.id;
      if (e && e._polyKey) {
        const idx = items.findIndex((b) => b.tenCty === e._polyKey);
        if (idx >= 0 && confirm(`Xóa "${items[idx].tenCty}"?`)) { removeAt(idx); clearHandles(); }
        return true;
      }
      return false;
    },
  },
};
