import { create } from 'zustand';

import type { MapScene } from '@kimu/shared/components/map/map-types';
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
