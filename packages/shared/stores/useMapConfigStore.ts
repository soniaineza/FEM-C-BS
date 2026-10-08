import { create } from 'zustand';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

// The style the map is drawn with when the server has not answered yet (or
// cannot be reached): the map must still appear.
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

interface MapConfigState {
  styleUrl: string;
  load: () => Promise<void>;
}

// Which map style the apps draw is decided by the server (GET
// /api/maps/config), so the tile provider can change without an app release.
export const useMapConfigStore = create<MapConfigState>((set) => ({
  styleUrl: DEFAULT_STYLE_URL,
  load: async () => {
    try {
      const res = await fetch(`${BASE_URL}/maps/config`);
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json.styleUrl === 'string' && json.styleUrl.startsWith('https://')) set({ styleUrl: json.styleUrl });
    } catch {
      // Keep the default style.
    }
  },
}));
