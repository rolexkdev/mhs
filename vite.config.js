import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
import fs from "fs";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [
    cesium(),
    {
      name: "save-api",
      configureServer(server) {
        server.middlewares.use("/api/save", (req, res) => {
          if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
          let body = "";
          req.on("data", d => (body += d));
          req.on("end", () => {
            try {
              fs.writeFileSync(
                path.resolve("public/data/mhs_buildings.json"),
                JSON.stringify(JSON.parse(body), null, 2)
              );
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        });
      },
    },
  ],
  server: { port: 5173, open: true },
});
