const fs = require('fs');
let content = fs.readFileSync('apps/backend/src/client-auth/client.service.ts', 'utf8');

// Replace stampsForReward: true, with pointsRate: true, stampsForReward: true,
content = content.replace(/stampsForReward: true,/g, 'pointsRate: true,\n                stampsForReward: true,');

// Replace stampsForReward: m.stampsForReward, with pointsRate: m.pointsRate, stampsForReward: m.stampsForReward,
content = content.replace(/stampsForReward: m.stampsForReward,/g, 'pointsRate: m.pointsRate,\n        stampsForReward: m.stampsForReward,');

// Replace stampsForReward: card.merchant.stampsForReward, with pointsRate: card.merchant.pointsRate, stampsForReward: card.merchant.stampsForReward,
content = content.replace(/stampsForReward: card\.merchant\.stampsForReward,/g, 'pointsRate: card.merchant.pointsRate,\n                stampsForReward: card.merchant.stampsForReward,');

fs.writeFileSync('apps/backend/src/client-auth/client.service.ts', content, 'utf8');
