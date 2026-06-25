# Hướng dẫn: Thêm một thực thể lên map 3D

Tài liệu này dành cho thành viên mới. Đọc xong, bạn sẽ tự thêm được một loại
"thực thể" (entity) mới vào bản đồ 3D — ví dụ: cột điện, dây điện, trạm biến áp,
hồ nước, bãi xe… — theo đúng cấu trúc chung của dự án.

> "Thực thể" = một loại đối tượng vẽ được lên map: **nhà xưởng**, **cây**,
> **cột đèn**, **đường**… Mỗi loại nằm gọn trong **một file** ở `src/map3d/entities/`.

**Triết lý:** mỗi entity TỰ MÔ TẢ chính nó (vẽ gì, lưu gì, đặt thế nào, kéo/xóa/
chọn ra sao). Phần khung (orchestrator, editor, highlight, store) chỉ **duyệt qua
danh sách entity** và gọi các hàm chuẩn — nên thêm thực thể mới **không phải sửa
các file khung**.

---

## 1. Bản đồ thư mục (ai làm gì)

```
src/
  config.js              Cấu hình chung (camera, màu, lớp 2D…)
  main.js                Điểm vào: dựng tab (định tuyến #hash), gọi 2D/3D
  map2d.js               Bản đồ 2D (Leaflet) — không liên quan entity 3D
  building3d.js          Helper dựng khối nhà 3D (tường + mái) bằng primitive
  map3d/
    index.js             ★ Orchestrator: nạp & vẽ mọi entity. KHÔNG cần sửa.
    viewer.js            Tạo Cesium viewer (camera, ánh sáng, terrain, click)
    context.js           Gói "ctx" = dịch vụ dùng chung (viewer, save, pick…)
    coords.js            Pixel chuột → tọa độ {lon,lat}
    geo.js               Toán học tọa độ thuần (centroid, rectCorners, circleLonLat…)
    store.js             ★ Lưu/đọc dữ liệu trên Supabase + đăng ký collection
    interactions.js      ★ CÔNG CỤ ĐẶT dùng chung (placePoint, drawPolygon, drawLine…)
    interactionLock.js   Khóa: mỗi lúc chỉ 1 công cụ chạy; Esc để hủy
    editor.js            Chế độ SỬA (kéo-thả di chuyển) & XÓA + menu "＋ Vẽ ▾"
    snap.js              Bắt điểm vào đỉnh nhà xưởng khi vẽ ("dính tay")
    ortho.js             Căn thẳng/90° khi vẽ đường (drawLine)
    measure.js           Tooltip số đo (chiều dài + góc) realtime khi vẽ
    highlight.js         ★ Hiệu ứng CHỌN: viền sáng ôm đúng hình thực thể
    billboards.js        Helper vẽ ảnh 2.5D (cache chiều cao ảnh, scale theo mét)
    selection.js         Click nền → chọn entity nào mở InfoBox
    roads.js             Nạp lớp đường nền (GeoJSON, chỉ để xem)
    history.js           Undo/redo (hiện áp dụng cho nhà xưởng)
    entities/
      registry.js        ★ Danh sách entity. Thêm entity mới thì sửa ĐÂY.
      building.js        "Nhà xưởng" — VÙNG (polygon) + khối 3D, kéo cả khối
      tree.js            "Cây xanh"  — ĐIỂM + billboard ảnh, có panel chú giải
      lamp.js            "Cột đèn"   — ĐIỂM tối giản (render + đặt + kéo + xóa)
      road.js            "Đường"     — ĐƯỜNG (polyline) bám đất, vẽ tay
      _TEMPLATE.js       ★ Khuôn mẫu có comment đầy đủ — COPY để bắt đầu
```

Khi thêm thực thể, bạn chỉ chạm vào **2 nơi**: file entity mới + `registry.js`.

---

## 2. Một "thực thể" gồm những gì?

