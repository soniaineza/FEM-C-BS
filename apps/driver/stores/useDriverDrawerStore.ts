import { create } from 'zustand';

// The driver side menu's open state, shared between the hamburger in
// DriverTopBar and the DriverDrawer overlay rendered by the (driver) layout.
export const useDriverDrawerStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
