/* =======================================================================================
   ===========================  CẤU HÌNH — CHỖ DUY NHẤT CẦN SỬA  =========================
   =======================================================================================

   MODE:
     "remote" = đọc thẳng từ server ArcGIS của org GISDNRC  (tiện, vẫn phụ thuộc họ)
     "local"  = đọc file .geojson trong public/data         (KHÔNG dính ArcGIS)
   ======================================================================================= */

export const MODE        = "local"; // "remote" | "local"
export const REMOTE_BASE  = "https://services9.arcgis.com/8C51lzNKJpqrSB4x/arcgis/rest/services";
export const LOCAL_BASE   = "/data";

/* Màu phân loại theo loại hình công ty */
export const CTY_COLORS = {
  "Công ty sản xuất":     "#1565c0",
  "Dệt may":              "#6a1b9a",
  "Sản xuất giấy":        "#2e7d32",
  "Cơ khí chính xác":     "#f57f17",
  "Chế biến thực phẩm":   "#c62828",
  "Nội thất":             "#4e342e",
  "Vật liệu xây dựng":    "#37474f",
  "Hạ tầng nước":         "#0288d1",
  "Bao bì":               "#558b2f",
  "Năng lượng":           "#ff6f00",
  "Hạ tầng KCN":          "#424242",
};

/* Nền mỗi page */
export const BASEMAP = { cty:"google-sat", hatang:"google-sat" };

/* Lớp dùng chung nhiều page */
const SHARED = [
  { title:"Đường vành đai KCN", local:"vanhdai.geojson", geom:"line", color:"#ff1744", weight:4 },
  { title:"Đường nội bộ",       local:"duong.geojson",   geom:"line", color:"#ffe082", weight:8 },
];

/* Khai báo lớp từng page */
export const LAYERS = {
  cty: [
    { title:"Công ty / Cơ sở", local:"cty.geojson", geom:"point", radius:14,
      categorical:{ field:"loaiHinh", colors:CTY_COLORS, default:"#9aa0a6" } },
    ...SHARED,
  ],
  hatang: [
    ...SHARED,
  ],
};

export const PAGES = [
  { key:"cty",    title:"Danh sách Công ty",   kind:"2d" },
  { key:"hatang", title:"Hạ tầng & Đường",     kind:"2d" },
  { key:"3d",     title:"3D Map",               kind:"3d" },
];

/* Camera / trung tâm bản đồ — KCN Minh Hưng Sikico, Bình Phước */
export const CAMERA_3D = { lon:106.5490, lat:11.5360, height:1100, heading:148, pitch:-38 };

/* ---- 3D (không dùng cho demo này) ---- */
export const SCENE_LAYERS = [];
export const LINE_3D      = "";
export const ESRI_TERRAIN = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/* Dựng URL query chuẩn để tải/đọc 1 lớp */
export function queryUrl(ly){
  return REMOTE_BASE + "/" + ly.service + "/FeatureServer/" + ly.layer +
         "/query?where=1=1&outFields=*&outSR=4326&f=geojson&resultRecordCount=10000";
}
export function sourceUrl(ly){
  return MODE === "local" ? (LOCAL_BASE + "/" + ly.local) : queryUrl(ly);
}
