/* Tải toàn bộ lớp 2D về public/data/*.geojson để chạy MODE="local".
   Chạy: npm run fetch-data   (cần Node 18+ vì dùng global fetch)        */
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LAYERS, queryUrl, LINE_3D } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "data");

// gom tất cả lớp (khử trùng theo service+layer)
const seen = new Set(), jobs = [];
for (const page of Object.values(LAYERS))
  for (const ly of page){
    const k = ly.service + "/" + ly.layer;
    if (!seen.has(k)) { seen.add(k); jobs.push(ly); }
  }
// thêm lớp đường dây điện 3D (dạng line, lấy được geojson)
jobs.push({ title:"Đường dây điện 3D", local:"duongdaydien_3d.geojson",
  _url: LINE_3D + "/query?where=1=1&outFields=*&outSR=4326&f=geojson&resultRecordCount=10000" });

await mkdir(OUT, { recursive:true });
console.log("Tải " + jobs.length + " lớp -> " + OUT + "\n");

let ok=0, fail=0;
for (const ly of jobs){
  const url = ly._url || queryUrl(ly);
  try{
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    const n = (j.features || []).length;
    await writeFile(join(OUT, ly.local), JSON.stringify(j));
    console.log("  ✓ " + ly.local.padEnd(28) + n + " đối tượng");
    ok++;
  }catch(e){ console.log("  ✗ " + ly.local.padEnd(28) + "LỖI: " + e.message); fail++; }
}
console.log("\nXong: " + ok + " ok, " + fail + " lỗi.");
console.log('Giờ đổi MODE = "local" trong src/config.js rồi: npm run dev');
