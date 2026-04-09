const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const p = new PrismaClient();
  try {
    const pw = await bcrypt.hash('Test@1234', 10);

    // 1. Create test client with 150 DH balance
    const c = await p.client.upsert({
      where: { email: 'parrain-test@jitplus.com' },
      update: { referralBalance: 150, referralCode: 'TESTPAY1' },
      create: {
        prenom: 'Test',
        nom: 'Parrain',
        email: 'parrain-test@jitplus.com',
        telephone: '+212699999999',
        countryCode: 'MA',
        password: pw,
        termsAccepted: true,
        emailVerified: true,
        telephoneVerified: true,
        referralBalance: 150,
        referralCode: 'TESTPAY1',
      },
    });
    console.log('Client:', c.id, c.email, 'Balance:', c.referralBalance);

    const mpw = await bcrypt.hash('Merchant@1234', 10);

    // 2. Create merchant (PREMIUM, VALIDATED referral)
    const m = await p.merchant.upsert({
      where: { email: 'filleul-test@jitplus.com' },
      update: { plan: 'PREMIUM', planActivatedByAdmin: true, referredByClientId: c.id },
      create: {
        nom: 'Boutique Test Filleul',
        email: 'filleul-test@jitplus.com',
        password: mpw,
        categorie: 'RESTAURANT',
        ville: 'Casablanca',
        countryCode: 'MA',
        termsAccepted: true,
        plan: 'PREMIUM',
        planActivatedByAdmin: true,
        referredByClientId: c.id,
        isActive: true,
      },
    });
    console.log('Merchant VALIDATED:', m.id, m.nom);

    // Create or update VALIDATED referral
    const ex = await p.clientReferral.findUnique({ where: { merchantId: m.id } });
    if (!ex) {
      await p.clientReferral.create({
        data: { clientId: c.id, merchantId: m.id, status: 'VALIDATED', amount: 25, validatedAt: new Date() },
      });
      console.log('Referral VALIDATED created');
    } else {
      await p.clientReferral.update({
        where: { merchantId: m.id },
        data: { status: 'VALIDATED', amount: 25, validatedAt: new Date() },
      });
      console.log('Referral VALIDATED updated');
    }

    // 3. Create merchant (FREE, PENDING referral)
    const m2 = await p.merchant.upsert({
      where: { email: 'filleul-pending@jitplus.com' },
      update: { plan: 'FREE', referredByClientId: c.id },
      create: {
        nom: 'Cafe Test En Attente',
        email: 'filleul-pending@jitplus.com',
        password: mpw,
        categorie: 'CAFE',
        ville: 'Rabat',
        countryCode: 'MA',
        termsAccepted: true,
        plan: 'FREE',
        referredByClientId: c.id,
        isActive: true,
      },
    });
    console.log('Merchant PENDING:', m2.id, m2.nom);

    const ex2 = await p.clientReferral.findUnique({ where: { merchantId: m2.id } });
    if (!ex2) {
      await p.clientReferral.create({
        data: { clientId: c.id, merchantId: m2.id, status: 'PENDING', amount: 0 },
      });
      console.log('Referral PENDING created');
    } else {
      console.log('Referral PENDING already exists');
    }

    console.log('\n=== DONE ===');
    console.log('Login: parrain-test@jitplus.com / Test@1234');
    console.log('Balance: 150 DH');
    console.log('Code parrainage: TESTPAY1');
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await p.$disconnect();
  }
}

main();
