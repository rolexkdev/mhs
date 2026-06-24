import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

// Dữ liệu giờ lưu trên Supabase (xem src/map3d/store.js) — không còn ghi file qua /api/save.
export default defineConfig({
  base: "./",
  plugins: [cesium()],
  server: { port: 5173, open: true },
});
