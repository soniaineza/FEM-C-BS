'use dom';

import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import type { DOMProps } from 'expo/dom';

import type { MapCar, MapMarker, MapRoute, MapScene, LngLat } from './map-types';
import { KIGALI_CENTER, SERVICE_AREA_BOUNDS, SERVICE_AREA_MIN_ZOOM } from './map-types';
import { CAR_LENGTH_M, createCar, createLights, loadCarModels } from './carModel';
import { Track, distanceM, lerpAngle, projectOnRoute } from './trackInterpolation';

// The map engine: MapLibre GL JS over OpenFreeMap's OpenStreetMap vector
// tiles, with 3D buildings and three.js 3D cars in a custom layer that shares
// the map's depth buffer (cars disappear behind buildings correctly).
//
// A DOM component: on iOS/Android it runs inside a WebView with the scripts
// bundled into the app (no CDN); on web it renders directly. The app drives
// it with one serialisable `scene` prop; it reports back through top-level
// async callbacks (the only kind a DOM component can receive).

// Used until the app passes the style chosen by the server (stores/useMapConfigStore.ts).
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const CAR_PX = 30; // on-screen car length at city zooms
const ASSIGNED_CAR_PX = 38;
const FOLLOW_EVERY_MS = 1200;
const USER_IDLE_MS = 8000; // after panning, wait this long before re-following
const REMOVE_AFTER_MS = 4000; // a car missing from updates fades out after this
const EMPTY_FC = { type: 'FeatureCollection', features: [] } as const;
const X_AXIS = new THREE.Vector3(1, 0, 0);
/** How long the base style may take before the map reports it as failed. */
const STYLE_TIMEOUT_MS = 15000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface Props {
  scene: MapScene;
  /** MapLibre style to draw; chosen by the server (GET /api/maps/config). */
  styleUrl?: string;
  onReady?: () => Promise<void>;
  onError?: (message: string) => Promise<void>;
  /** Progress inside the WebView, so a failure can say how far it got. */
  onStage?: (stage: string) => Promise<void>;
  onPress?: (latitude: number, longitude: number) => Promise<void>;
  onCenterChanged?: (latitude: number, longitude: number) => Promise<void>;
  onUserGesture?: () => Promise<void>;
  dom?: DOMProps;
}

interface CarEntry {
  track: Track;
  group: THREE.Group;
  vehicleClass: string | null;
  assigned: boolean;
  color: string | null;
  heading: number;
  wheelAngle: number;
  /** Drawn size relative to life (cars are enlarged when zoomed out). */
  scale: number;
  bornAt: number;
  lastSeenAt: number;
  lat: number;
  lng: number;
}

