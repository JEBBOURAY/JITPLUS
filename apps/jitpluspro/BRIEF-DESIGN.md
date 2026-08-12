# Brief Design — JitPlus **Pro** (application commerçant)

> Document à transmettre à l'équipe design pour la refonte visuelle de l'application.
> Il décrit l'objectif de chaque écran, le contenu, les zones de mise en page, les états
> (vide / chargement / erreur) et l'identité de marque à respecter.
> **Ne rien retirer fonctionnellement** : le brief décrit l'existant à embellir, pas à réduire.

---

## 1. Contexte

JitPlus **Pro** est l'application **côté commerçant** d'un programme de fidélité.
Le commerçant l'utilise en caisse au quotidien pour :

- scanner le QR code de ses clients pour créditer des points / tampons ou échanger une récompense,
- consulter sa base clients et l'historique des transactions,
- envoyer des campagnes marketing (push, WhatsApp, e-mail),
- gérer son compte, sa boutique et son abonnement.

**Public cible :** commerçants (cafés, restaurants, boutiques) — souvent en usage rapide, une main, en environnement lumineux.
**Plateformes :** iOS + Android (React Native / Expo). Le design doit être **responsive** (petits téléphones → grands écrans) et supporter **mode clair + mode sombre**.
**Langues :** Français, Anglais, **Arabe (RTL)** — prévoir les miroirs de mise en page pour l'arabe.

---

## 2. Identité de marque

Concept : **« Violet Maître × Charbon Pro »** — premium, moderne, épuré, professionnel.

### Couleurs principales
| Rôle | Clair | Sombre |
|---|---|---|
| Violet primaire (marque) | `#7C3AED` | `#7C3AED` |
| Violet clair / accent | `#8B5CF6` / `#A78BFA` | `#A78BFA` |
| Charbon (accent secondaire) | `#1F2937` | `#1F2937` |
| Dégradé de marque | `#7C3AED → #1F2937` (violet → charbon) | idem |
| Dégradé header (3 stops) | `#5B21B6 → #7C3AED → #1F2937` | idem |

### Couleurs de surface
| Rôle | Clair | Sombre |
|---|---|---|
| Fond écran | `#FFFFFF` | `#0B0F14` |
| Carte | `#FFFFFF` | `#1A1F2B` |
| Fond input | `#F1F5F9` | `#1A1F2B` |
| Bordure légère | `#F1F5F9` | subtile claire sur foncé |

### Couleurs de texte
| Rôle | Clair | Sombre |
|---|---|---|
| Texte principal | `#0F172A` | `#F1F5F9` |
| Texte secondaire | `#334155` | `#CBD5E1` |
| Texte atténué | `#64748B` | gris clair |

### Couleurs sémantiques
- Succès `#10B981` · Avertissement `#F59E0B` · Erreur `#EF4444`
- Or (badge Premium) `#FCD34D`
- Surface Premium sombre `#0f031e → #1a0533`
- Canaux : WhatsApp `#25D366` · E-mail `#EA4335`

### Typographie
- Police : **Lexend** (Regular 400 / Bold 700). Titres en gras, letter-spacing légèrement négatif (`-0.5`).
- Titre d'écran (H1) : ~28 px, gras.
- Corps : 14–16 px. Sous-texte / légende : 12–13 px.

### Style visuel
- **Coins arrondis** : cartes ~14–16 px, boutons ~14 px, pastilles/badges pleins arrondis.
- **Icônes** : style trait fin (`lucide`, strokeWidth 1.5–2). Conserver la cohérence des icônes.
- **Ombres** douces et discrètes ; séparation par bordures fines plutôt que fortes ombres.
- **Dégradés violets subtils** en fond de bannières/cartes (opacité 6–12 %).
- **Espacement** : marges latérales 16–24 px, padding cartes 16–32 px.

---

## 3. Navigation — barre d'onglets (5 onglets)

Barre inférieure personnalisée, translucide, avec 5 onglets :

`Activité` · `Clients` · **`Scan`** (bouton central mis en avant) · `Messages` · `Compte`

- L'onglet **Scan** est l'action principale : le concevoir comme un **bouton central proéminent** (violet, plus grand, éventuellement flottant/relevé). Un tap ouvre directement le **scanner plein écran** (voir §4.3).
- À l'ouverture de l'app, le scanner s'ouvre automatiquement.
- Prévoir un **badge de compteur** (pastille) sur l'onglet Compte (notifications non lues).

