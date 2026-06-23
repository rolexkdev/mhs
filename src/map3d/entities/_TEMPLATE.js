/**
 * _TEMPLATE.js — KHUÔN MẪU TẠO THỰC THỂ MỚI (copy file này để bắt đầu).
 * ============================================================================
 *
 * Mục tiêu: dạy bạn vẽ 1 "thực thể" (entity) mới lên map 3D theo đúng pattern
 * của dự án. Ví dụ ở đây là "Cột đèn" — 1 thực thể dạng ĐIỂM, đặt bằng cách
 * click 1 chỗ trên bản đồ.
 *
 * ❗ 6 BƯỚC để có thực thể mới (xem docs/HUONG-DAN-VE-THUC-THE.md cho bản đầy đủ):
 *   1) Copy file này → entities/<ten>.js, sửa id / label / dataKey.
 *   2) serialize(): chọn các trường sẽ LƯU xuống file.
 *   3) renderOne(): vẽ 1 instance lên scene (entity hoặc primitive).
 *   4) load(): nạp dữ liệu đã lưu (hoặc seed mặc định nếu chưa có).
 *   5) tools(): khai báo công cụ đặt — tái dùng placePoint/drawPolygon/drawRow…
 *   6) Mở registry.js → import & thêm vào mảng ENTITY_TYPES.
 *
 * KHÔNG cần đụng index.js hay editor.js. Orchestrator sẽ tự gọi:
 *   init → load → renderAll → panel.build
 * ============================================================================
 */
import * as Cesium from "cesium";
import { registerCollection } from "../store.js";
import { placePoint } from "../interactions.js";

// ── (1) Khai báo cấu hình riêng của loại thực thể này (tùy chọn) ──────────────
const COLOR = Cesium.Color.fromCssColorString("#FFD54F");

// ── State của module ─────────────────────────────────────────────────────────
let ctx = null;            // gói dịch vụ dùng chung (viewer, save, pickGround…)
let items = [];            // mảng instance "sống" — CÙNG tham chiếu với store
const handles = new Map(); // id instance → entity/primitive đã vẽ (để xóa sau)

// ── (2) Chọn trường sẽ LƯU. Bỏ các trường runtime (vd _entity, handle…) ───────
function serialize(p) {
  const { id, ten, lon, lat } = p;
  return { id, ten, lon, lat };
}

// ── (3) Vẽ 1 instance lên scene ──────────────────────────────────────────────
function renderOne(p) {
  const e = ctx.viewer.entities.add({
    name: p.ten,
    description: `<b>${p.ten}</b><br>(${p.lat}, ${p.lon})`,
    position: Cesium.Cartesian3.fromDegrees(+p.lon, +p.lat, 0),
    point: { pixelSize: 12, color: COLOR, outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
             heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
  });
  handles.set(p.id, e);
}

function removeOne(p) {
  const e = handles.get(p.id);
  if (e) { ctx.viewer.entities.remove(e); handles.delete(p.id); }
}

// ── Sinh id kế tiếp (đơn giản) ───────────────────────────────────────────────
function nextId() {
  const max = items.reduce((m, p) => Math.max(m, parseInt(p.id?.split("-").pop() ?? "0", 10)), 0);
  return `COT-${String(max + 1).padStart(3, "0")}`;
}

// ── Định nghĩa thực thể (đây là thứ registry.js import) ───────────────────────
export const template = {
  id: "template",         // (1) khóa nội bộ, duy nhất
  label: "Cột đèn",       //     tên hiển thị
  dataKey: "lights",      //     khóa trong file mhs_buildings.json

  /** Gọi 1 lần lúc khởi tạo: nhận ctx + đăng ký collection vào store. */
  init(context) {
    ctx = context;
    items = registerCollection(this.dataKey, serialize);
  },

  /**
   * (4) Nạp dữ liệu đã lưu.
   * @param slice  mảng (đã lưu) | undefined/null (chưa từng lưu → seed mặc định)
   * @returns {{needsSave:boolean}}  needsSave=true để orchestrator lưu lại sau seed
   */
  async load(slice) {
    if (Array.isArray(slice)) { for (const p of slice) items.push(p); return { needsSave: false }; }
    // Chưa có dữ liệu: để trống (hoặc seed từ 1 file geojson nếu muốn).
    return { needsSave: false };
  },

  /** Vẽ toàn bộ instance hiện có. */
  renderAll() {
    for (const p of items) renderOne(p);
    ctx.render();
  },

  /**
   * (5) Công cụ đặt thực thể. Trả về mảng tool — KHÔNG bắt buộc.
   * Ở đây ta KHÔNG gắn vào toolbar nhà xưởng; thay vào đó panel (dưới) tự tạo
   * nút bấm gọi startPlacing(). Tùy nhu cầu, bạn có thể trả tool cho toolbar.
   */
  tools() { return []; },

  /** (tùy chọn) Panel chú giải riêng bên trái. */
  panel: {
    build() {
      let el = document.getElementById("tpl-panel");
      if (!el) { el = document.createElement("div"); el.id = "tpl-panel"; el.className = "side-panel";
        document.getElementById("stage").appendChild(el); }
      el.innerHTML = `<div class="tp-header">${template.label}: ${items.length}</div>
        <button id="tpl-add">+ Thêm ${template.label}</button>`;
      el.style.display = "block";
      el.querySelector("#tpl-add").onclick = startPlacing;
    },
    hide() { const el = document.getElementById("tpl-panel"); if (el) el.style.display = "none"; },
  },
};

// ── Hành vi đặt: dùng công cụ chung placePoint ───────────────────────────────
function startPlacing() {
  // placePoint tự chiếm khóa tương tác, đổi con trỏ, dọn dẹp khi stop().
  placePoint(ctx, {
    onPlace: (pos, stop) => {
      const p = { id: nextId(), ten: template.label, lon: pos.lon, lat: pos.lat };
      items.push(p);
      renderOne(p);
      ctx.save();        // lưu ngay
      stop();            // đặt 1 lần rồi thôi (bỏ dòng này nếu muốn đặt liên tục)
      template.panel.build();
    },
  });
}

/*
 * GHI CHÚ KHI MUỐN THỰC THỂ DẠNG VÙNG (POLYGON) THAY VÌ ĐIỂM:
 *   - import { drawPolygon } from "../interactions.js";
 *   - thay placePoint bằng drawPolygon(ctx, { onFinish:(verts, stop)=>{…}, onHint })
 *   - renderOne dựng khối từ verts (xem building.js: addBuilding3D).
 * MUỐN VẼ HÀNG (nhiều điểm cách đều): dùng drawRow + geo.pointsAlongLine (xem tree.js).
 */
