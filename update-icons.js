const fs = require('fs');

function fix(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  c = c.replace(/import \{ Plus, Minus, Pencil, RefreshCw, Trophy, ChevronLeft \}/g, "import { Plus, Minus, Pencil, RefreshCw, Trophy, ChevronLeft, Gift }");
  c = c.replace(/REDEEM_REWARD: \{ icon: Minus, color: theme\.accent, sign: '-' \}/g, "REDEEM_REWARD: { icon: Gift, color: '#10B981', sign: '-' }");
  fs.writeFileSync(filePath, c, 'utf8');
}

fix('apps/jitplus/app/scan-history.tsx');
fix('apps/jitplus/app/rewards-history.tsx');
