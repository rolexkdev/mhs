# KCN Minh Hưng Sikico

Bản đồ Khu công nghiệp: **2 trang 2D** (Leaflet) + **1 trang 3D** (CesiumJS).

## Chạy nhanh
```bash
bun install
bun dev
```
Mở http://localhost:5173 . Mặc định `MODE="local"` (đọc dữ liệu từ `public/data/`), chạy được ngay.

## Build tĩnh để deploy
```bash
bun run build               # ra thư mục dist/ — bê lên hosting tĩnh bất kỳ
bun run preview
```

## Trang & dữ liệu
| Trang | Loại | Dữ liệu |
|-------|------|---------|
| Danh sách Công ty | 2D Leaflet | `public/data/cty.geojson`, `duong`, `vanhdai` |
| Hạ tầng & Đường   | 2D Leaflet | `public/data/duong.geojson`, `vanhdai.geojson` |
| 3D Map            | 3D Cesium  | `public/data/mhs_buildings.json` (nhà xưởng + cây + cột đèn) |

Trang 3D tự render: **nhà xưởng** (khối polygon), **cây xanh** (billboard ảnh 2.5D),
**cột đèn** (billboard) — tất cả từ `mhs_buildings.json`, trên nền OSM + địa hình ESRI.
Có sẵn công cụ vẽ/sửa (vẽ hộp, vẽ đa giác, thêm/kéo hàng cây, lấy tọa độ); mọi thay đổi
được lưu trở lại `mhs_buildings.json` qua middleware `/api/save` (xem `vite.config.js`).

## Cấu trúc mã nguồn
```
src/
  config.js              Cấu hình 2D: MODE, danh sách lớp, màu, nền, camera 3D
  main.js                Điểm vào: dựng tab, gọi 2D/3D
  map2d.js               Render Leaflet (lớp, ký hiệu, popup, chú giải, biểu đồ)
  building3d.js          Helper dựng khối nhà 3D (tường + mái) bằng primitive
  map3d/                 Cảnh 3D — kiến trúc "entity-module"
    index.js             Orchestrator: nạp & vẽ mọi entity
    viewer.js            Tạo Cesium viewer (camera, ánh sáng, terrain, click)
    store.js             Lưu/đọc mhs_buildings.json + collections theo dataKey
    interactions.js      Công cụ ĐẶT dùng chung (placePoint, drawPolygon, drawRow…)
    editor.js            Chế độ SỬA (kéo đỉnh nhà, di chuyển/xóa)
    geo.js · coords.js · billboards.js · selection.js · roads.js   (tiện ích)
    entities/
      registry.js        Danh sách entity — thêm entity mới thì sửa ĐÂY
      building.js        Nhà xưởng (polygon + khối 3D)
      tree.js            Cây xanh (điểm + billboard)
      lamp.js            Cột đèn (tối giản: render + xóa)
      _TEMPLATE.js       Khuôn mẫu để tạo entity mới
scripts/                 Script sinh dữ liệu (cây, cột đèn) + fetch dữ liệu 2D
```

## 👉 Thêm một thực thể mới lên map 3D
Xem hướng dẫn từng bước: **[docs/HUONG-DAN-VE-THUC-THE.md](docs/HUONG-DAN-VE-THUC-THE.md)**
(copy `entities/_TEMPLATE.js`, điền render/serialize/tools, thêm vào `registry.js`).

## Dữ liệu
- `public/data/cty.geojson` (và các lớp 2D) có thể tải lại bằng `npm run fetch-data`
  (chế độ `MODE="remote"` trong `config.js` đọc thẳng từ server gốc nếu cần).
- ⚠ `public/data/mhs_buildings.json` là **dữ liệu thật** của trang 3D; thao tác lưu sẽ
  **ghi đè toàn bộ file** — backup trước khi thử nghiệm (xem thư mục `backups/`).
- Nguồn gốc dữ liệu 2D thuộc tổ chức GISDNRC trên ArcGIS Online — tôn trọng giấy phép khi tái sử dụng.
  Nền vệ tinh dùng tile Google (cân nhắc license khi deploy thật).
