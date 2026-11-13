import type { IconNode } from 'lucide-react-native';
import { ACCENT_FILL } from './createJitIcon';

/**
 * JitPlus icon drawings on Lucide's 24×24 grid (stroke-only, round caps/joins).
 *
 * Two Moroccan motifs, used sparingly (at most one per icon):
 * - the horseshoe arch (bab), framed by a rectangle (alfiz) on the home icon;
 * - the 8-point star: the two-square khatam (outline for `star`, solid for
 *   `premium`), and a sharp filled star (inner radius = 0.55·R) for small
 *   accents. Small stars are filled because an outlined one reads as a gear
 *   at 16–20 px.
 * `fill: ACCENT_FILL` paints an element in the icon colour (see createJitIcon).
 * Star, wheel and gear coordinates are computed, then rounded to 2 decimals.
 */
export const glyphs = {
  home: [
    ['rect', { x: '4', y: '3', width: '16', height: '18', rx: '1.5', key: 'alfiz' }],
    ['path', { d: 'M8.5 21v-8a4.03 4.03 0 1 1 7 0v8', key: 'arch' }],
  ],
  clients: [
    ['circle', { cx: '10', cy: '7.5', r: '3.5', key: 'head' }],
    ['path', { d: 'M3.5 20.5v-.5a5.5 5.5 0 0 1 9.4-3.9', key: 'body' }],
    ['path', { d: 'M18 13.7L18.8 15.57L20.69 14.81L19.93 16.7L21.8 17.5L19.93 18.3L20.69 20.19L18.8 19.43L18 21.3L17.2 19.43L15.31 20.19L16.07 18.3L14.2 17.5L16.07 16.7L15.31 14.81L17.2 15.57Z', fill: ACCENT_FILL, key: 'star' }],
  ],
  scan: [
    ['path', { d: 'M3.07 9.25A9.5 9.5 0 0 1 7.99 3.89', key: 'tl' }],
    ['path', { d: 'M16.01 3.89A9.5 9.5 0 0 1 20.93 9.25', key: 'tr' }],
    ['path', { d: 'M3 16.5V19a2 2 0 0 0 2 2h2.5', key: 'bl' }],
    ['path', { d: 'M16.5 21H19a2 2 0 0 0 2-2v-2.5', key: 'br' }],
    ['rect', { x: '7.5', y: '8', width: '3.5', height: '3.5', rx: '0.75', key: 'q1' }],
    ['rect', { x: '13', y: '8', width: '3.5', height: '3.5', rx: '0.75', key: 'q2' }],
    ['rect', { x: '7.5', y: '13.5', width: '3.5', height: '3.5', rx: '0.75', key: 'q3' }],
    ['path', { d: 'M14.75 15.25h.01', key: 'dot' }],
  ],
  messages: [
    ['path', { d: 'M6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4.5V16A2.5 2.5 0 0 1 4 13.5v-8A2.5 2.5 0 0 1 6.5 3Z', key: 'bubble' }],
    ['path', { d: 'M12 5.6L12.82 7.52L14.76 6.74L13.98 8.68L15.9 9.5L13.98 10.32L14.76 12.26L12.82 11.48L12 13.4L11.18 11.48L9.24 12.26L10.02 10.32L8.1 9.5L10.02 8.68L9.24 6.74L11.18 7.52Z', fill: ACCENT_FILL, key: 'star' }],
  ],
  personAdd: [
    ['circle', { cx: '10', cy: '7.5', r: '3.5', key: 'head' }],
    ['path', { d: 'M3.5 20.5v-.5a5.5 5.5 0 0 1 9.4-3.9', key: 'body' }],
    ['path', { d: 'M18 14.5v6M15 17.5h6', key: 'plus' }],
  ],
  team: [
    ['circle', { cx: '12', cy: '8', r: '3', key: 'head' }],
    ['path', { d: 'M6.5 20v-.5A4.5 4.5 0 0 1 11 15h2a4.5 4.5 0 0 1 4.5 4.5v.5', key: 'body' }],
    ['circle', { cx: '5', cy: '9.5', r: '2', key: 'headL' }],
    ['path', { d: 'M2 18v-.5a3 3 0 0 1 2.5-2.96', key: 'bodyL' }],
    ['circle', { cx: '19', cy: '9.5', r: '2', key: 'headR' }],
    ['path', { d: 'M22 18v-.5a3 3 0 0 0-2.5-2.96', key: 'bodyR' }],
  ],
  store: [
    ['path', { d: 'M3 8l1.5-4.5h15L21 8', key: 'roof' }],
    ['path', { d: 'M3 8a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0', key: 'awning' }],
    ['path', { d: 'M4.5 11v10M19.5 11v10M3 21h18', key: 'walls' }],
    ['path', { d: 'M9.5 21v-4.5a2.5 2.5 0 0 1 5 0V21', key: 'door' }],
  ],
  stamp: [
    ['circle', { cx: '12', cy: '12', r: '9.5', key: 'ring' }],
    ['path', { d: 'M12 6.4L13.18 9.15L15.96 8.04L14.85 10.82L17.6 12L14.85 13.18L15.96 15.96L13.18 14.85L12 17.6L10.82 14.85L8.04 15.96L9.15 13.18L6.4 12L9.15 10.82L8.04 8.04L10.82 9.15Z', fill: ACCENT_FILL, key: 'star' }],
  ],
  games: [
    ['circle', { cx: '12', cy: '13', r: '7.5', key: 'wheel' }],
    ['circle', { cx: '12', cy: '13', r: '1.6', key: 'hub' }],
    ['path', { d: 'M13.6 13H19.5M13.13 14.13L17.3 18.3M12 14.6V20.5M10.87 14.13L6.7 18.3M10.4 13H4.5M10.87 11.87L6.7 7.7M12 11.4V5.5M13.13 11.87L17.3 7.7', key: 'spokes' }],
    ['path', { d: 'M10.5 2.5h3L12 4.5Z', key: 'pointer' }],
  ],
  deals: [
    ['path', { d: 'M3 11.38V4.5A1.5 1.5 0 0 1 4.5 3h6.88a1.5 1.5 0 0 1 1.06.44l8.12 8.12a1.5 1.5 0 0 1 0 2.12l-6.88 6.88a1.5 1.5 0 0 1-2.12 0l-8.12-8.12A1.5 1.5 0 0 1 3 11.38Z', key: 'tag' }],
    ['path', { d: 'M9.5 5.9L10.26 7.67L12.05 6.95L11.33 8.74L13.1 9.5L11.33 10.26L12.05 12.05L10.26 11.33L9.5 13.1L8.74 11.33L6.95 12.05L7.67 10.26L5.9 9.5L7.67 8.74L6.95 6.95L8.74 7.67Z', fill: ACCENT_FILL, key: 'star' }],
  ],
  gift: [
    ['rect', { x: '3', y: '9.5', width: '18', height: '3.5', rx: '1', key: 'lid' }],
    ['path', { d: 'M4.5 13v6.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V13', key: 'box' }],
    ['path', { d: 'M12 9.5V21', key: 'ribbon' }],
    ['path', { d: 'M12 1.6L12.69 3.22L14.33 2.57L13.68 4.21L15.3 4.9L13.68 5.59L14.33 7.23L12.69 6.58L12 8.2L11.31 6.58L9.67 7.23L10.32 5.59L8.7 4.9L10.32 4.21L9.67 2.57L11.31 3.22Z', fill: ACCENT_FILL, key: 'star' }],
  ],
  lock: [
    ['path', { d: 'M8.5 11V9a3.81 3.81 0 1 1 7 0v2', key: 'shackle' }],
    ['rect', { x: '4.5', y: '11', width: '15', height: '10', rx: '2.5', key: 'body' }],
    ['circle', { cx: '12', cy: '15.25', r: '1.25', key: 'hole' }],
    ['path', { d: 'M12 16.5V18', key: 'slot' }],
  ],
  bell: [
    ['path', { d: 'M12 3v1.5', key: 'knob' }],
    ['path', { d: 'M6 16.5v-5a6 6 0 0 1 12 0v5l1.5 2h-15Z', key: 'bell' }],
    ['path', { d: 'M10 21a2.3 2.3 0 0 0 4 0', key: 'clapper' }],
  ],
  star: [
    ['rect', { x: '5.6', y: '5.6', width: '12.8', height: '12.8', rx: '0.5', key: 'square' }],
    ['path', { d: 'M12 2.95L21.05 12L12 21.05L2.95 12Z', key: 'diamond' }],
  ],
  pin: [
    ['path', { d: 'M12 21.5S5 15.3 5 10a7 7 0 0 1 14 0c0 5.3-7 11.5-7 11.5Z', key: 'pin' }],
    ['circle', { cx: '12', cy: '10', r: '2.5', key: 'dot' }],
  ],
  ticket: [
    ['path', { d: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5Z', key: 'ticket' }],
    ['path', { d: 'M15 5v2M15 11v2M15 17v2', key: 'perf' }],
  ],
  stats: [
    ['path', { d: 'M3 21h18', key: 'base' }],
    ['path', { d: 'M6.5 17.5v-5M12 17.5V6M17.5 17.5v-8', key: 'bars' }],
  ],
  premium: [
    ['path', { d: 'M12 2.5L14.78 5.28L18.72 5.28L18.72 9.22L21.5 12L18.72 14.78L18.72 18.72L14.78 18.72L12 21.5L9.22 18.72L5.28 18.72L5.28 14.78L2.5 12L5.28 9.22L5.28 5.28L9.22 5.28Z', fill: ACCENT_FILL, key: 'seal' }],
  ],
  settings: [
    ['path', { d: 'M10.14 5.05l.05-2.38h3.62l.05 2.38 1.74.71 1.71-1.64 2.57 2.57-1.64 1.71.71 1.74 2.38.05v3.62l-2.38.05-.71 1.74 1.64 1.71-2.57 2.57-1.71-1.64-1.74.71-.05 2.38h-3.62l-.05-2.38-1.74-.71-1.71 1.64-2.57-2.57 1.64-1.71-.71-1.74-2.38-.05v-3.62l2.38-.05.71-1.74-1.64-1.71 2.57-2.57 1.71 1.64Z', key: 'gear' }],
    ['circle', { cx: '12', cy: '12', r: '3', key: 'axle' }],
  ],
  card: [
    ['rect', { x: '2.5', y: '5', width: '19', height: '14', rx: '2.5', key: 'card' }],
    ['path', { d: 'M7.5 8.8L8.17 10.37L9.76 9.74L9.13 11.33L10.7 12L9.13 12.67L9.76 14.26L8.17 13.63L7.5 15.2L6.83 13.63L5.24 14.26L5.87 12.67L4.3 12L5.87 11.33L5.24 9.74L6.83 10.37Z', fill: ACCENT_FILL, key: 'star' }],
    ['path', { d: 'M13 10.5h5M13 13.5h3', key: 'lines' }],
  ],
  phone: [
    ['rect', { x: '7', y: '2.5', width: '10', height: '19', rx: '2.5', key: 'body' }],
    ['path', { d: 'M12 7.6L12.61 9.03L14.05 8.45L13.47 9.89L14.9 10.5L13.47 11.11L14.05 12.55L12.61 11.97L12 13.4L11.39 11.97L9.95 12.55L10.53 11.11L9.1 10.5L10.53 9.89L9.95 8.45L11.39 9.03Z', fill: ACCENT_FILL, key: 'star' }],
    ['path', { d: 'M10.75 18.25h2.5', key: 'bar' }],
  ],
  clock: [
    ['circle', { cx: '12', cy: '12', r: '9.5', key: 'face' }],
    ['path', { d: 'M12 6.5V12l3.5 2', key: 'hands' }],
  ],
  roller: [
    ['rect', { x: '3.5', y: '3.5', width: '14', height: '5.5', rx: '1.5', key: 'roll' }],
    ['path', { d: 'M17.5 6.25H20a.5.5 0 0 1 .5.5v4.75a1 1 0 0 1-1 1H12v2.5', key: 'arm' }],
    ['rect', { x: '10.5', y: '15', width: '3', height: '6', rx: '1', key: 'handle' }],
  ],
  eye: [
    ['path', { d: 'M2.5 12C4.6 8 8 5.75 12 5.75S19.4 8 21.5 12c-2.1 4-5.5 6.25-9.5 6.25S4.6 16 2.5 12Z', key: 'lid' }],
    ['path', { d: 'M12 8.8L12.67 10.37L14.26 9.74L13.63 11.33L15.2 12L13.63 12.67L14.26 14.26L12.67 13.63L12 15.2L11.33 13.63L9.74 14.26L10.37 12.67L8.8 12L10.37 11.33L9.74 9.74L11.33 10.37Z', fill: ACCENT_FILL, key: 'star' }],
  ],
  poster: [
    ['rect', { x: '5', y: '2.5', width: '14', height: '19', rx: '2', key: 'sheet' }],
    ['path', { d: 'M12 5.8L12.57 7.13L13.91 6.59L13.37 7.93L14.7 8.5L13.37 9.07L13.91 10.41L12.57 9.87L12 11.2L11.43 9.87L10.09 10.41L10.63 9.07L9.3 8.5L10.63 7.93L10.09 6.59L11.43 7.13Z', fill: ACCENT_FILL, key: 'star' }],
    ['path', { d: 'M9 14.5h6M9 17.5h3.5', key: 'lines' }],
  ],
  parcel: [
    ['path', { d: 'M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5Z', key: 'box' }],
    ['path', { d: 'M3.5 7.5L12 12l8.5-4.5M12 12v9', key: 'edges' }],
  ],
  calendar: [
    ['rect', { x: '3.5', y: '5', width: '17', height: '15.5', rx: '2.5', key: 'sheet' }],
    ['path', { d: 'M8 3v4M16 3v4M3.5 10h17', key: 'rings' }],
    ['path', { d: 'M12 12.6L12.55 13.88L13.84 13.36L13.32 14.65L14.6 15.2L13.32 15.75L13.84 17.04L12.55 16.52L12 17.8L11.45 16.52L10.16 17.04L10.68 15.75L9.4 15.2L10.68 14.65L10.16 13.36L11.45 13.88Z', fill: ACCENT_FILL, key: 'star' }],
  ],
  mail: [
    ['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2.5', key: 'envelope' }],
    ['path', { d: 'M3.5 7.5l8.5 6 8.5-6', key: 'flap' }],
  ],
  megaphone: [
    ['path', { d: 'M3 10v4a1 1 0 0 0 1 1h3l8 4.5V4.5L7 9H4a1 1 0 0 0-1 1Z', key: 'horn' }],
    ['path', { d: 'M18.5 9.5a3.5 3.5 0 0 1 0 5', key: 'wave' }],
    ['path', { d: 'M8 15v3.5a1.5 1.5 0 0 0 3 0v-1.8', key: 'handle' }],
  ],
} satisfies Record<string, IconNode>;

