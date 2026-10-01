'use dom';

import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import type { DOMProps } from 'expo/dom';

import type { MapCar, MapMarker, MapRoute, MapScene, LngLat } from './map-types';
import { KIGALI_CENTER } from './map-types';
import { CAR_LENGTH_M, createCar, createLights, loadCarModels, setBrakeLights } from './carModel';
import { RENDER_DELAY_MS, Track, distanceM, lerpAngle, projectOnRoute } from './trackInterpolation';

// The map engine: MapLibre GL JS over OpenFreeMap's OpenStreetMap vector
// tiles, with 3D buildings and three.js 3D cars in a custom layer that shares
// the map's depth buffer (cars disappear behind buildings correctly).
//
// A DOM component: on iOS/Android it runs inside a WebView with the scripts
// bundled into the app (no CDN); on web it renders directly. The app drives
// it with one serialisable `scene` prop; it reports back through top-level
// async callbacks (the only kind a DOM component can receive).

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
// The standalone (server-free) build has to stay usable with no internet at
// all, when the tile style cannot be fetched. Literal read so Metro inlines it.
const OFFLINE_BUILD = process.env.EXPO_PUBLIC_OFFLINE_DEMO === '1';
const STYLE_WATCHDOG_MS = 12_000; // an unreachable network errors out fast; this only catches a hung one

/**
 * Tile-free map: a flat background and a faint street-scale grid around the
 * camera, so panning and zooming still read as movement. Cars, routes and
 * markers are drawn on top exactly as on the real map.
 */
function offlineStyle(center: LngLat): maplibregl.StyleSpecification {
  type Line = { type: 'Feature'; properties: { major: number }; geometry: { type: 'LineString'; coordinates: [number, number][] } };
  const features: Line[] = [];
  const span = 0.3;
  const step = 0.005;
  const line = (coords: [number, number][], major: boolean): Line => ({
    type: 'Feature',
    properties: { major: major ? 1 : 0 },
    geometry: { type: 'LineString', coordinates: coords },
  });
  for (let i = -Math.round(span / step); i <= Math.round(span / step); i++) {
    const major = i % 4 === 0;
    const lat = Math.round(center.latitude / step) * step + i * step;
    const lng = Math.round(center.longitude / step) * step + i * step;
    features.push(line([[center.longitude - span, lat], [center.longitude + span, lat]], major));
    features.push(line([[lng, center.latitude - span], [lng, center.latitude + span]], major));
  }
  return {
    version: 8,
    sources: { 'fem-grid': { type: 'geojson', data: { type: 'FeatureCollection', features } } },
    layers: [
      { id: 'fem-bg', type: 'background', paint: { 'background-color': '#eef0f2' } },
      {
        id: 'fem-grid-minor',
        type: 'line',
        source: 'fem-grid',
        filter: ['==', ['get', 'major'], 0],
        paint: { 'line-color': '#e2e5e9', 'line-width': 1 },
      },
      {
        id: 'fem-grid-major',
        type: 'line',
        source: 'fem-grid',
        filter: ['==', ['get', 'major'], 1],
        paint: { 'line-color': '#d3d8de', 'line-width': 1.5 },
      },
    ],
  };
}
const CAR_PX = 30; // on-screen car length at city zooms
const ASSIGNED_CAR_PX = 38;
const FOLLOW_EVERY_MS = 1200;
const USER_IDLE_MS = 8000; // after panning, wait this long before re-following
const REMOVE_AFTER_MS = 4000; // a car missing from updates fades out after this
const EMPTY_FC = { type: 'FeatureCollection', features: [] } as const;
const X_AXIS = new THREE.Vector3(1, 0, 0);
// Rwanda drives on the right: cars are drawn this far right of the road's
// centreline, so opposing traffic passes side by side instead of overlapping.
const LANE_OFFSET_M = 1.7;
// Stylised suspension: a slightly under-damped spring on pitch and roll.
const SUSPENSION_K = 70;
const SUSPENSION_C = 10;
const tmpRot = new THREE.Matrix4();
const tmpScale = new THREE.Matrix4();
const tmpMove = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpProj = new THREE.Matrix4();
const tmpOrigin = new THREE.Matrix4();
const FLIP_Y = new THREE.Matrix4().makeScale(1, -1, 1);
// Cars this far outside the visible map (in degrees) still animate their
// state but aren't drawn; most of the ~40 nearby cars are usually off screen.
const CULL_PAD_DEG = 0.004;

