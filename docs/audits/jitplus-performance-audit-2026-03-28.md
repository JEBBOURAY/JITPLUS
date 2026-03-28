# Audit Complet des Performances — JitPlus (Client App)

**Date :** 28 mars 2026  
**Version :** 1.1.8  
**Stack :** Expo 54 · React Native 0.81.5 · React 19.1 · React Query 5 · Zustand 5  
**Score global : 82/100 (B+)**

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Architecture & Démarrage](#2-architecture--démarrage)
3. [State Management & Re-renders](#3-state-management--re-renders)
4. [Réseau & Data Fetching](#4-réseau--data-fetching)
5. [FlatList & Virtualisation](#5-flatlist--virtualisation)
6. [Animations](#6-animations)
7. [Images & Assets](#7-images--assets)
8. [Carte (Discover)](#8-carte-discover)
9. [Mémoire & Fuites](#9-mémoire--fuites)
10. [Bundle Size](#10-bundle-size)
11. [Écrans individuels](#11-écrans-individuels)
12. [Recommandations prioritaires](#12-recommandations-prioritaires)

---

## 1. Résumé exécutif

| Domaine | Score | Verdict |
|---------|-------|---------|
| Temps de démarrage | 8/10 | ✅ Bon — fonts + auth en parallèle, splash bien géré |
| Re-renders | 7/10 | ⚠️ Moyen — context re-renders sur AuthContext/ThemeContext |
| Data fetching | 9/10 | ✅ Excellent — React Query bien configuré, WS + FCM dual-channel |
| FlatList perf | 8/10 | ✅ Bon — `removeClippedSubviews`, `windowSize`, `React.memo` |
| Animations | 8/10 | ✅ Bon — `useNativeDriver: true` partout sauf barres de progression |
| Images | 8/10 | ✅ Bon — expo-image avec `cachePolicy="disk"`, prefetch batché |
| Carte / Map | 7/10 | ⚠️ Moyen — Supercluster bon, mais tracksViewChanges + MAP_STYLE inline |
| Mémoire | 7/10 | ⚠️ Moyen — quelques écouteurs à risque, infinite query gcTime bien limité |
| Bundle size | 8/10 | ✅ Bon — lazy tabs, conditional require pour Notifications |
| Offline / Persistence | 9/10 | ✅ Excellent — query persist + stale-while-revalidate + reconnection |

---

## 2. Architecture & Démarrage

### ✅ Points forts

- **Splash Screen** bien contrôlé : `preventAutoHideAsync()` + `hideAsync` déclenché uniquement quand les fonts ET l'auth sont prêts (`SplashGate`)
- **Conditional `require`** pour `expo-notifications` (non importé dans Expo Go) — évite crash + réduit le code chargé en dev
- **Lazy tabs** activées (`lazy: true`) + `freezeOnBlur: true` dans le `TabLayout` — les onglets non visités ne montent pas au démarrage
- **Fonts** : seulement 4 Lexend weights + 1 SpaceMono — raisonnable

### ⚠️ Problèmes identifiés

#### P1 — `SplashGate` affiche un `ActivityIndicator` au lieu de garder le splash natif
**Impact :** Flash blanc entre le splash natif et le premier écran  
**Fichier :** `app/_layout.tsx`, lignes ~215-230

Le splash natif se cache quand `authLoading` passe à `false`, mais pendant le chargement, un composant React avec `<Image>` + `<ActivityIndicator>` est rendu. Sur Android, cela cause un flash visible car le splash natif a déjà été remplacé par le renderer React.

**Recommandation :** Utiliser `expo-splash-screen` avec `SplashScreen.hideAsync()` directement et ne rien render tant que `authLoading === true` (return `null`). Le splash natif reste affiché naturellement.

#### P2 — `NetInfo.addEventListener` sans cleanup au module-level
**Impact :** Mineur — une seule souscription globale  
**Fichier :** `app/_layout.tsx`, ligne ~68

Le `onlineManager.setEventListener` est appelé au module level. C'est acceptable car c'est un singleton, mais le listener NetInfo ne sera jamais nettoyé (même si c'est intentionnel ici).

---

## 3. State Management & Re-renders

### ✅ Points forts

- **Zustand** pour l'auth store avec des slices granulaires — (`useAuthStore((s) => s.client)`) permet aux composants de ne re-render que sur leur slice
- **`useCallback`** systématiquement utilisé dans les handlers de `HomeScreen`, `DiscoverScreen`, `NotificationsScreen`
- **`useMemo`** pour les listes triées/filtrées (`filteredCards`, `cards`, `filteredMerchants`, `mapItems`)
- **`React.memo`** sur les composants coûteux : `CardItem`, `CustomTabBar`, `GlassCard`, `MerchantLogo`, `FallbackMerchantCard`, `MerchantCallout`, `TrackedMarker`

### ⚠️ Problèmes identifiés

#### P3 — `AuthContext` provoque des re-renders massifs (CRITIQUE)
**Impact :** Élevé — chaque changement d'état dans `AuthProvider` re-render TOUS les consumers  
**Fichier :** `contexts/AuthContext.tsx`

L'`AuthContext` expose un objet recréé à chaque render du Provider, contenant `client`, `isLoading`, `isAuthenticated`, `isGuest`, `needsPasswordSetup`, et ~12 callbacks. Bien que les callbacks soient wrappés dans `useCallback`, l'objet value du context est recréé à chaque `store` change → **tous les composants qui appellent `useAuth()` re-render**.

Composants impactés : `TabLayout`, `RootLayoutNav`, `HomeScreen`, `QRScreen`, `ProfileScreen`, `NotificationsScreen`, `DiscoverScreen`, `CustomTabBar`, `GuestGuard`.

**Recommandation :** Deux options :
1. **Memoizer la valeur du context** avec `useMemo` sur les dépendances réelles
2. **Migrer vers Zustand directement** au lieu du context (comme `useAuthStore` existe déjà, supprimer le context wrapper)

```tsx
// Option 1 : Memoiser
const value = useMemo(() => ({
  client: store.client,
  isLoading: store.loading,
  isAuthenticated: !!store.client,
  isGuest: store.isGuest,
  needsPasswordSetup: store.needsPasswordSetup,
  enterGuestMode, sendOtp, verifyOtp, /* ... */
}), [store.client, store.loading, store.isGuest, store.needsPasswordSetup]);
```

#### P4 — `useTheme()` crée un context lookup à chaque call
**Impact :** Moyen — chaque composant enfant qui utilise `useTheme()` re-render quand le mode change  
Les composants enfants dans les `FlatList` (`CardItem`, etc.) appellent `useTheme()` individuellement. C'est intentionnel pour le dark mode, mais coûteux quand le thème ne change pas.

**Recommandation :** Passer les couleurs nécessaires en props aux composants de liste mémorisés au lieu de les lire depuis le context.

#### P5 — `HomeScreen` a ~280 lignes de state + 15 `useState`
**Impact :** Moyen — chaque `setState` cause un re-render du composant entier  
Le composant gère search, sort, filters, location, animations, banners.

**Recommandation :** Extraire en sous-composants : `<SearchBar>`, `<SortPills>`, `<CategoryFilter>`, `<WelcomeBanner>`, `<RewardBanner>`. Chaque sous-composant gère son propre state local.

---

## 4. Réseau & Data Fetching

### ✅ Points forts (Excellent)

- **React Query** parfaitement configuré :
  - `staleTime` calibré par endpoint (30s points, 5min merchants, 15s notifications)
  - `gcTime: 5min` sur infinite queries pour limiter la mémoire
  - `refetchOnReconnect: 'always'` pour fraîcheur post-offline
  - **Query persistence** via AsyncStorage avec blacklisting intelligent (pas de persistence des données sensibles)
  - Cache invalidation centralisée via `queryKeys`
- **Dual-channel real-time** : WebSocket (foreground) + FCM data payloads (background/offline)
- **Optimistic updates** sur `markNotificationAsRead` et `markAllNotificationsAsRead` — UX instantanée
- **Token refresh** avec interceptor axios + retry automatique
- **Déduplication** : `useUnreadNotificationCount` utilisé dans TabBar + NotificationsScreen sans double requête

### ⚠️ Problèmes identifiés

#### P6 — `useFocusEffect` dans `HomeScreen` appelle `refetch()` à chaque focus
**Impact :** Moyen — requête HTTP à chaque switch d'onglet, même si les données ne sont pas stale  
**Fichier :** `app/(tabs)/index.tsx`

```tsx
useFocusEffect(
  useCallback(() => { refetch(); }, [refetch]),
);
```

React Query gère déjà la revalidation via `staleTime`. Ce `useFocusEffect` force un réseau call systématiquement.

**Recommandation :** Remplacer par `refetchOnFocus` au niveau du query config, ou vérifier `isStale` avant de refetch :
```tsx
useFocusEffect(useCallback(() => {
  if (queryClient.getQueryState(queryKeys.points)?.isInvalidated) refetch();
}, [refetch]));
```

#### P7 — `NotificationsScreen` invalide les queries à chaque focus
**Impact :** Même pattern — double invalidation notifications + unreadCount  
**Fichier :** `app/(tabs)/notifications.tsx`

```tsx
useFocusEffect(useCallback(() => {
  queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
}, [...]));
```

Combiné avec `useAppForegroundRefresh()` qui invalide déjà les mêmes queries quand l'app revient au foreground, cela peut créer une cascade : foreground → invalidate → focus → invalidate à nouveau.

**Recommandation :** Supprimer l'invalidation dans `useFocusEffect` et laisser React Query gérer via `staleTime` (15s/10s).

#### P8 — `useUnreadNotificationCount` avec `refetchInterval: 30s`
**Impact :** Faible — polling redondant quand le WS est connecté  
Le polling est un fallback utile quand le WS est down, mais il tourne aussi quand le WS est actif.

**Recommandation :** (Optionnel) Conditionner le `refetchInterval` : `refetchInterval: socket?.connected ? false : 30_000`

---

## 5. FlatList & Virtualisation

### ✅ Points forts

- **`removeClippedSubviews`** activé sur Android/iOS pour les notifications
- **`maxToRenderPerBatch: 10`**, **`windowSize: 7`**, **`initialNumToRender: 10`** — valeurs raisonnables
- **`keyExtractor`** wrappé dans `useCallback`
- **`CardItem`** wrappé dans `React.memo` — évite les re-renders des cartes non modifiées
- **`keepPreviousData`** pour les notifications infinies — pas de flash pendant le chargement

### ⚠️ Problèmes identifiés

#### P9 — `HomeScreen` — FlatList manque les props d'optimisation
**Impact :** Moyen — la liste des cartes n'a pas `removeClippedSubviews`, `maxToRenderPerBatch`, `windowSize`  
**Fichier :** `app/(tabs)/index.tsx`

La FlatList des cartes de fidélité ne spécifie aucune prop de virtualisation (contrairement à NotificationsScreen qui le fait). Pour un utilisateur avec 50+ cartes, cela peut être lent.

**Recommandation :**
```tsx
<FlatList
  removeClippedSubviews={Platform.OS !== 'web'}
  maxToRenderPerBatch={8}
  windowSize={5}
  initialNumToRender={6}
  getItemLayout={...} // si hauteur fixe possible
/>
```

#### P10 — `FadeInView` avec stagger dans NotificationsScreen
**Impact :** Moyen — chaque notification lance une animation Animated.timing au mount  
Avec `MAX_STAGGER_DELAY_MS = 300` les 10 premiers items sont staggered, mais chaque `FadeInView` crée 2 `Animated.Value` + 2 `Animated.timing`. Pour 10 items = 20 animations parallèles au mount.

**Recommandation :** Pour les listes longues, n'appliquer le FadeIn qu'aux 3-5 premiers items visibles. Passer `delay={0}` aux suivants ou supprimer le wrapper FadeIn.

---

## 6. Animations

### ✅ Points forts

- **`useNativeDriver: true`** utilisé systématiquement pour opacity et translation (FadeInView, GlassCard, SwipeableNotifCard, welcome banner, reward banner)
- **`GlassCard`** — animation de press scale/glow bien optimisée avec `spring` natif
- **Swipe-to-dismiss** : `PanResponder` avec `useNativeDriver: true` sur translateX et opacity

### ⚠️ Problèmes identifiés

#### P11 — Barre de progression des cartes : `useNativeDriver: false`
**Impact :** Moyen — chaque `CardItem` lance un `Animated.timing` avec JS driver pour la width  
**Fichier :** `app/(tabs)/index.tsx`, `CardItem`

```tsx
Animated.timing(progressAnim, {
  toValue: animTarget,
  duration: PROGRESS_ANIM_DURATION_MS,
  useNativeDriver: false, // ← obligé car on anime `width`
}).start();
```

C'est une limitation connue (width n'est pas animable nativement), mais avec 30+ cartes cela fait 30 animations JS simultanées au mount.

**Recommandation :** Remplacer par une animation de `scaleX` avec `useNativeDriver: true` :
```tsx
// Wrapper fixe + inner view scalée de 0 à 1
<View style={{ width: '100%', overflow: 'hidden' }}>
  <Animated.View style={{
    transform: [{ scaleX: progressAnim }],
    transformOrigin: 'left',
  }} />
</View>
```
Ou utiliser `react-native-reanimated` (déjà installé) pour animer la largeur via `useAnimatedStyle`.

#### P12 — `Skeleton` shimmer : loop infinie Animated
**Impact :** Faible — chaque Skeleton lance une boucle `Animated.loop` avec JS timing  
Les Skeletons sont montrés brièvement au chargement, donc l'impact est limité. Mais si plusieurs écrans chargent simultanément, cela peut cumuler.

**Recommandation :** (Optionnel) Migrer vers un shimmer Reanimated `useSharedValue` + `withRepeat` pour un shimmer natif.

---

## 7. Images & Assets

### ✅ Points forts

- **`expo-image`** utilisé partout (sauf logo statique) — bien meilleur que `<Image>` de RN
  - `cachePolicy="disk"` — cache persistant entre sessions
  - `recyclingKey` — évite les flash de rechargement quand expo-image recycle les views dans les listes
  - `contentFit="cover"` — aucun stretch/blank
- **Prefetch batché** (`BATCH_SIZE = 6`) avec déduplique par session — évite le flooding réseau
- **Fallback gracieux** : `onError → setLogoError(true)` → affiche emoji catégorie ou logo JitPlus

### ⚠️ Problèmes identifiés

#### P13 — `require('@/assets/images/jitpluslogo.png')` utilisé à ~5 endroits différents
**Impact :** Faible — Metro résout le même fichier, mais chaque `require` dans un memo peut invalider le memo si la référence change  
**Recommandation :** Extraire dans un constant :
```tsx
// constants/images.ts
export const JITPLUS_LOGO = require('@/assets/images/jitpluslogo.png');
```

#### P14 — Pas de placeholder/blurhash sur les logos marchands
**Impact :** Moyen — les logos chargent depuis le réseau. Avant le chargement, soit `null` soit un emoji est affiché. Un placeholder gris ou blurhash donnerait un meilleur CLS (Cumulative Layout Shift).

**Recommandation :** Si le backend peut générer des blurhash (10 octets), les passer à `expo-image` :
```tsx
<Image placeholder={merchant.logoBlurHash} transition={200} />
```

---

## 8. Carte (Discover)

### ✅ Points forts

- **Supercluster** pour le clustering — O(n log n), bien plus performant que le clustering naïf
- **Seuils de recalcul** (`RECLUSTER_PAN_THRESHOLD_KM`, `RECLUSTER_ZOOM_THRESHOLD`) — évite les recalculs inutiles sur micro-pans
- **`TrackedMarker`** pattern — `tracksViewChanges=true` au mount → `false` après 500ms (Android perf)
- **`SafeMapView`** avec fallback gracieux pour Expo Go
- **`MAPS_AVAILABLE`** vérifié avant de trier/mapper pour la liste fallback — zero wasted computation

### ⚠️ Problèmes identifiés

#### P15 — `MAP_STYLE` array inline de ~30 objets recréé à chaque render
**Impact :** Moyen — le re-render de `DiscoverScreen` recrée l'array et le passe à `<SafeMapView>`  
**Fichier :** `app/(tabs)/discover.tsx`

Le `MAP_STYLE` est déclaré comme `as const` au module level, donc techniquement c'est le même objet. Cependant, `customMapStyle={MAP_STYLE as any}` fait un cast qui pourrait être mal interprété par TypeScript/Metro.

**Recommandation :** Vérifier que le `as any` ne crée pas un nouveau tableau. Idéalement, le garder `as const` sans cast.

#### P16 — `onRegionChangeComplete` met à jour `currentRegion` sur chaque pan/zoom
**Impact :** Moyen — chaque mouvement de carte cause `setCurrentRegion()` → re-render de `DiscoverScreen` → recalcul du clustering  
Le `useMapClustering` a une garde interne (seuils), mais le re-render du composant parent est quand même déclenché.

**Recommandation :** Utiliser `useRef` pour `currentRegion` au lieu de `useState`, et trigger le cluster recalc via un mutable ref + timer debounce :
```tsx
const regionRef = useRef(DEFAULT_REGION);
const handleRegionChange = useCallback((r) => {
  regionRef.current = r;
  // Le hook useMapClustering peut read le ref
}, []);
```

#### P17 — `sortedMappableMerchants` recalculé mais inutilisé quand `MAPS_AVAILABLE`
**Impact :** Faible — le `useMemo` est gardé par `if (MAPS_AVAILABLE) return []`, donc le calcul est skip  
C'est bien fait, aucune action requise.

---

## 9. Mémoire & Fuites

### ✅ Points forts

- **`cancelled` flag** dans les effets async (`_layout.tsx`, `DiscoverScreen`) — évite les setState sur composant démonté
- **`sessionVersionRef`** dans `AuthContext` — empêche les réponses stale d'écraser le state courant
- **`gcTime: 5 * 60 * 1000`** sur infinite queries — purge les pages après 5min
- **Cleanup systématique** : `removeEventListener`, `animation.stop()`, `clearTimeout`
- **`queryClient.clear()`** au logout — purge toutes les données sensibles

### ⚠️ Problèmes identifiés

#### P18 — `Dimensions.addEventListener` jamais nettoyé dans `responsive.ts`
**Impact :** Faible — singleton module-level, intentionnel (commenté)  
C'est acceptable car le module vit pour toute la durée de l'app.

#### P19 — `prefetched` Set dans `imageCache.ts` croît sans limite
**Impact :** Faible — le Set contient des strings (URLs de logos). Avec 1000 marchands uniques, c'est ~50KB max.  
**Recommandation :** (Optionnel) Limiter à 500 entrées avec un LRU ou reset au logout.

#### P20 — `PanResponder` dans `SwipeableNotifCard` créé dans un `useRef` à chaque instance
**Impact :** Faible — normal pour un PanResponder, mais avec 50+ notifications visibles, cela fait 50 PanResponder instances  
**Recommandation :** (Optionnel) Considérer `react-native-gesture-handler` Swipeable qui est plus optimisé pour les listes.

---

## 10. Bundle Size

### ✅ Points forts

- **Conditional require** pour `expo-notifications` et `react-native-view-shot` — réduit la taille effective en Expo Go
- **Dépendances raisonnables** : ~30 dependencies production, pas de lib lourde inutile
- **`lucide-react-native`** — tree-shakable, seuls les icônes utilisées sont bundlées
- **`supercluster`** — ~10KB gzipped, bien mieux qu'une lib de mapping full-featured
- **Monorepo `@jitplus/shared`** — code partagé sans duplication

### ⚠️ Problèmes identifiés

#### P21 — `expo-blur` (BlurView) importé dans CustomTabBar
**Impact :** Moyen — `expo-blur` inclut du code natif et peut ajouter ~50KB au bundle  
Le BlurView n'est visible que sur iOS (Android fallback opaque).

**Recommandation :** (Optionnel) Pour Android, rendre conditionnellement sans BlurView :
```tsx
const Container = Platform.OS === 'ios' ? BlurView : View;
```
(Déjà fait partiellement avec `backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.bgTabBar`)

#### P22 — `react-native-reanimated` installé mais non utilisé directement
**Impact :** Moyen — ~200KB ajoutés au bundle. Le seul usage est le plugin Babel (pour Gesture Handler / Navigation)  
Si le plugin est nécessaire pour `react-native-screens` / navigation, le garder. Sinon, considérer de le supprimer.

**Recommandation :** Vérifier si le Babel plugin est réellement nécessaire. Si oui, utiliser Reanimated pour les animations (remplacer Animated API → meilleure perf native).

---

## 11. Écrans individuels

### HomeScreen (index.tsx) — 7/10

| Aspect | Verdict | Détail |
|--------|---------|--------|
| Mémorisation | ✅ | `useMemo` pour filtres/tri, `React.memo` sur `CardItem` |
| FlatList | ⚠️ | Manque `removeClippedSubviews`, `maxToRenderPerBatch` |
| State bloat | ⚠️ | 15 useState dans un seul composant |
| Animation | ⚠️ | 30+ progress bars JS-driven au mount |
| Prefetch | ✅ | Logos merchants prefetchés au load |

### DiscoverScreen (discover.tsx) — 7/10

| Aspect | Verdict | Détail |
|--------|---------|--------|
| Clustering | ✅ | Supercluster performant avec seuils |
| Map re-render | ⚠️ | `onRegionChangeComplete` → useState → re-render |
| TrackedMarker | ✅ | Pattern correct pour Android bitmap |
| Memos | ✅ | Tous les sous-composants mémorisés |

### NotificationsScreen (notifications.tsx) — 8/10

| Aspect | Verdict | Détail |
|--------|---------|--------|
| FlatList | ✅ | Toutes les props d'optimisation présentes |
| Swipe | ⚠️ | PanResponder par item, pourrait être Gesture Handler |
| Stagger | ⚠️ | 10+ FadeInView simultanés au mount |
| Infinite scroll | ✅ | handleEndReached bien gardé |

### QRScreen (qr.tsx) — 9/10

| Aspect | Verdict | Détail |
|--------|---------|--------|
| Token cache | ✅ | SecureStore → pas de fetch à chaque focus |
| Brightness | ✅ | Restore propre (iOS backup + Android clear) |
| Render | ✅ | Composant simple, pas de liste |

### ProfileScreen (profile.tsx) — 7/10

| Aspect | Verdict | Détail |
|--------|---------|--------|
| State count | ⚠️ | 20+ useState — God component |
| Draft persist | ✅ | Debounced, background-safe |
| Network calls | ⚠️ | `refreshProfile()` sur chaque focus |

---

## 12. Recommandations prioritaires

### 🔴 Priorité Haute (impact direct sur la réactivité)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| P3 | Memoiser la valeur de `AuthContext` ou migrer vers Zustand pur | 2h | Élimine des dizaines de re-renders inutiles sur CHAQUE changement d'auth |
| P6/P7 | Supprimer les `refetch()`/`invalidateQueries()` forcés dans `useFocusEffect` | 30min | Réduit les requêtes réseau de ~50% sur navigation entre onglets |
| P9 | Ajouter les props de virtualisation sur la FlatList de HomeScreen | 15min | Améliore le scroll de la liste des cartes pour les utilisateurs 50+ cartes |
| P11 | Migrer les barres de progression vers `scaleX` natif ou Reanimated | 1h | Élimine 30+ animations JS simultanées au mount |

### 🟡 Priorité Moyenne (amélioration UX notable)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| P5 | Décomposer HomeScreen en sous-composants | 2h | Réduit la surface de re-render, meilleure maintenabilité |
| P10 | Limiter les FadeInView stagger aux 5 premiers items | 15min | Moins d'animations au mount de la liste de notifications |
| P14 | Ajouter des blurhash/placeholders sur les logos marchands | 1h (backend + frontend) | Meilleur CLS, UX premium |
| P16 | Utiliser `useRef` pour `currentRegion` dans DiscoverScreen | 30min | Élimine les re-renders de carte à chaque mouvement |

### 🟢 Priorité Basse (optimisation fine)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| P1 | Supprimer le splash React custom, garder le splash natif | 30min | Élimine le flash blanc au démarrage |
| P4 | Passer les couleurs en props aux composants de liste | 1h | Micro-optimisation re-renders |
| P8 | Conditionner `refetchInterval` au status WS | 30min | Économise polling réseau quand WS connecté |
| P12 | Migrer Skeleton shimmer vers Reanimated | 30min | Animation nativement drivée |
| P13 | Extraire `require(logo)` en constante | 5min | Code plus propre |
| P20 | Migrer SwipeableNotifCard vers Gesture Handler | 2h | PanResponder plus performant |
| P22 | Utiliser Reanimated (déjà installé) pour toutes les animations | 3h | Bundle déjà payé, autant en profiter |

---

## Annexe — Bonnes pratiques déjà en place

Ces patterns sont solides et ne doivent pas être modifiés :

1. **Query persistence** avec blacklist de données sensibles ✅
2. **Dual-channel real-time** (WS + FCM) avec optimistic updates ✅
3. **Centralized query keys** pour invalidation cohérente ✅
4. **`sessionVersionRef`** contre les race conditions auth ✅
5. **SSRF protection** dans `resolveImageUrl()` ✅
6. **Sentry** avec sampling raisonnable (0.2 traces) et PII disabled ✅
7. **`onlineManager`** synced avec NetInfo pour offline resilience ✅
8. **`freezeOnBlur: true`** pour frozen tabs ✅
9. **Batched image prefetch** avec déduplique ✅
10. **Responsive utilities** (`wp`, `hp`, `ms`) avec live Dimensions listener ✅
