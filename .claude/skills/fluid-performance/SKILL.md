---
name: fluid-performance
description: Make jitplus and jitpluspro feel fast and fluid — startup time, 60 fps scrolling, instant-feeling actions (optimistic updates, prefetch, cache), smooth animations off the JS thread, image weight, re-render control, and how to measure on Android/iOS. Use when a screen is slow to open, a list stutters, a tap feels laggy, the app starts slowly, or before shipping a screen with a long list, heavy images or animations.
---

# Fluid performance

"Fluid" means: the app opens fast, every tap answers within 100 ms, lists scroll at 60 fps, and data seems already there. Measure first, then fix the biggest cost.

## Perceived speed (biggest win, cheapest)

- **Show cached data immediately.** Both apps persist react-query (`createQueryPersister`). Screens read from the cache and refresh in the background. Never blank the screen while refetching (`placeholderData: keepPreviousData` for paginated or filtered lists).
- **Optimistic updates** for actions the server almost always accepts (follow a merchant, mark a notification read, toggle a setting): update the cache in `onMutate`, roll back in `onError`. Not for money, stamps or rewards: those wait for the server, with a loading state on the button.
- **Prefetch** the next likely screen: on a list row press-in or when a list renders, `queryClient.prefetchQuery` for the detail screen.
- **Skeletons** that match the final layout, never a lone spinner in the middle of the screen. No skeleton for under ~300 ms (avoid flicker).
- **Buttons respond instantly**: pressed state plus haptic on touch, a spinner inside the button while waiting, no double submit.

## Lists

- Any list that can exceed about 20 rows uses `FlatList` (or FlashList if added) — **not** `ScrollView` + `.map()`. Audit of 2026-11-21: the long lists (transactions, clients, notifications) already use FlatList. The `ScrollView` + `.map()` cases are bounded (constants, week days, settings, server-limited search, paginated coupons with "load more"). Re-check this whenever a new list renders server data.
- `keyExtractor` on a stable id. Rows wrapped in `memo`. `renderItem` defined with `useCallback`. No inline object or array props inside rows.
- Tune `initialNumToRender` (about one screen), `windowSize` (5–7) and `removeClippedSubviews` on Android for long lists. Use `getItemLayout` when rows have a fixed height.
- Paginate from the server (cursor) with `onEndReached`, and show a footer loader.

## Images

- `expo-image` everywhere, with `cachePolicy="memory-disk"`, `recyclingKey` in lists, and a fixed size.
- Request the right size from storage (thumbnails for lists); never download a 2000 px logo for a 40 px avatar. Pro compresses uploads with `expo-image-manipulator`; keep it on every upload.
- `transition` 150–200 ms at most; no fade on images that are already cached.

## Animations

- jitplus: Reanimated 4 + worklets. Animate `transform` and `opacity` only, on the UI thread. Gestures use `react-native-gesture-handler`. Springs and easings come from `utils/motion.ts`.
- Pro: core `Animated` with `useNativeDriver: true` (only `transform`/`opacity`). Do not animate `width`, `height`, `top` or colors on the JS thread in lists.
- Respect reduced motion (`useReduceMotion`). Never animate a whole list on mount.

## Re-renders

- Context values are memoized. Split contexts that change often (e.g. the realtime socket) from stable ones.
- zustand selectors pick the smallest slice (`useAuthStore((s) => s.merchant?.id)`), never the whole store.
- Heavy derived data goes in `useMemo` with correct deps. Do not memoize trivial values.
- Debounce search inputs (`DEBOUNCE_MS` 300) and filter with `useDeferredValue` for big local lists.

## Startup

- Splash stays until fonts and the auth state are ready, nothing more. Do not wait for network calls before the first screen: render from the cache.
- Lazy-load heavy screens and libraries (maps, games, PDF, video) when they are opened, not at app start.
- Keep the root layout light: no big synchronous work, no large JSON parsing at import time.

## Measure

```bash
ADB=/mnt/c/Users/ayoub/AppData/Local/Android/Sdk/platform-tools/adb.exe
$ADB shell dumpsys gfxinfo <package> reset   # then use the screen
$ADB shell dumpsys gfxinfo <package> | grep -E "Total frames|Janky frames|percentile"
$ADB shell am start -W -n <package>/.MainActivity | grep TotalTime   # cold start (force-stop first)
```

Packages: `com.jitplus.client` (jitplus) and `com.jitplus.pro` (Pro). In development, use the React Native perf monitor (dev menu) and the React DevTools profiler for re-renders. Always measure on a **release-like build** before concluding; dev builds are much slower. Targets: janky frames < 5 %, cold start < 2.5 s on a mid-range Android.

## Report

Give the before/after numbers for what you measured. If you only read code, say the gain is expected, not measured.
