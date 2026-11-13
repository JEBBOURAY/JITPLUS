/** Motion rules of a draggable bottom sheet. Positions are in px: 0 = open, `height` = fully below the screen. */

/** Spring from a damping ratio (1 = no overshoot) and a response time in seconds. */
export const spring = (dampingRatio: number, response: number) => ({
  stiffness: (2 * Math.PI / response) ** 2,
  damping: (4 * Math.PI * dampingRatio) / response,
  mass: 1,
});

/** Distance a release at `velocity` (px/s) still travels before resting, as scroll deceleration does. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a bound: the further the drag, the less the sheet follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Where the sheet shows for a finger at `raw`: 1:1 on the way down, resisting above its rest position or when it may not close. */
export function dragPosition(raw: number, height: number, dismissable: boolean): number {
  if (raw < 0) return -rubberband(-raw, height);
  return dismissable ? raw : rubberband(raw, height);
}

/**
 * Whether a release sends the sheet away. The throw decides, not the release
 * point: a quick flick from the top dismisses, a slow drag past halfway too,
 * and an upward flick from low down brings it back.
 */
export function shouldDismiss(position: number, velocity: number, height: number, dismissable: boolean): boolean {
  return dismissable && Math.max(0, position) + project(velocity) > height / 2;
}
