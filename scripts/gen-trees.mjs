/**
 * gen-trees.mjs — Tạo file .glb cho từng loại cây, không cần browser API.
 * Chạy: node scripts/gen-trees.mjs
 * Output: public/models/tree-{prefix}.glb
 *
 * Cấu trúc mỗi cây (chuẩn hóa về chiều cao 1m, Cesium scale theo chieuCao thực):
 *   Thân (cylinder): y = 0 → 0.28
 *   Tán dưới (cone): đỉnh tại y = 0.72, bán kính 0.44
 *   Tán giữa (cone): đỉnh tại y = 0.88, bán kính 0.32
 *   Chóp   (cone):   đỉnh tại y = 1.10, bán kính 0.15
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPECIES = [
  { prefix: "kh",  canopy: [0.910, 0.439, 0.616], trunk: [0.365, 0.251, 0.216] },
  { prefix: "tbv", canopy: [0.788, 0.659, 0.000], trunk: [0.475, 0.333, 0.298] },
  { prefix: "cd",  canopy: [0.231, 0.420, 0.231], trunk: [0.243, 0.153, 0.137] },
  { prefix: "bl",  canopy: [0.710, 0.482, 0.710], trunk: [0.416, 0.106, 0.565] },
  { prefix: "cv",  canopy: [0.800, 0.333, 0.200], trunk: [0.749, 0.212, 0.047] },
  { prefix: "bdl", canopy: [0.353, 0.608, 0.369], trunk: [0.106, 0.369, 0.125] },
  { prefix: "os",  canopy: [0.851, 0.471, 0.600], trunk: [0.533, 0.055, 0.310] },
  { prefix: "sd",  canopy: [0.106, 0.337, 0.176], trunk: [0.302, 0.200, 0.129] }, // Sao Đen: tán xanh đậm
];

// ── Geometry helpers ─────────────────────────────────────────

/** Hình trụ thuôn (tapered cylinder). Y: 0 → height. */
function cylinder(rb, rt, height, segs) {
  const pos = [], nor = [], idx = [];
  const slope = (rb - rt) / height;
  const lenN = Math.sqrt(1 + slope * slope);

  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pos.push(c * rb, 0,      s * rb);
    pos.push(c * rt, height, s * rt);
    // outward-slanted normal for tapered shape
    nor.push(c / lenN, slope / lenN, s / lenN);
    nor.push(c / lenN, slope / lenN, s / lenN);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }

  // Bottom cap
  let ci = pos.length / 3;
  pos.push(0, 0, 0); nor.push(0, -1, 0);
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    pos.push(Math.cos(t) * rb, 0, Math.sin(t) * rb);
    nor.push(0, -1, 0);
  }
  for (let i = 0; i < segs; i++) {
    idx.push(ci, ci + 1 + i, ci + 1 + (i + 1) % segs);
  }

  // Top cap
  ci = pos.length / 3;
  pos.push(0, height, 0); nor.push(0, 1, 0);
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    pos.push(Math.cos(t) * rt, height, Math.sin(t) * rt);
    nor.push(0, 1, 0);
  }
  for (let i = 0; i < segs; i++) {
    idx.push(ci, ci + 1 + (i + 1) % segs, ci + 1 + i);
  }

  return { pos, nor, idx };
}

/** Hình nón. Đỉnh tại y = height, đáy tại y = 0. */
function cone(r, height, segs) {
  const pos = [], nor = [], idx = [];
  const lenN = Math.sqrt(r * r + height * height);
  const ny = r / lenN; // upward component

  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * Math.PI * 2;
    const t1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0);
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const cm = Math.cos((t0 + t1) / 2), sm = Math.sin((t0 + t1) / 2);

    const base = pos.length / 3;
    // Apex (unique per face for correct lighting)
    pos.push(0, height, 0);
    nor.push(cm * (height / lenN), ny, sm * (height / lenN));
    // Base vert 0
    pos.push(c0 * r, 0, s0 * r);
    nor.push(c0 * (height / lenN), ny, s0 * (height / lenN));
    // Base vert 1
    pos.push(c1 * r, 0, s1 * r);
    nor.push(c1 * (height / lenN), ny, s1 * (height / lenN));

    idx.push(base, base + 1, base + 2);
  }

  // Bottom cap
  let ci = pos.length / 3;
  pos.push(0, 0, 0); nor.push(0, -1, 0);
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    pos.push(Math.cos(t) * r, 0, Math.sin(t) * r);
    nor.push(0, -1, 0);
  }
  for (let i = 0; i < segs; i++) {
    idx.push(ci, ci + 1 + (i + 1) % segs, ci + 1 + i);
  }

  return { pos, nor, idx };
}

