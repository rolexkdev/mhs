/**
 * supabase.js — Client Supabase dùng chung (trình duyệt).
 *
 * URL + anon key lấy từ .env (Vite expose biến tiền tố VITE_). Anon key NẰM
 * TRONG bundle — bảo mật ghi dựa vào RLS + đăng nhập (xem supabase/schema.sql).
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn("[supabase] Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env");
}

export const supabase = createClient(url || "http://localhost", anon || "public-anon-key");
