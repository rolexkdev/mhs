/**
 * import-to-supabase.mjs — Nạp dữ liệu cũ từ file JSON lên bảng collections (1 lần).
 *
 * Cách chạy (PowerShell):
 *   $env:SUPABASE_URL="https://xxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_KEY="<service_role key>"
 *   node scripts/import-to-supabase.mjs
 *
 * Dùng service_role key (bỏ qua RLS) — CHỈ chạy ở máy local, đừng commit key.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong biến môi trường.");
  process.exit(1);
}

const file = "public/data/mhs_buildings.json";
const raw = JSON.parse(fs.readFileSync(file, "utf8"));

// mỗi key trong file (buildings/trees/lamps) → 1 dòng collections
const rows = Object.entries(raw)
  .filter(([, v]) => Array.isArray(v))
  .map(([data_key, items]) => ({ data_key, items }));

const sb = createClient(url, key);
const { error } = await sb.from("collections").upsert(rows, { onConflict: "data_key" });
if (error) { console.error("Import lỗi:", error.message); process.exit(1); }

console.log("Đã import:", rows.map((r) => `${r.data_key}(${r.items.length})`).join(", "));
