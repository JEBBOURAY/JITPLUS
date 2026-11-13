import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play } from 'lucide-react-native';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { font } from '@/constants/design';
import type { DemoId } from '@/constants/demoVideos';

/**
 * "Voir la démo" coach mark: a small bubble pointing at a page's demo button,
 * shown a moment after the page opens and fading out on its own.
 *
 * Rendered by <DemoHintHost/> at the app root (above every screen and header,
 * pointerEvents box-none so it never blocks the page), fed by DemoVideoButton.
 */

/** Times a page's hint may appear before it stops for good. */
export const DEMO_HINT_MAX_SHOWS = 2;
/** How long the bubble stays before fading out. */
export const DEMO_HINT_DURATION_MS = 4000;

export interface DemoHintRequest {
  id: DemoId;
  /** Button rect in window coordinates (measureInWindow). */
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  color: string;
  textColor: string;
  isRTL: boolean;
  onPress: () => void;
}

// ── Tiny store (one hint at a time) ──────────────────────────────────────────
let current: DemoHintRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => current;

export function showDemoHint(req: DemoHintRequest) { current = req; emit(); }
/** Hides the hint, only if it still belongs to `id` (when given). */
export function hideDemoHint(id?: DemoId) {
  if (!current || (id && current.id !== id)) return;
  current = null;
  emit();
}

// ── Persistence ──────────────────────────────────────────────────────────────
async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** True when the page's hint may still be shown: demo never opened and shown < max. */
export async function shouldShowDemoHint(id: DemoId): Promise<boolean> {
  const [seen, counts] = await Promise.all([
    readJson<unknown>(ASYNC_STORAGE_KEYS.DEMO_VIDEOS_SEEN, []),
    readJson<Record<string, number>>(ASYNC_STORAGE_KEYS.DEMO_HINT_SHOWN, {}),
  ]);
  if (Array.isArray(seen) && seen.includes(id)) return false;
  return (counts?.[id] ?? 0) < DEMO_HINT_MAX_SHOWS;
}

export async function recordDemoHintShown(id: DemoId): Promise<void> {
  const counts = await readJson<Record<string, number>>(ASYNC_STORAGE_KEYS.DEMO_HINT_SHOWN, {});
  const next = { ...counts, [id]: (counts?.[id] ?? 0) + 1 };
  AsyncStorage.setItem(ASYNC_STORAGE_KEYS.DEMO_HINT_SHOWN, JSON.stringify(next)).catch(() => {});
}

/** Same list as the "Tutoriels vidéo" screen, so a clip opened anywhere counts as seen. */
export async function markDemoSeen(id: DemoId): Promise<void> {
  const seen = await readJson<unknown>(ASYNC_STORAGE_KEYS.DEMO_VIDEOS_SEEN, []);
  const list = Array.isArray(seen) ? seen : [];
  if (list.includes(id)) return;
  AsyncStorage.setItem(ASYNC_STORAGE_KEYS.DEMO_VIDEOS_SEEN, JSON.stringify([...list, id])).catch(() => {});
}

// ── Host ─────────────────────────────────────────────────────────────────────
const EDGE = 12;
const ARROW = 8;
const GAP = 4;
const MAX_WIDTH = 250;

export function DemoHintHost() {
  const req = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!req) return null;
  // key: a new request restarts the animation from scratch.
  return <DemoHintBubble key={`${req.id}-${req.rect.x}-${req.rect.y}`} req={req} />;
}

function DemoHintBubble({ req }: { req: DemoHintRequest }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Host origin measured with the same measureInWindow as the button, so both share one
  // coordinate space (on Android the window offset can differ from the screen's by the status bar).
  const rootRef = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(6)).current;

  const { rect } = req;
  const ox = origin?.x ?? 0;
  const oy = origin?.y ?? 0;
  const btnTop = rect.y - oy;
  const btnBottom = btnTop + rect.height;
  const anchorX = rect.x - ox + rect.width / 2;

  useEffect(() => {
    if (!size || !origin) return;
    let alive = true;
    let fadeOut: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (!alive) return;
      if (reduce) shift.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(shift, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
    const timer = setTimeout(() => {
      fadeOut = Animated.timing(opacity, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true });
      fadeOut.start(({ finished }) => { if (finished) hideDemoHint(req.id); });
    }, DEMO_HINT_DURATION_MS);
    return () => { alive = false; clearTimeout(timer); fadeOut?.stop(); };
  }, [size, origin, opacity, shift, req.id]);

  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  // Measured once at the left edge (full width available), then placed under/over the button.
  const left = size ? Math.min(Math.max(anchorX - w / 2, EDGE), screenW - w - EDGE) : EDGE;
  // Always under the button; above it only when there is no room left below (scanner pill at the bottom).
  const below = btnBottom + GAP + ARROW + h + EDGE <= screenH;
  const top = below ? btnBottom + GAP : btnTop - GAP - ARROW - h;
  const arrowLeft = Math.min(Math.max(anchorX - left - ARROW, 14), Math.max(w - 14 - ARROW * 2, 14));

  return (
    <View
      ref={rootRef}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      collapsable={false}
      onLayout={() => rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
    >
      <Animated.View
        onLayout={(e) => {
          if (size) return;
          const { width, height } = e.nativeEvent.layout;
          setSize({ w: width, h: height });
        }}
        style={[
          styles.wrap,
          size ? { width: w } : null,
          { left, top, opacity, transform: [{ translateY: below ? shift : Animated.multiply(shift, -1) }] },
        ]}
      >
        {below ? <View style={[styles.arrow, styles.arrowUp, { marginLeft: arrowLeft, borderBottomColor: req.color }]} /> : null}
        <Pressable
          onPress={() => { hideDemoHint(req.id); req.onPress(); }}
          accessibilityRole="button"
          accessibilityLabel={req.text}
          style={[styles.bubble, { backgroundColor: req.color, flexDirection: req.isRTL ? 'row-reverse' : 'row' }]}
        >
          <Play size={12} color={req.textColor} fill={req.textColor} />
          <Text style={[styles.text, { color: req.textColor, textAlign: req.isRTL ? 'right' : 'left' }]} maxFontSizeMultiplier={1.2}>
            {req.text}
          </Text>
        </Pressable>
        {!below ? <View style={[styles.arrow, styles.arrowDown, { marginLeft: arrowLeft, borderTopColor: req.color }]} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', maxWidth: MAX_WIDTH },
  bubble: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  arrow: { alignSelf: 'flex-start', width: 0, height: 0, borderLeftWidth: ARROW, borderRightWidth: ARROW, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  arrowUp: { borderBottomWidth: ARROW, marginBottom: -1 },
  arrowDown: { borderTopWidth: ARROW, marginTop: -1 },
});