Mỗi file entity export một object. Khung sẽ tự gọi các hàm này khi cần:

| Thành phần              | Bắt buộc | Vai trò                                                        |
|-------------------------|:--------:|---------------------------------------------------------------|
| `id`, `label`           | ✅       | khóa nội bộ + tên hiển thị                                     |
| `dataKey`               | ✅       | khóa lưu trong Supabase (vd `"trees"`, `"roads"`)             |
| `init(ctx)`             | ✅       | nhận `ctx`, đăng ký collection vào store                       |
| `load(slice)`           | ✅       | nạp dữ liệu đã lưu (hoặc seed mặc định)                        |
| `renderAll()`           | ✅       | vẽ toàn bộ instance lên scene                                  |
| `serialize(inst)`       | ✅       | chọn trường sẽ lưu (đăng ký kèm collection)                   |
| `tools()`               | tùy     | công cụ vẽ → hiện trong menu **"＋ Vẽ ▾"**                     |
| `editing`               | tùy     | hook chế độ Sửa/Xóa: `beginDrag/drag/endDrag/tryDelete`        |
| `getHighlight(sel)`     | tùy     | viền sáng ôm hình khi click chọn                              |
| `panel`                 | tùy     | panel chú giải riêng bên trái                                  |
| `resolvePick(picked)`   | tùy     | chỉ khi click khối primitive (xem `building.js`)              |

Orchestrator (`index.js`) tự gọi theo thứ tự: **init → load → renderAll → panel.build**.
Bạn không gọi tay. Các hook `tools/editing/getHighlight` được editor/highlight gọi khi
người dùng tương tác.

---

## 3. `ctx` — bộ đồ nghề dùng chung

Mọi entity nhận `ctx` ở `init()`. Đây là những thứ bạn hay dùng:

```js
ctx.viewer          // Cesium.Viewer
ctx.scene           // viewer.scene
ctx.status("…")     // ghi dòng trạng thái dưới đáy màn hình
ctx.render()        // yêu cầu vẽ lại 1 frame (viewer chỉ render khi cần — xem lưu ý §8)
ctx.pickGround(p)   // pixel → {lon,lat} bám ellipsoid (ổn định mọi góc nhìn)
ctx.pickSurface(p)  // pixel → {lon,lat} bám terrain (sát bề mặt thật)
ctx.save()          // LƯU toàn bộ dữ liệu lên Supabase (gọi sau mỗi thay đổi)
```

---

## 4. Công cụ ĐẶT có sẵn (`interactions.js`)

Phần bạn dùng nhiều nhất khi "vẽ". Mỗi công cụ trả về hàm `stop()`.
**Quy ước: callback luôn nhận `stop` ở cuối** — gọi `stop()` để dừng, KHÔNG gọi
thì công cụ tự reset để đặt/vẽ **liên tục**.

| Công cụ        | Khi nào dùng                          | Callback                          |
|----------------|---------------------------------------|-----------------------------------|
| `placePoint`   | đặt 1 điểm (cây, cột đèn, cột điện…)  | `onPlace({lon,lat}, stop)`        |
| `drawPolygon`  | vẽ VÙNG kín tự do (nhà, hồ…)         | `onFinish([[lon,lat]…], stop)`    |
| `drawRect`     | vẽ hộp chữ nhật vuông góc             | `onFinish([[lon,lat]×4], stop)`   |
| `drawLine`     | vẽ ĐƯỜNG gấp khúc MỞ (đường, dây…)   | `onFinish([[lon,lat]…], stop)`    |
| `drawRow`      | vẽ hàng (nhiều điểm cách đều)         | `onFinish(start, end, stop)`      |
| `coordPicker`  | bảng lấy/ghim tọa độ                  | —                                 |

Ví dụ đặt điểm **liên tục** (không gọi `stop`):

