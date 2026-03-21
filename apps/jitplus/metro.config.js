const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Support pnpm symlinked node_modules structure
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Watch packages/shared so Metro can follow monorepo imports.
// Avoid watching the global pnpm store on Windows — it can cause
// "Failed to start watch mode" in OneDrive-backed workspaces.
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(workspaceRoot, 'packages', 'shared'),
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
  react: path.resolve(projectRoot, 'node_modules', 'react'),
  'react-native': path.resolve(projectRoot, 'node_modules', 'react-native'),
  'react-native-safe-area-context': path.resolve(projectRoot, 'node_modules', 'react-native-safe-area-context'),
  'react-native-screens': path.resolve(projectRoot, 'node_modules', 'react-native-screens'),
  'expo-router': path.resolve(projectRoot, 'node_modules', 'expo-router'),
  'expo-modules-core': path.resolve(workspaceRoot, 'node_modules', 'expo-modules-core'),
  '@react-navigation/core': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'core'),
  '@react-navigation/native': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'native'),
  '@react-navigation/elements': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'elements'),
  '@react-navigation/bottom-tabs': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'bottom-tabs'),
  '@react-navigation/native-stack': path.resolve(projectRoot, 'node_modules', '@react-navigation', 'native-stack'),
};

// Force-resolve singleton packages from projectRoot.  In a pnpm monorepo many
// packages also exist at <workspaceRoot>/node_modules (hoisted copies).  Metro
// walks up directory trees, so an import from packages/shared or from a transitive
// dep can pick up the monorepo-root copy.  Two copies of packages with native
// registrations cause "Tried to register two views with the same name" crashes.
//
// FORCE_PREFIX matches both the bare package name AND deep imports.
const FORCE_PREFIX = [
  'react',
  'react-native',
  'react-native-safe-area-context',
  'react-native-screens',
  'expo-router',
  'expo-modules-core',
  'expo-linear-gradient',
  '@react-navigation',
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