// ── GLB builder ───────────────────────────────────────────────

/**
 * Đóng gói nhiều mesh + materials thành 1 file GLB.
 * @param {Array<{geo, tx, ty, tz, matIdx}>} parts
 * @param {Array<[r,g,b]>} colors  - màu theo index material
 */
function buildGLB(parts, colors) {
  // Binary bin: [positions0, normals0, indices0, positions1, ...]
  const binParts = [];
  let binOffset = 0;

  const gltfBufferViews = [];
  const gltfAccessors = [];
  const gltfMeshes = [];
  const gltfNodes = [];

  function alignTo4() {
    const rem = binOffset % 4;
    if (rem !== 0) {
      const pad = new Uint8Array(4 - rem);
      binParts.push(pad);
      binOffset += pad.byteLength;
    }
  }

  function addBufferView(typedArray, target) {
    binParts.push(typedArray);
    const bv = { buffer: 0, byteOffset: binOffset, byteLength: typedArray.byteLength, target };
    gltfBufferViews.push(bv);
    binOffset += typedArray.byteLength;
    return gltfBufferViews.length - 1;
  }

  for (const { geo, tx = 0, ty = 0, tz = 0, matIdx } of parts) {
    const nVerts = geo.pos.length / 3;
    const posArr = new Float32Array(geo.pos);
    const norArr = new Float32Array(geo.nor);
    const maxIdx = Math.max(...geo.idx);
    const idxArr = maxIdx < 65536 ? new Uint16Array(geo.idx) : new Uint32Array(geo.idx);
    const idxCompType = maxIdx < 65536 ? 5123 : 5125;

    // POSITION
    const pvIdx = addBufferView(posArr, 34962);
    let minP = [Infinity, Infinity, Infinity], maxP = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nVerts; i++) {
      for (let j = 0; j < 3; j++) {
        minP[j] = Math.min(minP[j], posArr[i * 3 + j]);
        maxP[j] = Math.max(maxP[j], posArr[i * 3 + j]);
      }
    }
    const posAcc = gltfAccessors.length;
    gltfAccessors.push({ bufferView: pvIdx, byteOffset: 0, componentType: 5126, count: nVerts, type: "VEC3",
      min: minP.map(v => Math.round(v * 1e5) / 1e5),
      max: maxP.map(v => Math.round(v * 1e5) / 1e5) });

    // NORMAL
    const nvIdx = addBufferView(norArr, 34962);
    const norAcc = gltfAccessors.length;
    gltfAccessors.push({ bufferView: nvIdx, byteOffset: 0, componentType: 5126, count: nVerts, type: "VEC3" });

    // INDEX (must be 4-byte aligned)
    alignTo4();
    const ivIdx = addBufferView(idxArr, 34963);
    const idxAcc = gltfAccessors.length;
    gltfAccessors.push({ bufferView: ivIdx, byteOffset: 0, componentType: idxCompType, count: geo.idx.length, type: "SCALAR" });

    const meshIdx = gltfMeshes.length;
    gltfMeshes.push({ primitives: [{ attributes: { POSITION: posAcc, NORMAL: norAcc }, indices: idxAcc, material: matIdx, mode: 4 }] });

    const node = { mesh: meshIdx };
    if (tx !== 0 || ty !== 0 || tz !== 0) node.translation = [tx, ty, tz];
    gltfNodes.push(node);
  }

  // Pad BIN chunk to 4-byte boundary
  alignTo4();

  // Combine BIN
  const binTotal = binOffset;
  const binBuffer = Buffer.alloc(binTotal);
  let off = 0;
  for (const p of binParts) {
    Buffer.from(p.buffer, p.byteOffset, p.byteLength).copy(binBuffer, off);
    off += p.byteLength;
  }

  // glTF JSON
  const gltfJSON = {
    asset: { version: "2.0", generator: "gen-trees.mjs" },
    scene: 0,
    scenes: [{ nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    materials: colors.map(([r, g, b]) => ({
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, 1.0],
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
    })),
    accessors: gltfAccessors,
    bufferViews: gltfBufferViews,
    buffers: [{ byteLength: binTotal }],
  };

  const jsonStr = JSON.stringify(gltfJSON);
  const jsonBytes = Buffer.from(jsonStr, "utf8");
  // Pad JSON to 4-byte boundary with spaces
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

  // GLB header + chunks
  const jsonChunkLen = jsonChunk.byteLength;
  const binChunkLen  = binBuffer.byteLength;
  const totalLen = 12 + 8 + jsonChunkLen + (binChunkLen > 0 ? 8 + binChunkLen : 0);

  const out = Buffer.alloc(totalLen);
  let o = 0;

  // Header
  out.writeUInt32LE(0x46546C67, o); o += 4; // magic "glTF"
  out.writeUInt32LE(2,          o); o += 4; // version
  out.writeUInt32LE(totalLen,   o); o += 4;

  // JSON chunk
  out.writeUInt32LE(jsonChunkLen,   o); o += 4;
  out.writeUInt32LE(0x4E4F534A, o); o += 4; // "JSON"
  jsonChunk.copy(out, o); o += jsonChunkLen;

  // BIN chunk
  if (binChunkLen > 0) {
    out.writeUInt32LE(binChunkLen,    o); o += 4;
    out.writeUInt32LE(0x004E4942, o); o += 4; // "BIN\0"
    binBuffer.copy(out, o);
  }

  return out;
}

