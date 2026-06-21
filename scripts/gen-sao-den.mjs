/**
 * gen-sao-den.mjs — Sinh 3 hàng cây THẲNG chạy hết chiều dài Đường Trung tâm.
 * Chạy: node scripts/gen-sao-den.mjs
 *
 * Cách làm:
 *   - Lấy trục thẳng của đại lộ = đoạn thẳng pt0 → pt1 của ring "Đường Trung tâm"
 *     (đúng trục A→B mà map3d.js dùng để dựng cột đèn).
 *   - Đặt 3 hàng cây song song trục, mỗi hàng 1 offset cố định (THẲNG tăm tắp):
 *       hàng Đông  o = -9   (Cây Sao Đen)
 *       hàng Giữa  o = +7   (Cây Cau Vua)
 *       hàng Tây   o = +23  (Cây Sao Đen)
 *   - Rải cây cách đều SPACING mét, chạy từ đầu tới cuối đường (margin nhỏ 2 đầu).
 *   - Cùng s ở cả 3 hàng → mỗi trạm là 1 lát cắt ngang gọn gàng.
 *   - 2 hàng cột đèn map3d.js tự suy ra từ 2 hàng Sao Đen → cũng thẳng & dài hết đường.
 *   - Ghi đè toàn bộ Sao Đen + Cau Vua cũ trong public/data/mhs_buildings.json.
 *
 * Phép chiếu trùng KHÍT với renderLamps() trong map3d.js để cây rơi đúng offset.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "public", "data");

// ── Tham số ───────────────────────────────────────────────────
const ROAD_NAME = "Đường Trung tâm";
const SPACING   = 22;   // m — khoảng cách giữa 2 cây liên tiếp trên cùng hàng
const MARGIN    = 8;    // m — chừa 2 đầu đường
const ROWS = [
  { off: -9, species: "Cây Sao Đen", prefix: "SD"  }, // hàng Đông
  { off:  7, species: "Cây Cau Vua", prefix: "CAU" }, // hàng Giữa
  { off: 23, species: "Cây Sao Đen", prefix: "SD"  }, // hàng Tây
];

// ── Phép chiếu (KHÍT renderLamps trong map3d.js) ──────────────
const M = 111000, cosL = Math.cos(11.523 * Math.PI / 180);

// ── Đọc trục đường ────────────────────────────────────────────
const roadRaw = fs.readFileSync(path.join(DATA, "duong.geojson"), "utf8").replace(/^﻿/, "");
const road = JSON.parse(roadRaw);
const feat = road.features.find(f => f.properties?.tenDuong === ROAD_NAME);
if (!feat) throw new Error(`Không tìm thấy "${ROAD_NAME}" trong duong.geojson`);

const ring = feat.geometry.coordinates;
const A = ring[0], B = ring[1];                      // trục thẳng đại lộ
const dx = (B[0] - A[0]) * cosL, dy = B[1] - A[1], len = Math.hypot(dx, dy);
const ux = dx / len, uy = dy / len, px = -uy, py = ux; // dọc & vuông góc trục
const roadLen = len * M;                              // chiều dài đường (m)

// (s, off) tính theo mét → [lon, lat]
const place = (s, off) => {
  const ex = (ux * s + px * off) / M, ey = (uy * s + py * off) / M;
  return [A[0] + ex / cosL, A[1] + ey];
};

// RNG seeded để kết quả lặp lại được.
const rand = (seed) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// ── Sinh cây ──────────────────────────────────────────────────
const counters = {};                                 // prefix → số đếm
const trees = [];
for (let s = MARGIN; s <= roadLen - MARGIN + 1e-6; s += SPACING) {
  for (const { off, species, prefix } of ROWS) {
    const [lon, lat] = place(s, off);
    const n = (counters[prefix] = (counters[prefix] || 0) + 1);
    const r = rand(trees.length + 1);
    trees.push({
      soHieu:    `${prefix}-${String(n).padStart(3, "0")}`,
      tenLoai:   species,
      chieuCao:  Math.round((12 + r * 6) * 10) / 10,                 // 12–18 m
      duongKinh: Math.round(30 + rand(trees.length + 7) * 25),       // 30–55 cm
      namTrong:  2016 + Math.floor(rand(trees.length + 13) * 7),     // 2016–2022
      trangThai: rand(trees.length + 19) > 0.18 ? "Tốt"
               : (rand(trees.length + 23) > 0.5 ? "Cần chăm sóc" : "Bình thường"),
      lon: +lon.toFixed(7),
      lat: +lat.toFixed(7),
    });
  }
}

// ── Ghi vào mhs_buildings.json ────────────────────────────────
const bldPath = path.join(DATA, "mhs_buildings.json");
const bld = JSON.parse(fs.readFileSync(bldPath, "utf8").replace(/^﻿/, ""));
const keep = new Set(["Cây Sao Đen", "Cây Cau Vua"]);
bld.trees = (bld.trees || []).filter(t => !keep.has(t.tenLoai));    // bỏ Sao Đen + Cau Vua cũ
bld.trees.push(...trees);
fs.writeFileSync(bldPath, JSON.stringify(bld, null, 2), "utf8");

const nSao = trees.filter(t => t.tenLoai === "Cây Sao Đen").length;
const nCau = trees.filter(t => t.tenLoai === "Cây Cau Vua").length;
const stations = Math.round((roadLen - 2 * MARGIN) / SPACING) + 1;
console.log(`Đường dài ${roadLen.toFixed(0)} m → ${stations} trạm × 3 hàng.`);
console.log(`Sinh ${trees.length} cây (Sao Đen ${nSao}, Cau Vua ${nCau}).`);
console.log(`→ ghi vào ${path.relative(path.join(__dirname, ".."), bldPath)} (tổng trees: ${bld.trees.length})`);
