# PRD — Coiffure à domicile Julien Bouche

## Implemented (v2.9 — 2026-06) — Version bureau + ergonomie mobile
- Layout desktop (lg+) : sidebar gauche fixe avec tous les menus, contenu pleine largeur max-w-6xl (fini le cadre "téléphone" sur ordinateur). Recherche + Verrouiller dans la sidebar.
- Mobile : flèche ChevronDown dans la topbar (`topbar-quick-menu`) ouvrant un panneau grille 4 colonnes avec les 11 menus (`quick-menu-panel`, badge demandes inclus). Fermeture au clic extérieur/navigation.
- Espace Client : onglets (Fidélité/Historique/Factures/RDV) passés en grille 4 colonnes icône+label empilés — l'onglet RDV n'était pas visible sur petits téléphones.
- Clients : tri alphabétique par nom (localeCompare fr).
- Vérifié par screenshots mobile (390px) + desktop (1920px) : tabs OK, sidebar OK, quick menu OK, tri OK.

## Implemented (v2.8 — 2026-02) — Notifications visites portail + UX chargement
- **Notifications de visite portail client** : chaque fois qu'un client ouvre son Espace Client via son magic link, une notification admin est créée automatiquement (« Marie D. a consulté sa carte de fidélité »). Anti-spam intégré : une seule notification par client par heure (dedupe_key). Nouveau widget « Activité récente » sur le Dashboard avec bouton d'effacement par notification. Endpoints : `POST /api/notifications/admin/{nid}/dismiss`, `push_admin_debounced()` dans `services/notifications.py`.
- **Écran de chargement amélioré** : PinGate.jsx totalement refait — messages dynamiques progressifs (« Chargement… » → « Réveil du serveur, quelques secondes… » → « Encore un instant… »), spinner animé avec logo Julien Bouche, retry automatique jusqu'à 60s (12 tentatives × 5s) pour tolérer le cold-start du backend en production, et écran d'erreur avec bouton « Réessayer » si tous les retries échouent.
- **Bug fix préexistant** : `dismiss_client_all` était référencé mais absent du service notifications → l'endpoint `/api/public/client/{token}/notifications/dismiss` crashait. Fonction ajoutée. Filtrage `dismissed: {$ne: true}` ajouté à `list_admin` et `count_admin_unread`.
- Tests : validation curl end-to-end (visite portail → notif créée → 2e visite = dédupliquée → dismiss OK).

## Implemented (v2.7 — 2026-06) — Adresses structurées + fix demandes PWA
- **Adresse structurée + autocomplétion** : composant `AddressAutocomplete.jsx` (n° / rue / code postal / ville / pays France). Autocomplétion pendant la frappe via l'API Adresse data.gouv.fr (BAN, gratuite) — la sélection remplit les champs ET fournit lat/lng (pas de géocodage Nominatim). CP à 5 chiffres → liste des communes via geo.api.gouv.fr (select si plusieurs villes). Intégré à la création client (Clients.jsx) et l'édition (ClientDetail.jsx onglet Infos). Backend : `address_parts` sur Client/ClientCreate, lat/lng acceptés au create/update (skip géocodage si fournis).
- **BUG FIX demandes de RDV** : « Proposer autre » et « Refuser » ne marchaient pas (window.prompt/confirm bloqués en PWA installée). Remplacés par des panneaux inline (`counter-form-*`, `reject-confirm-*`) dans AppointmentRequests.jsx + même fix pour « Autre date » de l'espace client (`alt-date-form`).
- Tests : agent de test 100% (10/10 pytest `test_client_address.py` + 6/6 flux UI). L'agent a aussi corrigé un import manquant dans Clients.jsx.

## Implemented (v2.6 — 2026-06) — Factures, coiffeurs & fix heure RDV
- **BUG FIX heure RDV** (rapporté user) : l'heure changeait à chaque réouverture d'un RDV (datetime-local recevait l'UTC brut, la sauvegarde reconvertissait local→UTC → dérive). Fix : `isoToLocalInput()` dans AppointmentForm.jsx. Vérifié stable sur 4 cycles.
- **Coiffeur par prestation** : à l'encaissement, choix Julien/Marley par prestation (`stylist-section`, constante STYLISTS). `AppointmentService.stylist` (défaut "Julien"), `FinishAppointment.stylists` (dict service_id→nom).
- **Factures espace client** : à chaque règlement validé, numéro séquentiel `F-YYYY-XXXX` (compteur atomique `db.counters._id=invoice_YYYY`). Onglet « Factures » dans l'espace client (`tab-factures`, `invoices-section`) : numéro, jour/heure, prestations avec « par Julien/Marley », prix (ou « Offerte »), supplément déplacement, total, mode de paiement. Exposé via `invoices` dans GET /api/public/client/{token} (RDV done uniquement, stylist défaut "Julien" pour l'historique).
- Tests : iteration_5/6 — heure stable, stylists persistés, facture F-2026-0001 de référence (rdv_037b0f8120). Bug plumbing (stylists absent du payload finish) trouvé par l'agent de test et corrigé.


