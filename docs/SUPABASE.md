# Lưu dữ liệu lên Supabase (Postgres)

Trang 3D lưu/đọc dữ liệu (nhà xưởng, cây, cột đèn) trên Supabase thay vì file.
Mô hình: **1 bảng `collections`** — mỗi loại thực thể = 1 dòng JSONB. Ghi cần **đăng nhập**.

Toàn bộ logic nằm trong [src/map3d/store.js](../src/map3d/store.js) + [src/supabase.js](../src/supabase.js)
+ [src/auth.js](../src/auth.js). Entity (building/tree/lamp) KHÔNG đụng tới.

## Thiết lập (1 lần)

### 1. Tạo bảng + RLS
Mở Supabase Dashboard → **SQL Editor** → dán nội dung [supabase/schema.sql](../supabase/schema.sql) → **Run**.

### 2. Khai báo key cho app
Lấy ở Dashboard → **Project Settings → API**. Tạo file `.env` (copy từ `.env.example`):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

### 3. Tạo tài khoản đăng nhập
Dashboard → **Authentication → Users → Add user** (email + mật khẩu).

### 4. Nạp dữ liệu cũ từ file lên DB (1 lần)
```powershell
$env:SUPABASE_URL="https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_KEY="<service_role key>"   # KHÔNG commit key này
npm run import-data
```
Script đọc `public/data/mhs_buildings.json` và upsert vào bảng `collections`.

### 5. Chạy
```
bun dev      # hoặc npm run dev
```
- Khách: xem được bản đồ (RLS cho đọc công khai).
- Bấm **🔑 Đăng nhập** (góc phải) → sửa & lưu được; thay đổi ghi thẳng lên Supabase.

## Cách hoạt động
| Hàm (store.js) | Việc |
|---|---|
| `loadRaw()` | `select * from collections` → `{ buildings:[…], trees:[…], lamps:[…] }` |
| `save()` | gom mọi collection → `upsert` từng dòng (chặn nếu chưa đăng nhập) |

## Lưu ý
- `anon key` nằm trong bundle (lộ) — bảo mật GHI dựa vào **RLS + đăng nhập**, không phải giấu key.
- `save()` **ghi đè cả dòng** của collection (last-write-wins). Nếu sau này cần nhiều
  người sửa đồng thời an toàn hơn → tách bảng quan hệ + cập nhật từng dòng.
- `service_role key` chỉ dùng cho script import ở máy local, **tuyệt đối không** đưa vào client.
