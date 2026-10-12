# Déploiement « tampons uniquement » (suppression du système de points)

Ce document décrit la mise en production de la migration
`20261007120000_stamps_only` et des nouvelles versions des apps
(JitPlus 1.4.0, JitPlus Pro 1.6.0).

## Ce qui change

- Le backend, JitPlus et JitPlus Pro ne connaissent plus que les tampons.
  Les anciennes versions des apps ne fonctionnent plus avec le nouveau backend
  (champs `points` renommés en `stamps`, routes renommées). La mise à jour est donc forcée.
- Les commerçants encore en mode POINTS sont convertis automatiquement par la migration :
  - ratio `pps` (points par tampon) = coût du cadeau le moins cher / 10
    (repli : `rewardThreshold` / 10, puis 100 / 10) ;
  - soldes = `ROUND(points / pps)`, cadeaux = `ROUND(coût / pps)` (minimum 1) ;
  - mode `PER_AMOUNT`, `amount_per_stamp = points_rate × pps` (même dépense, même progression) ;
  - `stamps_for_reward = 10`, limite d'accumulation et coût du ticket de la roue divisés par `pps` ;
  - une ligne `LOYALTY_PROGRAM_CHANGE` dans l'historique de chaque carte active ;
  - un instantané avant/après dans `audit_logs` (`admin_email = 'system:stamps-only-migration'`).
- L'historique en points des commerçants déjà passés aux tampons est ré-exprimé en tampons,
  pour que l'annulation d'une ancienne transaction reste cohérente.
- La migration tourne dans une seule transaction (`BEGIN … COMMIT`, `LOCK TABLE`).
  En cas d'erreur, la base reste intacte.

## Outils

