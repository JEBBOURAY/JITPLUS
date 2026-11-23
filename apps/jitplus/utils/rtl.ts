import { I18nManager } from 'react-native';

/** Mirrors a directional icon (arrow, chevron) under RTL: Arabic reloads the app with forceRTL. */
export const DIR_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;
