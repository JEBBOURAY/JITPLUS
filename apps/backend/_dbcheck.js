process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://admin:password123@localhost:5432/jit_db?schema=public';
const { PrismaClient } = require('./src/generated/client');
const p = new PrismaClient();
(async () => {
  const clients = await p.client.findMany({ take: 5, select: { id: true, nom: true, telephone: true, email: true } });
  console.log('=== CLIENTS ===');
  console.log(JSON.stringify(clients, null, 2));
  
  const cards = await p.loyaltyCard.count();
  console.log('\nTotal loyalty cards:', cards);
  
  const merchants = await p.merchant.findMany({ take: 3, select: { id: true, nom: true, plan: true } });
  console.log('\n=== MERCHANTS ===');
  console.log(JSON.stringify(merchants, null, 2));

  // Check if any cards link clients to merchants
  const cardSample = await p.loyaltyCard.findMany({ take: 5, select: { clientId: true, merchantId: true, points: true } });
  console.log('\n=== LOYALTY CARDS (sample) ===');
  console.log(JSON.stringify(cardSample, null, 2));
  
  await p.$disconnect();
})();
