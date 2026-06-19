import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

// base:"./" để build ra chạy được khi mở từ thư mục con / static host bất kỳ
export default defineConfig({
  base: "./",
  plugins: [cesium()],
  server: { port: 5173, open: true }
});
