import { createRef } from 'react';
import { create } from 'zustand';

import type { MapController, MapScene } from '../components/map/map-types';

// The shared ride-flow map (components/map/MapStage.tsx) is mounted once in
// the (main) layout and stays alive behind the transparent ride-flow screens,
// so moving between vehicle choice, fare, searching and tracking never
// reloads the map. The focused screen owns the scene; a screen losing focus
// only clears the scene if it still owns it (focus/blur can interleave).
interface MapStageState {
  owner: string | null;
  scene: MapScene | null;
  /** Bumped to put the camera back where the scene frames it. */
  recenterToken: number;
  setScene: (owner: string, scene: MapScene) => void;
  release: (owner: string) => void;
  recenter: () => void;
}

export const useMapStageStore = create<MapStageState>((set, get) => ({
  owner: null,
  scene: null,
  recenterToken: 0,
  setScene: (owner, scene) => set({ owner, scene }),
  release: (owner) => {
    if (get().owner === owner) set({ owner: null, scene: null });
  },
  recenter: () => set((s) => ({ recenterToken: s.recenterToken + 1 })),
}));

// The shared map's camera commands. Screens drawn over the map forward their
// drag and pinch gestures here (components/map/MapGestureLayer.tsx).
export const mapStageController = createRef<MapController>();