## Original problem statement
Application premium mobile-first en français pour Julien Bouche (coiffeur à domicile). Couleurs BLANC/BLEU + or champagne, typographie élégante (Cormorant Garamond + Outfit). Gestion complète : tarifs, RDV, paiement multi-modal, CRM fidélité, comptabilité URSSAF, stock, dashboard.

Dernière demande utilisateur (2026-05) : transformer l'app en "assistant intelligent de terrain" avec 8 modules — Tournée optimisée, Slot suggestions intelligents, Générateur d'image Avant/Après pour réseaux sociaux, Objectifs mensuels, Insights automatiques, Temps de trajet entre RDV, CRM clients perdus, Excellence UX.

## Architecture
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn UI + Recharts + Sonner ; fonts Cormorant Garamond (titres) + Outfit (corps).
- **Backend**: FastAPI + Motor (MongoDB) + httpx (Nominatim OpenStreetMap pour géocodage).
- **Auth**: SUPPRIMÉE — l'app utilise l'utilisateur local hardcodé `local-julien` (mono-utilisateur).
- **PWA**: manifest + service worker + bannière d'installation.

## User persona
Julien Bouche — coiffeur indépendant auto-entrepreneur, mobile, passe d'un client à l'autre. Usage principal : smartphone.

## Core requirements (static)
- Design Jewel & Luxury light mode (#0A192F primary, #D4AF37 gold accents)
- Mobile-first avec phone-frame 480px sur desktop
- Persistance MongoDB
- Navigation cliquable partout

## Implemented (v2.5 — 2026-06) — Rappels SMS, RDV récurrents & No-show/Acomptes
- **Rappels SMS 24h avant** (semi-auto, gratuit) : `GET /api/reminders/tomorrow` liste les RDV `scheduled` du lendemain (fuseau Europe/Paris) avec message construit depuis `settings.reminder_sms_template` (variables {first_name},{time},{date},{services},{brand_name}, éditable dans Réglages). Widget dashboard `widget-reminders` avec bouton `sms:` pré-rempli → `POST /api/reminders/{rid}/sent` (collection `reminders_sent`) → badge "Envoyé".
- **RDV récurrents** : `POST /api/appointments/{rid}/schedule-next` {weeks 1-26} crée le RDV suivant (même client/prestations/heure, prix recalculé, is_gift reset). UI : section `recurrence-section` sur tout RDV non annulé (boutons 4/5/6 sem + saisie libre, navigation vers le nouveau RDV).
- **No-show / Acomptes** : champs client `deposit_required` + `deposit_note`. Fiche client : 6e carte stats `client-noshow-card` (compteur annulations + badge acompte), toggle + note dans l'onglet Infos. Formulaire RDV : bannière orange `client-risk-banner` si annulations > 0 ou acompte requis.
- **Fix UI fiche client** : texte explicatif de l'encart espace client supprimé (demande user), encart compacté en colonne.
- **Tests** : 38/38 pytest (dont `tests/test_session3_features.py` 11 tests, lancer avec `REACT_APP_BACKEND_URL` en env) + 100% flows frontend via agent de test. Bug critique corrigé : useState manquants dans AppointmentForm (write parallèle perdu).

## Implemented (v2.4 — 2026-06) — Prospection, RDV recommandé & Backup JSON
- **Export/Backup JSON** (P0 rattrapé) : `GET /api/backup/export` (protégé PIN) exporte les 10 collections (settings, services, clients, appointments, appointment_requests, stock, notifications, relances, client_photos, urssaf_status) avec `counts` + `exported_at`. Bouton de téléchargement dans Réglages (`backup-section`).
- **Prochain RDV recommandé** : `app/services/next_visit.py` calcule la fréquence moyenne (min 7j, null si <2 RDV done), `next_recommended_date`, `days_until` et les 2 prestations habituelles. Exposé dans `GET /api/clients/{cid}` (admin) ET `GET /api/public/client/{token}` (espace client). UI : carte compte à rebours gold dans l'Espace Client avec bouton "Réserver ce créneau" (pré-remplit date à 10h + prestations habituelles dans l'onglet Nouveau RDV) + bandeau `next-visit-admin` sur la fiche client avec bouton "Planifier".
- **Zone de prospection** (Carte) : toggle Clients / Zone de prospection sur `/carte`. Clic sur la carte = centre, slider rayon 1-20 km, `POST /api/prospection/analyze` → population estimée (communes geo.api.gouv.fr, cache Mongo `communes_cache` 90j par département), taux de pénétration /1000 hab, top 3 communes à prospecter (score population/(clients+1), pop ≥300, rayon ×1.5). Markers gold + clients de la zone surlignés + KPIs + classement.
- **Fix carte** : `key={center}` sur MapContainer pour recentrer sur le barycentre clients après chargement.
- **Tests** : agent de test — backend 7/7 pytest (`tests/test_new_features.py`) + 100% flows frontend (backup, next-visit admin/public/prefill, prospection E2E, régressions carte/espace client/PIN OK).

