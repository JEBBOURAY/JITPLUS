const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Support pnpm symlinked node_modules structure
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Watch packages/shared AND the pnpm virtual store so Metro can follow symlinks
// from app-level node_modules junctions into the .pnpm content-addressable store.
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(workspaceRoot, 'packages', 'shared'),
  path.resolve(workspaceRoot, 'node_modules', '.pnpm'),
];

// Enable symlink resolution for pnpm on Windows (not needed on Linux/macOS
// where pnpm creates real symlinks that Metro follows natively).
if (process.platform === 'win32') {
  config.resolver.unstable_enableSymlinks = true;
}

// Only resolve modules from the project-level node_modules (pnpm junctions
// are correctly set up there for every transitive dependency).
// NOTE: DO NOT add workspaceRoot/node_modules to nodeModulesPaths — pnpm
// hoists an *incomplete* copy of packages (e.g. expo-router without entry.js)
// there. All app dependencies are already reachable via the app-level
// node_modules junctions created by pnpm.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths || []),
  path.resolve(projectRoot, 'node_modules'),
];
// Deduplicate in case the project root was already included
config.resolver.nodeModulesPaths = [...new Set(config.resolver.nodeModulesPaths)];

// Force a single copy of packages that break when duplicated (context mismatch).
// pnpm creates multiple copies with different peer-dep resolutions; Metro may
// resolve different copies for different import chains.
config.resolver.extraNodeModules = {
  'expo-router': path.resolve(projectRoot, 'node_modules', 'expo-router'),
  '@react-navigation/core': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'core'),
  '@react-navigation/native': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'native'),
  react: path.resolve(projectRoot, 'node_modules', 'react'),
  'react-native': path.resolve(projectRoot, 'node_modules', 'react-native'),
};

module.exports = config;
