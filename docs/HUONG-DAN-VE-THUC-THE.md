# Hướng dẫn: Vẽ một thực thể lên map 3D

Tài liệu này dành cho thành viên mới. Đọc xong, bạn sẽ tự thêm được một loại
"thực thể" (entity) mới vào bản đồ 3D — ví dụ: cột đèn, trạm điện, hồ nước,
bãi xe… — theo đúng cấu trúc chung của dự án.

> "Thực thể" = một loại đối tượng vẽ được lên map: **cây**, **nhà xưởng**, …
> Mỗi loại nằm gọn trong **một file** ở `src/map3d/entities/`.

---

## 1. Bản đồ thư mục (ai làm gì)

```
src/
  config.js              Cấu hình chung (camera, màu, lớp 2D…)
  main.js                Điểm vào: dựng tab, gọi 2D/3D
  map2d.js               Bản đồ 2D (Leaflet) — không liên quan entity 3D
  building3d.js          Helper dựng khối nhà 3D (tường + mái) bằng primitive
  map3d/
    index.js             ★ Orchestrator: nạp & vẽ mọi entity. KHÔNG cần sửa.
    viewer.js            Tạo Cesium viewer (camera, ánh sáng, terrain, click)
    context.js           Gói "ctx" = dịch vụ dùng chung (viewer, save, pick…)
    coords.js            Pixel chuột → tọa độ {lon,lat}
    geo.js               Toán học tọa độ thuần (centroid, rectCorners, distance)
    store.js             ★ Lưu/đọc dữ liệu (mhs_buildings.json) + collections
    interactions.js      ★ CÔNG CỤ ĐẶT dùng chung (placePoint, drawPolygon…)
    interactionLock.js   Khóa: mỗi lúc chỉ 1 công cụ chạy; Esc để hủy
    editor.js            Chế độ SỬA (kéo đỉnh nhà, di chuyển cây) — nâng cao
    billboards.js        Helper vẽ ảnh 2.5D (cache chiều cao ảnh, scale theo mét)
    selection.js         Click nền → chọn entity nào mở InfoBox
    roads.js             Nạp lớp đường
    entities/
      registry.js        ★ Danh sách entity. Thêm entity mới thì sửa ĐÂY.
      building.js        Thực thể "Nhà xưởng" (dạng polygon + khối 3D)
      tree.js            Thực thể "Cây xanh"  (dạng điểm + billboard ảnh)
      lamp.js            Thực thể "Cột đèn"   (tối giản: chỉ render + xóa)
      _TEMPLATE.js       ★ Khuôn mẫu có comment — COPY để bắt đầu
```

Khi thêm thực thể, bạn chỉ chạm vào **2 nơi**: file entity mới + `registry.js`.

---

## 2. Một "thực thể" gồm những gì?

Mỗi file entity export một object với các phần sau:

| Thành phần        | Bắt buộc | Vai trò                                                        |
|-------------------|:--------:|---------------------------------------------------------------|
| `id`, `label`     | ✅       | khóa nội bộ + tên hiển thị                                     |
| `dataKey`         | ✅       | khóa lưu trong `mhs_buildings.json` (vd `"trees"`)            |
| `init(ctx)`       | ✅       | nhận `ctx`, đăng ký collection vào store                       |
| `load(slice)`     | ✅       | nạp dữ liệu đã lưu (hoặc seed mặc định)                        |
| `renderAll()`     | ✅       | vẽ toàn bộ instance lên scene                                  |
| `serialize(inst)` | ✅       | chọn trường sẽ lưu (đăng ký kèm collection)                   |
| `tools()`         | tùy     | công cụ đặt hiện trên toolbar nhà xưởng                        |
| `panel`           | tùy     | panel chú giải riêng bên trái                                  |
| `editing`         | tùy     | hook cho chế độ Sửa (chỉ khi cần kéo/sửa hình phức tạp)       |

Orchestrator (`index.js`) tự gọi theo thứ tự: **init → load → renderAll → panel.build**.
Bạn không cần gọi tay.

---

## 3. `ctx` — bộ đồ nghề dùng chung

Mọi entity nhận `ctx` ở `init()`. Đây là những thứ bạn hay dùng:

```js
ctx.viewer          // Cesium.Viewer
ctx.scene           // viewer.scene
ctx.status("…")     // ghi dòng trạng thái dưới đáy màn hình
ctx.render()        // yêu cầu vẽ lại 1 frame (vì viewer chỉ render khi cần)
ctx.pickGround(p)   // pixel → {lon,lat} bám ellipsoid (ổn định mọi góc nhìn)
ctx.pickSurface(p)  // pixel → {lon,lat} bám terrain (sát bề mặt thật)
ctx.save()          // LƯU toàn bộ dữ liệu (gọi sau mỗi thay đổi)
```

---

## 4. Công cụ ĐẶT có sẵn (`interactions.js`)