## Implemented (v2.3 — 2026-06) — Espace Client & demandes de RDV
- Portail client par magic link `/c/{access_token}` : fidélité, historique, avis Google, demandes de RDV (pending → counter_proposed → accepted/rejected) avec notifications in-app côté client et admin. Page admin `/demandes`.

## Implemented (v2.2 — 2026-06) — Logique durées théoriques pour suggestions
- **Modèle Service enrichi** : nouveau champ `duration_minutes` (durée théorique métier).
- **Migration idempotente** (`app_meta.service_duration_backfill_v1`) : backfill des 14 prestations existantes (Coupe Homme 30min, Coupe + Barbe 45min, Couleur Femme 75min, Balayage long 120min, etc.).
- **Catalogue enrichi** : 14 nouvelles prestations ajoutées via API → total **28 prestations** (8 Homme · 18 Femme · 2 Enfant).
- **Moteur `/api/slots/suggest` corrigé** : utilise désormais la somme des durées théoriques des `service_ids` envoyés (jamais le `duration_minutes` réel sauvé sur les anciens RDV). Helper `app/services/duration.py` centralise la règle.
- **Frontend AppointmentForm** : envoie `service_ids` au lieu d'une durée arbitraire + affiche la durée totale prévue dans la carte Smart Slots.
- **Frontend Settings** : champ Durée moyenne dans le formulaire d'ajout + édition inline de la durée pour chaque prestation existante.
- **Tests** : 25/25 pytest backend, 7/7 Playwright (smart-slots + social-generator + settings-prestations).

## Implemented (v2.1 — 2026-05) — Stabilisation & qualité
- **Refactor backend complet** : `server.py` 1525 → 9 lignes (thin shim). Nouvelle structure `app/` :
  - `app/main.py` (FastAPI app + include routers), `app/db.py`, `app/dependencies.py`
  - `app/models/` : auth, clients, services, appointments, stock, settings
  - `app/routers/` : 14 routers thématiques (clients, photos, geocode, tour, slots, insights, appointments, accounting, analytics, calendar, stock, dashboard, services, auth, settings)
  - `app/services/` : tour, slots, client_status, insights, goals, dashboard, accounting, analytics, appointments, geocoding, settings
  - `app/utils/` : travel (haversine, km_to_minutes), dates (parse_iso, month_range), formatting (normalize_address)
  - Critique : `/api/clients/status` reste déclaré AVANT `/api/clients/{cid}` dans le même router.
- **Cache géocodage robuste** : normalisation des adresses (accents/casse/ponctuation), TTL 90 jours configurable via `GEOCODE_TTL_DAYS`, gestion fine des erreurs (timeout / rate-limited / not_found / exception), persistance MongoDB avec compteurs `hits`/`resolves`, stats process exposées via `GET /api/geocode/stats`. Réponse enrichie `{address, lat, lng, source, cached, error}`.
- **Tests E2E Playwright** standalone (`yarn test:e2e`) : 5 tests × 2 projets (desktop-chrome + mobile Pixel 5) = 10 tests verts. Couvre smart-slots et générateur social Avant·Après. Helpers `tests/e2e/helpers.js` pour seed/cleanup via l'API publique. Doc `tests/e2e/README.md`.
- **Fix iframe Maps** : tous les liens Google Maps (Tour + ClientDetail) passent en `<a target="_blank" rel="noopener noreferrer">` au lieu de `window.open` pour contourner `ERR_BLOCKED_BY_RESPONSE` dans la preview.

