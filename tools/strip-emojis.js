/**
 * Strip all decorative emojis from jitpluspro i18n locale files.
 * Keeps ✓ (U+2713) as it's a subtle text indicator.
 */
const fs = require('fs');

const files = [
  'apps/jitpluspro/i18n/locales/fr.ts',
  'apps/jitpluspro/i18n/locales/en.ts',
  'apps/jitpluspro/i18n/locales/ar.ts',
];

// Emojis to strip — longer sequences (with variation selectors) first
const emojis = [
  '⚠️', 'ℹ️',        // with variation selector U+FE0F
  '⚠', 'ℹ',           // fallback without variation selector
  '🎉', '🔥', '📱', '📊', '📧', '🔒', '✅', '❌',
  '💬', '📢', '🏪', '⚡', '🎁', '🔄', '💡', '🎂',
  '🚀', '�️', '🏷', '💰', '📅', '☕', '🍕',
];

const root = process.cwd();

let totalChanges = 0;

files.forEach(f => {
  const filePath = require('path').join(root, f);
  let content = fs.readFileSync(filePath, 'utf8');
  const origLen = content.length;

  for (const emoji of emojis) {
    content = content.replaceAll(emoji + ' ', '');   // prefix: "🎁 text" → "text"
    content = content.replaceAll(' ' + emoji, '');   // suffix: "text 🎁" → "text"
    content = content.replaceAll(emoji, '');          // bare/inline
  }

  const removed = origLen - content.length;
  totalChanges += removed;

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`${f}: ${removed} chars removed`);
});

console.log(`\nTotal: ${totalChanges} chars removed`);
