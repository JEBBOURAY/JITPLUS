const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname);

const files = [
  'apps/backend/src/merchant/services/merchant-transaction.service.ts',
  'apps/backend/src/client-auth/client.service.ts',
  'apps/backend/src/admin/admin.service.ts',
  'apps/backend/src/auth/auth.service.ts',
  'apps/backend/src/client-auth/client-auth.service.ts',
  'apps/backend/src/merchant/services/merchant-dashboard.service.ts',
  'apps/backend/src/merchant/services/merchant-profile.service.ts',
  'apps/backend/src/merchant/services/upgrade-request.service.ts',
  'apps/backend/src/notifications/notifications.service.ts',
];

// Each entry: [corrupted string in file, correct character]
// These are UTF-8 bytes that were mis-decoded as Latin-1 then re-encoded as UTF-8
const fixes = [
  ['Ã©', '\u00E9'],  // é
  ['Ã§', '\u00E7'],  // ç
  ['Ã¨', '\u00E8'],  // è
  ['Ãª', '\u00EA'],  // ê
  ['Ã\u00A0', '\u00E0'],  // à (Ã + non-breaking space → à)
  ['Ã®', '\u00EE'],  // î
  ['Ã´', '\u00F4'],  // ô
  ['Ã»', '\u00FB'],  // û
  ['Ã‰', '\u00C9'],  // É
  ['Ãˆ', '\u00C8'],  // È
  ['Ã\u00AB', '\u00EB'],  // ë
  ['Ã\u00B9', '\u00F9'],  // ù
  ['â†’', '→'], // arrow
  ['\u00E2\u20AC\u201D', '\u2014'],  // em dash —
  ['\u00E2\u20AC\u2122', '\u2019'],  // right single quote '
  ['\u00E2\u20AC\u0153', '\u201C'],  // left double quote "
  ['\u00E2\u0153\u2026', '\u2705'],  // ✅
  ['\u00E2\u0153\u008F\u00EF\u00B8\u008F', '\u270F\uFE0F'], // ✏️
  ['\u00F0\u0178\u017D\u0081', '\uD83C\uDF81'],  // 🎁
  ['\u00F0\u0178\u017D\u2030', '\uD83C\uDF89'],  // 🎉
  ['\u00F0\u0178\u017D\u2020', '\uD83C\uDF85'],  // 🎅 (just in case)
  ['\u00E2\u0094\u20AC', '\u2500'],  // ─ box drawing
];

let totalFixes = 0;
for (const file of files) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    console.log('SKIP (not found):', fullPath);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = 0;
  for (const [from, to] of fixes) {
    const count = content.split(from).length - 1;
    if (count > 0) {
      content = content.split(from).join(to);
      changed += count;
      console.log(`  Fixed ${count}x [${JSON.stringify(from)}] -> [${JSON.stringify(to)}] in ${path.basename(file)}`);
    }
  }
  if (changed > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    totalFixes += changed;
    console.log(`Saved: ${path.basename(file)} (${changed} fixes)\n`);
  } else {
    console.log(`No changes: ${path.basename(file)}\n`);
  }
}
console.log(`Total fixes applied: ${totalFixes}`);
