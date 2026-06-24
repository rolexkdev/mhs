-- =====================================================================
-- KCN Minh Hưng Sikico — Schema lưu dữ liệu bản đồ trên Supabase Postgres
-- Chạy 1 lần trong: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- 1 bảng JSONB theo collection: mỗi loại thực thể (buildings/trees/lamps…) = 1 dòng.
-- Thêm loại thực thể mới KHÔNG cần đổi schema — chỉ thêm 1 dòng data_key mới.
create table if not exists public.collections (
  data_key   text primary key,                 -- "buildings" | "trees" | "lamps" | …
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Tự cập nhật updated_at mỗi lần ghi
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_collections_touch on public.collections;
create trigger trg_collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();

-- ---- Row Level Security ----------------------------------------------
alter table public.collections enable row level security;

-- Ai cũng ĐỌC được (trang xem công khai). Đổi 'true' → 'auth.role() = ...' nếu muốn riêng tư.
drop policy if exists "collections read" on public.collections;
create policy "collections read" on public.collections
  for select using (true);

-- Chỉ user ĐÃ ĐĂNG NHẬP mới được GHI (insert + update). upsert cần cả 2.
drop policy if exists "collections insert" on public.collections;
create policy "collections insert" on public.collections
  for insert to authenticated with check (true);

drop policy if exists "collections update" on public.collections;
create policy "collections update" on public.collections
  for update to authenticated using (true) with check (true);

-- Tạo user: Supabase Dashboard → Authentication → Users → Add user
-- (hoặc bật Email provider rồi tự đăng ký).