class CarLayer implements maplibregl.CustomLayerInterface {
  id = 'kimu-cars';
  type = 'custom' as const;
  renderingMode = '3d' as const;
  cars = new Map<string, CarEntry>();
  serverOffsetMs = 0;
  private map!: maplibregl.Map;
  private renderer!: THREE.WebGLRenderer;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private nextFrame: ReturnType<typeof setTimeout> | null = null;
  // Scratch objects reused every frame. render() runs ~30 times a second and
  // allocated two Matrix4 per car plus two more for the camera each time, so
  // a busy map churned hundreds of short-lived objects a second and the GC
  // pauses showed up as stutter on cheaper phones.
  private readonly scratchScale = new THREE.Matrix4();
  private readonly scratchTranslate = new THREE.Matrix4();
  private readonly scratchProjection = new THREE.Matrix4();
  private readonly scratchOrigin = new THREE.Matrix4();
  private readonly scratchRoll = new THREE.Quaternion();

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    for (const light of createLights()) this.scene.add(light);
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    // Cars start as the procedural fallback; swap in the glTF models once
    // they're decoded (a few hundred ms, from the bundle).
    loadCarModels().then(() => this.rebuildCars());
  }

  private rebuildCars() {
    for (const entry of this.cars.values()) {
      this.scene.remove(entry.group);
      entry.group = createCar(entry.vehicleClass, entry.assigned, entry.color);
      this.scene.add(entry.group);
    }
    this.map?.triggerRepaint();
  }

  onRemove() {
    if (this.nextFrame) clearTimeout(this.nextFrame);
    this.renderer?.dispose();
  }

  /** Merges a scene's car list into the animated set. */
  update(cars: MapCar[], now: number) {
    const seen = new Set<string>();
    for (const car of cars) {
      seen.add(car.id);
      let entry = this.cars.get(car.id);
      const cls = car.vehicleClass ?? null;
      const assigned = Boolean(car.assigned);
      const color = car.color ?? null;
      if (entry && (entry.vehicleClass !== cls || entry.assigned !== assigned || entry.color !== color)) {
        this.scene.remove(entry.group);
        entry.group = createCar(cls, assigned, color);
        entry.vehicleClass = cls;
        entry.assigned = assigned;
        entry.color = color;
        this.scene.add(entry.group);
      }
      if (!entry) {
        const group = createCar(cls, assigned, color);
        group.traverse((o) => {
          o.frustumCulled = false; // positions are in mercator units; skip three's culling
        });
        entry = {
          track: new Track(),
          group,
          vehicleClass: cls,
          assigned,
          color,
          heading: car.heading ?? 0,
          wheelAngle: 0,
          scale: 1,
          bornAt: now,
          lastSeenAt: now,
          lat: car.latitude,
          lng: car.longitude,
        };
        this.cars.set(car.id, entry);
        this.scene.add(group);
      }
      entry.lastSeenAt = now;
      const serverNow = now + this.serverOffsetMs;
      const samples = car.trail && car.trail.length
        ? car.trail
        : [[serverNow, car.latitude, car.longitude, car.heading] as [number, number, number, number | null]];
      entry.track.add(samples, serverNow);
    }
    for (const [id, entry] of this.cars) {
      if (!seen.has(id) && !entry.assigned && now - entry.lastSeenAt > REMOVE_AFTER_MS) {
        this.scene.remove(entry.group);
        this.cars.delete(id);
      }
    }
    this.map?.triggerRepaint();
  }

  position(id: string): LngLat | null {
    const e = this.cars.get(id);
    return e ? { latitude: e.lat, longitude: e.lng } : null;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: maplibregl.CustomRenderMethodInput) {
    const now = Date.now();
    const serverNow = now + this.serverOffsetMs;
    const zoom = this.map.getZoom();
    let moving = false;
    let hasAssigned = false;
    // Relative-to-centre rendering: the GPU works in 32-bit floats, and an
    // absolute Web-Mercator position (~0.58) only resolves to ~1.4 m there —
    // cars tore into shards from zoom ~19. Cars are placed relative to an
    // origin at the map centre, and the origin is folded into the camera
    // matrix here in 64-bit JS, so the GPU only sees small, precise numbers.
    const origin = maplibregl.MercatorCoordinate.fromLngLat(this.map.getCenter(), 0);

    for (const entry of this.cars.values()) {
      const st = entry.track.sample(entry.track.renderTime(serverNow));
      if (!st) continue;
      moving = moving || st.moving;
      hasAssigned = hasAssigned || entry.assigned;
      // Turn the wheels by the distance covered (scaled with the drawn size).
      const wheels = entry.group.userData.wheels as THREE.Object3D[] | undefined;
      if (wheels?.length && (st.lat !== entry.lat || st.lng !== entry.lng)) {
        const movedM = distanceM(entry.lat, entry.lng, st.lat, st.lng);
        entry.wheelAngle = (entry.wheelAngle + movedM / (entry.group.userData.wheelRadiusM * entry.scale)) % (Math.PI * 2);
        const roll = this.scratchRoll.setFromAxisAngle(X_AXIS, entry.wheelAngle);
        for (const w of wheels) w.quaternion.copy(roll).multiply(w.userData.baseQuaternion);
      }
      entry.lat = st.lat;
      entry.lng = st.lng;
      // Ease the body's rotation so corners read as a turn, not a snap.
      entry.heading = lerpAngle(entry.heading, st.heading, 0.18);

      const mc = maplibregl.MercatorCoordinate.fromLngLat([st.lng, st.lat], 0);
      const unitsPerMeter = mc.meterInMercatorCoordinateUnits();
      const metersPerPixel = (40075016.686 * Math.cos((st.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
      // Smaller when zoomed out so a city-wide view isn't a pile of cars.
      const zoomFactor = Math.min(1, Math.max(0.6, 0.6 + (zoom - 12) * 0.13));
      const px = (entry.assigned ? ASSIGNED_CAR_PX : CAR_PX) * zoomFactor;
      // Never smaller than life, never smaller than a legible icon.
      let k = Math.max(1, (px * metersPerPixel) / CAR_LENGTH_M);
      const age = now - entry.bornAt;
      if (age < 450) k *= 0.3 + 0.7 * (age / 450); // grow in on appearance
      entry.scale = k;
      const s = unitsPerMeter * k;

      const m = entry.group.matrix;
      m.makeRotationZ((-entry.heading * Math.PI) / 180);
      m.premultiply(this.scratchScale.makeScale(s, -s, s));
      m.premultiply(this.scratchTranslate.makeTranslation(mc.x - origin.x, mc.y - origin.y, mc.z - origin.z));
      entry.group.matrixWorldNeedsUpdate = true;

      const ring = entry.group.getObjectByName('ring');
      if (ring) {
        const pulse = 1 + 0.12 * Math.sin(now / 280);
        ring.scale.set(pulse, pulse, 1);
      }
    }

    this.camera.projectionMatrix = this.scratchProjection
      .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
      .multiply(this.scratchOrigin.makeTranslation(origin.x, origin.y, origin.z));
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    // ~30 fps while anything moves or pulses; idle maps cost nothing.
    if (this.cars.size && !this.nextFrame) {
      this.nextFrame = setTimeout(() => {
        this.nextFrame = null;
        this.map.triggerRepaint();
      }, moving || hasAssigned ? 33 : 250);
    }
  }
}

function markerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement('div');
  el.className = `kimu-marker kimu-${marker.kind}`;
  if (marker.kind === 'radar') {
    el.innerHTML = '<span></span><span></span><span></span><i></i>';
  } else if (marker.kind === 'me') {
    el.innerHTML = '<span></span><i></i>';
  } else {
    el.innerHTML = '<i></i>';
  }
  if (marker.label) {
    const label = document.createElement('div');
    label.className = 'kimu-label';
    label.textContent = marker.label;
    el.appendChild(label);
  }
  return el;
}

function routeFeature(coords: [number, number][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: coords },
  };
}