// ── Tree assembler ────────────────────────────────────────────

function buildTree(canopyColor, trunkColor) {
  // Material 0 = trunk, 1 = canopy
  const SEGS = 8;
  const parts = [
    { geo: cylinder(0.09, 0.055, 0.28, SEGS), tx: 0, ty: 0,    tz: 0, matIdx: 0 }, // thân
    { geo: cone(0.44, 0.44, SEGS),             tx: 0, ty: 0.28, tz: 0, matIdx: 1 }, // tán dưới
    { geo: cone(0.32, 0.36, SEGS),             tx: 0, ty: 0.55, tz: 0, matIdx: 1 }, // tán giữa
    { geo: cone(0.15, 0.22, SEGS),             tx: 0, ty: 0.80, tz: 0, matIdx: 1 }, // chóp đỉnh
  ];
  return buildGLB(parts, [trunkColor, canopyColor]);
}

/** Sao Đen: thân cao thẳng, tán hẹp dạng cột (columnar) — đặc trưng cây sao đen. */
function buildSaoDen(canopyColor, trunkColor) {
  const SEGS = 8;
  const parts = [
    { geo: cylinder(0.06, 0.04, 0.45, SEGS), tx: 0, ty: 0,    tz: 0, matIdx: 0 }, // thân cao
    { geo: cone(0.26, 0.40, SEGS),            tx: 0, ty: 0.42, tz: 0, matIdx: 1 }, // tán dưới hẹp
    { geo: cone(0.20, 0.34, SEGS),            tx: 0, ty: 0.66, tz: 0, matIdx: 1 }, // tán giữa
    { geo: cone(0.11, 0.26, SEGS),            tx: 0, ty: 0.88, tz: 0, matIdx: 1 }, // chóp nhọn
  ];
  return buildGLB(parts, [trunkColor, canopyColor]);
}

// ── Main ──────────────────────────────────────────────────────

const outDir = path.join(__dirname, "..", "public", "models");
fs.mkdirSync(outDir, { recursive: true });

for (const sp of SPECIES) {
  const glb = sp.prefix === "sd"
    ? buildSaoDen(sp.canopy, sp.trunk)
    : buildTree(sp.canopy, sp.trunk);
  const outPath = path.join(outDir, `tree-${sp.prefix}.glb`);
  fs.writeFileSync(outPath, glb);
  console.log(`  ✓  tree-${sp.prefix}.glb  (${(glb.byteLength / 1024).toFixed(1)} KB)`);
}

console.log(`\nĐã tạo ${SPECIES.length} file GLB → public/models/`);