---

## 4. Écrans à concevoir

### 4.1 — Écran d'accueil / **Clients** (onglet « Clients »)

**Objectif :** afficher et rechercher la base de clients fidélisés.

**Zones de mise en page :**
1. **En-tête** simple : titre « Clients ».
2. **Bannière conseil** (dismissable, avec « Ne plus me montrer ») : icône éclair + titre « Vos clients fidèles » + courte description. Fond dégradé violet très léger.
3. **Barre de recherche** : champ « Nom ou n° de téléphone… » avec icône loupe et bouton effacer (X).
4. **Liste des cartes clients** — chaque carte :
   - Avatar rond avec **initiales** (ex. « JD ») sur fond violet doux,
   - Nom complet (Prénom Nom),
   - **Pastille de solde** : « 1 250 pts » ou « 8 tampons » (violet),
   - Tap → ouvre la fiche détaillée du client.
5. Bouton / état pour **charger la liste** (« Afficher mes clients »).

**États :**
- **Chargement** : squelettes de cartes (skeleton).
- **Vide** : illustration + « Aucun client » + conseil « Scannez le QR code d'un client… » + bouton « Scanner un premier client ».
- **Recherche sans résultat** : « Aucun client ne correspond à "…" ».
- **Erreur réseau** : icône alerte + « Erreur de chargement » + bouton « Réessayer ».

---

### 4.2 — **Activité** (onglet « Activité »)

**Objectif :** historique en temps réel de toutes les transactions clients.

