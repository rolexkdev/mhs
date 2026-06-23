/**
 * building3d.js — Step 1: Terrain-aware building primitives
 *
 * Core insight:
 *   - Every vertex is in ECEF (world space). Camera transforms don't move vertices,
 *     only the view changes → buildings always stick to their geographic position.
 *   - WallGeometry generates per-face normals. Cesium's sun lighting then shades
 *     each wall face differently → looks solid and 3D without any custom shader.
 *   - We sample terrain height at the building centroid so the base sits on the
 *     actual ground, not at sea level.
 */

import * as Cesium from "cesium";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Geographic centroid of a polygon [[lon,lat], …] */
function centroid(polygon) {
  const n = polygon.length;
  return polygon.reduce(
    ([sx, sy], [x, y]) => [sx + x / n, sy + y / n],
    [0, 0]
  );
}

/**
 * Sample the terrain height (metres above ellipsoid) at a lon/lat point.
 * Falls back to 0 if there is no real terrain provider loaded yet.
 */
export async function sampleGroundHeight(terrainProvider, lon, lat) {
  if (
    !terrainProvider ||
    terrainProvider instanceof Cesium.EllipsoidTerrainProvider
  ) {
    return 0;
  }
  try {
    const positions = [Cesium.Cartographic.fromDegrees(lon, lat)];
    const results = await Cesium.sampleTerrainMostDetailed(
      terrainProvider,
      positions
    );
    const h = results[0].height ?? 0;
    console.debug(`[building3d] terrain @ ${lon.toFixed(4)},${lat.toFixed(4)} = ${h.toFixed(1)}m`);
    return h;
  } catch (err) {
    console.warn("[building3d] terrain sample failed, using 0m:", err.message);
    return 0;
  }
}

// ─── Core builder ─────────────────────────────────────────────────────────────

/**
 * Add one 3D building to the Cesium scene.
 *
 * @param {Cesium.Viewer} viewer
 * @param {object} opts
 *   polygon    [[lon,lat],…]  footprint corners (open or closed ring)
 *   height     number         building height in metres
 *   wallColor  Cesium.Color   colour for all wall faces
 *   roofColor  Cesium.Color   colour for the roof polygon
 *   groundH    number|null    pre-sampled ground height; if null, samples now
 *
 * @returns {Promise<{wallPrim, roofPrim, groundH}>}
 *   primitives you can remove from scene.primitives when you need to clean up
 */
export async function addBuilding3D(viewer, {
  polygon,
  height,
  wallColor,
  roofColor,
  groundH = null,
  id = undefined, // gắn vào GeometryInstance để scene.pick nhận diện được khối khi click
}) {
  const scene = viewer.scene;

  // 1. Ground height: where the building base sits
  if (groundH === null) {
    const [cLon, cLat] = centroid(polygon);
    groundH = await sampleGroundHeight(scene.terrainProvider, cLon, cLat);
  }

  const baseH = groundH;
  const topH  = groundH + height;

  // 2. WallGeometry needs a closed ring
  const ring = [...polygon];
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push(ring[0]);

  // 3. Walls — WallGeometry produces per-face normals so each wall is lit differently.
  //    This is what makes the building look solid rather than flat.
  const wallPrim = scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        id,
        geometry: new Cesium.WallGeometry({
          positions:      ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, baseH)),
          maximumHeights: ring.map(() => topH),
          minimumHeights: ring.map(() => baseH),
          vertexFormat:   Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(wallColor),
        },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({
        flat:        false, // enable Cesium's directional lighting model
        faceForward: true,
      }),
      shadows: Cesium.ShadowMode.ENABLED,
    })
  );

  // 4. Roof — flat polygon at top height
  const roofPrim = scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        id,
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(
            polygon.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, topH))
          ),
          perPositionHeight: true,
          vertexFormat:      Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(roofColor),
        },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({
        flat:        false,
        faceForward: true,
      }),
      shadows: Cesium.ShadowMode.ENABLED,
    })
  );

  return { wallPrim, roofPrim, groundH };
}

/**
 * Remove a building returned by addBuilding3D().
 */
export function removeBuilding3D(scene, building) {
  if (!building) return;
  if (building.wallPrim) scene.primitives.remove(building.wallPrim);
  if (building.roofPrim) scene.primitives.remove(building.roofPrim);
}
