/**
 * store.js — Lưu / đọc dữ liệu các thực thể trên Supabase Postgres.
 *
 * Bảng public.collections (xem supabase/schema.sql): mỗi loại thực thể = 1 dòng
 *   { data_key: "trees", items: [ … ] }
 *
 * - Mỗi entity "đăng ký" 1 collection (mảng instance sống) + hàm serialize.
 * - loadRaw() đọc tất cả dòng → trả { buildings:[…], trees:[…], lamps:[…] }.
 * - save() gom mọi collection rồi UPSERT từng dòng (cần đăng nhập — RLS chặn khách).
 *
 * Đổi nơi lưu (file → DB → API…) CHỈ cần sửa file này; entity không phải đụng tới.
 */
import { supabase } from "../supabase.js";

const collections = new Map();  // dataKey -> { items: [], serialize: fn }

const setStatus = (msg) => { const el = document.getElementById("status"); if (el) el.textContent = msg; };

/**
 * Đăng ký 1 collection cho 1 entity type.
 * @param {string} dataKey   khóa trong DB (vd "trees", "buildings")
 * @param {(inst)=>object} serialize  chuyển 1 instance về object JSON thuần
 * @returns {Array} mảng items "sống" — entity giữ tham chiếu này để thêm/xóa
 */
export function registerCollection(dataKey, serialize) {
  if (!collections.has(dataKey)) collections.set(dataKey, { items: [], serialize });
  return collections.get(dataKey).items;
}

/**
 * Đọc toàn bộ dữ liệu đã lưu từ Supabase.
 * @returns {object|null} { buildings, trees, … } hoặc null nếu chưa có / lỗi.
 *   1 key vắng mặt = "chưa từng lưu" (entity sẽ tự seed dữ liệu mặc định).
 */
export async function loadRaw() {
  try {
    const { data, error } = await supabase.from("collections").select("data_key, items");
    if (error) throw error;
    if (!data || !data.length) return null;
    const out = {};
    for (const row of data) out[row.data_key] = row.items;
    return out;
  } catch (e) {
    console.warn("[store] loadRaw lỗi:", e.message);
    setStatus("⚠ Không tải được dữ liệu từ Supabase: " + e.message);
    return null;
  }
}

/** Gom mọi collection → UPSERT lên Supabase. Cần đăng nhập (RLS). */
export async function save() {
  const payload = {};
  const rows = [];
  for (const [dataKey, { items, serialize }] of collections) {
    const ser = items.map(serialize);
    payload[dataKey] = ser;
    rows.push({ data_key: dataKey, items: ser });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    setStatus("⚠ Chưa đăng nhập — thay đổi KHÔNG được lưu lên server. Bấm “Đăng nhập”.");
    return payload;
  }

  const { error } = await supabase.from("collections").upsert(rows, { onConflict: "data_key" });
  if (error) {
    console.error("[store] save lỗi:", error);
    setStatus("⚠ Lưu thất bại: " + error.message);
  }
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
