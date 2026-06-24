/**
 * viewer.js — Khởi tạo & cấu hình Cesium Viewer (chỉ làm đúng việc dựng cảnh).
 *
 * Không biết gì về cây/nhà xưởng. Trả về 1 viewer đã:
 *   - tắt các widget thừa, bật shadow + log-depth (chống Z-fighting nhà cao)
 *   - requestRenderMode: chỉ vẽ lại khi cảnh đổi → đứng yên gần như 0 tải
 *   - thay click mặc định: click entity → InfoBox; click nền → bỏ chọn
 *     (bỏ qua khi đang có công cụ vẽ/sửa hoạt động — xem interactionLock)
 *   - nền OSM, ánh sáng định hướng, terrain ESRI, đặt camera ban đầu
 */
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { ESRI_TERRAIN, CAMERA_3D } from "../config.js";
import { isInteracting } from "./interactionLock.js";
import { resolveSelection } from "./selection.js";

/** Tạo viewer trong phần tử #cesium. @returns {Promise<Cesium.Viewer>} */
export async function createViewer() {
  const viewer = new Cesium.Viewer("cesium", {
    baseLayer: false, baseLayerPicker: false, geocoder: false,
    timeline: false, animation: false, sceneModePicker: false,
    navigationHelpButton: false, homeButton: false, infoBox: true,
    selectionIndicator: false,   // tắt khung xanh 2D mặc định — tự vẽ viền ôm hình (highlight.js)
    shadows: true,
    logarithmicDepthBuffer: true,
  });

  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;

  // requestRenderMode: cảnh đứng yên không tự vẽ. Mỗi khi thêm/xóa entity (đặt
  // cây/cột đèn/đường, preview khi vẽ, handle khi sửa…) phải xin vẽ lại 1 frame,
  // nếu không thực thể mới "mất tiêu" cho tới khi camera nhúc nhích.
  viewer.entities.collectionChanged.addEventListener(() => viewer.scene.requestRender());

  // Khi camera di chuyển (kéo/zoom), hạ độ phân giải cho mỗi frame nhẹ hơn →
  // mượt dù nhiều billboard; camera dừng thì trả về nét tối đa & vẽ lại 1 frame.
  const FULL_RES = viewer.scene.pixelRatio || 1;
  const MOVE_RES = FULL_RES * 0.55;
  viewer.camera.moveStart.addEventListener(() => { viewer.scene.pixelRatio = MOVE_RES; });
  viewer.camera.moveEnd.addEventListener(() => {
    viewer.scene.pixelRatio = FULL_RES;
    viewer.scene.requestRender();
  });

  // Click: entity → InfoBox; nền → bỏ chọn. Gác lại khi đang vẽ/sửa.
  viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  viewer.screenSpaceEventHandler.setInputAction((e) => {
    if (isInteracting()) return;
    const picked = viewer.scene.pick(e.position);
    if (picked?.id?._isHighlight) return;   // click trúng viền sáng → giữ nguyên lựa chọn
    viewer.selectedEntity = resolveSelection(picked);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Nền bản đồ OSM (globe dùng tile nên không cần chiếu sáng globe).
  viewer.imageryLayers.add(new Cesium.ImageryLayer(
    new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })
  ));
  viewer.scene.globe.enableLighting = false;

  // Ánh sáng định hướng cho khối nhà: chếch trên cao để tường sáng nhưng vẫn có khối.
  viewer.scene.light = new Cesium.DirectionalLight({
    direction: new Cesium.Cartesian3(0.35, 0.35, -0.87),
    intensity: 2.8,
  });

  try {
    viewer.terrainProvider =
      await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ESRI_TERRAIN);
  } catch (e) { console.warn("terrain", e.message); }

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(CAMERA_3D.lon, CAMERA_3D.lat, CAMERA_3D.height),
    orientation: {
      heading: Cesium.Math.toRadians(CAMERA_3D.heading),
      pitch:   Cesium.Math.toRadians(CAMERA_3D.pitch),
    },
  });

  return viewer;
}
