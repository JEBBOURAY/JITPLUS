import { create } from 'zustand';
import type { StampsUpdatedPayload } from '@jitplus/shared/src/realtime';

export interface StampsEvent extends StampsUpdatedPayload {
  receivedAt: number;
}

interface WsState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
  /** Last stamps:updated event — lets the QR screen confirm a scan in real time. */
  lastStampsEvent: StampsEvent | null;
  pushStampsEvent: (payload: StampsUpdatedPayload) => void;
}

/**
 * Lightweight store tracking WebSocket connection state.
 * Used by polling hooks to skip HTTP polling when WS is active.
 */
export const useWsStore = create<WsState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
  lastStampsEvent: null,
  pushStampsEvent: (payload) => set({ lastStampsEvent: { ...payload, receivedAt: Date.now() } }),
}));
