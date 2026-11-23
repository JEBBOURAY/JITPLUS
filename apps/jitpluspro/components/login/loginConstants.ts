import { spring } from '@/utils/sheetPhysics';

/** Pro's press physics for the login buttons: critically damped, 0.2 s response. */
export const PRESS_SPRING = spring(1, 0.2);
