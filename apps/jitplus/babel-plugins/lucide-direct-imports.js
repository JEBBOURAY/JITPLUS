/* eslint-env node */
/**
 * Rewrites `import { Foo, Bar as Baz } from 'lucide-react-native'` into one
 * default import per icon file.
 *
 * Metro has no stable tree shaking, so the barrel import pulled all ~1 600
 * icons (≈1.3 MB of source) into the bundle for the ~100 the app renders.
 *
 * The package `exports` map hides `dist/esm/icons/*`, so the rewritten imports
 * use absolute paths resolved from this app's copy (which is also the copy
 * metro.config.js forces for `lucide-react-native`). Names that are not icons
 * (`Icon`, `createLucideIcon`, unknown aliases) stay on the barrel import.
 */
const fs = require('fs');
const path = require('path');

const PKG = 'lucide-react-native';

function loadIconMap() {
  const cjsEntry = require.resolve(PKG, { paths: [path.resolve(__dirname, '..')] });
  const esmDir = path.resolve(path.dirname(cjsEntry), '..', 'esm');
  const barrel = fs.readFileSync(path.join(esmDir, 'lucide-react-native.js'), 'utf8');
  const map = new Map();
  for (const [, names, file] of barrel.matchAll(/export \{([^}]+)\} from '\.\/(icons\/[^']+)';/g)) {
    const abs = path.join(esmDir, file).split(path.sep).join('/');
    for (const part of names.split(',')) {
      const match = part.trim().match(/^default as (\w+)$/);
      if (match) map.set(match[1], abs);
    }
  }
  if (map.size === 0) {
    throw new Error(`[lucide-direct-imports] no icons found in ${esmDir}; the ${PKG} layout changed`);
  }
  return map;
}

let iconMap;

module.exports = function lucideDirectImports({ types: t }) {
  return {
    name: 'lucide-direct-imports',
    visitor: {
      ImportDeclaration(p) {
        const { node } = p;
        if (node.source.value !== PKG || node.importKind === 'type') return;
        iconMap = iconMap || loadIconMap();

        const direct = [];
        const kept = [];
        for (const spec of node.specifiers) {
          if (t.isImportSpecifier(spec)) {
            if (spec.importKind === 'type') continue;
            const name = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
            const file = iconMap.get(name);
            if (file) {
              direct.push(
                t.importDeclaration(
                  [t.importDefaultSpecifier(t.identifier(spec.local.name))],
                  t.stringLiteral(file),
                ),
              );
              continue;
            }
          }
          kept.push(spec);
        }
        if (direct.length === 0) return;

        if (kept.length === 0) {
          p.replaceWithMultiple(direct);
        } else {
          node.specifiers = kept;
          p.insertAfter(direct);
        }
      },
    },
  };
};
