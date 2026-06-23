/**
 * store.js — Lưu / đọc dữ liệu các thực thể (1 nguồn sự thật duy nhất).
 *
 * Toàn bộ thực thể được lưu chung trong public/data/mhs_buildings.json dạng:
 *   { "buildings": [...], "trees": [...] }   // mỗi key = dataKey của 1 entity type
 *
 * - Mỗi entity type "đăng ký" 1 collection (mảng instance đang sống) + hàm serialize.
 * - save() gom tất cả collection lại, gọi serialize từng cái, POST về /api/save.
 *   (Vite middleware ghi đè file — xem vite.config.js. Có fallback localStorage.)
 *
 * ⚠ File mhs_buildings.json chứa DỮ LIỆU THẬT. save() ghi đè toàn bộ file.
 */

const collections = new Map();  // dataKey -> { items: [], serialize: fn }

/**
 * Đăng ký 1 collection cho 1 entity type.
 * @param {string} dataKey   khóa trong file JSON (vd "trees", "buildings")
 * @param {(inst)=>object} serialize  chuyển 1 instance về object JSON thuần
 * @returns {Array} mảng items "sống" — entity giữ tham chiếu này để thêm/xóa
 */
export function registerCollection(dataKey, serialize) {
  if (!collections.has(dataKey)) collections.set(dataKey, { items: [], serialize });
  return collections.get(dataKey).items;
}

/** Chuẩn hóa dữ liệu cũ: file từng là mảng buildings thuần (không có key trees). */
function normalize(raw) {
  if (Array.isArray(raw)) return { buildings: raw, trees: null };
  return { buildings: raw.buildings || [], trees: "trees" in raw ? raw.trees : null };
}

/**
 * Đọc toàn bộ dữ liệu đã lưu.
 * @returns {object|null} { buildings, trees, … } hoặc null nếu chưa có ở đâu cả.
 *   Lưu ý: 1 key = null nghĩa là "chưa từng lưu" (entity sẽ tự seed dữ liệu mặc định).
 */
export async function loadRaw() {
  try {
    const r = await fetch("/data/mhs_buildings.json?t=" + Date.now());
    if (r.ok) return normalize(await r.json());
  } catch (e) {}
  try {
    const s = localStorage.getItem("mhs_buildings");
    if (s) return normalize(JSON.parse(s));
  } catch (e) {}
  return null;
}

/** Gom mọi collection → payload → POST /api/save (fallback localStorage). */
export async function save() {
  const payload = {};
  for (const [dataKey, { items, serialize }] of collections) {
    payload[dataKey] = items.map(serialize);
  }
  try {
    const r = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) return payload;
  } catch (e) {}
  try { localStorage.setItem("mhs_buildings", JSON.stringify(payload)); } catch (e) {}
  return payload;
}

/** Xuất ra file .json tải về (nút "⬇ JSON"). */
export async function exportToFile() {
  const payload = await save();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "mhs_buildings.json",
  });
  a.click();
  URL.revokeObjectURL(a.href);
}
