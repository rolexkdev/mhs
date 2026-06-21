/**
 * gen-sao-den.mjs — Sinh 3 hàng cây + 2 hàng cột đèn chạy LIỀN MẠCH theo Đường Trung tâm.
 * Chạy: node scripts/gen-sao-den.mjs
 *
 * Cách làm:
 *   - Dựng TIM ĐƯỜNG (centerline) = trung tuyến của 2 mép ring "Đường Trung tâm",
 *     resample mịn + làm trơn → đường cong liền mạch chạy hết đường (kể cả khúc cong xuống Tây Nam).
 *   - Rải cây cách đều SPACING mét dọc tim đường; mỗi trạm đặt 3 cây theo pháp tuyến cục bộ:
 *       off = -16 Sao Đen | off = 0 Cau Vua | off = +16 Sao Đen
 *     → 3 hàng song song, bám sát đường, tự uốn theo khúc cong (nối liền hàng cũ).
 *   - Cột đèn: cứ 3 trạm 1 cột mỗi bên, đặt lệch ±LAMP_OFF (vào trong so với hàng Sao Đen).
 *   - Ghi cây vào trees[] và cột đèn vào lamps[] của public/data/mhs_buildings.json.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "public", "data");

// ── Tham số ───────────────────────────────────────────────────
const ROAD_NAME  = "Đường Trung tâm";
const SPACING    = 22;   // m — khoảng cách giữa 2 trạm cây liên tiếp
const MARGIN     = 8;    // m — chừa 2 đầu đường
const ROW_OFF    = 16;   // m — khoảng cách từ tim đến mỗi hàng Sao Đen
const LAMP_OFF   = 12;   // m — khoảng cách từ tim đến mỗi hàng cột đèn (lệch vào trong)
const LAMP_EVERY = 3;    // 3 trạm cây → 1 cột đèn mỗi bên

// ── Toạ độ phẳng (mét) quanh điểm gốc ─────────────────────────
const M = 111000, cosL = Math.cos(11.523 * Math.PI / 180);

// ── Đọc ring đường ────────────────────────────────────────────
const road = JSON.parse(fs.readFileSync(path.join(DATA, "duong.geojson"), "utf8").replace(/^﻿/, ""));
const feat = road.features.find(f => f.properties?.tenDuong === ROAD_NAME);
if (!feat) throw new Error(`Không tìm thấy "${ROAD_NAME}" trong duong.geojson`);
const ring = feat.geometry.coordinates;
const O = ring[0];                                   // gốc toạ độ phẳng
const toXY = ([lon, lat]) => [(lon - O[0]) * cosL * M, (lat - O[1]) * M];
const toLL = ([x, y]) => [O[0] + x / (cosL * M), O[1] + y / M];
const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Resample polyline theo N điểm cách đều (tỉ lệ chiều dài).
function resampleN(xy, N) {
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + dd(xy[i - 1], xy[i]));
  const L = cum[cum.length - 1], out = [];
  for (let k = 0; k < N; k++) {
    const t = L * k / (N - 1);
    let i = 1; while (i < cum.length && cum[i] < t) i++;
    const a = xy[i - 1], b = xy[i], seg = (cum[i] - cum[i - 1]) || 1, f = (t - cum[i - 1]) / seg;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

// Làm trơn bằng trung bình trượt (giữ 2 đầu).
function smooth(xy, win) {
  const h = (win - 1) / 2, out = [];
  for (let i = 0; i < xy.length; i++) {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(xy.length - 1, i + h); j++) { sx += xy[j][0]; sy += xy[j][1]; n++; }
    out.push([sx / n, sy / n]);
  }
  return out;
}

// ── Tim đường = trung tuyến 2 mép ───────────────────────────
const east = ring.slice(0, 19).map(toXY);            // mép Đông (pt 0..18)
const west = ring.slice(18).reverse().map(toXY);     // mép Tây (pt 38..18) — cùng chiều với Đông
const NF = 600;
const eR = resampleN(east, NF), wR = resampleN(west, NF);
let center = eR.map((p, i) => [(p[0] + wR[i][0]) / 2, (p[1] + wR[i][1]) / 2]);
center = smooth(center, 31);

// Sampler theo chiều dài cung: at(s) → { p:[x,y], n:[nx,ny] } (n = pháp tuyến trái).
const cum = [0];
for (let i = 1; i < center.length; i++) cum.push(cum[i - 1] + dd(center[i - 1], center[i]));
const L = cum[cum.length - 1];
function at(s) {
  s = Math.max(0, Math.min(L, s));
  let i = 1; while (i < cum.length && cum[i] < s) i++;
  const a = center[i - 1], b = center[i], seg = (cum[i] - cum[i - 1]) || 1, f = (s - cum[i - 1]) / seg;
  const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;          // tiếp tuyến đơn vị
  return { p, n: [-ty, tx] };                                        // pháp tuyến trái (+ = phía Tây)
}

// RNG seeded để kết quả lặp lại được.
const rand = (seed) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// ── Sinh cây 3 hàng ───────────────────────────────────────────
const ROWS = [
  { off: -ROW_OFF, species: "Cây Sao Đen", prefix: "SD"  },
  { off:        0, species: "Cây Cau Vua", prefix: "CAU" },
  { off:  ROW_OFF, species: "Cây Sao Đen", prefix: "SD"  },
];
const counters = {};
const trees = [];
const stations = [];
for (let s = MARGIN; s <= L - MARGIN + 1e-6; s += SPACING) stations.push(at(s));
for (const st of stations) {
  for (const { off, species, prefix } of ROWS) {
    const [lon, lat] = toLL([st.p[0] + st.n[0] * off, st.p[1] + st.n[1] * off]);
    const n = (counters[prefix] = (counters[prefix] || 0) + 1);
    const r = rand(trees.length + 1);
    trees.push({
      soHieu:    `${prefix}-${String(n).padStart(3, "0")}`,
      tenLoai:   species,
      chieuCao:  Math.round((12 + r * 6) * 10) / 10,
      duongKinh: Math.round(30 + rand(trees.length + 7) * 25),
      namTrong:  2016 + Math.floor(rand(trees.length + 13) * 7),
      trangThai: rand(trees.length + 19) > 0.18 ? "Tốt"
               : (rand(trees.length + 23) > 0.5 ? "Cần chăm sóc" : "Bình thường"),
      lon: +lon.toFixed(7),
      lat: +lat.toFixed(7),
    });
  }
}

// ── Sinh cột đèn 2 hàng (giữa các trạm, cứ LAMP_EVERY trạm 1 cột) ─
const lamps = [];
for (let i = 0; i + 1 < stations.length; i += LAMP_EVERY) {
  const sMid = MARGIN + (i + 0.5) * SPACING;
  const st = at(sMid);
  for (const off of [-LAMP_OFF, LAMP_OFF]) {
    const [lon, lat] = toLL([st.p[0] + st.n[0] * off, st.p[1] + st.n[1] * off]);
    lamps.push({ lon: +lon.toFixed(7), lat: +lat.toFixed(7) });
  }
}

// ── Ghi vào mhs_buildings.json ────────────────────────────────
const bldPath = path.join(DATA, "mhs_buildings.json");
const bld = JSON.parse(fs.readFileSync(bldPath, "utf8").replace(/^﻿/, ""));
const keep = new Set(["Cây Sao Đen", "Cây Cau Vua"]);
bld.trees = (bld.trees || []).filter(t => !keep.has(t.tenLoai));
bld.trees.push(...trees);
bld.lamps = lamps;
fs.writeFileSync(bldPath, JSON.stringify(bld, null, 2), "utf8");

const nSao = trees.filter(t => t.tenLoai === "Cây Sao Đen").length;
const nCau = trees.filter(t => t.tenLoai === "Cây Cau Vua").length;
console.log(`Tim đường dài ${L.toFixed(0)} m → ${stations.length} trạm × 3 hàng.`);
console.log(`Sinh ${trees.length} cây (Sao Đen ${nSao}, Cau Vua ${nCau}) + ${lamps.length} cột đèn.`);
console.log(`→ ghi vào ${path.relative(path.join(__dirname, ".."), bldPath)} (tổng trees: ${bld.trees.length})`);
