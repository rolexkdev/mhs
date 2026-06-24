/**
 * geo.js — Toán học tọa độ THUẦN (không phụ thuộc Cesium / DOM).
 *
 * Tách riêng để dễ test và tái dùng: mọi phép tính lon/lat ↔ mét nằm ở đây.
 * Quy ước: điểm là mảng [lon, lat]; "polygon" là mảng các điểm.
 */

/** ~ số mét cho 1 độ vĩ tuyến (gần đúng, đủ cho phạm vi 1 KCN). */
export const METERS_PER_DEG_LAT = 111000;

/** Số mét cho 1 độ kinh tuyến tại vĩ độ `lat` (co lại theo cos(lat)). */
export function metersPerDegLon(lat) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

/** Trọng tâm hình học của polygon [[lon,lat], …] → [lon, lat]. */
export function centroid(polygon) {
  const n = polygon.length;
  return polygon.reduce(
    ([sx, sy], [x, y]) => [sx + x / n, sy + y / n],
    [0, 0]
  );
}

/** Khoảng cách mét giữa 2 điểm {lon,lat}. */
export function distanceMeters(a, b) {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const dx = (b.lon - a.lon) * 111320 * cosLat;
  const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Nội suy `n` điểm cách đều trên đoạn start→end (kể cả 2 đầu).
 * Trả về mảng [{lon,lat}, …].
 */
export function pointsAlongLine(start, end, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out.push({
      lon: start.lon + t * (end.lon - start.lon),
      lat: start.lat + t * (end.lat - start.lat),
    });
  }
  return out;
}

/**
 * Vòng tròn quanh tâm (lon,lat) bán kính `radiusM` mét → mảng [[lon,lat], …] kín.
 * Dùng cho hiệu ứng chọn quanh thực thể dạng điểm (cây, cột đèn).
 */
export function circleLonLat(lon, lat, radiusM, seg = 28) {
  const MLON = metersPerDegLon(lat), MLAT = METERS_PER_DEG_LAT;
  const out = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push([lon + (Math.cos(a) * radiusM) / MLON, lat + (Math.sin(a) * radiusM) / MLAT]);
  }
  return out;
}

/**
 * Hình chữ nhật từ 1 cạnh (p1→p2) + bề sâu = khoảng vuông góc từ con trỏ tới cạnh.
 * Tính trong hệ mét cục bộ để góc luôn vuông, ở mọi góc xoay của lô.
 * Trả về 4 đỉnh [[lon,lat], …].
 */
export function rectCorners(p1, p2, cur) {
  const MLON = metersPerDegLon(p1.lat);
  const MLAT = 110540;
  const bx = (p2.lon - p1.lon) * MLON,  by = (p2.lat - p1.lat) * MLAT;
  const cx = (cur.lon - p1.lon) * MLON, cy = (cur.lat - p1.lat) * MLAT;
  const elen = Math.hypot(bx, by) || 1;
  const px = -by / elen, py = bx / elen;   // pháp tuyến đơn vị của cạnh
  const d  = cx * px + cy * py;             // bề sâu có dấu
  const m2ll = (mx, my) => [p1.lon + mx / MLON, p1.lat + my / MLAT];
  return [m2ll(0, 0), m2ll(bx, by), m2ll(bx + px * d, by + py * d), m2ll(px * d, py * d)];
}