```js
import { placePoint } from "../interactions.js";

function startPlacing() {
  return placePoint(ctx, {
    surface: true,                         // bám terrain
    onPlace: (pos) => {
      const p = { id: nextId(), lon: pos.lon, lat: pos.lat };
      items.push(p); renderOne(p); ctx.save();
      ctx.status(`Đã đặt: ${items.length} — Esc để dừng`);
    },
  });
}
```

> Phím **Esc** tự hủy công cụ đang chạy (cơ chế trong `interactionLock.js`),
> bạn không cần xử lý thủ công. Khi vẽ, **snap** (bắt đỉnh nhà) và **measure**
> (số đo) chạy sẵn; `drawLine` còn có **ortho** (giữ Shift = căn thẳng/90°).

---

## 5. Ba hook tương tác (đều TÙY CHỌN)

Khung duyệt `ENTITY_TYPES` và gọi các hook này — khai báo cái nào thì có tính năng đó.

### 5a. `tools()` — nút vẽ trong menu "＋ Vẽ ▾"

Trả mảng công cụ. Mỗi tool: `{ id, label, title, run(onHint) → stop }`.
`run` gọi 1 công cụ ở §4 và **trả về `stop`** của nó (editor dùng để dừng khi đổi mode/Esc).

```js
tools() {
  return [{ id: "pole-add", label: "⚡ Cột điện",
            title: "Đặt cột điện — click liên tục, Esc để dừng",
            run: () => startPlacing() }];
}
```

### 5b. `editing` — chế độ Sửa (kéo di chuyển) & Xóa

Editor lo phần handler chuột; entity chỉ cần 4 hàm. **`ll` = `{lon,lat}` mặt đất
dưới con trỏ.** Trả `true` nếu điểm pick là của entity này (để editor dừng hỏi
các entity khác). Mẹo nhận diện: gắn id lên entity lúc `renderOne` (vd `e._poleId = p.id`).

```js
editing: {
  // Sửa: kéo-thả di chuyển
  beginDrag(picked, ll) {                 // LEFT_DOWN
    const id = picked?.id?._poleId; if (!id || !ll) return false;
    const p = items.find(x => x.id === id); if (!p) return false;
    dragP = p; dragging = true; moved = false;
    grabLL = { lon: ll.lon, lat: ll.lat };
    baseLL = { lon: +p.lon, lat: +p.lat };
    return true;
  },
  drag(ll) {                              // MOUSE_MOVE
    if (!dragging || !ll) return;
    moved = true;
    dragP.lon = baseLL.lon + (ll.lon - grabLL.lon);
    dragP.lat = baseLL.lat + (ll.lat - grabLL.lat);
    const e = handles.get(dragP.id);
    if (e) e.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(dragP.lon, dragP.lat, 0));
  },
  endDrag() {                             // LEFT_UP → true nếu THỰC SỰ di chuyển
    const was = dragging && moved; dragging = false; dragP = null; return was;
  },
  // Xóa: click trong chế độ "Xóa"
  tryDelete(picked) {
    const id = picked?.id?._poleId; if (!id) return false;
    const p = items.find(x => x.id === id);
    if (p && confirm(`Xóa ${label}?`)) { removeOne(p); ctx.save(); }
    return true;
  },
}
```

> Entity dạng VÙNG (nhà xưởng) kéo cả khối bằng cách dời mọi đỉnh theo cùng 1 delta —
> xem `building.js`. Vì dựng khối 3D nặng, nó chỉ hiện **khung viền** khi kéo và dựng
> lại khối 1 lần lúc thả.

### 5c. `getHighlight(sel)` — viền sáng khi chọn

Khi click chọn, `highlight.js` vẽ viền phát sáng ôm hình thật. Trả
`{ lines: Cartesian3[][], clamp?, width?, color? }` hoặc `null` nếu không phải của bạn.

```js
import { circleLonLat } from "../geo.js";

getHighlight(sel) {
  const id = sel?._poleId; if (!id) return null;
  const p = items.find(x => x.id === id); if (!p) return null;
  return { lines: [ circleLonLat(+p.lon, +p.lat, 2)
            .map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)) ],
           clamp: true };   // vòng tròn bám đất quanh cột
}
```