## Implemented (v2.0 — 2026-05) — Massive update "Assistant intelligent"
- **Tournée du jour** (`/tour`) : itinéraire optimisé chronologique avec KPIs (RDV, CA prévu, durée, trajet), bouton "Itinéraire complet" ouvrant Google Maps avec waypoints, alertes conflit si trajet > marge entre RDV.
- **Suggestions de créneaux intelligentes** : `POST /api/slots/suggest` calcule les meilleurs créneaux du jour selon position du client (lat/lng), durée prévue et tournée existante, retourne 5 suggestions scorées par "faible détour" / "proche de X" / "sans conflit".
- **Générateur d'image Avant·Après** : canvas HTML5 produit JPEG 1080×1080 (post Insta) ou 1080×1920 (story) avec fond navy, labels gold "AVANT·APRÈS" et signature "Julien" en bas. Web Share API + téléchargement.
- **Objectifs mensuels** : 4 objectifs (CA, RDV, panier moyen, relances) configurables dans `/reglages`, widget de progression sur le dashboard avec barres dorées.
- **Insights automatiques** : 5 insights générés depuis l'historique (jour le plus rentable, créneau performant, top catégorie, durée moyenne, etc.) affichés sur le dashboard.
- **Statuts CRM** (`/clients-status`) : actif / à relancer / en retard / presque perdu / perdu — calcul basé sur le ratio jours_depuis_dernier_RDV / fréquence_moyenne. SMS de relance pré-rempli avec signature personnalisable.
- **Géocodage automatique** : adresses clients géocodées via OpenStreetMap au CRUD, stockées en cache (`db.geocache`). Fallback gracieux (lat/lng=null) si rate-limit.
- **Branding** : prénom de signature configurable dans Réglages, utilisé dans SMS de relance et visuels Avant·Après.
- **CTA "Démarrer ma journée"** sur le dashboard quand des RDV sont prévus aujourd'hui.

## Implemented (v1.5 — 2026-04)
- **Auth supprimée** : suppression de Google OAuth + badge Emergent, accès direct.
- **Confirmations SMS/Email enrichies** avec date/heure/prestations/montant.
- **Frais CB** : taux 1.75% configurable, suivi par mois et par client.
- **Reset multi-mois** en compta.
- **Genre & âge** (M/Mme + birth_date) avec code couleur Bleu/Rose dans toute l'app.
- **Filtre fidélité** par genre/âge.
- **Photos Avant/Après** + Web Share API.

## Implemented (v1.2 — 2026-04)
- Statut "Annulé" (no-show), synchronisation iCal (`/api/calendar/:token.ics`), Analytics, refonte phone-frame mobile.

## Implemented (v1.1 — 2026-04)
- Vue semaine/mois calendrier, PWA installable, notifications navigateur, exports CSV/PDF compta, contacts SMS/Email natifs, lien de paiement, import contacts CSV/vCard.

## Implemented (v1 — 2026-04)
- CRUD prestations/clients/RDV/stock, comptabilité URSSAF, dashboard, fidélité 5+1, gratuités.

## Test status
- **v2.1 (2026-05)** : 25/25 pytest backend (100%) — 20 régression + 5 géocodage. 10/10 Playwright E2E (desktop + mobile). Refactor backend transparent : aucune route ni payload modifié, hot reload OK.
- **v2.0 (2026-05)** : 20/20 backend, frontend ~80%. Bug `Client` Pydantic `lat`/`lng` corrigé. Routing `/api/clients/status` avant `{cid}`.

## P0/P1/P2 backlog
- **P2** : Logo/branding image upload (actuellement seul `brand_name` est utilisé, le canvas social gère déjà brand_name).
- **P2** : Rappels SMS 100% automatiques via Twilio (option payante, si le user le demande).
- **P2** : Notifications push pour RDV imminents.
- **P2** : Synchronisation tournée avec Google Maps Directions API pour estimation précise.
- **P3** : CI GitHub Actions pour Playwright (actuellement standalone local).
- **P3** : Tests Playwright additionnels sur Tour, ClientStatus et Settings (couvrent les flows secondaires).