interface Props {
  scene: MapScene;
  onReady?: () => Promise<void>;
  onError?: (message: string) => Promise<void>;
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
  /** Smoothed motion for body dynamics and brake lights. */
  speed: number;
  accel: number;
  yawRate: number;
  pitch: number;
  pitchVel: number;
  roll: number;
  rollVel: number;
}

class CarLayer implements maplibregl.CustomLayerInterface {
  id = 'fem-cars';
  type = 'custom' as const;
  renderingMode = '3d' as const;
  cars = new Map<string, CarEntry>();
  serverOffsetMs = 0;
  assignedCount = 0;
  private map!: maplibregl.Map;
  private renderer!: THREE.WebGLRenderer;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private nextFrame: ReturnType<typeof setTimeout> | null = null;
  private lastRenderAt = 0;

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
          speed: 0,
          accel: 0,
          yawRate: 0,
          pitch: 0,
          pitchVel: 0,
          roll: 0,
          rollVel: 0,
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
    this.assignedCount = 0;
    for (const entry of this.cars.values()) if (entry.assigned) this.assignedCount++;
    this.map?.triggerRepaint();
  }

  position(id: string): LngLat | null {
    const e = this.cars.get(id);
    return e ? { latitude: e.lat, longitude: e.lng } : null;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: maplibregl.CustomRenderMethodInput) {
    const now = Date.now();
    const t = now + this.serverOffsetMs - RENDER_DELAY_MS;
    const zoom = this.map.getZoom();
    let moving = false;
    // Relative-to-centre rendering: the GPU works in 32-bit floats, and an
    // absolute Web-Mercator position (~0.58) only resolves to ~1.4 m there —
    // cars tore into shards from zoom ~19. Cars are placed relative to an
    // origin at the map centre, and the origin is folded into the camera
    // matrix here in 64-bit JS, so the GPU only sees small, precise numbers.
    const origin = maplibregl.MercatorCoordinate.fromLngLat(this.map.getCenter(), 0);

    // Frame time for time-based smoothing (the loop runs at 4–30 fps).
    const bounds = this.map.getBounds();
    const dt = Math.min(0.25, Math.max(0.001, (now - (this.lastRenderAt || now - 33)) / 1000));
    this.lastRenderAt = now;

    for (const entry of this.cars.values()) {
      const st = entry.track.sample(t);
      if (!st) continue;
      moving = moving || st.moving;
      if (
        !entry.assigned &&
        (st.lat < bounds.getSouth() - CULL_PAD_DEG || st.lat > bounds.getNorth() + CULL_PAD_DEG ||
          st.lng < bounds.getWest() - CULL_PAD_DEG || st.lng > bounds.getEast() + CULL_PAD_DEG)
      ) {
        // Off screen: keep its state current, skip the drawing work.
        entry.group.visible = false;
        entry.lat = st.lat;
        entry.lng = st.lng;
        entry.heading = st.heading;
        continue;
      }
      entry.group.visible = true;
      const movedM = st.lat !== entry.lat || st.lng !== entry.lng ? distanceM(entry.lat, entry.lng, st.lat, st.lng) : 0;
      // Turn the wheels by the distance covered (scaled with the drawn size).
      const wheels = entry.group.userData.wheels as THREE.Object3D[] | undefined;
      if (wheels?.length && movedM > 0 && movedM < 30) {
        entry.wheelAngle = (entry.wheelAngle + movedM / (entry.group.userData.wheelRadiusM * entry.scale)) % (Math.PI * 2);
        tmpQuat.setFromAxisAngle(X_AXIS, entry.wheelAngle);
        for (const w of wheels) w.quaternion.copy(tmpQuat).multiply(w.userData.baseQuaternion);
      }
      entry.lat = st.lat;
      entry.lng = st.lng;

      // Motion estimates (smoothed): speed, acceleration, yaw rate.
      const instSpeed = movedM < 30 ? movedM / dt : entry.speed;
      const prevSpeed = entry.speed;
      entry.speed += (instSpeed - entry.speed) * (1 - Math.exp(-dt / 0.25));
      entry.accel += ((entry.speed - prevSpeed) / dt - entry.accel) * (1 - Math.exp(-dt / 0.35));
      // Ease the body's rotation so corners read as a turn, not a snap
      // (time-based, so it feels the same at 4 fps and 30 fps).
      const prevHeading = entry.heading;
      entry.heading = lerpAngle(entry.heading, st.heading, 1 - Math.exp(-dt / 0.14));
      const dHeading = ((((entry.heading - prevHeading) % 360) + 540) % 360) - 180;
      entry.yawRate += ((dHeading * Math.PI) / 180 / dt - entry.yawRate) * (1 - Math.exp(-dt / 0.2));

      // Springy body: nose dips when braking, leans out of corners.
      const pitchTarget = Math.max(-0.05, Math.min(0.035, entry.accel * 0.014));
      const rollTarget = Math.max(-0.06, Math.min(0.06, -entry.yawRate * entry.speed * 0.02));
      // Semi-implicit Euler in small steps: stable at any frame rate.
      const steps = Math.ceil(dt / 0.016);
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        entry.pitchVel += (SUSPENSION_K * (pitchTarget - entry.pitch) - SUSPENSION_C * entry.pitchVel) * h;
        entry.pitch += entry.pitchVel * h;
        entry.rollVel += (SUSPENSION_K * (rollTarget - entry.roll) - SUSPENSION_C * entry.rollVel) * h;
        entry.roll += entry.rollVel * h;
      }
      // Brake lights: slowing down, or standing (held on the brake).
      setBrakeLights(entry.group, entry.accel < -0.7 || entry.speed < 0.4);

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

      // Right-hand lane: offset perpendicular to travel (east = +x, south = +y).
      const hr = (entry.heading * Math.PI) / 180;
      const laneX = Math.cos(hr) * LANE_OFFSET_M * unitsPerMeter;
      const laneY = Math.sin(hr) * LANE_OFFSET_M * unitsPerMeter;

      const m = entry.group.matrix;
      m.makeRotationZ((-entry.heading * Math.PI) / 180);
      m.multiply(tmpRot.makeRotationX(entry.pitch));
      m.multiply(tmpRot.makeRotationY(entry.roll));
      // Cars live in a north-up, right-handed frame (y = -mercator y); the
      // mirror into Web Mercator (y south) is applied once, in the camera.
      // Mirroring each car instead gave them a negative determinant, so
      // three.js flipped face winding on top of MapLibre's own mirrored
      // projection and every car rendered inside-out (dark, outline on top).
      m.premultiply(tmpScale.makeScale(s, s, s));
      m.premultiply(tmpMove.makeTranslation(mc.x - origin.x + laneX, -(mc.y - origin.y + laneY), mc.z - origin.z));
      entry.group.matrixWorldNeedsUpdate = true;

      const ring = entry.group.getObjectByName('ring');
      if (ring) {
        const pulse = 1 + 0.12 * Math.sin(now / 280);
        ring.scale.set(pulse, pulse, 1);
      }
    }

    this.camera.projectionMatrix = tmpProj
      .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
      .multiply(tmpOrigin.makeTranslation(origin.x, origin.y, origin.z))
      .multiply(FLIP_Y);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    // ~30 fps while anything moves or pulses at street zooms; ~15 fps
    // zoomed out (car motion is sub-pixel there); idle maps cost nothing.
    if (this.cars.size && !this.nextFrame) {
      const active = moving || this.assignedCount > 0;
      const interval = !active ? 250 : zoom >= 14.5 || this.assignedCount > 0 ? 33 : 66;
      this.nextFrame = setTimeout(() => {
        this.nextFrame = null;
        this.map.triggerRepaint();
      }, interval);
    }
  }
}

function markerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement('div');
  el.className = `fem-marker fem-${marker.kind}`;
  if (marker.kind === 'radar') {
    el.innerHTML = '<span></span><span></span><span></span><i></i>';
  } else if (marker.kind === 'me') {
    el.innerHTML = '<span></span><i></i>';
  } else {
    el.innerHTML = '<i></i>';
  }
  if (marker.label) {
    const label = document.createElement('div');
    label.className = 'fem-label';
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

export default function MapEngine({ scene, onReady, onError, onPress, onCenterChanged, onUserGesture }: Props) {
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
  const lastZoomToken = useRef(0);
  const callbacks = useRef({ onReady, onError, onPress, onCenterChanged, onUserGesture });
  callbacks.current = { onReady, onError, onPress, onCenterChanged, onUserGesture };
  sceneRef.current = scene;

  // ---------- one-time map setup ----------
  useEffect(() => {
    if (!container.current) return;
    // Until the map has loaded, surface script failures (e.g. a worker that
    // can't start inside the WebView) instead of spinning silently.
    const reportEarly = (message: string) => {
      if (!loadedRef.current) callbacks.current.onError?.(message);
    };
    const onWindowError = (e: ErrorEvent) => reportEarly(`script: ${e.message}`);
    const onRejection = (e: PromiseRejectionEvent) =>
      reportEarly(`promise: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onRejection);
    let map: maplibregl.Map;
    try {
      const cam = scene.camera;
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
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
        fadeDuration: 150,
      });
    } catch (err) {
      callbacks.current.onError?.(err instanceof Error ? err.message : 'WebGL is not available');
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
      return;
    }
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') {
      // Dev/test hook: lets end-to-end tests drive the camera and inspect cars.
      const w = window as unknown as { __femMaps?: unknown[] };
      (w.__femMaps ??= []).push({ map, cars: () => carsRef.current });
    }

    map.on('load', () => {
      // Compact attribution starts expanded; keep it collapsed until tapped.
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      // 3D buildings (OpenMapTiles heights), under the labels. Absent on the
      // tile-free offline style.
      const firstLabel = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      if (map.getSource('openmaptiles')) map.addLayer(
        {
          id: 'fem-buildings-3d',
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
      for (const id of ['secondary', 'primary']) {
        map.addSource(`fem-route-${id}`, { type: 'geojson', data: EMPTY_FC as any });
        map.addLayer({
          id: `fem-route-${id}-casing`,
          type: 'line',
          source: `fem-route-${id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 17, 12] },
        });
        map.addLayer({
          id: `fem-route-${id}-line`,
          type: 'line',
          source: `fem-route-${id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': id === 'primary' ? '#111111' : '#16A34A',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 17, 7],
            ...(id === 'secondary' ? { 'line-dasharray': [1.2, 1.4] } : {}),
          },
        });
      }
      const layer = new CarLayer();
      carsRef.current = layer;
      map.addLayer(layer);
      loadedRef.current = true;
      applyScene(sceneRef.current, true);
      callbacks.current.onReady?.();
    });

    // No internet in the standalone build: swap to the tile-free style rather
    // than showing an error, once the style fetch fails or takes too long.
    let usedOfflineStyle = false;
    const useOfflineStyle = () => {
      if (!OFFLINE_BUILD || usedOfflineStyle || loadedRef.current) return false;
      usedOfflineStyle = true;
      const cam = sceneRef.current.camera;
      map.setStyle(
        offlineStyle({
          latitude: cam.center?.latitude ?? KIGALI_CENTER.latitude,
          longitude: cam.center?.longitude ?? KIGALI_CENTER.longitude,
        }),
        { diff: false }
      );
      return true;
    };
    const watchdog = OFFLINE_BUILD ? setTimeout(useOfflineStyle, STYLE_WATCHDOG_MS) : null;

    map.on('error', (e) => {
      // Tile hiccups are routine; only a style that never loads is fatal.
      if (!loadedRef.current && !map.isStyleLoaded()) {
        if (useOfflineStyle()) return;
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
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
      clearInterval(tick);
      if (watchdog) clearTimeout(watchdog);
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

  function applyScene(s: MapScene, first: boolean) {
    const map = mapRef.current;
    const cars = carsRef.current;
    if (!map || !cars) return;
    cars.serverOffsetMs = s.serverTimeOffsetMs ?? 0;
    cars.update(s.cars ?? [], Date.now());
    syncMarkers(s.markers ?? []);
    syncRoutes(s.routes ?? []);
    map.getCanvas().style.cursor = s.reportCenter ? 'grab' : '';

    // +/− buttons: zoom around the current centre, and count it as a user
    // gesture so follow/fit modes don't immediately pull the camera back.
    const zc = s.zoomCommand;
    if (zc && zc.token !== lastZoomToken.current) {
      lastZoomToken.current = zc.token;
      if (!first) {
        lastUserGestureAt.current = Date.now();
        const target = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + zc.delta));
        map.easeTo({ zoom: target, duration: 250 });
      }
    }

    const cam = s.camera;
    const key = JSON.stringify([cam.mode, cam.token ?? 0, cam.center?.latitude, cam.center?.longitude, cam.zoom, cam.pitch]);
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
      const src = map.getSource(`fem-route-${id}`) as maplibregl.GeoJSONSource | undefined;
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
      const src = map.getSource(`fem-route-${id}`) as maplibregl.GeoJSONSource | undefined;
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
    const padding = cam.padding ?? { top: 60, bottom: 60, left: 40, right: 40 };
    const duration = animate ? 800 : 0;
    if (cam.mode === 'center' && cam.center) {
      map.easeTo({
        center: [cam.center.longitude, cam.center.latitude],
        zoom: cam.zoom ?? map.getZoom(),
        pitch: cam.pitch ?? 0,
        padding,
        duration,
      });
      return;
    }
    const bounds = boundsOf(interestingPoints(s));
    if (!bounds) return;
    const cameraOpts = map.cameraForBounds(bounds, { padding, maxZoom: cam.zoom ?? 16.5 });
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
      padding: s.camera.padding ?? { top: 80, bottom: 80, left: 50, right: 50 },
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
.fem-marker { position: relative; width: 0; height: 0; }
.fem-marker > i { position: absolute; transform: translate(-50%, -50%); box-shadow: 0 2px 6px rgba(0,0,0,.35); }
.fem-pickup > i { width: 16px; height: 16px; border-radius: 50%; background: #111; border: 4px solid #fff; box-sizing: content-box; }
.fem-destination > i { width: 14px; height: 14px; background: #111; border: 4px solid #fff; box-sizing: content-box; }
.fem-me > i { width: 14px; height: 14px; border-radius: 50%; background: #16A34A; border: 3px solid #fff; }
.fem-me > span { position: absolute; width: 44px; height: 44px; border-radius: 50%; transform: translate(-50%, -50%);
  background: rgba(22,163,74,.18); animation: fem-breathe 2.4s ease-in-out infinite; }
.fem-radar > i { width: 14px; height: 14px; border-radius: 50%; background: #111; border: 4px solid #fff; box-sizing: content-box; }
.fem-radar > span { position: absolute; width: 220px; height: 220px; border-radius: 50%; transform: translate(-50%, -50%) scale(0);
  background: radial-gradient(circle, rgba(22,163,74,0) 40%, rgba(22,163,74,.35) 100%); animation: fem-radar 2.7s ease-out infinite; }
.fem-radar > span:nth-child(2) { animation-delay: .9s; }
.fem-radar > span:nth-child(3) { animation-delay: 1.8s; }
.fem-label { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); white-space: nowrap;
  background: #111; color: #fff; font: 600 12px/1 -apple-system, system-ui, sans-serif; padding: 7px 10px; border-radius: 8px;
  box-shadow: 0 3px 10px rgba(0,0,0,.25); }
@keyframes fem-radar { 0% { transform: translate(-50%,-50%) scale(.1); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1); opacity: 0; } }
@keyframes fem-breathe { 0%,100% { transform: translate(-50%,-50%) scale(.7); } 50% { transform: translate(-50%,-50%) scale(1); } }
`;