---

## 6. Sáu bước thêm một thực thể mới

Lấy ví dụ thêm **"Cột điện"** (dạng điểm). File mẫu đầy đủ: `entities/_TEMPLATE.js`.

**Bước 1 — Copy template & đổi tên**
```
cp src/map3d/entities/_TEMPLATE.js src/map3d/entities/pole.js
```
Sửa `id: "pole"`, `label: "Cột điện"`, `dataKey: "poles"`, đổi export `export const pole = {…}`.

**Bước 2 — `serialize`**: chọn các trường LƯU, bỏ trường runtime (`_entity`, handle…).

**Bước 3 — `renderOne`**: vẽ 1 instance + **gắn id để pick** (`e._poleId = p.id`).

**Bước 4 — `load`**: `slice` là mảng đã lưu, hoặc `undefined` (chưa có → seed/để trống).

**Bước 5 — Cách đặt + tương tác**: viết `tools()` (§5a). Thêm `editing` (§5b) và
`getHighlight` (§5c) nếu muốn kéo/xóa/chọn. Template đã có sẵn mẫu cho cả ba.

**Bước 6 — Đăng ký `registry.js`**
```js
import { pole } from "./pole.js";
export const ENTITY_TYPES = [building, tree, lamp, road, pole];   // ← thêm vào đây
```

Xong! Mở app, tab **3D Map** — thực thể của bạn đã có trong menu "＋ Vẽ ▾", kéo/xóa/
chọn được, và **tự lưu** lên Supabase dưới khóa `dataKey`.

---

## 7. Học từ 4 ví dụ có sẵn

- **ĐIỂM + billboard ảnh** → `entities/tree.js`
  (đặt bằng `placePoint`, vẽ hàng bằng `drawRow`, render billboard 2.5D, có panel chú giải).
- **ĐIỂM tối giản** → `entities/lamp.js`
  (đặt + kéo + xóa, không panel — ví dụ gọn nhất để bắt chước).
- **VÙNG (polygon) + khối 3D** → `entities/building.js`
  (vẽ bằng `drawRect`/`drawPolygon`, render khối bằng `building3d.js`, kéo cả khối,
  highlight là khung dây 3D).
- **ĐƯỜNG (polyline) bám đất** → `entities/road.js`
  (vẽ bằng `drawLine`, render polyline `clampToGround` — mẫu cho **dây điện / ống nước**).

---

## 8. Chạy, lưu trữ & lưu ý

```bash
bun dev        # chạy dev server (mở http://localhost:5173)
bun run build  # build kiểm tra không vỡ
```

**Lưu trữ (Supabase):** `ctx.save()` gom mọi collection rồi UPSERT lên bảng
`public.collections` (mỗi `dataKey` = 1 dòng). **Cần đăng nhập** (RLS chặn khách) —
bấm nút "Đăng nhập" trên thanh tab; chưa đăng nhập thì thay đổi **không** được lưu.
Cấu hình khóa Supabase trong `.env` (xem `.env.example` và `docs/SUPABASE.md`).
Nút "⬇ JSON" trên toolbar xuất toàn bộ ra file `mhs_buildings.json` để sao lưu/đối chiếu.

**requestRenderMode:** viewer chỉ vẽ lại khi cảnh đổi để tiết kiệm tải. Thêm/xóa
entity đã tự xin vẽ lại; nhưng nếu bạn **đổi thuộc tính** entity có sẵn (vd dời
`position`) mà màn hình không cập nhật, hãy gọi `ctx.render()` (hoặc
`ctx.scene.requestRender()`). Với hình **bám đất** (`clampToGround`) build bất đồng
bộ, xin vẽ lại vài frame liên tiếp — xem `renderBurst` trong `road.js`.
```
