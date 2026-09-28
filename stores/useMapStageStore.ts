import { create } from 'zustand';

import type { MapScene } from '../components/map/map-types';

// The shared ride-flow map (components/map/MapStage.tsx) is mounted once in
// the (main) layout and stays alive behind the transparent ride-flow screens,
// so moving between vehicle choice, fare, searching and tracking never
// reloads the map. The focused screen owns the scene; a screen losing focus
// only clears the scene if it still owns it (focus/blur can interleave).
interface MapStageState {
  owner: string | null;
  scene: MapScene | null;
  setScene: (owner: string, scene: MapScene) => void;
  release: (owner: string) => void;
}

export const useMapStageStore = create<MapStageState>((set, get) => ({
  owner: null,
  scene: null,
  setScene: (owner, scene) => set({ owner, scene }),
  release: (owner) => {
    if (get().owner === owner) set({ owner: null, scene: null });
  },
}));
