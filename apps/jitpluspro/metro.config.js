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

// 1. Watch shared package and the pnpm store so Metro can follow symlinks
const fs = require('fs');
const watchFolders = [
  path.resolve(workspaceRoot, 'packages', 'shared'),
];
// In local monorepo dev, also watch the monorepo-level shared & pnpm store
const monorepoShared = path.resolve(monorepoRoot, 'packages', 'shared');
const monrepoPnpmStore = path.resolve(monorepoRoot, 'node_modules', '.pnpm');
if (fs.existsSync(monorepoShared)) watchFolders.push(monorepoShared);
if (fs.existsSync(monrepoPnpmStore)) watchFolders.push(monrepoPnpmStore);
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
  'expo-router': path.resolve(projectRoot, 'node_modules', 'expo-router'),
  '@react-navigation/core': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'core'),
  '@react-navigation/native': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'native'),
  react: path.resolve(projectRoot, 'node_modules', 'react'),
  'react-native': path.resolve(projectRoot, 'node_modules', 'react-native'),
};

module.exports = config;
