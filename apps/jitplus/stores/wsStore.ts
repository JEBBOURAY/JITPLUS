import { create } from 'zustand';

interface WsState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

/**
 * Lightweight store tracking WebSocket connection state.
 * Used by polling hooks to skip HTTP polling when WS is active.
 */
export const useWsStore = create<WsState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));
