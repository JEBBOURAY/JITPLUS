const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// In local dev (monorepo), shared lives at ../../packages/shared.
// On EAS builds, shared is bundled at ./packages/shared (self-contained workspace).
// Use projectRoot as workspace root so Metro finds packages/shared locally,
// and add the monorepo shared path as a fallback watch folder for local dev.
const monorepoRoot = path.resolve(projectRoot, '../..');
const workspaceRoot = projectRoot;

const config = getDefaultConfig(projectRoot);

// ── pnpm monorepo ─────────────────────────────────────────────────────────────
// Watch only the folders Metro actually needs instead of the entire workspace
// root. Watching the whole workspace on Windows causes "Failed to start watch
// mode" because there are too many files (node_modules/.pnpm, android/build…).
//
// Strategy (mirrors apps/jitplus/metro.config.js which works correctly):
//  1. watchFolders = shared package + pnpm content-addressable store only
//  2. nodeModulesPaths = project node_modules only (pnpm junctions are complete)
//  3. unstable_enableSymlinks = true  → Metro follows pnpm junctions correctly

// 1. Watch shared package paths only.
//    Avoid watching the global pnpm store on Windows because it can make
//    Metro watcher startup time out ("Failed to start watch mode"), especially
//    in OneDrive-backed workspaces.
const fs = require('fs');
const watchFolders = [];
const localShared = path.resolve(workspaceRoot, 'packages', 'shared');
if (fs.existsSync(localShared)) watchFolders.push(localShared);
// In local monorepo dev, also watch the monorepo-level shared & pnpm store
const monorepoShared = path.resolve(monorepoRoot, 'packages', 'shared');
if (fs.existsSync(monorepoShared)) watchFolders.push(monorepoShared);
config.watchFolders = [
  ...(config.watchFolders || []),
  ...watchFolders,
];

// 2. Only resolve from the project-level node_modules (pnpm junctions are
//    correctly set up there for every transitive dependency).
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths || []),
  path.resolve(projectRoot, 'node_modules'),
];
// Deduplicate in case the project root was already included
config.resolver.nodeModulesPaths = [...new Set(config.resolver.nodeModulesPaths)];

// 3. Follow pnpm symlinks/junctions on Windows only
// (Linux/macOS uses real symlinks that Metro follows natively)
if (process.platform === 'win32') {
  config.resolver.unstable_enableSymlinks = true;
}

// 4. Force a single copy of packages that break when duplicated (context mismatch).
//    pnpm creates multiple copies with different peer-dep resolutions; Metro may
//    resolve different copies for different import chains, causing
//    "useLinkPreviewContext must be used within a LinkPreviewContextProvider".
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules', 'react'),
  'react-native': path.resolve(projectRoot, 'node_modules', 'react-native'),
  'react-native-safe-area-context': path.resolve(projectRoot, 'node_modules', 'react-native-safe-area-context'),
  'react-native-screens': path.resolve(projectRoot, 'node_modules', 'react-native-screens'),
  'expo-router': path.resolve(projectRoot, 'node_modules', 'expo-router'),
  'expo-modules-core': path.resolve(monorepoRoot, 'node_modules', 'expo-modules-core'),
  '@react-navigation/core': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'core'),
  '@react-navigation/native': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'native'),
  '@react-navigation/elements': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'elements'),
  '@react-navigation/bottom-tabs': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'bottom-tabs'),
  '@react-navigation/native-stack': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'native-stack'),
};

// 5. Force-resolve singleton packages from projectRoot regardless of the
//    importing file's location.  In a pnpm monorepo many packages also exist
//    at <monorepoRoot>/node_modules (hoisted copies).  Metro's default
//    resolution walks up directory trees, so an import from packages/shared
//    or from a transitive dep can pick up the monorepo-root copy instead of
//    the project copy.  Two copies of packages with native registrations
//    cause "Tried to register two views with the same name" crashes.
//
//    resolveRequest intercepts BEFORE the normal resolution.  For every
//    bare import matching the list below, we pretend the importing file
//    lives at projectRoot so the resolution always finds the project copy.
//
//    FORCE_PREFIX matches both the bare package name AND deep imports
//    (e.g. react-native/Libraries/NativeComponent/NativeComponentRegistry).
const FORCE_PREFIX = [
  'react',                              // react + react/jsx-runtime etc.
  'react-native',                       // + subpaths (NativeComponentRegistry…)
  'react-native-safe-area-context',     // native RNCSafeAreaProvider
  'react-native-screens',               // native RNSScreen*
  'expo-router',                        // must be single copy (contexts)
  'expo-modules-core',                  // native module proxy / view adapter
  'expo-linear-gradient',               // native ExpoLinearGradient
  '@react-navigation',                  // all scoped packages
  'lucide-react-native',
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    FORCE_PREFIX.some((p) => moduleName === p || moduleName.startsWith(p + '/'))
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: path.resolve(projectRoot, '__force_resolve__.js') },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
