import { create } from 'zustand';

// The slide-in side menu's open state, shared between the hamburger button on
// the home screen and the KimuDrawer overlay rendered by the (main) layout.
export const useDrawerStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
