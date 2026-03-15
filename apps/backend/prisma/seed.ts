import { PrismaClient, MerchantCategory, AdminRole, LoyaltyType, TransactionType } from '../src/generated/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── Guard: empêcher l'exécution en production ──
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Le seed ne peut PAS être exécuté en production !');
    process.exit(1);
  }

  console.log('🌱 Début du seed...');

  // ── Nettoyer les données existantes (dans l'ordre des dépendances) ──
  await prisma.clientNotificationStatus.deleteMany();
  await prisma.deviceSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.loyaltyCard.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.store.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.client.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.admin.deleteMany();

  console.log('🧹 Données existantes supprimées');

  const pw = await bcrypt.hash('Seed@Test2024!', 10);
  const adminPw = await bcrypt.hash('Admin@JitPlus2024!', 10);

  // ═══════════════════════════════════════════
  // 1. ADMINS
  // ═══════════════════════════════════════════
  const admin = await prisma.admin.create({
    data: {
      email: 'admin@jitplus.com',
      password: adminPw,
      nom: 'Admin Principal',
      role: AdminRole.ADMIN,
    },
  });
  console.log('✅ Admin:', admin.email, '/ Admin@JitPlus2024!');

  // ═══════════════════════════════════════════
  // 2. MERCHANTS (10 marchands variés à Casablanca)
  // ═══════════════════════════════════════════
  const merchantsData = [
    {
      nom: 'Café Barrista',
      email: 'cafe@test.com',
      categorie: MerchantCategory.CAFE,
      description: 'Le meilleur café artisanal de Casablanca. Grains torréfiés sur place.',
      ville: 'Casablanca',
      quartier: 'Maarif',
      adresse: '45 Rue du Parc, Maarif',
      latitude: 33.5731,
      longitude: -7.6298,
      phoneNumber: '+212661000001',
      pointsRate: 10,
      loyaltyType: LoyaltyType.STAMPS,
      stampsForReward: 8,
      conversionRate: 10,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 15 },
    },
    {
      nom: 'Épicerie Verte',
      email: 'epicerie@test.com',
      categorie: MerchantCategory.EPICERIE,
      description: 'Produits bio et locaux. Fruits, légumes, et épices du terroir.',
      ville: 'Casablanca',
      quartier: 'Bourgogne',
      adresse: '12 Bd Zerktouni, Bourgogne',
      latitude: 33.5850,
      longitude: -7.6190,
      phoneNumber: '+212661000002',
      pointsRate: 5,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 5,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 20 },
    },
    {
      nom: 'Restaurant Dar Zellij',
      email: 'restaurant@test.com',
      categorie: MerchantCategory.RESTAURANT,
      description: 'Cuisine marocaine traditionnelle dans un cadre raffiné. Tajines, couscous, pastilla.',
      ville: 'Casablanca',
      quartier: 'Anfa',
      adresse: '78 Rue Anfa, Anfa',
      latitude: 33.5680,
      longitude: -7.6600,
      phoneNumber: '+212661000003',
      pointsRate: 15,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 15,
      pointsRules: { pointsPerDirham: 2, minimumPurchase: 50 },
    },
    {
      nom: 'Boulangerie Al Fourno',
      email: 'boulangerie@test.com',
      categorie: MerchantCategory.BOULANGERIE,
      description: 'Pain artisanal, viennoiseries et pâtisseries marocaines et françaises.',
      ville: 'Casablanca',
      quartier: 'Gauthier',
      adresse: '22 Rue Jean Jaurès, Gauthier',
      latitude: 33.5890,
      longitude: -7.6150,
      phoneNumber: '+212661000004',
      pointsRate: 8,
      loyaltyType: LoyaltyType.STAMPS,
      stampsForReward: 10,
      conversionRate: 8,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 10 },
    },
    {
      nom: 'Pharmacie Centrale',
      email: 'pharmacie@test.com',
      categorie: MerchantCategory.PHARMACIE,
      description: 'Pharmacie de garde, parapharmacie et conseil santé.',
      ville: 'Casablanca',
      quartier: 'Centre-Ville',
      adresse: '5 Bd Mohammed V',
      latitude: 33.5950,
      longitude: -7.6100,
      phoneNumber: '+212661000005',
      pointsRate: 3,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 3,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 30 },
    },
    {
      nom: 'Librairie Kalila',
      email: 'librairie@test.com',
      categorie: MerchantCategory.LIBRAIRIE,
      description: 'Livres, BD, manga et papeterie. Section jeunesse et littérature arabe.',
      ville: 'Casablanca',
      quartier: 'Racine',
      adresse: '33 Rue Racine',
      latitude: 33.5770,
      longitude: -7.6350,
      phoneNumber: '+212661000006',
      pointsRate: 12,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 12,
      pointsRules: { pointsPerDirham: 2, minimumPurchase: 40 },
    },
    {
      nom: 'Fashion House',
      email: 'vetements@test.com',
      categorie: MerchantCategory.VETEMENTS,
      description: 'Mode homme et femme. Marques locales et internationales.',
      ville: 'Casablanca',
      quartier: 'Morocco Mall',
      adresse: 'Morocco Mall, Niveau 2',
      latitude: 33.5460,
      longitude: -7.6730,
      phoneNumber: '+212661000007',
      pointsRate: 20,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 20,
      pointsRules: { pointsPerDirham: 3, minimumPurchase: 100 },
    },
    {
      nom: 'Coiffure Studio M',
      email: 'coiffure@test.com',
      categorie: MerchantCategory.COIFFURE,
      description: 'Coiffure homme et femme, barbier, soins capillaires.',
      ville: 'Casablanca',
      quartier: 'Oasis',
      adresse: '10 Rue Oasis',
      latitude: 33.5620,
      longitude: -7.6400,
      phoneNumber: '+212661000008',
      pointsRate: 10,
      loyaltyType: LoyaltyType.STAMPS,
      stampsForReward: 6,
      conversionRate: 10,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 50 },
    },
    {
      nom: 'TechZone',
      email: 'tech@test.com',
      categorie: MerchantCategory.ELECTRONIQUE,
      description: 'Smartphones, accessoires, réparations et gadgets tech.',
      ville: 'Casablanca',
      quartier: 'Derb Ghallef',
      adresse: '88 Bd Massira, Derb Ghallef',
      latitude: 33.5700,
      longitude: -7.6500,
      phoneNumber: '+212661000009',
      pointsRate: 25,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 25,
      pointsRules: { pointsPerDirham: 5, minimumPurchase: 200 },
    },
    {
      nom: 'FitClub Gym',
      email: 'sport@test.com',
      categorie: MerchantCategory.SPORT,
      description: 'Salle de sport, coaching personnalisé, cours collectifs.',
      ville: 'Casablanca',
      quartier: 'Ain Diab',
      adresse: '15 Corniche Ain Diab',
      latitude: 33.5550,
      longitude: -7.6700,
      phoneNumber: '+212661000010',
      pointsRate: 10,
      loyaltyType: LoyaltyType.STAMPS,
      stampsForReward: 12,
      conversionRate: 10,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 0 },
    },
  ];

  const merchants: any[] = [];
  for (const m of merchantsData) {
    const merchant = await prisma.merchant.create({
      data: {
        nom: m.nom,
        email: m.email,
        password: pw,
        categorie: m.categorie,
        description: m.description,
        ville: m.ville,
        quartier: m.quartier,
        adresse: m.adresse,
        latitude: m.latitude,
        longitude: m.longitude,
        phoneNumber: m.phoneNumber,
        pointsRate: m.pointsRate,
        loyaltyType: m.loyaltyType,
        conversionRate: m.conversionRate,
        stampsForReward: m.stampsForReward ?? 10,
        pointsRules: m.pointsRules,
        termsAccepted: true,
        isActive: true,
      },
    });
    merchants.push(merchant);
    console.log(`✅ Merchant: ${merchant.nom} (${merchant.email})`);
  }

  // ═══════════════════════════════════════════
  // 3. STORES (quelques magasins supplémentaires)
  // ═══════════════════════════════════════════
  const storesData = [
    { merchantIdx: 0, nom: 'Café Barrista - Twin Center', ville: 'Casablanca', quartier: 'Maarif', adresse: 'Twin Center, RDC', latitude: 33.5745, longitude: -7.6265 },
    { merchantIdx: 1, nom: 'Épicerie Verte - Oulfa', ville: 'Casablanca', quartier: 'Oulfa', adresse: '90 Bd Oulfa', latitude: 33.5600, longitude: -7.5900 },
    { merchantIdx: 2, nom: 'Dar Zellij - Ain Diab', ville: 'Casablanca', quartier: 'Ain Diab', adresse: 'Corniche, Ain Diab', latitude: 33.5540, longitude: -7.6680 },
    { merchantIdx: 6, nom: 'Fashion House - Anfaplace', ville: 'Casablanca', quartier: 'Anfa', adresse: 'Anfaplace Mall, Niveau 1', latitude: 33.5680, longitude: -7.6650 },
  ];

  for (const s of storesData) {
    await prisma.store.create({
      data: {
        merchantId: merchants[s.merchantIdx].id,
        nom: s.nom,
        ville: s.ville,
        quartier: s.quartier,
        adresse: s.adresse,
        latitude: s.latitude,
        longitude: s.longitude,
      },
    });
  }
  console.log(`✅ ${storesData.length} stores créés`);

  // ═══════════════════════════════════════════
  // 4. REWARDS (récompenses par marchand)
  // ═══════════════════════════════════════════
  const rewardsData = [
    { merchantIdx: 0, titre: 'Café offert', cout: 80, description: 'Un café au choix offert (espresso, cappuccino, latte)' },
    { merchantIdx: 0, titre: 'Croissant offert', cout: 50, description: 'Un croissant beurre ou chocolat offert' },
    { merchantIdx: 1, titre: 'Panier fruits', cout: 100, description: 'Un panier de fruits de saison offert' },
    { merchantIdx: 1, titre: '-20% sur commande', cout: 150, description: '20% de réduction sur votre prochaine commande' },
    { merchantIdx: 2, titre: 'Thé à la menthe offert', cout: 50, description: 'Un thé à la menthe traditionnel offert' },
    { merchantIdx: 2, titre: 'Dessert offert', cout: 200, description: 'Un dessert au choix offert avec votre repas' },
    { merchantIdx: 3, titre: 'Baguette offerte', cout: 60, description: 'Une baguette tradition offerte' },
    { merchantIdx: 3, titre: 'Pâtisserie offerte', cout: 100, description: 'Une pâtisserie marocaine au choix' },
    { merchantIdx: 4, titre: '-10% parapharmacie', cout: 80, description: '10% de réduction sur la parapharmacie' },
    { merchantIdx: 5, titre: 'Livre de poche offert', cout: 120, description: 'Un livre de poche au choix offert' },
    { merchantIdx: 6, titre: 'Bon de 50 DH', cout: 200, description: 'Bon d\'achat de 50 DH sur votre prochain achat' },
    { merchantIdx: 7, titre: 'Coupe gratuite', cout: 100, description: 'Une coupe homme ou femme offerte' },
    { merchantIdx: 8, titre: 'Accessoire offert', cout: 300, description: 'Un accessoire téléphone offert (coque, chargeur...)' },
    { merchantIdx: 9, titre: 'Séance offerte', cout: 100, description: 'Une séance de sport offerte avec coach' },
  ];

  const rewards: any[] = [];
  for (const r of rewardsData) {
    const reward = await prisma.reward.create({
      data: {
        merchantId: merchants[r.merchantIdx].id,
        titre: r.titre,
        cout: r.cout,
        description: r.description,
      },
    });
    rewards.push(reward);
  }
  console.log(`✅ ${rewards.length} rewards créés`);

  // Mettre le premier reward actif pour chaque marchand
  for (let i = 0; i < merchants.length; i++) {
    const firstReward = rewards.find((r: any) => r.merchantId === merchants[i].id);
    if (firstReward) {
      await prisma.merchant.update({
        where: { id: merchants[i].id },
        data: { activeRewardId: firstReward.id },
      });
    }
  }

  // ═══════════════════════════════════════════
  // 5. TEAM MEMBERS
  // ═══════════════════════════════════════════
  const teamData = [
    { merchantIdx: 0, nom: 'Youssef Barista', email: 'youssef@cafe-test.com' },
    { merchantIdx: 0, nom: 'Amina Serveuse', email: 'amina@cafe-test.com' },
    { merchantIdx: 2, nom: 'Karim Chef', email: 'karim@restaurant-test.com' },
    { merchantIdx: 6, nom: 'Sara Vendeuse', email: 'sara@fashion-test.com' },
    { merchantIdx: 9, nom: 'Omar Coach', email: 'omar@fitclub-test.com' },
  ];

  for (const t of teamData) {
    await prisma.teamMember.create({
      data: {
        merchantId: merchants[t.merchantIdx].id,
        nom: t.nom,
        email: t.email,
        password: pw,
      },
    });
  }
  console.log(`✅ ${teamData.length} team members créés`);

  // ═══════════════════════════════════════════
  // 6. CLIENTS (5 clients test)
  // ═══════════════════════════════════════════
  const clientsData = [
    { prenom: 'Ayoub', nom: 'Bennani', email: 'ayoub@test.com', telephone: '+212600000001', countryCode: 'MA' },
    { prenom: 'Fatima', nom: 'El Amrani', email: 'fatima@test.com', telephone: '+212600000002', countryCode: 'MA' },
    { prenom: 'Mohamed', nom: 'Tazi', email: 'mohamed@test.com', telephone: '+212600000003', countryCode: 'MA' },
    { prenom: 'Salma', nom: 'Idrissi', email: 'salma@test.com', telephone: '+212600000004', countryCode: 'MA' },
    { prenom: 'Yassine', nom: 'Alaoui', email: 'yassine@test.com', telephone: '+212600000005', countryCode: 'MA' },
  ];

  const clients: any[] = [];
  for (const c of clientsData) {
    const client = await prisma.client.create({
      data: {
        prenom: c.prenom,
        nom: c.nom,
        email: c.email,
        telephone: c.telephone,
        countryCode: c.countryCode,
        termsAccepted: true,
        shareInfoMerchants: true,
      },
    });
    clients.push(client);
    console.log(`✅ Client: ${client.prenom} ${client.nom} (${client.telephone})`);
  }

  // ═══════════════════════════════════════════
  // 7. LOYALTY CARDS (chaque client a plusieurs cartes)
  // ═══════════════════════════════════════════
  const cardsData = [
    // Ayoub → 4 marchands
    { clientIdx: 0, merchantIdx: 0, points: 65 },
    { clientIdx: 0, merchantIdx: 2, points: 180 },
    { clientIdx: 0, merchantIdx: 3, points: 45 },
    { clientIdx: 0, merchantIdx: 8, points: 250 },
    // Fatima → 3 marchands
    { clientIdx: 1, merchantIdx: 0, points: 30 },
    { clientIdx: 1, merchantIdx: 1, points: 90 },
    { clientIdx: 1, merchantIdx: 4, points: 60 },
    // Mohamed → 5 marchands
    { clientIdx: 2, merchantIdx: 0, points: 120 },
    { clientIdx: 2, merchantIdx: 2, points: 95 },
    { clientIdx: 2, merchantIdx: 5, points: 200 },
    { clientIdx: 2, merchantIdx: 6, points: 150 },
    { clientIdx: 2, merchantIdx: 9, points: 80 },
    // Salma → 3 marchands
    { clientIdx: 3, merchantIdx: 1, points: 40 },
    { clientIdx: 3, merchantIdx: 3, points: 75 },
    { clientIdx: 3, merchantIdx: 7, points: 55 },
    // Yassine → 2 marchands
    { clientIdx: 4, merchantIdx: 0, points: 15 },
    { clientIdx: 4, merchantIdx: 9, points: 100 },
  ];

  const cards: any[] = [];
  for (const c of cardsData) {
    const card = await prisma.loyaltyCard.create({
      data: {
        clientId: clients[c.clientIdx].id,
        merchantId: merchants[c.merchantIdx].id,
        points: c.points,
      },
    });
    cards.push(card);
  }
  console.log(`✅ ${cards.length} cartes de fidélité créées`);

  // ═══════════════════════════════════════════
  // 8. TRANSACTIONS (historique réaliste)
  // ═══════════════════════════════════════════
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  const txData = [
    // Ayoub @ Café Barrista
    { clientIdx: 0, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 35, points: 35, daysAgo: 30 },
    { clientIdx: 0, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 20, points: 20, daysAgo: 22 },
    { clientIdx: 0, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 15, points: 10, daysAgo: 10 },
    // Ayoub @ Restaurant
    { clientIdx: 0, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 120, points: 80, daysAgo: 25 },
    { clientIdx: 0, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 85, points: 60, daysAgo: 15 },
    { clientIdx: 0, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 60, points: 40, daysAgo: 5 },
    // Ayoub @ Boulangerie
    { clientIdx: 0, merchantIdx: 3, type: TransactionType.EARN_POINTS, amount: 25, points: 25, daysAgo: 18 },
    { clientIdx: 0, merchantIdx: 3, type: TransactionType.EARN_POINTS, amount: 20, points: 20, daysAgo: 8 },
    // Ayoub @ TechZone
    { clientIdx: 0, merchantIdx: 8, type: TransactionType.EARN_POINTS, amount: 500, points: 250, daysAgo: 12 },
    // Fatima @ Café
    { clientIdx: 1, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 30, points: 30, daysAgo: 20 },
    // Fatima @ Épicerie
    { clientIdx: 1, merchantIdx: 1, type: TransactionType.EARN_POINTS, amount: 80, points: 40, daysAgo: 14 },
    { clientIdx: 1, merchantIdx: 1, type: TransactionType.EARN_POINTS, amount: 100, points: 50, daysAgo: 7 },
    // Mohamed @ Café (a déjà récupéré un reward)
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 200, points: 200, daysAgo: 35 },
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.REDEEM_REWARD, amount: 0, points: 80, daysAgo: 20, rewardIdx: 0 },
    // Mohamed @ Restaurant
    { clientIdx: 2, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 150, points: 95, daysAgo: 10 },
    // Mohamed @ Librairie
    { clientIdx: 2, merchantIdx: 5, type: TransactionType.EARN_POINTS, amount: 300, points: 200, daysAgo: 28 },
    // Mohamed @ Fashion
    { clientIdx: 2, merchantIdx: 6, type: TransactionType.EARN_POINTS, amount: 450, points: 150, daysAgo: 6 },
    // Mohamed @ FitClub
    { clientIdx: 2, merchantIdx: 9, type: TransactionType.EARN_POINTS, amount: 300, points: 80, daysAgo: 3 },
    // Salma
    { clientIdx: 3, merchantIdx: 1, type: TransactionType.EARN_POINTS, amount: 60, points: 40, daysAgo: 16 },
    { clientIdx: 3, merchantIdx: 3, type: TransactionType.EARN_POINTS, amount: 50, points: 75, daysAgo: 11 },
    { clientIdx: 3, merchantIdx: 7, type: TransactionType.EARN_POINTS, amount: 120, points: 55, daysAgo: 4 },
    // Yassine
    { clientIdx: 4, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 15, points: 15, daysAgo: 2 },
    { clientIdx: 4, merchantIdx: 9, type: TransactionType.EARN_POINTS, amount: 600, points: 100, daysAgo: 1 },
  ];

  for (const tx of txData) {
    await prisma.transaction.create({
      data: {
        clientId: clients[tx.clientIdx].id,
        merchantId: merchants[tx.merchantIdx].id,
        type: tx.type,
        amount: tx.amount,
        points: Math.abs(tx.points),
        rewardId: (tx as any).rewardIdx !== undefined ? rewards[(tx as any).rewardIdx].id : undefined,
        createdAt: daysAgo(tx.daysAgo),
      },
    });
  }
  console.log(`✅ ${txData.length} transactions créées`);

  // ═══════════════════════════════════════════
  // 9. NOTIFICATIONS (variées, avec des dates différentes)
  // ═══════════════════════════════════════════
  const notifData = [
    // ── Café Barrista (idx 0) — Ayoub, Fatima, Mohamed, Yassine ont une carte ──
    { merchantIdx: 0, title: 'Happy Hour! ☕', body: 'Café offert pour tout achat avant 10h ce weekend!', recipientCount: 45, successCount: 42, daysAgo: 0 },
    { merchantIdx: 0, title: 'Nouvelle carte de fidélité 🎉', body: 'Collectez 8 tampons et recevez un café gratuit ! Venez découvrir notre nouveau programme.', recipientCount: 50, successCount: 47, daysAgo: 3 },
    { merchantIdx: 0, title: 'Fermeture exceptionnelle ⚠️', body: 'Notre café sera fermé le lundi 24 février pour travaux. Réouverture mardi à 7h!', recipientCount: 50, successCount: 48, daysAgo: 1 },

    // ── Restaurant Dar Zellij (idx 2) — Ayoub, Mohamed ont une carte ──
    { merchantIdx: 2, title: 'Nouveau menu 🍽️', body: 'Découvrez notre nouveau menu d\'hiver avec des plats chauds et réconfortants.', recipientCount: 30, successCount: 28, daysAgo: 5 },
    { merchantIdx: 2, title: 'Soirée spéciale Couscous 🥘', body: 'Ce vendredi, soirée couscous à volonté pour seulement 89 DH. Réservez vite !', recipientCount: 35, successCount: 33, daysAgo: 2 },
    { merchantIdx: 2, title: 'Offre Saint-Valentin ❤️', body: 'Menu couple à 199 DH : entrée + plat + dessert + thé. Ambiance romantique garantie.', recipientCount: 30, successCount: 27, daysAgo: 4 },

    // ── Boulangerie Al Fourno (idx 3) — Ayoub, Salma ont une carte ──
    { merchantIdx: 3, title: 'Pain chaud dès 6h 🥖', body: 'Venez profiter de notre pain tradition tout chaud dès 6h du matin. Offre spéciale: 2ème baguette à moitié prix!', recipientCount: 40, successCount: 38, daysAgo: 1 },
    { merchantIdx: 3, title: 'Pâtisseries marocaines 🍰', body: 'Commandez vos cornes de gazelle et briouates pour le weekend. -15% sur les commandes de plus de 100 DH.', recipientCount: 40, successCount: 36, daysAgo: 7 },

    // ── TechZone (idx 8) — Ayoub a une carte ──
    { merchantIdx: 8, title: 'Soldes Tech -30% 📱', body: 'Coques, écouteurs, chargeurs... Profitez de -30% sur tous les accessoires ce weekend!', recipientCount: 60, successCount: 55, daysAgo: 0 },
    { merchantIdx: 8, title: 'Nouveau : réparation express ⚡', body: 'Service de réparation d\'écran en 30 min. Apportez votre téléphone et repartez le même jour!', recipientCount: 55, successCount: 50, daysAgo: 6 },

    // ── Épicerie Verte (idx 1) — Fatima, Salma ont une carte ──
    { merchantIdx: 1, title: 'Arrivage bio 🌿', body: 'Nouvelles variétés de fruits et légumes bio cette semaine. Fraises, avocat et mangue!', recipientCount: 20, successCount: 18, daysAgo: 2 },

    // ── Fashion House (idx 6) — Mohamed a une carte ──
    { merchantIdx: 6, title: 'Soldes -40% 🏷️', body: 'Profitez de -40% sur toute la collection été! Offre limitée.', recipientCount: 80, successCount: 75, daysAgo: 3 },

    // ── FitClub (idx 9) — Mohamed, Yassine ont une carte ──
    { merchantIdx: 9, title: 'Cours gratuit 💪', body: 'Séance de yoga gratuite ce samedi à 9h. Places limitées!', recipientCount: 25, successCount: 23, daysAgo: 4 },
    { merchantIdx: 9, title: 'Offre parrainage 🤝', body: 'Invitez un ami et recevez chacun une séance offerte. Valable jusqu\'au 28 février.', recipientCount: 25, successCount: 22, daysAgo: 1 },
  ];

  for (const n of notifData) {
    await prisma.notification.create({
      data: {
        merchantId: merchants[n.merchantIdx].id,
        title: n.title,
        body: n.body,
        recipientCount: n.recipientCount,
        successCount: n.successCount,
        failureCount: n.recipientCount - n.successCount,
        createdAt: daysAgo(n.daysAgo),
      },
    });
  }
  console.log(`✅ ${notifData.length} notifications créées`);

  // ═══════════════════════════════════════════
  // RÉSUMÉ
  // ═══════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('✨ SEED TERMINÉ AVEC SUCCÈS!');
  console.log('══════════════════════════════════════════');
  console.log('\n📋 Comptes de test:');
  console.log('──────────────────────────────────────────');
  console.log('🔑 Admin:     admin@jitplus.com / Admin@JitPlus2024!');
  console.log('──────────────────────────────────────────');
  console.log('🏪 Marchands (tous mot de passe: Seed@Test2024!):');
  merchants.forEach((m: any) => console.log(`   ${m.email} → ${m.nom}`));
  console.log('──────────────────────────────────────────');
  console.log('👤 Clients (connexion par OTP sur le téléphone):');
  clients.forEach((c: any) => console.log(`   ${c.telephone} → ${c.prenom} ${c.nom}`));
  console.log('══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
