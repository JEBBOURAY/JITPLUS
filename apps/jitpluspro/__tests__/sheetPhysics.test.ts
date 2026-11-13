import { dragPosition, project, rubberband, shouldDismiss, spring } from '@/utils/sheetPhysics';

const HEIGHT = 400;

describe('bottom sheet physics', () => {
  it('builds a critically damped spring from a damping ratio of 1', () => {
    const { stiffness, damping, mass } = spring(1, 0.35);
    // Critical damping: c = 2·√(k·m).
    expect(damping).toBeCloseTo(2 * Math.sqrt(stiffness * mass), 6);
    expect(spring(0.8, 0.3).damping).toBeLessThan(2 * Math.sqrt(spring(0.8, 0.3).stiffness));
  });

  it('projects a throw in its own direction, further when faster', () => {
    expect(project(0)).toBe(0);
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(2000)).toBeGreaterThan(project(1000));
    expect(project(-1000)).toBeCloseTo(-499, 0);
  });

  it('follows less and less past a bound, without ever stopping', () => {
    const near = rubberband(50, HEIGHT);
    const far = rubberband(300, HEIGHT);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(50);
    expect(far).toBeGreaterThan(near);
    expect(far / 300).toBeLessThan(near / 50);
  });

  it('tracks the finger 1:1 downwards and resists upwards', () => {
    expect(dragPosition(120, HEIGHT, true)).toBe(120);
    expect(dragPosition(-120, HEIGHT, true)).toBeLessThan(0);
    expect(dragPosition(-120, HEIGHT, true)).toBeGreaterThan(-120);
  });

  it('resists downwards too while it may not close', () => {
    const held = dragPosition(120, HEIGHT, false);
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan(120);
  });

  it('lets the throw decide the dismissal, not the release point', () => {
    expect(shouldDismiss(20, 1500, HEIGHT, true)).toBe(true); // quick flick from the top
    expect(shouldDismiss(260, 0, HEIGHT, true)).toBe(true); // slow drag past halfway
    expect(shouldDismiss(120, 0, HEIGHT, true)).toBe(false); // let go early
    expect(shouldDismiss(300, -1500, HEIGHT, true)).toBe(false); // flicked back up from low down
  });

  it('never dismisses a sheet that must stay open', () => {
    expect(shouldDismiss(380, 3000, HEIGHT, false)).toBe(false);
  });
});
