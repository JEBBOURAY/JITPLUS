import {
  PrismaClient,
  MerchantCategory,
  MerchantPlan,
  AdminRole,
  LoyaltyType,
  TransactionType,
  TransactionStatus,
  AuditAction,
  UpgradeRequestStatus,
} from '../src/generated/client';
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
  await prisma.auditLog.deleteMany();
  await prisma.profileView.deleteMany();
  await prisma.upgradeRequest.deleteMany();
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
  const clientPw = await bcrypt.hash('Client@Test2024!', 10);
  const adminPw = await bcrypt.hash('Admin@JitPlus2024!', 10);

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

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

  const admin2 = await prisma.admin.create({
    data: {
      email: 'support@jitplus.com',
      password: adminPw,
      nom: 'Support JitPlus',
      role: AdminRole.ADMIN,
    },
  });

  console.log('✅ 2 Admins créés');

  // ═══════════════════════════════════════════
  // 2. MERCHANTS (12 marchands variés, multi-villes, multi-plans)
  // ═══════════════════════════════════════════
  const merchantsData = [
    // ─── idx 0 : Café STAMPS, PREMIUM actif, onboarding OK, Casablanca ───
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
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(180),
      onboardingCompleted: true,
      referralCode: 'CAFE-BARR',
      socialLinks: { instagram: 'https://instagram.com/cafebarrista', facebook: 'https://facebook.com/cafebarrista', website: 'https://cafebarrista.ma' },
      profileViews: 342,
    },
    // ─── idx 1 : Épicerie POINTS, PREMIUM admin-activé, Casablanca ───
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
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(90),
      planActivatedByAdmin: true,
      onboardingCompleted: true,
      referralCode: 'EPIC-VERT',
      socialLinks: { instagram: 'https://instagram.com/epicerieverte', tiktok: 'https://tiktok.com/@epicerieverte' },
      profileViews: 128,
    },
    // ─── idx 2 : Restaurant POINTS, PREMIUM trial, Casablanca ───
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
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(10),
      trialStartedAt: daysAgo(20),
      onboardingCompleted: true,
      referralCode: 'REST-DARZE',
      referredByIdx: 0 as number | undefined,
      socialLinks: { instagram: 'https://instagram.com/darzellij', facebook: 'https://facebook.com/darzellij', youtube: 'https://youtube.com/@darzellij' },
      profileViews: 567,
    },
    // ─── idx 3 : Boulangerie STAMPS, FREE (trial expiré), Casablanca ───
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
      plan: MerchantPlan.FREE,
      trialStartedAt: daysAgo(45),
      onboardingCompleted: true,
      referralCode: 'BOUL-FOUR',
      socialLinks: { facebook: 'https://facebook.com/alfourno' },
      profileViews: 89,
    },
    // ─── idx 4 : Pharmacie POINTS, FREE, Casablanca ───
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
      plan: MerchantPlan.FREE,
      onboardingCompleted: true,
      profileViews: 210,
    },
    // ─── idx 5 : Librairie POINTS, PREMIUM, Rabat ───
    {
      nom: 'Librairie Kalila',
      email: 'librairie@test.com',
      categorie: MerchantCategory.LIBRAIRIE,
      description: 'Livres, BD, manga et papeterie. Section jeunesse et littérature arabe.',
      ville: 'Rabat',
      quartier: 'Agdal',
      adresse: '33 Av. Fal Ould Oumeir, Agdal',
      latitude: 33.9911,
      longitude: -6.8498,
      phoneNumber: '+212661000006',
      pointsRate: 12,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 12,
      pointsRules: { pointsPerDirham: 2, minimumPurchase: 40 },
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(365),
      onboardingCompleted: true,
      referralCode: 'LIBR-KALI',
      socialLinks: { instagram: 'https://instagram.com/librairekalila', snapchat: 'librairekalila' },
      profileViews: 175,
    },
    // ─── idx 6 : Fashion POINTS, PREMIUM, Casablanca ───
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
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(240),
      onboardingCompleted: true,
      referralCode: 'FASH-HOUS',
      referredByIdx: 0 as number | undefined,
      socialLinks: { instagram: 'https://instagram.com/fashionhouse', tiktok: 'https://tiktok.com/@fashionhouse', website: 'https://fashionhouse.ma' },
      profileViews: 890,
    },
    // ─── idx 7 : Coiffure STAMPS, FREE, Marrakech ───
    {
      nom: 'Coiffure Studio M',
      email: 'coiffure@test.com',
      categorie: MerchantCategory.COIFFURE,
      description: 'Coiffure homme et femme, barbier, soins capillaires.',
      ville: 'Marrakech',
      quartier: 'Guéliz',
      adresse: '10 Rue de la Liberté, Guéliz',
      latitude: 31.6340,
      longitude: -8.0080,
      phoneNumber: '+212661000008',
      pointsRate: 10,
      loyaltyType: LoyaltyType.STAMPS,
      stampsForReward: 6,
      conversionRate: 10,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 50 },
      plan: MerchantPlan.FREE,
      onboardingCompleted: true,
      referralCode: 'COIF-STUD',
      profileViews: 66,
    },
    // ─── idx 8 : TechZone POINTS, PREMIUM, Casablanca ───
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
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(60),
      onboardingCompleted: true,
      referralCode: 'TECH-ZONE',
      socialLinks: { instagram: 'https://instagram.com/techzonema', website: 'https://techzone.ma' },
      profileViews: 445,
      accumulationLimit: 1000,
    },
    // ─── idx 9 : Sport STAMPS, PREMIUM trial, Casablanca ───
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
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(5),
      trialStartedAt: daysAgo(25),
      onboardingCompleted: true,
      referralCode: 'FIT-CLUB',
      socialLinks: { instagram: 'https://instagram.com/fitclubgym' },
      profileViews: 310,
    },
    // ─── idx 10 : Beauté POINTS, FREE, onboarding NON complété (nouveau marchand) ───
    {
      nom: 'Beauté Zen',
      email: 'beaute@test.com',
      categorie: MerchantCategory.BEAUTE,
      description: 'Institut de beauté, hammam, soins du visage et du corps.',
      ville: 'Tanger',
      quartier: 'Centre-Ville',
      adresse: '55 Bd Pasteur, Tanger',
      latitude: 35.7673,
      longitude: -5.7998,
      phoneNumber: '+212661000011',
      pointsRate: 10,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 10,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 50 },
      plan: MerchantPlan.FREE,
      onboardingCompleted: false,
      profileViews: 5,
    },
    // ─── idx 11 : Supermarché POINTS, PREMIUM, Casablanca — désactivé (banni) ───
    {
      nom: 'SuperMarché Atlas',
      email: 'supermarche@test.com',
      categorie: MerchantCategory.SUPERMARCHE,
      description: 'Supermarché de proximité. Produits frais et sec, hygiène, ménage.',
      ville: 'Casablanca',
      quartier: 'Hay Hassani',
      adresse: '120 Bd Hay Hassani',
      latitude: 33.5580,
      longitude: -7.6820,
      phoneNumber: '+212661000012',
      pointsRate: 5,
      loyaltyType: LoyaltyType.POINTS,
      conversionRate: 5,
      pointsRules: { pointsPerDirham: 1, minimumPurchase: 50 },
      plan: MerchantPlan.PREMIUM,
      planExpiresAt: daysFromNow(30),
      onboardingCompleted: true,
      isActive: false,
      profileViews: 30,
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
        stampsForReward: (m as any).stampsForReward ?? 10,
        pointsRules: m.pointsRules,
        socialLinks: (m as any).socialLinks ?? undefined,
        profileViews: m.profileViews ?? 0,
        plan: m.plan ?? MerchantPlan.FREE,
        planExpiresAt: (m as any).planExpiresAt ?? undefined,
        planActivatedByAdmin: (m as any).planActivatedByAdmin ?? false,
        trialStartedAt: (m as any).trialStartedAt ?? undefined,
        referralCode: (m as any).referralCode ?? undefined,
        accumulationLimit: (m as any).accumulationLimit ?? undefined,
        onboardingCompleted: m.onboardingCompleted ?? false,
        termsAccepted: true,
        isActive: (m as any).isActive ?? true,
      },
    });
    merchants.push(merchant);
    console.log(`✅ Merchant: ${merchant.nom} (${merchant.email}) [${m.plan ?? 'FREE'}]`);
  }

  // Mettre à jour les referrals (Restaurant et Fashion parrainés par Café)
  for (let i = 0; i < merchantsData.length; i++) {
    const refIdx = (merchantsData[i] as any).referredByIdx;
    if (refIdx !== undefined) {
      await prisma.merchant.update({
        where: { id: merchants[i].id },
        data: { referredById: merchants[refIdx].id },
      });
    }
  }
  // Café a parrainé 2 marchands → 2 mois earned
  await prisma.merchant.update({
    where: { id: merchants[0].id },
    data: { referralMonthsEarned: 2 },
  });

  // ═══════════════════════════════════════════
  // 3. STORES (succursales/points de vente supplémentaires)
  // ═══════════════════════════════════════════
  const storesData = [
    { merchantIdx: 0, nom: 'Café Barrista - Twin Center', ville: 'Casablanca', quartier: 'Maarif', adresse: 'Twin Center, RDC', latitude: 33.5745, longitude: -7.6265 },
    { merchantIdx: 0, nom: 'Café Barrista - Marina', ville: 'Casablanca', quartier: 'Marina', adresse: 'Marina Shopping, RDC', latitude: 33.6000, longitude: -7.6300 },
    { merchantIdx: 1, nom: 'Épicerie Verte - Oulfa', ville: 'Casablanca', quartier: 'Oulfa', adresse: '90 Bd Oulfa', latitude: 33.5600, longitude: -7.5900 },
    { merchantIdx: 2, nom: 'Dar Zellij - Ain Diab', ville: 'Casablanca', quartier: 'Ain Diab', adresse: 'Corniche, Ain Diab', latitude: 33.5540, longitude: -7.6680 },
    { merchantIdx: 6, nom: 'Fashion House - Anfaplace', ville: 'Casablanca', quartier: 'Anfa', adresse: 'Anfaplace Mall, Niveau 1', latitude: 33.5680, longitude: -7.6650 },
    { merchantIdx: 6, nom: 'Fashion House - Rabat', ville: 'Rabat', quartier: 'Agdal', adresse: 'Mega Mall, Niveau 2', latitude: 33.9850, longitude: -6.8540 },
    { merchantIdx: 8, nom: 'TechZone - Twin Center', ville: 'Casablanca', quartier: 'Maarif', adresse: 'Twin Center, Niveau -1', latitude: 33.5745, longitude: -7.6265 },
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
    { merchantIdx: 0, titre: 'Petit-déj offert', cout: 150, description: 'Un petit-déjeuner complet offert (café + jus + viennoiserie)' },
    { merchantIdx: 1, titre: 'Panier fruits', cout: 100, description: 'Un panier de fruits de saison offert' },
    { merchantIdx: 1, titre: '-20% sur commande', cout: 150, description: '20% de réduction sur votre prochaine commande' },
    { merchantIdx: 2, titre: 'Thé à la menthe offert', cout: 50, description: 'Un thé à la menthe traditionnel offert' },
    { merchantIdx: 2, titre: 'Dessert offert', cout: 200, description: 'Un dessert au choix offert avec votre repas' },
    { merchantIdx: 2, titre: 'Menu complet -25%', cout: 350, description: '25% de réduction sur un menu complet' },
    { merchantIdx: 3, titre: 'Baguette offerte', cout: 60, description: 'Une baguette tradition offerte' },
    { merchantIdx: 3, titre: 'Pâtisserie offerte', cout: 100, description: 'Une pâtisserie marocaine au choix' },
    { merchantIdx: 4, titre: '-10% parapharmacie', cout: 80, description: '10% de réduction sur la parapharmacie' },
    { merchantIdx: 5, titre: 'Livre de poche offert', cout: 120, description: 'Un livre de poche au choix offert' },
    { merchantIdx: 5, titre: 'Carnet premium offert', cout: 200, description: 'Un carnet Moleskine offert' },
    { merchantIdx: 6, titre: 'Bon de 50 DH', cout: 200, description: 'Bon d\'achat de 50 DH sur votre prochain achat' },
    { merchantIdx: 6, titre: 'Bon de 100 DH', cout: 350, description: 'Bon d\'achat de 100 DH' },
    { merchantIdx: 7, titre: 'Coupe gratuite', cout: 100, description: 'Une coupe homme ou femme offerte' },
    { merchantIdx: 7, titre: 'Soin capillaire offert', cout: 150, description: 'Un soin capillaire professionnel offert' },
    { merchantIdx: 8, titre: 'Accessoire offert', cout: 300, description: 'Un accessoire téléphone offert (coque, chargeur...)' },
    { merchantIdx: 8, titre: 'Réparation -50%', cout: 500, description: '50% de réduction sur une réparation d\'écran' },
    { merchantIdx: 9, titre: 'Séance offerte', cout: 100, description: 'Une séance de sport offerte avec coach' },
    { merchantIdx: 9, titre: 'Mois -30%', cout: 250, description: '30% de réduction sur votre prochain abonnement mensuel' },
    { merchantIdx: 10, titre: 'Soin visage offert', cout: 150, description: 'Un soin du visage express (30 min) offert' },
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
    { merchantIdx: 0, nom: 'Rachid Caissier', email: 'rachid@cafe-test.com' },
    { merchantIdx: 2, nom: 'Karim Chef', email: 'karim@restaurant-test.com' },
    { merchantIdx: 2, nom: 'Nadia Hôtesse', email: 'nadia@restaurant-test.com' },
    { merchantIdx: 6, nom: 'Sara Vendeuse', email: 'sara@fashion-test.com' },
    { merchantIdx: 6, nom: 'Imane Caissière', email: 'imane@fashion-test.com' },
    { merchantIdx: 8, nom: 'Hamza Technicien', email: 'hamza@tech-test.com' },
    { merchantIdx: 9, nom: 'Omar Coach', email: 'omar@fitclub-test.com' },
    { merchantIdx: 9, nom: 'Leila Coach Yoga', email: 'leila@fitclub-test.com' },
  ];

  const teamMembers: any[] = [];
  for (const t of teamData) {
    const tm = await prisma.teamMember.create({
      data: {
        merchantId: merchants[t.merchantIdx].id,
        nom: t.nom,
        email: t.email,
        password: pw,
      },
    });
    teamMembers.push(tm);
  }
  console.log(`✅ ${teamData.length} team members créés`);

  // ═══════════════════════════════════════════
  // 6. CLIENTS (10 clients test variés)
  // ═══════════════════════════════════════════
  const clientsData = [
    // idx 0 : Client principal, mot de passe + OTP, toutes notifs ON
    { prenom: 'Ayoub', nom: 'Bennani', email: 'ayoub@test.com', telephone: '+212600000001', countryCode: 'MA', password: clientPw, dateNaissance: new Date('1995-03-15') },
    // idx 1 : Femme, notifs email OFF
    { prenom: 'Fatima', nom: 'El Amrani', email: 'fatima@test.com', telephone: '+212600000002', countryCode: 'MA', password: clientPw, dateNaissance: new Date('1990-07-22'), notifEmail: false },
    // idx 2 : Client actif multi-marchand, toutes notifs ON
    { prenom: 'Mohamed', nom: 'Tazi', email: 'mohamed@test.com', telephone: '+212600000003', countryCode: 'MA', password: clientPw, dateNaissance: new Date('1988-11-05') },
    // idx 3 : Femme, notifs whatsapp OFF
    { prenom: 'Salma', nom: 'Idrissi', email: 'salma@test.com', telephone: '+212600000004', countryCode: 'MA', password: clientPw, dateNaissance: new Date('1997-01-30'), notifWhatsapp: false },
    // idx 4 : Jeune client, peu d'activité
    { prenom: 'Yassine', nom: 'Alaoui', email: 'yassine@test.com', telephone: '+212600000005', countryCode: 'MA', password: clientPw, dateNaissance: new Date('2001-09-12') },
    // idx 5 : Client Google, pas de mot de passe
    { prenom: 'Khadija', nom: 'Bouazza', email: 'khadija@test.com', telephone: '+212600000006', countryCode: 'MA', googleId: 'google-uid-khadija-001', dateNaissance: new Date('1993-04-18') },
    // idx 6 : Client sans email (téléphone uniquement)
    { prenom: 'Hassan', nom: 'Ouazzani', telephone: '+212600000007', countryCode: 'MA', dateNaissance: new Date('1985-12-01') },
    // idx 7 : Français au Maroc
    { prenom: 'Sophie', nom: 'Dupont', email: 'sophie@test.com', telephone: '+33612345678', countryCode: 'FR', password: clientPw, dateNaissance: new Date('1992-06-14') },
    // idx 8 : Client push OFF (teste les filtres notif)
    { prenom: 'Omar', nom: 'Mansouri', email: 'omar.client@test.com', telephone: '+212600000008', countryCode: 'MA', password: clientPw, notifPush: false },
    // idx 9 : Client inactif (soft-deleted)
    { prenom: 'Zineb', nom: 'Fikri', email: 'zineb@test.com', telephone: '+212600000009', countryCode: 'MA', password: clientPw, deletedAt: daysAgo(10) },
  ];

  const clients: any[] = [];
  for (const c of clientsData) {
    const client = await prisma.client.create({
      data: {
        prenom: c.prenom,
        nom: c.nom,
        email: (c as any).email ?? undefined,
        telephone: c.telephone,
        countryCode: c.countryCode,
        password: (c as any).password ?? undefined,
        googleId: (c as any).googleId ?? undefined,
        dateNaissance: (c as any).dateNaissance ?? undefined,
        termsAccepted: true,
        shareInfoMerchants: true,
        notifPush: (c as any).notifPush ?? true,
        notifEmail: (c as any).notifEmail ?? true,
        notifWhatsapp: (c as any).notifWhatsapp ?? true,
        deletedAt: (c as any).deletedAt ?? undefined,
      },
    });
    clients.push(client);
    console.log(`✅ Client: ${client.prenom} ${client.nom} (${client.telephone})`);
  }

  // ═══════════════════════════════════════════
  // 7. LOYALTY CARDS (chaque client actif a plusieurs cartes)
  // ═══════════════════════════════════════════
  const cardsData = [
    // Ayoub (idx 0) → 5 marchands (client très actif)
    { clientIdx: 0, merchantIdx: 0, points: 65 },
    { clientIdx: 0, merchantIdx: 2, points: 180 },
    { clientIdx: 0, merchantIdx: 3, points: 45 },
    { clientIdx: 0, merchantIdx: 5, points: 80 },
    { clientIdx: 0, merchantIdx: 8, points: 250 },
    // Fatima (idx 1) → 4 marchands
    { clientIdx: 1, merchantIdx: 0, points: 30 },
    { clientIdx: 1, merchantIdx: 1, points: 90 },
    { clientIdx: 1, merchantIdx: 4, points: 60 },
    { clientIdx: 1, merchantIdx: 7, points: 4 },
    // Mohamed (idx 2) → 6 marchands (super actif)
    { clientIdx: 2, merchantIdx: 0, points: 120 },
    { clientIdx: 2, merchantIdx: 2, points: 95 },
    { clientIdx: 2, merchantIdx: 5, points: 200 },
    { clientIdx: 2, merchantIdx: 6, points: 150 },
    { clientIdx: 2, merchantIdx: 8, points: 400 },
    { clientIdx: 2, merchantIdx: 9, points: 80 },
    // Salma (idx 3) → 3 marchands
    { clientIdx: 3, merchantIdx: 1, points: 40 },
    { clientIdx: 3, merchantIdx: 3, points: 75 },
    { clientIdx: 3, merchantIdx: 7, points: 55 },
    // Yassine (idx 4) → 2 marchands
    { clientIdx: 4, merchantIdx: 0, points: 15 },
    { clientIdx: 4, merchantIdx: 9, points: 100 },
    // Khadija (idx 5) → 3 marchands (Google user)
    { clientIdx: 5, merchantIdx: 0, points: 50 },
    { clientIdx: 5, merchantIdx: 2, points: 120 },
    { clientIdx: 5, merchantIdx: 6, points: 75 },
    // Hassan (idx 6) → 2 marchands (téléphone only)
    { clientIdx: 6, merchantIdx: 3, points: 30 },
    { clientIdx: 6, merchantIdx: 4, points: 20 },
    // Sophie (idx 7) → 2 marchands (française)
    { clientIdx: 7, merchantIdx: 2, points: 160 },
    { clientIdx: 7, merchantIdx: 6, points: 200 },
    // Omar (idx 8) → 1 marchand (push OFF)
    { clientIdx: 8, merchantIdx: 0, points: 25 },
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
  // 8. TRANSACTIONS (historique riche et réaliste)
  // ═══════════════════════════════════════════
  const txData: Array<{
    clientIdx: number; merchantIdx: number; type: TransactionType;
    amount: number; points: number; daysAgo: number;
    rewardIdx?: number; teamIdx?: number; status?: TransactionStatus; note?: string;
  }> = [
    // ── Ayoub @ Café Barrista (Stamps) ──
    { clientIdx: 0, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 35, points: 35, daysAgo: 45, teamIdx: 0 },
    { clientIdx: 0, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 20, points: 20, daysAgo: 30, teamIdx: 1 },
    { clientIdx: 0, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 15, points: 10, daysAgo: 10, teamIdx: 0 },
    // ── Ayoub @ Restaurant Dar Zellij ──
    { clientIdx: 0, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 120, points: 80, daysAgo: 40, teamIdx: 3 },
    { clientIdx: 0, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 85, points: 60, daysAgo: 25 },
    { clientIdx: 0, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 60, points: 40, daysAgo: 5, teamIdx: 4 },
    // ── Ayoub @ Boulangerie ──
    { clientIdx: 0, merchantIdx: 3, type: TransactionType.EARN_POINTS, amount: 25, points: 25, daysAgo: 18 },
    { clientIdx: 0, merchantIdx: 3, type: TransactionType.EARN_POINTS, amount: 20, points: 20, daysAgo: 8 },
    // ── Ayoub @ Librairie ──
    { clientIdx: 0, merchantIdx: 5, type: TransactionType.EARN_POINTS, amount: 120, points: 80, daysAgo: 15 },
    // ── Ayoub @ TechZone ──
    { clientIdx: 0, merchantIdx: 8, type: TransactionType.EARN_POINTS, amount: 500, points: 250, daysAgo: 12, teamIdx: 7 },

    // ── Fatima @ Café ──
    { clientIdx: 1, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 30, points: 30, daysAgo: 20, teamIdx: 1 },
    // ── Fatima @ Épicerie ──
    { clientIdx: 1, merchantIdx: 1, type: TransactionType.EARN_POINTS, amount: 80, points: 40, daysAgo: 14 },
    { clientIdx: 1, merchantIdx: 1, type: TransactionType.EARN_POINTS, amount: 100, points: 50, daysAgo: 7 },
    // ── Fatima @ Pharmacie ──
    { clientIdx: 1, merchantIdx: 4, type: TransactionType.EARN_POINTS, amount: 200, points: 60, daysAgo: 9 },
    // ── Fatima @ Coiffure (Marrakech) ──
    { clientIdx: 1, merchantIdx: 7, type: TransactionType.EARN_POINTS, amount: 150, points: 4, daysAgo: 3 },

    // ── Mohamed @ Café (gros client — a redemé un reward) ──
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 200, points: 200, daysAgo: 50, teamIdx: 0 },
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 50, points: 50, daysAgo: 35 },
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.REDEEM_REWARD, amount: 0, points: 80, daysAgo: 30, rewardIdx: 0 },
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 40, points: 40, daysAgo: 15 },
    // ── Mohamed @ Restaurant ──
    { clientIdx: 2, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 150, points: 95, daysAgo: 22, teamIdx: 3 },
    // ── Mohamed @ Librairie ──
    { clientIdx: 2, merchantIdx: 5, type: TransactionType.EARN_POINTS, amount: 300, points: 200, daysAgo: 28 },
    // ── Mohamed @ Fashion ──
    { clientIdx: 2, merchantIdx: 6, type: TransactionType.EARN_POINTS, amount: 450, points: 150, daysAgo: 6, teamIdx: 5 },
    // ── Mohamed @ TechZone (a atteint la limite d'accumulation) ──
    { clientIdx: 2, merchantIdx: 8, type: TransactionType.EARN_POINTS, amount: 800, points: 400, daysAgo: 20, teamIdx: 7 },
    // ── Mohamed @ FitClub ──
    { clientIdx: 2, merchantIdx: 9, type: TransactionType.EARN_POINTS, amount: 300, points: 80, daysAgo: 3, teamIdx: 8 },

    // ── Salma ──
    { clientIdx: 3, merchantIdx: 1, type: TransactionType.EARN_POINTS, amount: 60, points: 40, daysAgo: 16 },
    { clientIdx: 3, merchantIdx: 3, type: TransactionType.EARN_POINTS, amount: 50, points: 75, daysAgo: 11 },
    { clientIdx: 3, merchantIdx: 7, type: TransactionType.EARN_POINTS, amount: 120, points: 55, daysAgo: 4 },

    // ── Yassine ──
    { clientIdx: 4, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 15, points: 15, daysAgo: 2, teamIdx: 2 },
    { clientIdx: 4, merchantIdx: 9, type: TransactionType.EARN_POINTS, amount: 600, points: 100, daysAgo: 1, teamIdx: 9 },

    // ── Khadija (Google user) ──
    { clientIdx: 5, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 50, points: 50, daysAgo: 12, teamIdx: 0 },
    { clientIdx: 5, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 200, points: 120, daysAgo: 8 },
    { clientIdx: 5, merchantIdx: 6, type: TransactionType.EARN_POINTS, amount: 250, points: 75, daysAgo: 4 },

    // ── Hassan (téléphone only) ──
    { clientIdx: 6, merchantIdx: 3, type: TransactionType.EARN_POINTS, amount: 30, points: 30, daysAgo: 7 },
    { clientIdx: 6, merchantIdx: 4, type: TransactionType.EARN_POINTS, amount: 100, points: 20, daysAgo: 5 },

    // ── Sophie (française) ──
    { clientIdx: 7, merchantIdx: 2, type: TransactionType.EARN_POINTS, amount: 300, points: 160, daysAgo: 18, teamIdx: 3 },
    { clientIdx: 7, merchantIdx: 6, type: TransactionType.EARN_POINTS, amount: 600, points: 200, daysAgo: 10, teamIdx: 6 },

    // ── Omar (push OFF) ──
    { clientIdx: 8, merchantIdx: 0, type: TransactionType.EARN_POINTS, amount: 25, points: 25, daysAgo: 3 },

    // ── Transactions ADJUST_POINTS (correction admin) ──
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.ADJUST_POINTS, amount: 0, points: -10, daysAgo: 14, note: 'Correction: double scan détecté' },
    { clientIdx: 0, merchantIdx: 8, type: TransactionType.ADJUST_POINTS, amount: 0, points: 50, daysAgo: 11, note: 'Bonus fidélité anniversaire' },

    // ── Transaction CANCELLED (annulée) ──
    { clientIdx: 1, merchantIdx: 1, type: TransactionType.EARN_POINTS, amount: 50, points: 25, daysAgo: 5, status: TransactionStatus.CANCELLED, note: 'Annulée par le client' },

    // ── Transaction LOYALTY_PROGRAM_CHANGE ──
    { clientIdx: 2, merchantIdx: 0, type: TransactionType.LOYALTY_PROGRAM_CHANGE, amount: 0, points: 0, daysAgo: 60, note: 'Migration POINTS → STAMPS' },
  ];

  for (const tx of txData) {
    await prisma.transaction.create({
      data: {
        clientId: clients[tx.clientIdx].id,
        merchantId: merchants[tx.merchantIdx].id,
        type: tx.type,
        amount: tx.amount,
        points: Math.abs(tx.points),
        rewardId: tx.rewardIdx !== undefined ? rewards[tx.rewardIdx].id : undefined,
        teamMemberId: tx.teamIdx !== undefined ? teamMembers[tx.teamIdx].id : undefined,
        performedByName: tx.teamIdx !== undefined ? teamMembers[tx.teamIdx].nom : undefined,
        status: tx.status ?? TransactionStatus.ACTIVE,
        note: tx.note ?? undefined,
        createdAt: daysAgo(tx.daysAgo),
      },
    });
  }
  console.log(`✅ ${txData.length} transactions créées`);

  // ═══════════════════════════════════════════
  // 9. NOTIFICATIONS (variées, avec des dates différentes)
  // ═══════════════════════════════════════════
  const notifData = [
    // ── Café Barrista (idx 0) ──
    { merchantIdx: 0, title: 'Happy Hour! ☕', body: 'Café offert pour tout achat avant 10h ce weekend!', recipientCount: 45, successCount: 42, daysAgo: 0 },
    { merchantIdx: 0, title: 'Nouvelle carte de fidélité 🎉', body: 'Collectez 8 tampons et recevez un café gratuit ! Venez découvrir notre nouveau programme.', recipientCount: 50, successCount: 47, daysAgo: 3 },
    { merchantIdx: 0, title: 'Fermeture exceptionnelle ⚠️', body: 'Notre café sera fermé le lundi 24 mars pour travaux. Réouverture mardi à 7h!', recipientCount: 50, successCount: 48, daysAgo: 1 },
    { merchantIdx: 0, title: 'Nouveau blend éthiopien 🌍', body: 'Découvrez notre nouveau café single origin d\'Éthiopie. Disponible dès demain en boutique!', recipientCount: 48, successCount: 45, daysAgo: 6 },

    // ── Restaurant Dar Zellij (idx 2) ──
    { merchantIdx: 2, title: 'Nouveau menu 🍽️', body: 'Découvrez notre nouveau menu d\'hiver avec des plats chauds et réconfortants.', recipientCount: 30, successCount: 28, daysAgo: 5 },
    { merchantIdx: 2, title: 'Soirée spéciale Couscous 🥘', body: 'Ce vendredi, soirée couscous à volonté pour seulement 89 DH. Réservez vite !', recipientCount: 35, successCount: 33, daysAgo: 2 },
    { merchantIdx: 2, title: 'Brunch du dimanche 🥐', body: 'Nouveau brunch marocain chaque dimanche de 10h à 14h. Buffet à volonté 149 DH.', recipientCount: 30, successCount: 27, daysAgo: 4 },

    // ── Boulangerie Al Fourno (idx 3) ──
    { merchantIdx: 3, title: 'Pain chaud dès 6h 🥖', body: 'Venez profiter de notre pain tradition tout chaud dès 6h du matin. Offre spéciale: 2ème baguette à moitié prix!', recipientCount: 40, successCount: 38, daysAgo: 1 },
    { merchantIdx: 3, title: 'Pâtisseries marocaines 🍰', body: 'Commandez vos cornes de gazelle et briouates pour le weekend. -15% sur les commandes de plus de 100 DH.', recipientCount: 40, successCount: 36, daysAgo: 7 },

    // ── TechZone (idx 8) ──
    { merchantIdx: 8, title: 'Soldes Tech -30% 📱', body: 'Coques, écouteurs, chargeurs... Profitez de -30% sur tous les accessoires ce weekend!', recipientCount: 60, successCount: 55, daysAgo: 0 },
    { merchantIdx: 8, title: 'Nouveau : réparation express ⚡', body: 'Service de réparation d\'écran en 30 min. Apportez votre téléphone et repartez le même jour!', recipientCount: 55, successCount: 50, daysAgo: 6 },
    { merchantIdx: 8, title: 'iPhone 16 en stock 📦', body: 'L\'iPhone 16 est disponible chez TechZone! Venez le découvrir en magasin.', recipientCount: 60, successCount: 57, daysAgo: 2 },

    // ── Épicerie Verte (idx 1) ──
    { merchantIdx: 1, title: 'Arrivage bio 🌿', body: 'Nouvelles variétés de fruits et légumes bio cette semaine. Fraises, avocat et mangue!', recipientCount: 20, successCount: 18, daysAgo: 2 },
    { merchantIdx: 1, title: 'Promo Ramadan 🌙', body: 'Préparez votre Ramadan ! -20% sur les dattes, le miel et les fruits secs.', recipientCount: 22, successCount: 20, daysAgo: 8 },

    // ── Fashion House (idx 6) ──
    { merchantIdx: 6, title: 'Soldes -40% 🏷️', body: 'Profitez de -40% sur toute la collection été! Offre limitée.', recipientCount: 80, successCount: 75, daysAgo: 3 },
    { merchantIdx: 6, title: 'Nouvelle collection 🆕', body: 'La collection printemps 2026 est arrivée! Découvrez-la en exclusivité ce weekend.', recipientCount: 85, successCount: 80, daysAgo: 0 },

    // ── FitClub (idx 9) ──
    { merchantIdx: 9, title: 'Cours gratuit 💪', body: 'Séance de yoga gratuite ce samedi à 9h. Places limitées!', recipientCount: 25, successCount: 23, daysAgo: 4 },
    { merchantIdx: 9, title: 'Offre parrainage 🤝', body: 'Invitez un ami et recevez chacun une séance offerte. Valable jusqu\'au 30 mars.', recipientCount: 25, successCount: 22, daysAgo: 1 },

    // ── Librairie (idx 5) ──
    { merchantIdx: 5, title: 'Dédicace ce samedi ✍️', body: 'Rencontre avec l\'auteur Tahar Benjelloun ce samedi à 16h. Entrée libre!', recipientCount: 15, successCount: 14, daysAgo: 2 },

    // ── Pharmacie (idx 4) ──
    { merchantIdx: 4, title: 'Journée dépistage 🏥', body: 'Dépistage gratuit diabète et tension ce samedi de 9h à 13h.', recipientCount: 30, successCount: 28, daysAgo: 5 },
  ];

  const notifications: any[] = [];
  for (const n of notifData) {
    const notif = await prisma.notification.create({
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
    notifications.push(notif);
  }
  console.log(`✅ ${notifications.length} notifications créées`);

  // ═══════════════════════════════════════════
  // 10. CLIENT NOTIFICATION STATUSES (lecture/dismissal)
  // ═══════════════════════════════════════════
  const clientNotifData = [
    // Ayoub a lu les notifs Café Barrista (0,1,2) et Restaurant (4,5)
    { clientIdx: 0, notifIdx: 0, isRead: true, readAt: daysAgo(0) },
    { clientIdx: 0, notifIdx: 1, isRead: true, readAt: daysAgo(2) },
    { clientIdx: 0, notifIdx: 2, isRead: true, readAt: daysAgo(0), isDismissed: true, dismissedAt: daysAgo(0) },
    { clientIdx: 0, notifIdx: 4, isRead: true, readAt: daysAgo(4) },
    { clientIdx: 0, notifIdx: 5, isRead: false },
    // Fatima a lu certaines notifs
    { clientIdx: 1, notifIdx: 0, isRead: true, readAt: daysAgo(0) },
    { clientIdx: 1, notifIdx: 1, isRead: false },
    { clientIdx: 1, notifIdx: 12, isRead: true, readAt: daysAgo(1) },
    // Mohamed a lu beaucoup
    { clientIdx: 2, notifIdx: 0, isRead: true, readAt: daysAgo(0) },
    { clientIdx: 2, notifIdx: 1, isRead: true, readAt: daysAgo(2) },
    { clientIdx: 2, notifIdx: 4, isRead: true, readAt: daysAgo(4) },
    { clientIdx: 2, notifIdx: 5, isRead: true, readAt: daysAgo(1) },
    { clientIdx: 2, notifIdx: 14, isRead: true, readAt: daysAgo(2) },
    { clientIdx: 2, notifIdx: 16, isRead: false },
    // Khadija
    { clientIdx: 5, notifIdx: 0, isRead: true, readAt: daysAgo(0) },
    { clientIdx: 5, notifIdx: 4, isRead: false },
    // Sophie
    { clientIdx: 7, notifIdx: 4, isRead: true, readAt: daysAgo(3) },
    { clientIdx: 7, notifIdx: 14, isRead: true, readAt: daysAgo(2) },
  ];

  for (const cn of clientNotifData) {
    await prisma.clientNotificationStatus.create({
      data: {
        clientId: clients[cn.clientIdx].id,
        notificationId: notifications[cn.notifIdx].id,
        isRead: cn.isRead,
        readAt: (cn as any).readAt ?? undefined,
        isDismissed: (cn as any).isDismissed ?? false,
        dismissedAt: (cn as any).dismissedAt ?? undefined,
      },
    });
  }
  console.log(`✅ ${clientNotifData.length} statuts de notification créés`);

  // ═══════════════════════════════════════════
  // 11. UPGRADE REQUESTS (demandes de passage Premium)
  // ═══════════════════════════════════════════
  const upgradeData = [
    // Boulangerie (FREE) → demande PENDING
    { merchantIdx: 3, status: UpgradeRequestStatus.PENDING, message: 'Nous avons besoin des fonctionnalités Premium pour gérer nos 3 succursales.', daysAgo: 2 },
    // Coiffure (FREE) → demande APPROVED (déjà traitée)
    { merchantIdx: 7, status: UpgradeRequestStatus.APPROVED, message: 'Besoin du multi-canal pour nos clients à Marrakech.', adminNote: 'Approuvé pour 3 mois d\'essai', reviewedById: admin.id, reviewedAt: daysAgo(5), daysAgo: 8 },
    // Pharmacie (FREE) → demande REJECTED
    { merchantIdx: 4, status: UpgradeRequestStatus.REJECTED, message: 'Nous voulons le Premium.', adminNote: 'Compte trop récent, réessayez dans 1 mois.', reviewedById: admin.id, reviewedAt: daysAgo(3), daysAgo: 7 },
    // Beauté (FREE, onboarding non complété) → demande PENDING
    { merchantIdx: 10, status: UpgradeRequestStatus.PENDING, message: 'Je viens de m\'inscrire et j\'ai besoin du Premium pour mon institut.', daysAgo: 1 },
  ];

  for (const u of upgradeData) {
    await prisma.upgradeRequest.create({
      data: {
        merchantId: merchants[u.merchantIdx].id,
        status: u.status,
        message: u.message,
        adminNote: (u as any).adminNote ?? undefined,
        reviewedById: (u as any).reviewedById ?? undefined,
        reviewedAt: (u as any).reviewedAt ?? undefined,
        createdAt: daysAgo(u.daysAgo),
      },
    });
  }
  console.log(`✅ ${upgradeData.length} demandes d'upgrade créées`);

  // ═══════════════════════════════════════════
  // 12. DEVICE SESSIONS (sessions des marchands)
  // ═══════════════════════════════════════════
  const deviceData = [
    // Café Barrista — 2 devices (owner + team)
    { merchantIdx: 0, deviceName: 'iPhone 14 Pro', deviceOS: 'iOS 17.4', userType: 'MERCHANT', userEmail: 'cafe@test.com', userName: 'Café Barrista', isCurrentDevice: true, lastActiveAt: daysAgo(0) },
    { merchantIdx: 0, deviceName: 'Samsung A54', deviceOS: 'Android 14', userType: 'TEAM_MEMBER', userEmail: 'youssef@cafe-test.com', userName: 'Youssef Barista', isCurrentDevice: true, lastActiveAt: daysAgo(0) },
    // Restaurant — 1 device
    { merchantIdx: 2, deviceName: 'iPad Pro 12.9"', deviceOS: 'iPadOS 17.3', userType: 'MERCHANT', userEmail: 'restaurant@test.com', userName: 'Restaurant Dar Zellij', isCurrentDevice: true, lastActiveAt: daysAgo(0) },
    // Fashion House — 3 devices (owner + 2 team)
    { merchantIdx: 6, deviceName: 'iPhone 15', deviceOS: 'iOS 17.4', userType: 'MERCHANT', userEmail: 'vetements@test.com', userName: 'Fashion House', isCurrentDevice: true, lastActiveAt: daysAgo(0) },
    { merchantIdx: 6, deviceName: 'Samsung S24', deviceOS: 'Android 14', userType: 'TEAM_MEMBER', userEmail: 'sara@fashion-test.com', userName: 'Sara Vendeuse', isCurrentDevice: true, lastActiveAt: daysAgo(1) },
    { merchantIdx: 6, deviceName: 'Xiaomi Redmi Note 13', deviceOS: 'Android 14', userType: 'TEAM_MEMBER', userEmail: 'imane@fashion-test.com', userName: 'Imane Caissière', isCurrentDevice: false, lastActiveAt: daysAgo(5) },
    // TechZone
    { merchantIdx: 8, deviceName: 'Pixel 8', deviceOS: 'Android 14', userType: 'MERCHANT', userEmail: 'tech@test.com', userName: 'TechZone', isCurrentDevice: true, lastActiveAt: daysAgo(0) },
    // FitClub
    { merchantIdx: 9, deviceName: 'iPhone 13', deviceOS: 'iOS 17.2', userType: 'MERCHANT', userEmail: 'sport@test.com', userName: 'FitClub Gym', isCurrentDevice: true, lastActiveAt: daysAgo(0) },
    { merchantIdx: 9, deviceName: 'iPad Mini', deviceOS: 'iPadOS 17.3', userType: 'TEAM_MEMBER', userEmail: 'omar@fitclub-test.com', userName: 'Omar Coach', isCurrentDevice: true, lastActiveAt: daysAgo(1) },
  ];

  for (const d of deviceData) {
    await prisma.deviceSession.create({
      data: {
        merchantId: merchants[d.merchantIdx].id,
        deviceName: d.deviceName,
        deviceOS: d.deviceOS,
        userType: d.userType,
        userEmail: d.userEmail,
        userName: d.userName,
        isCurrentDevice: d.isCurrentDevice,
        lastActiveAt: d.lastActiveAt,
        ipAddress: '105.159.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255),
      },
    });
  }
  console.log(`✅ ${deviceData.length} sessions d'appareils créées`);

  // ═══════════════════════════════════════════
  // 13. PROFILE VIEWS (vues de profils marchands)
  // ═══════════════════════════════════════════
  const profileViewData = [
    // Ayoub a visité Café, Restaurant, TechZone
    { merchantIdx: 0, clientIdx: 0, daysAgo: 0 },
    { merchantIdx: 0, clientIdx: 0, daysAgo: 2 },
    { merchantIdx: 0, clientIdx: 0, daysAgo: 5 },
    { merchantIdx: 2, clientIdx: 0, daysAgo: 1 },
    { merchantIdx: 2, clientIdx: 0, daysAgo: 4 },
    { merchantIdx: 8, clientIdx: 0, daysAgo: 0 },
    // Fatima a visité Café, Épicerie
    { merchantIdx: 0, clientIdx: 1, daysAgo: 1 },
    { merchantIdx: 1, clientIdx: 1, daysAgo: 0 },
    { merchantIdx: 1, clientIdx: 1, daysAgo: 3 },
    // Mohamed — visite beaucoup
    { merchantIdx: 0, clientIdx: 2, daysAgo: 0 },
    { merchantIdx: 2, clientIdx: 2, daysAgo: 0 },
    { merchantIdx: 5, clientIdx: 2, daysAgo: 1 },
    { merchantIdx: 6, clientIdx: 2, daysAgo: 0 },
    { merchantIdx: 6, clientIdx: 2, daysAgo: 2 },
    { merchantIdx: 8, clientIdx: 2, daysAgo: 1 },
    { merchantIdx: 9, clientIdx: 2, daysAgo: 0 },
    // Khadija
    { merchantIdx: 0, clientIdx: 5, daysAgo: 0 },
    { merchantIdx: 2, clientIdx: 5, daysAgo: 1 },
    { merchantIdx: 6, clientIdx: 5, daysAgo: 0 },
    // Sophie
    { merchantIdx: 2, clientIdx: 7, daysAgo: 0 },
    { merchantIdx: 6, clientIdx: 7, daysAgo: 1 },
    { merchantIdx: 6, clientIdx: 7, daysAgo: 3 },
  ];

  for (const pv of profileViewData) {
    const viewDate = daysAgo(pv.daysAgo);
    viewDate.setHours(0, 0, 0, 0);
    await prisma.profileView.create({
      data: {
        merchantId: merchants[pv.merchantIdx].id,
        clientId: clients[pv.clientIdx].id,
        viewDate: viewDate,
      },
    });
  }
  console.log(`✅ ${profileViewData.length} vues de profils créées`);

  // ═══════════════════════════════════════════
  // 14. AUDIT LOGS (actions admin)
  // ═══════════════════════════════════════════
  const auditData = [
    { action: AuditAction.ADMIN_LOGIN, targetType: 'ADMIN', targetId: admin.id, targetLabel: 'Admin Principal (admin@jitplus.com)', daysAgo: 0 },
    { action: AuditAction.ADMIN_LOGIN, targetType: 'ADMIN', targetId: admin.id, targetLabel: 'Admin Principal (admin@jitplus.com)', daysAgo: 1 },
    { action: AuditAction.ADMIN_LOGIN, targetType: 'ADMIN', targetId: admin2.id, targetLabel: 'Support JitPlus (support@jitplus.com)', daysAgo: 0 },
    { action: AuditAction.ACTIVATE_PREMIUM, targetType: 'MERCHANT', targetId: merchants[1].id, targetLabel: 'Épicerie Verte (epicerie@test.com)', metadata: { plan: 'PREMIUM', duration: '3 mois', reason: 'Activation manuelle admin' }, daysAgo: 30 },
    { action: AuditAction.BAN_MERCHANT, targetType: 'MERCHANT', targetId: merchants[11].id, targetLabel: 'SuperMarché Atlas (supermarche@test.com)', metadata: { reason: 'Violation des CGU — spam de notifications' }, daysAgo: 5 },
    { action: AuditAction.APPROVE_UPGRADE_REQUEST, targetType: 'MERCHANT', targetId: merchants[7].id, targetLabel: 'Coiffure Studio M (coiffure@test.com)', metadata: { plan: 'PREMIUM', duration: '3 mois' }, daysAgo: 5 },
    { action: AuditAction.REJECT_UPGRADE_REQUEST, targetType: 'MERCHANT', targetId: merchants[4].id, targetLabel: 'Pharmacie Centrale (pharmacie@test.com)', metadata: { reason: 'Compte trop récent' }, daysAgo: 3 },
  ];

  for (const a of auditData) {
    await prisma.auditLog.create({
      data: {
        adminId: a.action === AuditAction.ADMIN_LOGIN && a.targetId === admin2.id ? admin2.id : admin.id,
        adminEmail: a.action === AuditAction.ADMIN_LOGIN && a.targetId === admin2.id ? admin2.email : admin.email,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        targetLabel: a.targetLabel,
        metadata: (a as any).metadata ?? undefined,
        ipAddress: '105.159.100.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
        createdAt: daysAgo(a.daysAgo),
      },
    });
  }
  console.log(`✅ ${auditData.length} logs d'audit créés`);

  // ═══════════════════════════════════════════
  // RÉSUMÉ COMPLET
  // ═══════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════');
  console.log('✨ SEED TERMINÉ AVEC SUCCÈS!');
  console.log('══════════════════════════════════════════════════════');

  console.log('\n🔑 ADMINS (mot de passe: Admin@JitPlus2024!):');
  console.log('──────────────────────────────────────────────────────');
  console.log('   admin@jitplus.com    → Admin Principal');
  console.log('   support@jitplus.com  → Support JitPlus');

  console.log('\n🏪 MARCHANDS (mot de passe: Seed@Test2024!):');
  console.log('──────────────────────────────────────────────────────');
  merchants.forEach((m: any, i: number) => {
    const md = merchantsData[i];
    const plan = md.plan ?? 'FREE';
    const status = (md as any).isActive === false ? '❌ BANNI' : md.onboardingCompleted ? '✅' : '⏳ onboarding';
    console.log(`   ${m.email.padEnd(25)} → ${m.nom.padEnd(25)} [${plan}] ${status} (${md.ville})`);
  });

  console.log('\n👤 CLIENTS:');
  console.log('──────────────────────────────────────────────────────');
  console.log('   Avec mot de passe (Client@Test2024!) + OTP:');
  clientsData.filter(c => (c as any).password).forEach(c => {
    const deleted = (c as any).deletedAt ? ' [SUPPRIMÉ]' : '';
    console.log(`   ${c.telephone} → ${c.prenom} ${c.nom} (${(c as any).email ?? 'pas d\'email'})${deleted}`);
  });
  console.log('   Sans mot de passe (OTP ou Google uniquement):');
  clientsData.filter(c => !(c as any).password).forEach(c => {
    const method = (c as any).googleId ? 'Google' : 'OTP';
    console.log(`   ${c.telephone} → ${c.prenom} ${c.nom} [${method}]`);
  });

  console.log('\n👥 TEAM MEMBERS (mot de passe: Seed@Test2024!):');
  console.log('──────────────────────────────────────────────────────');
  teamData.forEach(t => console.log(`   ${t.email.padEnd(30)} → ${t.nom}`));

  console.log('\n📊 DONNÉES CRÉÉES:');
  console.log('──────────────────────────────────────────────────────');
  console.log(`   ${merchants.length} marchands (${merchantsData.filter(m => m.plan === MerchantPlan.PREMIUM).length} PREMIUM, ${merchantsData.filter(m => !m.plan || m.plan === MerchantPlan.FREE).length} FREE)`);
  console.log(`   ${storesData.length} succursales`);
  console.log(`   ${rewards.length} récompenses`);
  console.log(`   ${teamData.length} membres d'équipe`);
  console.log(`   ${clients.length} clients (${clientsData.filter(c => (c as any).password).length} avec mdp, ${clientsData.filter(c => (c as any).googleId).length} Google, ${clientsData.filter(c => (c as any).deletedAt).length} supprimé)`);
  console.log(`   ${cards.length} cartes de fidélité`);
  console.log(`   ${txData.length} transactions (${txData.filter(t => t.type === TransactionType.REDEEM_REWARD).length} redemptions, ${txData.filter(t => t.type === TransactionType.ADJUST_POINTS).length} ajustements, ${txData.filter(t => t.status === TransactionStatus.CANCELLED).length} annulée)`);
  console.log(`   ${notifications.length} notifications`);
  console.log(`   ${clientNotifData.length} statuts de notification`);
  console.log(`   ${upgradeData.length} demandes d'upgrade (${upgradeData.filter(u => u.status === UpgradeRequestStatus.PENDING).length} PENDING)`);
  console.log(`   ${deviceData.length} sessions d'appareils`);
  console.log(`   ${profileViewData.length} vues de profils`);
  console.log(`   ${auditData.length} logs d'audit`);
  console.log('══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
