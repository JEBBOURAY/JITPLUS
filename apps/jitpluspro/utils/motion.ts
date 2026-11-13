import { Easing } from 'react-native';

/** Strong ease-out: enters and exits that react to the user. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Strong ease-in-out: something already on screen moving to a new place. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