**Zones de mise en page :**
1. **En-tête** : titre « Activité ».
2. **Bannière conseil** (même style que Clients).
3. **Filtres** (puces horizontales) : `Tout` · `Gains` · `Échanges` · `Ajustements` · `Équipe` · `Roue de chance`.
4. **Liste des transactions** groupée par date (« Aujourd'hui », « Hier », dates) — chaque ligne :
   - **Icône ronde** colorée selon le type (gain de points = flèche montante verte/violette ; échange récompense = cadeau ; ajustement ; gain roue de la chance),
   - Libellé de l'action + nom du client,
   - **Montant** à droite : « +30 pts » (gain, en vert/violet) ou « Échangé »,
   - Heure / auteur (« par [membre d'équipe] »),
   - Transaction **annulée** : style barré / atténué + libellé « Annulée ».

**États :**
- Chargement : skeleton de lignes.
- Vide : « Aucune activité » + « L'historique apparaîtra ici après votre premier scan. »
- Pied de liste : « — Tout est affiché — ».

---

### 4.3 — **Scan** (scanner QR — plein écran)

**Objectif :** action centrale — scanner le QR client, ou saisir son téléphone manuellement.

**Zones de mise en page (plein écran, par-dessus la caméra) :**
1. **Vue caméra plein écran** avec **cadre de visée** au centre (coins stylisés violets, zone de scan claire, reste assombri).
2. **Bouton fermer** (X) en haut.
3. **Overlay de détection** : quand un QR est détecté → message animé (« QR détecté », « Vérification… », « Client trouvé : [nom] ») avec retour haptique.
4. **Saisie manuelle alternative** : champ **téléphone** avec **préfixe pays** (drapeau + indicatif, ex. 🇲🇦 +212) + bouton de recherche, pour les clients sans QR.

**États :**
- **Permission caméra requise** : écran dédié avec icône, titre « Autoriser la caméra », texte explicatif, bouton « Autoriser la caméra ».
- Initialisation caméra (loader).
- **QR invalide / expiré** : alerte + possibilité de re-scanner.
- **Client introuvable** pour un numéro : message clair.

> Après un scan réussi, l'app enchaîne vers l'écran de saisie du montant / attribution de points (hors de ce brief, mais garder la **cohérence visuelle**).

---

### 4.4 — **Messages** / Push Marketing (onglet « Messages »)

**Objectif :** envoyer des campagnes marketing aux clients. **Fonctionnalité Premium** (prévoir l'état verrouillé).

**Zones de mise en page :**
1. **En-tête** : titre « Push Marketing » + sous-titre « Envoyez des notifications à vos clients ».
2. **Sélecteur de canal** (onglets/segments) : `Notif` · `WhatsApp` · `E-mail` (couleurs de canal respectives).
3. **Formulaire de composition** (selon le canal) :
   - **Notif** : Titre du message + Contenu + astuce de rédaction.
   - **WhatsApp** : zone message + compteur « X client(s) avec numéro trouvé » + quota mensuel.
   - **E-mail** : Objet + Contenu + quota mensuel.
4. **Cible** : « Tous les clients » / « Clients actifs ».
5. **Bouton d'envoi** proéminent (« Envoyer à tous mes clients ») avec états : normal, « Envoi en cours… », progression « Envoi 3/50… », **cooldown** après envoi (30 s).
6. **Quota** affiché : « 12/50 messages utilisés » (barre ou pastille).
7. **Historique d'envoi** : liste des campagnes passées (canal, titre, date, statut envoyé/échec, vues).

**États :**
- **Verrouillé (plan Gratuit)** : carte « Réservé au plan Pro » + description + call-to-action de mise à niveau (style Premium sombre + or).
- Vide : « Aucun message envoyé » + « Rédigez votre premier message ci-dessus ! ».
- Confirmations avant envoi (action irréversible) et écrans de succès (« Notification envoyée ! »).

---

### 4.5 — **Compte** (onglet « Compte »)

**Objectif :** profil commerçant, boutique, abonnement, préférences, sécurité.

**Zones de mise en page :**
1. **Carte de profil** en tête : **logo** de la boutique (éditable), **image de couverture** (éditable, 16:9), nom du commerce, e-mail.
2. **Carte Abonnement / Forfait** : badge de plan (`PRO` / `ESSAI PRO` / `GRATUIT`), état (« Actif depuis le… », « X jours restants », barre de progression pour l'essai), bouton « Gérer mon forfait ». Le plan Pro utilise un **traitement premium** (fond sombre `#0f031e`, accents violet + or).
3. **Sections repliables (accordéons)** — une seule ouverte à la fois :
   - **Ma boutique** : boutiques, GPS, aperçu vitrine, cadeaux de fidélité, roue de la chance, gestion d'équipe.
   - **Préférences** : langue (FR / EN / AR), thème clair/sombre, notifications.
   - **Compte** : sécurité (mot de passe, appareils connectés), parrainage, mentions légales, déconnexion, suppression de compte.
4. **Lignes d'info** (`InfoRow`) : icône + libellé + valeur/chevron.
5. **Bouton Déconnexion** et **Supprimer le compte** (style danger) en bas.

**Éléments Premium :** badges cadenas « Pro » sur les fonctions verrouillées + modales d'explication (upsell).

**Page Forfait détaillée** (accessible depuis « Gérer mon forfait ») : héro du plan, **tableau comparatif Gratuit vs Pro** (fidélité, boutiques, clients, QR, dashboard, push, messages, équipe, cadeaux, roue), et blocs « Assistance & contact » (WhatsApp / e-mail).

---

## 5. Exigences transverses

- **Mode clair ET sombre** : fournir les maquettes dans les deux thèmes.
- **RTL (arabe)** : miroir de la mise en page (icônes, alignements, sens de lecture).
- **Responsive** : du petit téléphone (~360 px) aux grands écrans ; typographie et espacements adaptatifs.
- **Accessibilité** : contrastes AA, cibles tactiles ≥ 44 px, support agrandissement police (jusqu'à ~1,6×), libellés pour lecteurs d'écran.
- **États systématiques** pour chaque liste/écran : chargement (skeleton), vide, erreur, succès.
- **Micro-interactions** : retours haptiques, transitions douces (fade), animations d'overlay de scan.
- **Cohérence** : réutiliser les mêmes composants (cartes, pastilles, bannières, boutons, en-têtes) sur tous les écrans.

---

## 6. Livrables attendus du designer

1. **Écrans haute-fidélité** (clair + sombre) pour : Clients, Activité, Scan, Messages, Compte (+ page Forfait).
2. **Tous les états** de chaque écran (vide / chargement / erreur / verrouillé Premium / succès).
3. **La barre d'onglets** avec le bouton central Scan.
4. **Kit UI / composants** : boutons, cartes, pastilles/badges, champs, bannières, accordéons, avatars à initiales.
5. **Spécifications** : couleurs (tokens ci-dessus), typographie Lexend, espacements, rayons, icônes.
6. Fichiers **Figma** organisés + export des assets (logo, icônes, illustrations d'états vides).
7. Variante **RTL** pour au moins un écran de référence.
