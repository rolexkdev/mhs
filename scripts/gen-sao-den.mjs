/**
 * gen-sao-den.mjs — Sinh dãy cây Sao Đen dọc 2 bên Đường Trung tâm.
 * Chạy: node scripts/gen-sao-den.mjs
 *
 * Cách làm:
 *   - Đọc ring "Đường Trung tâm" trong duong.geojson (đường bao khép kín của con đường).
 *   - Ring = 2 cạnh dài chạy song song: cạnh Đông (điểm 0..17) và cạnh Tây (điểm 18..38).
 *   - Resample mỗi cạnh theo SPACING mét → 1 hàng cây mỗi bên.
 *   - Inset nhẹ vào trong (về phía tim đường) để cây nằm ngay mép dải trồng.
 *   - Ghi kết quả vào trees[] của public/data/mhs_buildings.json (thay các cây Sao Đen cũ).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "public", "data");

// ── Tham số ───────────────────────────────────────────────────
const ROAD_NAME = "Đường Trung tâm";
const SPACING   = 9;    // m — khoảng cách giữa 2 cây trên cùng hàng
const INSET     = 2.5;  // m — dịch vào trong khỏi mép đường
const SPECIES   = "Cây Sao Đen";
const PREFIX    = "SD";

// ── Toạ độ ↔ mét phẳng (gốc tại tâm KCN ~11.51N) ──────────────
const LAT0 = 11.51;
const COSLAT = Math.cos(LAT0 * Math.PI / 180);
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320 * COSLAT;
const toXY  = ([lon, lat]) => [lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT];
const toLL  = ([x, y]) => [x / M_PER_DEG_LON, y / M_PER_DEG_LAT];
const dist  = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Resample polyline (mảng [x,y]) thành các điểm cách đều `step` mét.
function resample(xy, step) {
  const out = [xy[0]];
  let carry = 0;
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1], b = xy[i];
    let segLen = dist(a, b);
    if (segLen === 0) continue;
    const dir = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen];
    let d = step - carry;
    while (d <= segLen) {
      out.push([a[0] + dir[0] * d, a[1] + dir[1] * d]);
      d += step;
    }
    carry = segLen - (d - step);
  }
  return out;
}

// Điểm gần nhất trong tập `others` (để biết hướng "vào trong" + inset).
function nearest(p, others) {
  let best = others[0], bestD = Infinity;
  for (const q of others) {
    const dd = dist(p, q);
    if (dd < bestD) { bestD = dd; best = q; }
  }
  return best;
}

// Dịch điểm p về phía q một đoạn `m` mét.
function moveToward(p, q, m) {
  const d = dist(p, q);
  if (d === 0) return p;
  return [p[0] + (q[0] - p[0]) / d * m, p[1] + (q[1] - p[1]) / d * m];
}

// RNG seeded để kết quả lặp lại được.
function rand(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ── Đọc đường ─────────────────────────────────────────────────
const roadRaw = fs.readFileSync(path.join(DATA, "duong.geojson"), "utf8").replace(/^﻿/, "");
const road = JSON.parse(roadRaw);
const feat = road.features.find(f => f.properties?.tenDuong === ROAD_NAME);
if (!feat) throw new Error(`Không tìm thấy "${ROAD_NAME}" trong duong.geojson`);

const ring = feat.geometry.coordinates;          // 39 điểm, ring khép kín
const eastLL = ring.slice(0, 18);                // điểm 0..17  — cạnh Đông
const westLL = ring.slice(18);                   // điểm 18..38 — cạnh Tây

const eastXY = resample(eastLL.map(toXY), SPACING);
const westXY = resample(westLL.map(toXY), SPACING);

// Inset mỗi hàng về phía hàng đối diện.
const rowEast = eastXY.map(p => moveToward(p, nearest(p, westXY), INSET));
const rowWest = westXY.map(p => moveToward(p, nearest(p, eastXY), INSET));

// ── Tạo cây ───────────────────────────────────────────────────
let n = 0;
const trees = [];
for (const xy of [...rowEast, ...rowWest]) {
  const [lon, lat] = toLL(xy);
  n++;
  const r = rand(n);
  trees.push({
    soHieu:    `${PREFIX}-${String(n).padStart(3, "0")}`,
    tenLoai:   SPECIES,
    chieuCao:  Math.round((12 + r * 6) * 10) / 10,      // 12–18 m
    duongKinh: Math.round((30 + rand(n + 7) * 25)),     // 30–55 cm
    namTrong:  2016 + Math.floor(rand(n + 13) * 7),     // 2016–2022
    trangThai: rand(n + 19) > 0.18 ? "Tốt" : (rand(n + 23) > 0.5 ? "Cần chăm sóc" : "Bình thường"),
    lon: +lon.toFixed(7),
    lat: +lat.toFixed(7),
  });
}

// ── Ghi vào mhs_buildings.json ────────────────────────────────
const bldPath = path.join(DATA, "mhs_buildings.json");
const bldRaw = fs.readFileSync(bldPath, "utf8").replace(/^﻿/, "");
const bld = JSON.parse(bldRaw);
bld.trees = (bld.trees || []).filter(t => t.tenLoai !== SPECIES);  // bỏ Sao Đen cũ
bld.trees.push(...trees);
fs.writeFileSync(bldPath, JSON.stringify(bld, null, 2), "utf8");

console.log(`Đã sinh ${trees.length} cây Sao Đen (hàng Đông: ${rowEast.length}, hàng Tây: ${rowWest.length})`);
console.log(`→ ghi vào ${path.relative(path.join(__dirname, ".."), bldPath)} (tổng trees: ${bld.trees.length})`);
