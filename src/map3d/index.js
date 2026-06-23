/**
 * index.js — ORCHESTRATOR cảnh 3D. Đây là "nhạc trưởng" ghép mọi mảnh lại.
 *
 * Chu trình khi mở tab 3D (load3D):
 *   1. Tạo viewer (viewer.js) + ctx (context.js) — chỉ 1 lần.
 *   2. init từng entity type (đăng ký collection vào store).
 *   3. mount editor (toolbar, nút tọa độ).
 *   4. Nạp dữ liệu đã lưu (store.loadRaw) → chia cho từng entity (theo dataKey).
 *   5. renderAll từng entity → vẽ lên scene.
 *   6. Dựng panel chú giải của entity.
 *
 * File này CỐ TÌNH không biết chi tiết "cây" hay "nhà xưởng" — nó chỉ lặp qua
 * ENTITY_TYPES. Muốn thêm thực thể mới: sửa registry.js, KHÔNG sửa file này.
 *
 * Giữ nguyên 2 export cũ (load3D, hideTreePanel) để main.js & map2d.js không đổi.
 */
import { createViewer } from "./viewer.js";
import { createContext } from "./context.js";
import { loadRaw, save } from "./store.js";
import { addRoads } from "./roads.js";
import { ENTITY_TYPES } from "./entities/registry.js";
import { tree } from "./entities/tree.js";
import { initEditor, mountEditor, refreshButtons } from "./editor.js";
import { cancelActive } from "./interactionLock.js";

let viewer = null, ctx = null, loaded = false, escAttached = false;

export async function load3D() {
  document.getElementById("map").style.display = "none";
  document.getElementById("side").style.display = "none";
  document.getElementById("cesium").style.display = "block";
  document.querySelectorAll(".banner").forEach((b) => b.remove());

  const status = () => document.getElementById("status");
  status().textContent = "Đang dựng cảnh 3D…";

  try {
    if (!viewer) {
      viewer = await createViewer();
      ctx = createContext(viewer);
      ENTITY_TYPES.forEach((e) => e.init(ctx));
      initEditor(ctx);
    }
    mountEditor();

    if (!escAttached) {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { cancelActive(); refreshButtons(); }
      });
      escAttached = true;
    }

    if (!loaded) {
      status().textContent = "Đang render nhà xưởng…";
      await addRoads(viewer);

      const raw = await loadRaw();
      let needsSave = false;
      for (const e of ENTITY_TYPES) {
        const slice = raw ? raw[e.dataKey] : undefined;
        const r = await e.load(slice);
        if (r?.needsSave) needsSave = true;
      }
      for (const e of ENTITY_TYPES) await e.renderAll();
      for (const e of ENTITY_TYPES) e.panel?.build();

      loaded = true;
      if (needsSave) save(); // lần đầu: migrate dữ liệu seed (vd cây từ cay.geojson)
      status().textContent = "3D: sẵn sàng — click thực thể để xem thông tin";
    } else {
      for (const e of ENTITY_TYPES) e.panel?.build();
    }
  } catch (err) {
    status().textContent = "Lỗi 3D: " + err.message;
    console.error(err);
  }
}

/** Ẩn panel cây khi rời tab 3D (map2d.js gọi). */
export function hideTreePanel() {
  tree.panel?.hide?.();
}
