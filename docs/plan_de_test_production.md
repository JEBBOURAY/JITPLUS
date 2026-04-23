# Plan de Test Global - Scénarios Avant Mise en Production (JIT+)

## 1. Objectif du Test
Valider que l'ensemble de la plateforme JIT+ est fonctionnelle, stable, sécurisée et performante avant le déploiement final en production. Ce document recense de manière exhaustive tous les scénarios de test critiques à valider pour éviter toute régression ou faille.

## 2. P&eacute;rim&egrave;tre du Test
Le test couvre les quatre applications principales de l'écosystème :
- **`apps/backend`** : L'API principale, base de données, websockets, CRON jobs.
- **`apps/admin`** : Le tableau de bord Web de gestion globale.
- **`apps/jitplus`** : L'application mobile (iOS/Android) pour les clients finaux.
- **`apps/jitpluspro`** : L'application mobile (iOS/Android) pour les marchands et leur personnel.

---

## 3. Sc&eacute;narios de Test par Application

### 3.1 🟢 Backend (`apps/backend`)

**Priorit&eacute; Critique :**
- [ ] **Auth-B-01 :** Inscription / Connexion Client (Email/OTP).
- [ ] **Auth-B-02 :** Connexion Sociale Client (Google, Apple).
- [ ] **Auth-B-03 :** Inscription / Connexion Marchand (Email/Mot de passe).
- [ ] **Auth-B-04 :** R&eacute;vocation et rafra&icirc;chissement des tokens JWT.
- [ ] **Loyalty-B-01 :** Calcul de l'ajout de points / tampons avec respect de la limite quotidienne.
- [ ] **Loyalty-B-02 :** R&eacute;duction des points / tampons lors de l'utilisation d'une r&eacute;compense (Atomicit&eacute; des transactions).
- [ ] **Loyalty-B-03 :** Validation correcte / Refus des QR codes p&eacute;rim&eacute;s ou invalides.
- [ ] **LuckyWheel-B-01 :** G&eacute;n&eacute;ration &eacute;quitable via le serveur des tirages de la Roue de la chance.
- [ ] **LuckyWheel-B-02 :** Mise &agrave; jour atomique du stock d'articles gagn&eacute;s pour &eacute;viter les doublons hors stock.
- [ ] **Referral-B-01 :** Calcul correct des bonus d'affiliation (Parrainage Marchand-Marchand et Client-Marchand).

**Priorit&eacute; Haute :**
- [ ] **Notif-B-01 :** Envoi de notifications Push multi-appareils (Firebase).
- [ ] **Notif-B-02 :** Envoi d'emails transactionnels (OTP, Re&ccedil;us).
- [ ] **Notif-B-03 :** Envoi de notifications WhatsApp et respect des quotas marchands.

### 3.2 🔵 Admin Dashboard (`apps/admin`)

**Priorit&eacute; Critique :**
- [ ] **Auth-A-01 :** Connexion administrateur avec un identifiant valide.
- [ ] **Auth-A-02 :** D&eacute;connexion automatique apr&egrave;s 15 minutes d'inactivit&eacute;.
- [ ] **Merchant-A-01 :** Modification du statut complet d'un marchand (Bannir / D&eacute;bannir avec motif).
- [ ] **Merchant-A-02 :** Modification des abonnements marchands (Passer en Premium, r&eacute;voquer, d&eacute;finir les dates).
- [ ] **Payout-A-01 :** Traitement complet du workflow des demandes de paiement de parrainage client (En attente -> Approuv&eacute; -> Pay&eacute;).

**Priorit&eacute; Haute :**
- [ ] **Notif-A-01 :** Envoi s&eacute;curis&eacute; d'une notification mass-broadcast (Tous les clients ou Tous les marchands).
- [ ] **Data-A-01 :** Pagination, filtrage, et recherche corrects sur la liste massive des marchands/clients afin de v&eacute;rifier les performances de requ&ecirc;tes.
- [ ] **Audit-A-01 :** V&eacute;rification que chaque action r&eacute;alis&eacute;e (ban, upgrade) est bien loggu&eacute;e avec la d&eacute;claration exacte dans l'Audit Log.

