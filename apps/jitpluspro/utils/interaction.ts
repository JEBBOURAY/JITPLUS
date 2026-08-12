// ── Lightweight app-wide "user interaction" signal ──
// Lets the floating tab bar know when the user touches or scrolls a screen,
// so idle-only affordances (e.g. the Scan button breathing animation) can
// pause on interaction and resume after a short idle period.

type InteractionListener = () => void;

const listeners = new Set<InteractionListener>();

/** Notify all subscribers that the user just interacted (tap / scroll). */
export function pokeInteraction(): void {
  listeners.forEach((listener) => listener());
}

/** Subscribe to interaction events. Returns an unsubscribe function. */
export function subscribeInteraction(listener: InteractionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
