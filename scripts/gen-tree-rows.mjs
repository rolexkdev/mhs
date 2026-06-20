/**
 * gen-tree-rows.mjs — Sinh số liệu cây thật theo mặt cắt trồng dọc đoạn thẳng phía
 * Bắc Đường Trung tâm: 2 hàng Sao Đen 2 bên + 1 hàng Cau Vua chạy giữa (dải phân cách).
 * Chạy: node scripts/gen-tree-rows.mjs
 * Ghi đè trees[] trong public/data/mhs_buildings.json (giữ nguyên buildings).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BP = path.join(__dirname, "..", "public", "data", "mhs_buildings.json");

// ── Tham số (chỉnh ở đây) ─────────────────────────────────────
const N = 24, spacing = 22, side = 16, startM = 40; // m
const A = [106.56048, 11.52988];  // đầu Bắc đường (lon,lat)
const B = [106.5614, 11.5174];    // hướng tới khúc cong (định hướng đoạn thẳng)

const MLON = 111320 * Math.cos(11.52 * Math.PI / 180), MLAT = 110540;
let dx = (B[0] - A[0]) * MLON, dy = (B[1] - A[1]) * MLAT;
const L = Math.hypot(dx, dy); dx /= L; dy /= L;
const px = -dy, py = dx;          // pháp tuyến (ngang đường)
const ax = A[0] * MLON, ay = A[1] * MLAT;
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

const trees = [];
let sd = 0, cau = 0;
const ll = (s, off) => [
  +((ax + dx * s + px * off) / MLON).toFixed(7),
  +((ay + dy * s + py * off) / MLAT).toFixed(7),
];
const status = (r) => r > 0.18 ? "Tốt" : (rnd(r * 99) > 0.5 ? "Cần chăm sóc" : "Bình thường");

for (let i = 0; i < N; i++) {
  const s = startM + i * spacing;
  // 2 hàng Sao Đen 2 bên
  for (const off of [-side, +side]) {
    const r = rnd(++sd);
    const [lon, lat] = ll(s, off);
    trees.push({ soHieu: `SD-${String(sd).padStart(3, "0")}`, tenLoai: "Cây Sao Đen",
      chieuCao: Math.round((16 + r * 3) * 10) / 10, duongKinh: Math.round(35 + rnd(sd + 7) * 20),
      namTrong: 2016 + Math.floor(rnd(sd + 13) * 7), trangThai: status(rnd(sd + 19)), lon, lat });
  }
  // 1 hàng Cau Vua giữa
  {
    const r = rnd(1000 + ++cau);
    const [lon, lat] = ll(s, 0);
    trees.push({ soHieu: `CAU-${String(cau).padStart(3, "0")}`, tenLoai: "Cây Cau Vua",
      chieuCao: Math.round((14 + r * 3) * 10) / 10, duongKinh: Math.round(25 + rnd(cau + 7) * 12),
      namTrong: 2018 + Math.floor(rnd(cau + 13) * 5), trangThai: status(rnd(cau + 19)), lon, lat });
  }
}

const j = JSON.parse(fs.readFileSync(BP, "utf8").replace(/^﻿/, ""));
j.trees = trees;
fs.writeFileSync(BP, JSON.stringify(j, null, 2), "utf8");
console.log(`Đã sinh ${trees.length} cây: ${sd} Sao Đen + ${cau} Cau Vua → ${path.relative(path.join(__dirname, ".."), BP)}`);
