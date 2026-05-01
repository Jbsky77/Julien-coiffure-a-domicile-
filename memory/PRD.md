# PRD — Coiffure à domicile Julien Bouche

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
- **P2** : Notifications push pour RDV imminents.
- **P2** : Synchronisation tournée avec Google Maps Directions API pour estimation précise.
- **P3** : CI GitHub Actions pour Playwright (actuellement standalone local).
- **P3** : Tests Playwright additionnels sur Tour, ClientStatus et Settings (couvrent les flows secondaires).
