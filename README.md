# KCN Minh Hưng Sikico

Clone bản đồ KCN Dầu Giây: **4 page 2D** (Leaflet) + **1 page 3D** (CesiumJS).
Không dùng ArcGIS JS API — chỉ là thư viện mã nguồn mở đọc dữ liệu GeoJSON / Scene Layer.

## Chạy nhanh (chế độ remote — đọc thẳng từ server gốc)
```bash
npm install
npm run dev
```
Mở http://localhost:5173 . Mặc định `MODE="remote"` nên chạy được ngay.

## Cắt hẳn ArcGIS (chế độ local — tự host dữ liệu)
```bash
npm run fetch-data          # tải mọi lớp 2D về public/data/*.geojson
# rồi sửa src/config.js:  export const MODE = "local";
npm run dev
```
Từ đây app không gọi arcgis.com cho dữ liệu 2D nữa.

## Build tĩnh để deploy
```bash
npm run build               # ra thư mục dist/ — bê lên hosting tĩnh bất kỳ
npm run preview
```

## Cấu trúc
- `src/config.js`  — **chỗ duy nhất cần sửa**: MODE, danh sách lớp, màu, nền, cấu hình 3D.
- `src/map2d.js`   — render Leaflet (lớp, ký hiệu, popup, chú giải, biểu đồ).
- `src/map3d.js`   — render Cesium (scene layer I3S + địa hình + nền OSM).
- `scripts/fetch-data.mjs` — tải GeoJSON về để chạy local.

## Ghi chú về 3D
Model 3D là Scene Layer **I3S** trên server org. `fetch-data` chỉ tải được lớp 2D
(và đường dây điện). Muốn 3D chạy hoàn toàn local phải convert I3S → **3D Tiles** rồi
trỏ `SCENE_LAYERS` sang URL tự host (dùng tool của Cesium/FME — ngoài phạm vi repo này).

## Dữ liệu
Nguồn gốc thuộc tổ chức GISDNRC trên ArcGIS Online. Tôn trọng quyền sở hữu/giấy phép
dữ liệu khi tái sử dụng. Nền vệ tinh ở page Cây xanh là tile Google (cân nhắc license khi deploy thật).