### 3.3 📱 Application Client (`apps/jitplus`)

**Priorit&eacute; Critique :**
- [ ] **Onboarding-C-01 :** Parcours de cr&eacute;ation du profil (Nom, pr&eacute;nom, photo, date de naissance).
- [ ] **Scanner-C-01 :** Affichage du QR Code personnel dynamique.
- [ ] **Scanner-C-02 :** Rafraichissement en temps r&eacute;el du QR code (s&eacute;curit&eacute; anti-capture).
- [ ] **Wallet-C-01 :** Affichage en temps r&eacute;el du solde point/tampon mis &agrave; jour sans n&eacute;cessit&eacute; de relancer l'app.
- [ ] **Reward-C-01 :** Processus de r&eacute;clamation d'une r&eacute;compense avec d&eacute;duction des points.

**Priorit&eacute; Haute :**
- [ ] **LuckyWheel-C-01 :** Processus de participation &agrave; un tirage avec l'animation associ&eacute;e.
- [ ] **Discover-C-01 :** Carte interactive : chargement des marchands bas&eacute; sur la g&eacute;olocalisation.
- [ ] **Referral-C-01 :** Affichage et partage correct du code de parrainage client.
- [ ] **Referral-C-02 :** Demande de retrait pour les gains r&eacute;colt&eacute;s via le parrainage.

### 3.4 🏪 Application Marchand (`apps/jitpluspro`)

**Priorit&eacute; Critique :**
- [ ] **Program-M-01 :** Choix et configuration d'un programme de fid&eacute;lit&eacute; (Points vs Tampons).
- [ ] **Program-M-02 :** Cr&eacute;ation limit&eacute;e de r&eacute;compenses avec des p&eacute;nalit&eacute;s de co&ucirc;t.
- [ ] **Scan-M-01 :** Le scan rapide du QR client via l'appareil photo du t&eacute;l&eacute;phone.
- [ ] **Scan-M-02 :** Attribution des points au client (V&eacute;rification visuelle d'assentiment success/failure).
- [ ] **LuckyWheel-M-01 :** Cr&eacute;ation et configuration d'une campagne Roue de la chance.
- [ ] **Roles-M-01 :** Tests en tant que "Staff" (ne peut pas acc&eacute;der aux analytiques, ne peut que scanner).

**Priorit&eacute; Haute :**
- [ ] **Analytics-M-01 :** Comptage correct des scan de clients et points distribu&eacute;s dans les analytiques.
- [ ] **Notifications-M-01 :** L'envoi de notifications cibl&eacute;es &agrave; l'audience du marchand.

---

## 4. Sc&eacute;narios Globaux / Int&eacute;gration
- [ ] **Boucle de Fid&eacute;lisation :** Le marchand scanne le client, le backend valide la transaction, l'application client refl&egrave;te l'ajout de points imm&eacute;diatement.
- [ ] **Boucle Roue de la chance :** Le client effectue N scan avec le marchand pour d&eacute;verrouiller la participation, d&eacute;clenche le tirage, le lot est soustrait co&ocirc;t&eacute; Backend.
- [ ] **Boucle D'Abonnement :** L'Admin attribue le plan PREMIUM, l'application JitPlus Pro du marchand d&eacute;verrouille instantan&eacute;ment ses acc&egrave;s (ex: analytics limit&eacute;s enlev&eacute;s).

## 5. Recommandations de d&eacute;ploiement
* Ex&eacute;cuter l'int&eacute;gralit&eacute; de ces tests dans l'environnement *Staging*, connect&eacute; sur les bases test.
* Tous les formulaires num&eacute;riques (paiements, montants, points) doivent &ecirc;tre test&eacute;s contre les injections n&eacute;gatives ou symboles afin d'&eacute;viter les probl&egrave;mes de typage (`NaN`).