| Script (dans `apps/backend`) | Rôle | Écrit en base ? |
| --- | --- | --- |
| `scripts/stamps-migration-precheck.ts` | Rapport de ce que la migration va faire, carte par carte. Code de sortie 1 si un point bloquant est trouvé. | Non (transaction READ ONLY) |
| `scripts/stamps-migration-postcheck.ts` | Vérifie le schéma final, les invariants et, avec `--precheck`, compare chaque carte et chaque cadeau aux prévisions. | Non (transaction READ ONLY) |
| `scripts/notify-stamps-conversion.ts` | Prévient les clients des commerçants convertis (notification + push). Simulation par défaut, `--send` pour envoyer. Idempotent. | Oui (`notifiedAt` dans l'audit, notifications) |

Ces scripts ne sont pas dans l'image Docker. Ils se lancent depuis un poste avec le dépôt,
`pnpm install` fait, et un accès à Cloud SQL via le Cloud SQL Auth Proxy :

```bash
cloud-sql-proxy jitplus-97259:europe-west9:jitplus-db --port 5433
# Dans un autre terminal, depuis apps/backend :
export DATABASE_URL="postgresql://<user>:<mot_de_passe>@127.0.0.1:5433/<base>"
```

Reprendre l'utilisateur, le mot de passe et le nom de base du secret `DATABASE_URL`
(Secret Manager), en remplaçant l'hôte par `127.0.0.1:5433`. Ne pas écrire ces valeurs
dans un fichier du dépôt. Les rapports JSON générés contiennent des identifiants de
clients : les garder hors du dépôt, et les supprimer quelques semaines après le déploiement.

Paramètres du déploiement dans `cloudbuild.yaml` :

| Substitution | Valeur | Effet |
| --- | --- | --- |
| `_MIN_VERSION_JITPLUS` | `1.4.0` | Version minimale de JitPlus (`/health/version?app=jitplus`) |
| `_MIN_VERSION_JITPLUSPRO` | `1.6.0` | Version minimale de JitPlus Pro (`/health/version?app=jitpluspro`) |
| `_MIN_VERSION_LEGACY` | `1.6.0` | Lu par les anciennes builds qui n'envoient pas `?app=` : toutes sont forcées à se mettre à jour |
| `_MAINTENANCE_MODE` | `false` | Mettre `true` pour le déploiement de la migration |

## J-7 : préparation

1. **Ne pas fusionner** la branche sur la branche surveillée par le déclencheur Cloud Build
   avant le jour J (sinon le déploiement part sans maintenance ni sauvegarde).
   Vérifier les déclencheurs : `gcloud builds triggers list`.
2. **Soumettre les apps aux stores** (JitPlus 1.4.0, JitPlus Pro 1.6.0) avec une
   publication manuelle :
   - App Store Connect : « Publier manuellement cette version » ;
   - Google Play : « Publication gérée » activée.

   Les nouvelles apps ne fonctionnent qu'avec le nouveau backend : elles ne doivent
   pas être publiées avant le jour J.
3. **Pré-vérification à blanc** sur la production :

   ```bash
   cd apps/backend
   npx ts-node scripts/stamps-migration-precheck.ts --out precheck-j7.json
   ```

   - Un message `BLOQUANT` doit être corrigé avant le jour J (soldes négatifs,
     cadeaux à 0, `points_rate <= 0`, migration en échec, PostgreSQL < 13…).
   - Relire les avertissements : cartes dont un petit solde tombe à 0 tampon par arrondi,
     cadeaux qui coûteront plus de 100 tampons, achats récents qui dépasseraient le
     plafond de 20 tampons par transaction, ratio de repli faute de trace d'audit.
     Prévenir les commerçants concernés si besoin.
4. Tester le déploiement complet sur une copie de la base (restaurer une sauvegarde sur
   une instance de test) si le volume de données est important : le job de migration a un
   délai maximal de 300 s (`--task-timeout`).
5. Annoncer la maintenance aux commerçants (créneau de faible activité).

## Jour J

### 1. Passer le backend actuel en maintenance

```bash
gcloud run services update jitplus-api --region=europe-west9 \
  --update-env-vars=MAINTENANCE_MODE=true
```

Les apps affichent l'écran de maintenance au lancement, puis lors de leur vérification
périodique (30 min pour Pro, 6 h pour JitPlus). Une app déjà ouverte peut donc encore
envoyer des requêtes : c'est sans danger, la migration verrouille les tables et
s'exécute en quelques secondes.

### 2. Sauvegarder la base

```bash
gcloud sql backups create --instance=jitplus-db --description="avant stamps_only"
gcloud sql backups list --instance=jitplus-db --limit=3   # noter l'ID
```

### 3. Pré-vérification de référence

```bash
npx ts-node scripts/stamps-migration-precheck.ts --out precheck-jourJ.json
```

Elle doit être faite **après** la mise en maintenance : la post-vérification compare
chaque carte à ce rapport, et toute transaction intermédiaire fausserait la comparaison.
Ne pas continuer si un point bloquant apparaît.

### 4. Déployer avec la maintenance active

Fusionner la branche, puis lancer le build avec `_MAINTENANCE_MODE=true`, par exemple :

```bash
gcloud builds triggers run <déclencheur> --branch=<branche> \
  --substitutions=_MAINTENANCE_MODE=true
```

Si le déclencheur part automatiquement à la fusion, le désactiver la veille et le
lancer à la main comme ci-dessus.

Le pipeline construit l'image, exécute le job `jitplus-migrate` (migration), puis
déploie le service avec `MAINTENANCE_MODE=true` et les nouvelles versions minimales.
Si le job de migration échoue, le service n'est pas déployé : voir « En cas d'échec ».

### 5. Post-vérification

```bash
npx ts-node scripts/stamps-migration-postcheck.ts --precheck precheck-jourJ.json
```

Toutes les lignes doivent être OK (code de sortie 0). Contrôles manuels conseillés :

- `GET /health/version?app=jitplus` renvoie `min_*_version = 1.4.0` et `maintenance: true` ;
- `GET /health/version?app=jitpluspro` renvoie `1.6.0` ; sans `?app=` : `1.6.0` ;
- avec les nouvelles apps (TestFlight / test interne) : scan d'un client, ajout de tampons
  en mode `PER_AMOUNT` et `PER_VISIT`, échange d'un cadeau, annulation d'une transaction,
  affichage de la carte côté client, mise à jour en temps réel.

**Point de non-retour** : tant que les apps ne sont pas publiées, un retour arrière
complet reste possible. Ne publier les apps que si la post-vérification est verte.

### 6. Publier les apps

Publier JitPlus 1.4.0 et JitPlus Pro 1.6.0 dans les deux stores, puis attendre qu'elles
soient visibles et téléchargeables (vérifier sur un téléphone, iOS et Android).

### 7. Sortir de la maintenance

```bash
gcloud run services update jitplus-api --region=europe-west9 \
  --update-env-vars=MAINTENANCE_MODE=false
```

Les anciennes apps affichent alors l'écran de mise à jour obligatoire.

### 8. Prévenir les clients des commerçants convertis

```bash
# Variables d'environnement de production nécessaires : DATABASE_URL, JWT_SECRET,
# FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, BACKEND_URL
npx ts-node scripts/notify-stamps-conversion.ts          # simulation : liste les envois
npx ts-node scripts/notify-stamps-conversion.ts --send   # envoi réel
```

Le script peut être relancé sans risque : les commerçants déjà notifiés sont ignorés.
Les variables du shell sont prioritaires sur un éventuel fichier `apps/backend/.env`
local. Les avertissements `WebSocket emit failed` sont normaux : le script ne lance pas
de serveur WebSocket, la notification reste enregistrée et le push part quand même.

## En cas d'échec

### Le job de migration échoue (étape 4)

La base n'a pas changé (transaction unique) et l'ancien service tourne toujours.

1. Trouver la vraie erreur dans les **journaux PostgreSQL** de Cloud SQL
   (Console > SQL > jitplus-db > Journaux, ou Logs Explorer avec
   `resource.type="cloudsql_database"`). Prisma n'affiche souvent que
   `current transaction is aborted`, sans la cause.
   Les contrôles d'intégrité de la migration lèvent des erreurs explicites
   (`stamps_only: …`).
2. Corriger les données en cause, relancer la pré-vérification, puis relancer le build.
   L'entrypoint marque automatiquement la tentative échouée comme annulée (P3009),
   pas d'intervention manuelle sur `_prisma_migrations`.
3. Si le créneau est dépassé : `MAINTENANCE_MODE=false` sur l'ancien service (étape 7).

### La post-vérification échoue ou un problème apparaît avant la publication des apps

Retour arrière complet :

1. Restaurer la sauvegarde de l'étape 2 (écrase toute l'instance) :

   ```bash
   gcloud sql backups restore <ID_SAUVEGARDE> --restore-instance=jitplus-db
   ```

2. Remettre le trafic sur la révision précédente du service :

   ```bash
   gcloud run revisions list --service=jitplus-api --region=europe-west9
   gcloud run services update-traffic jitplus-api --region=europe-west9 \
     --to-revisions=<révision_précédente>=100
   ```

   La révision précédente garde ses anciennes variables, maintenance comprise :
   repasser `MAINTENANCE_MODE=false` (étape 7) une fois le trafic basculé.
3. Annuler la soumission des apps dans les stores.

Ne pas restaurer la sauvegarde une fois la maintenance levée : les transactions faites
depuis seraient perdues. Après la publication des apps, corriger en avant.

### Retrouver l'état d'avant pour un commerçant

Pour chaque commerçant converti, l'instantané d'audit contient l'ancienne et la
nouvelle configuration (taux, règles, cadeaux, roue, solde total) :

```sql
SELECT target_label, metadata
  FROM audit_logs
 WHERE admin_email = 'system:stamps-only-migration'
   AND merchant_id = '<id>';
```

Le solde avant/après de chaque carte se trouve dans `precheck-jourJ.json` (clé `cards`).
Conserver ce fichier, hors du dépôt, quelques semaines après le déploiement.