function boundsOf(points: [number, number][]): maplibregl.LngLatBounds | null {
  if (!points.length) return null;
  const b = new maplibregl.LngLatBounds(points[0], points[0]);
  for (const p of points) b.extend(p);
  return b;
}

/**
 * Padding that fits the canvas. Screens ask for the space their panels
 * cover in pixels; on a short phone that can be more than the map is tall,
 * and MapLibre then refuses to compute a camera at all (the map would stay
 * wherever it was, often nowhere near the ride). Keep at least 30% of each
 * axis for the content, shrinking the padding proportionally when needed.
 *
 * `reserved` is padding the map already holds: a 'center' camera eases to
 * its padding, and MapLibre keeps it. When fitting bounds MapLibre adds the
 * requested padding on top of that, so only the part not yet reserved is
 * asked for, within what the canvas has left.
 */
function fitPadding(
  map: maplibregl.Map,
  padding: { top: number; bottom: number; left: number; right: number },
  reserved: { top?: number; bottom?: number; left?: number; right?: number } = {}
) {
  const { width, height } = map.getCanvas().getBoundingClientRect();
  const clamp = (a: number, b: number, ra: number, rb: number, size: number) => {
    a = Math.max(0, a - ra);
    b = Math.max(0, b - rb);
    const max = Math.max(0, size * 0.7 - ra - rb);
    const total = a + b;
    if (!size || total <= max) return [a, b];
    const k = max / total;
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  const [top, bottom] = clamp(padding.top, padding.bottom, reserved.top ?? 0, reserved.bottom ?? 0, height);
  const [left, right] = clamp(padding.left, padding.right, reserved.left ?? 0, reserved.right ?? 0, width);
  return { top, bottom, left, right };
}

export default function MapEngine({ scene, styleUrl, onReady, onError, onStage, onPress, onCenterChanged, onUserGesture }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carsRef = useRef<CarLayer | null>(null);
  const markersRef = useRef(new Map<string, { marker: maplibregl.Marker; kind: string; label?: string }>());
  const sceneRef = useRef(scene);
  const loadedRef = useRef(false);
  const lastCameraKey = useRef('');
  const lastUserGestureAt = useRef(0);
  const routeAnim = useRef<{ key: string; startedAt: number } | null>(null);
  const lastFollowAt = useRef(0);
  const callbacks = useRef({ onReady, onError, onStage, onPress, onCenterChanged, onUserGesture });
  callbacks.current = { onReady, onError, onStage, onPress, onCenterChanged, onUserGesture };
  sceneRef.current = scene;
  const appliedStyle = useRef<string>('');

  /**
   * Everything the engine adds on top of the base style. Runs on every style
   * load, so switching to the server-chosen style keeps buildings, routes and
   * cars. Each piece is independent: a style without the OpenMapTiles source
   * simply has no 3D buildings instead of leaving the map half-built.
   */
  function installLayers(map: maplibregl.Map) {
    // Compact attribution starts expanded; keep it collapsed until tapped.
    container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    try {
      // 3D buildings (OpenMapTiles heights), under the labels.
      if (map.getSource('openmaptiles') && !map.getLayer('kimu-buildings-3d')) {
        const firstLabel = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
        map.addLayer(
          {
            id: 'kimu-buildings-3d',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 14.5,
            paint: {
              'fill-extrusion-color': '#e3e5e8',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.5, 0.85],
            },
          },
          firstLabel
        );
      }
    } catch (err) {
      console.warn('[map] 3D buildings unavailable for this style:', err);
    }
    for (const id of ['secondary', 'primary']) {
      if (map.getSource(`kimu-route-${id}`)) continue;
      map.addSource(`kimu-route-${id}`, { type: 'geojson', data: EMPTY_FC as any });
      map.addLayer({
        id: `kimu-route-${id}-casing`,
        type: 'line',
        source: `kimu-route-${id}`,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 17, 12] },
      });
      map.addLayer({
        id: `kimu-route-${id}-line`,
        type: 'line',
        source: `kimu-route-${id}`,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': id === 'primary' ? '#111111' : '#0E7C4A',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 17, 7],
          ...(id === 'secondary' ? { 'line-dasharray': [1.2, 1.4] } : {}),
        },
      });
    }
    if (!map.getLayer('kimu-cars')) {
      const layer = new CarLayer();
      carsRef.current = layer;
      map.addLayer(layer);
    }
  }

  // ---------- one-time map setup ----------
  useEffect(() => {
    if (!container.current) return;
    // The first thing the page says to native. If this never arrives, the
    // WebView itself did not run the page; if it does and nothing follows,
    // the map could not be built.
    callbacks.current.onStage?.('page booted');
    let map: maplibregl.Map;
    try {
      const cam = scene.camera;
      appliedStyle.current = styleUrl || DEFAULT_STYLE_URL;
      map = new maplibregl.Map({
        container: container.current,
        style: appliedStyle.current,
        center: [cam.center?.longitude ?? KIGALI_CENTER.longitude, cam.center?.latitude ?? KIGALI_CENTER.latitude],
        zoom: cam.zoom ?? 14,
        pitch: cam.pitch ?? 0,
        bearing: cam.bearing ?? 0,
        // The OpenFreeMap style already carries the required attribution;
        // shown as a small collapsed (i) that expands on tap.
        attributionControl: { compact: true },
        pixelRatio: Math.min(window.devicePixelRatio || 1, scene.maxPixelRatio ?? 2),
        canvasContextAttributes: { antialias: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        interactive: scene.interactive !== false,
        // Kimu drives in Rwanda only: the map cannot be dragged or zoomed out
        // past the service area, so a stray swipe never loses the trip.
        maxBounds: SERVICE_AREA_BOUNDS,
        minZoom: SERVICE_AREA_MIN_ZOOM,
        fadeDuration: 150,
      });
    } catch (err) {
      callbacks.current.onError?.(err instanceof Error ? err.message : 'WebGL is not available');
      return;
    }
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    const styleHost = hostOf(appliedStyle.current);
    callbacks.current.onStage?.('map created, loading style from ' + styleHost);
    // A style request that hangs raises no error event at all, so on a slow
    // or filtered mobile network the map would wait for ever in silence.
    // Name the host so a tester's screenshot says which server to blame.
    const styleTimer = setTimeout(() => {
      if (mapRef.current !== map || loadedRef.current) return;
      callbacks.current.onError?.(
        'The map style did not load from ' + styleHost + ' within ' + STYLE_TIMEOUT_MS / 1000 + 's.'
      );
    }, STYLE_TIMEOUT_MS);
    if (process.env.NODE_ENV !== 'production') {
      // Dev/test hook: lets end-to-end tests drive the camera and inspect cars.
      const w = window as unknown as { __kimuMaps?: unknown[] };
      (w.__kimuMaps ??= []).push({ map, cars: () => carsRef.current });
    }

    // Fires for the first style and again after setStyle(): everything the
    // engine draws on top of the base map is (re)installed here.
    map.on('style.load', () => {
      clearTimeout(styleTimer);
      callbacks.current.onStage?.('style loaded');
      installLayers(map);
      if (loadedRef.current) applyScene(sceneRef.current, true);
    });
    map.on('load', () => {
      if (!carsRef.current) installLayers(map);
      loadedRef.current = true;
      applyScene(sceneRef.current, true);
      callbacks.current.onReady?.();
    });

    map.on('error', (e) => {
      // Tile hiccups are routine; only a style that never loads is fatal.
      if (!loadedRef.current && !map.isStyleLoaded()) {
        callbacks.current.onError?.(e.error?.message ?? 'The map could not be loaded.');
      }
    });
    map.on('click', (e) => callbacks.current.onPress?.(e.lngLat.lat, e.lngLat.lng));
    const markGesture = (e: any) => {
      if (e?.originalEvent) {
        lastUserGestureAt.current = Date.now();
        callbacks.current.onUserGesture?.();
      }
    };
    map.on('dragstart', markGesture);
    map.on('zoomstart', markGesture);
    map.on('moveend', () => {
      if (sceneRef.current.reportCenter) {
        const c = map.getCenter();
        callbacks.current.onCenterChanged?.(c.lat, c.lng);
      }
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    // Follow camera + route trimming run on a light timer, not per frame.
    const tick = setInterval(() => {
      trimRoutes();
      follow();
    }, 250);

    return () => {
      clearInterval(tick);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      carsRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- scene updates ----------
  useEffect(() => {
    if (loadedRef.current) applyScene(scene, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // The server's choice of map style can arrive after the map was created
  // (stores/useMapConfigStore.ts loads it in the background): switch to it.
  useEffect(() => {
    const map = mapRef.current;
    const next = styleUrl || DEFAULT_STYLE_URL;
    if (!map || next === appliedStyle.current) return;
    appliedStyle.current = next;
    // Keep carsRef: MapLibre usually carries the custom car layer across a
    // style diff, and installLayers() only builds a new one when the layer is
    // really gone. Clearing it here left the map with a layer but no handle,
    // so every later scene update was skipped and the map froze.
    map.setStyle(next);
  }, [styleUrl]);

  function applyScene(s: MapScene, first: boolean) {
    const map = mapRef.current;
    const cars = carsRef.current;
    if (!map || !cars) return;
    cars.serverOffsetMs = s.serverTimeOffsetMs ?? 0;
    cars.update(s.cars ?? [], Date.now());
    syncMarkers(s.markers ?? []);
    syncRoutes(s.routes ?? []);
    map.getCanvas().style.cursor = s.reportCenter ? 'grab' : '';

    const cam = s.camera;
    const key = JSON.stringify([cam.mode, cam.token ?? 0, cam.center?.latitude, cam.center?.longitude, cam.zoom, cam.pitch, cam.padding]);
    if (first || key !== lastCameraKey.current) {
      lastCameraKey.current = key;
      lastUserGestureAt.current = 0;
      applyCamera(s, !first);
    }
  }

  function syncMarkers(markers: MapMarker[]) {
    const map = mapRef.current!;
    const existing = markersRef.current;
    const ids = new Set(markers.map((m) => m.id));
    for (const [id, entry] of existing) {
      if (!ids.has(id)) {
        entry.marker.remove();
        existing.delete(id);
      }
    }
    for (const m of markers) {
      const entry = existing.get(m.id);
      if (entry && (entry.kind !== m.kind || entry.label !== m.label)) {
        entry.marker.remove();
        existing.delete(m.id);
      }
      const current = existing.get(m.id);
      if (current) {
        current.marker.setLngLat([m.longitude, m.latitude]);
      } else {
        const marker = new maplibregl.Marker({ element: markerElement(m), anchor: 'center' })
          .setLngLat([m.longitude, m.latitude])
          .addTo(map);
        existing.set(m.id, { marker, kind: m.kind, label: m.label });
      }
    }
  }

  function syncRoutes(routes: MapRoute[]) {
    const map = mapRef.current!;
    for (const id of ['primary', 'secondary'] as const) {
      const route = routes.find((r) => (r.style ?? 'primary') === id);
      const src = map.getSource(`kimu-route-${id}`) as maplibregl.GeoJSONSource | undefined;
      if (!src) continue;
      if (!route || route.coordinates.length < 2) {
        src.setData(EMPTY_FC as any);
        continue;
      }
      const key = `${id}:${route.coordinates.length}:${route.coordinates[0]}:${route.coordinates[route.coordinates.length - 1]}`;
      if (route.animateIn && routeAnim.current?.key !== key) {
        routeAnim.current = { key, startedAt: Date.now() };
      }
      if (!route.trimBehindCarId) src.setData(routeFeature(route.coordinates) as any);
    }
    trimRoutes();
  }

  /** Draws each route: progressive reveal, and trimmed behind its car. */
  function trimRoutes() {
    const map = mapRef.current;
    const cars = carsRef.current;
    if (!map || !cars || !loadedRef.current) return;
    for (const route of sceneRef.current.routes ?? []) {
      const id = route.style ?? 'primary';
      const src = map.getSource(`kimu-route-${id}`) as maplibregl.GeoJSONSource | undefined;
      if (!src || route.coordinates.length < 2) continue;
      let coords = route.coordinates;
      if (route.trimBehindCarId) {
        const pos = cars.position(route.trimBehindCarId);
        const proj = pos ? projectOnRoute(coords, pos.latitude, pos.longitude) : null;
        if (proj) coords = [proj.point, ...coords.slice(proj.index + 1)];
      }
      const anim = routeAnim.current;
      if (route.animateIn && anim && anim.key.startsWith(`${id}:`)) {
        const f = Math.min(1, (Date.now() - anim.startedAt) / 900);
        if (f < 1) coords = coords.slice(0, Math.max(2, Math.ceil(coords.length * f)));
      }
      if (route.trimBehindCarId || route.animateIn) src.setData(routeFeature(coords) as any);
    }
  }

  function interestingPoints(s: MapScene): [number, number][] {
    const pts: [number, number][] = [];
    for (const r of s.routes ?? []) pts.push(...r.coordinates);
    for (const m of s.markers ?? []) if (m.kind !== 'me' || !(s.routes ?? []).length) pts.push([m.longitude, m.latitude]);
    const cars = carsRef.current;
    for (const c of s.cars ?? []) {
      if (!c.assigned) continue;
      const pos = cars?.position(c.id);
      pts.push(pos ? [pos.longitude, pos.latitude] : [c.longitude, c.latitude]);
    }
    return pts;
  }

  function applyCamera(s: MapScene, animate: boolean) {
    const map = mapRef.current!;
    const cam = s.camera;
    const wanted = cam.padding ?? { top: 60, bottom: 60, left: 40, right: 40 };
    const duration = animate ? 800 : 0;
    if (cam.mode === 'center' && cam.center) {
      map.easeTo({
        center: [cam.center.longitude, cam.center.latitude],
        zoom: cam.zoom ?? map.getZoom(),
        pitch: cam.pitch ?? 0,
        padding: fitPadding(map, wanted),
        duration,
      });
      return;
    }
    const bounds = boundsOf(interestingPoints(s));
    if (!bounds) return;
    const cameraOpts = map.cameraForBounds(bounds, { padding: fitPadding(map, wanted, map.getPadding()), maxZoom: cam.zoom ?? 16.5 });
    if (cameraOpts) map.easeTo({ ...cameraOpts, pitch: cam.pitch ?? 0, duration });
  }

  /** Follow mode: keep the assigned car and what's left of the route framed. */
  function follow() {
    const map = mapRef.current;
    const s = sceneRef.current;
    if (!map || !loadedRef.current || s.camera.mode !== 'follow') return;
    if (Date.now() - lastUserGestureAt.current < USER_IDLE_MS) return;
    if (map.isMoving()) return;
    const now = Date.now();
    if (now - lastFollowAt.current < FOLLOW_EVERY_MS) return;
    lastFollowAt.current = now;
    const assigned = (s.cars ?? []).find((c) => c.assigned);
    const pos = assigned ? carsRef.current?.position(assigned.id) : null;
    const pts: [number, number][] = [];
    if (pos) pts.push([pos.longitude, pos.latitude]);
    const route = (s.routes ?? [])[0];
    if (route && route.coordinates.length) pts.push(route.coordinates[route.coordinates.length - 1]);
    for (const m of s.markers ?? []) if (m.kind === 'pickup' || m.kind === 'destination') pts.push([m.longitude, m.latitude]);
    const bounds = boundsOf(pts);
    if (!bounds) return;
    const cameraOpts = map.cameraForBounds(bounds, {
      padding: fitPadding(map, s.camera.padding ?? { top: 80, bottom: 80, left: 50, right: 50 }, map.getPadding()),
      maxZoom: s.camera.zoom ?? 16.5,
    });
    if (cameraOpts) map.easeTo({ ...cameraOpts, pitch: s.camera.pitch ?? 45, duration: 1100, easing: (x) => x });
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#eef0f2', overflow: 'hidden' }}>
      <style>{MARKER_CSS}</style>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}

const MARKER_CSS = `
html, body, #root { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #eef0f2; }
.maplibregl-ctrl-attrib { font: 10px/1.4 -apple-system, system-ui, sans-serif; }
.kimu-marker { position: relative; width: 0; height: 0; }
.kimu-marker > i { position: absolute; transform: translate(-50%, -50%); box-shadow: 0 2px 6px rgba(0,0,0,.35); }
.kimu-pickup > i { width: 16px; height: 16px; border-radius: 50%; background: #111; border: 4px solid #fff; box-sizing: content-box; }
.kimu-destination > i { width: 14px; height: 14px; background: #F97316; border: 4px solid #fff; box-sizing: content-box; }
.kimu-me > i { width: 14px; height: 14px; border-radius: 50%; background: #0E7C4A; border: 3px solid #fff; }
.kimu-me > span { position: absolute; width: 44px; height: 44px; border-radius: 50%; transform: translate(-50%, -50%);
  background: rgba(14,124,74,.18); animation: kimu-breathe 2.4s ease-in-out infinite; }
.kimu-radar > i { width: 14px; height: 14px; border-radius: 50%; background: #111; border: 4px solid #fff; box-sizing: content-box; }
.kimu-radar > span { position: absolute; width: 220px; height: 220px; border-radius: 50%; transform: translate(-50%, -50%) scale(0);
  background: radial-gradient(circle, rgba(14,124,74,0) 40%, rgba(14,124,74,.35) 100%); animation: kimu-radar 2.7s ease-out infinite; }
.kimu-radar > span:nth-child(2) { animation-delay: .9s; }
.kimu-radar > span:nth-child(3) { animation-delay: 1.8s; }
.kimu-label { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); white-space: nowrap;
  background: #111; color: #fff; font: 600 12px/1 -apple-system, system-ui, sans-serif; padding: 7px 10px; border-radius: 8px;
  box-shadow: 0 3px 10px rgba(0,0,0,.25); }
@keyframes kimu-radar { 0% { transform: translate(-50%,-50%) scale(.1); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1); opacity: 0; } }
@keyframes kimu-breathe { 0%,100% { transform: translate(-50%,-50%) scale(.7); } 50% { transform: translate(-50%,-50%) scale(1); } }
`;