Đây là phần bạn dùng nhiều nhất khi "vẽ". Mỗi công cụ trả về hàm `stop()`.
**Quy ước: callback luôn nhận `stop` ở cuối** — gọi `stop()` để dừng.

| Công cụ        | Khi nào dùng                         | Callback                          |
|----------------|--------------------------------------|-----------------------------------|
| `placePoint`   | đặt 1 điểm (cây, cột đèn…)           | `onPlace({lon,lat}, stop)`        |
| `drawPolygon`  | vẽ vùng tự do (nhà, hồ…)            | `onFinish([[lon,lat]…], stop)`    |
| `drawRect`     | vẽ hộp chữ nhật vuông góc            | `onFinish([[lon,lat]×4], stop)`   |
| `drawRow`      | vẽ hàng (nhiều điểm cách đều)        | `onFinish(start, end, stop)`      |
| `coordPicker`  | bảng lấy/ghim tọa độ                 | —                                 |

Ví dụ đặt 1 điểm rồi dừng:

```js
import { placePoint } from "../interactions.js";

placePoint(ctx, {
  onPlace: (pos, stop) => {
    const p = { id: nextId(), lon: pos.lon, lat: pos.lat };
    items.push(p);
    renderOne(p);
    ctx.save();
    stop();              // bỏ dòng này nếu muốn đặt liên tục
  },
});
```

> Phím **Esc** tự hủy công cụ đang chạy (cơ chế trong `interactionLock.js`),
> bạn không cần xử lý thủ công.

---

## 5. Sáu bước thêm một thực thể mới

Lấy ví dụ thêm **"Cột đèn"** (dạng điểm). File mẫu đầy đủ: `entities/_TEMPLATE.js`.

### Bước 1 — Copy template
```
cp src/map3d/entities/_TEMPLATE.js src/map3d/entities/light.js
```
Sửa `id: "light"`, `label: "Cột đèn"`, `dataKey: "lights"` và đổi tên export
(`export const light = { … }`).

### Bước 2 — Chọn trường lưu (`serialize`)
```js
function serialize(p) {
  const { id, ten, lon, lat } = p;   // chỉ lưu các trường này
  return { id, ten, lon, lat };       // BỎ các trường runtime
}
```

### Bước 3 — Vẽ 1 instance (`renderOne`)
```js
function renderOne(p) {
  const e = ctx.viewer.entities.add({
    name: p.ten,
    position: Cesium.Cartesian3.fromDegrees(+p.lon, +p.lat, 0),
    point: { pixelSize: 12, color: Cesium.Color.GOLD,
             heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
  });
  handles.set(p.id, e);
}
```

### Bước 4 — Nạp dữ liệu (`load`)
```js
async load(slice) {
  if (Array.isArray(slice)) { for (const p of slice) items.push(p); return { needsSave:false }; }
  return { needsSave: false }; // chưa có gì → để trống (hoặc seed từ geojson)
}
```

### Bước 5 — Cách đặt (`tools` hoặc panel)
Dùng `placePoint` như mục 4. Có thể đặt nút trong `panel.build()` (xem template).

### Bước 6 — Đăng ký vào `registry.js`
```js
import { light } from "./light.js";
export const ENTITY_TYPES = [building, tree, light];   // ← thêm vào đây
```

Xong! Mở app, chuyển tab **3D Map** — thực thể của bạn đã hoạt động và **tự lưu**
vào `mhs_buildings.json` dưới khóa `dataKey`.

---

## 6. Học từ 3 ví dụ có sẵn

- **Dạng ĐIỂM + billboard ảnh** → đọc `entities/tree.js`
  (đặt bằng `placePoint`, vẽ hàng bằng `drawRow`, render bằng billboard 2.5D —
  ảnh PNG cao đúng số mét, xem `billboards.js`).
- **Dạng VÙNG (polygon) + khối 3D** → đọc `entities/building.js`
  (vẽ bằng `drawRect`/`drawPolygon`, render khối bằng `building3d.js`,
  có `editing` để kéo chỉnh đỉnh).
- **Entity TỐI GIẢN (chỉ render + xóa)** → đọc `entities/lamp.js`
  (cột đèn: vị trí sinh sẵn bằng script, không có công cụ đặt tay; minh họa
  rằng `tools()` và `panel` là tùy chọn).

---

## 7. Chạy & lưu ý

```
npm run dev      # chạy dev server (mở http://localhost:5173)
npm run build    # build kiểm tra không vỡ
```

⚠ **Dữ liệu thật:** `ctx.save()` ghi đè `public/data/mhs_buildings.json` qua
middleware trong `vite.config.js`. Khi thử nghiệm phá phách, hãy **backup file
này trước** (thư mục `backups/` đã có 1 bản). Nếu không có dev server,
`save()` tự fallback xuống `localStorage`.
