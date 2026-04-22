# PRD — Coiffure à domicile Julien Bouche

## Original problem statement
Application premium mobile-first en français pour Julien Bouche (coiffeur à domicile). Couleurs BLANC/BLEU, typographie élégante. Gestion complète : tarifs, RDV, paiement multi-modal, CRM fidélité, comptabilité URSSAF, stock, dashboard.

## Architecture
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn UI + Recharts + Sonner, fonts Cormorant Garamond (headings) + Outfit (body).
- **Backend**: FastAPI + Motor (MongoDB), httpx pour Emergent OAuth.
- **Auth**: Emergent-managed Google OAuth (cookie `session_token` httpOnly 7j).

## User persona
Julien Bouche — coiffeur indépendant auto-entrepreneur, mobile, passe d'un client à l'autre. Usage principal : smartphone.

## Core requirements (static)
- Design Jewel & Luxury light mode (#0A192F primary, #D4AF37 gold accents)
- Mobile-first avec bottom nav
- Persistance MongoDB multi-appareils
- Navigation cliquable partout (listes, cartes, historique)

## Implemented (v1 — 2026-04)
- Google OAuth + protection des routes, Layout sidebar desktop + bottom nav mobile
- **Prestations**: 5 prestations par défaut (HOMME/FEMME/ENFANT), CRUD dans Réglages, prix éditables
- **Clients**: CRUD, anniversaire, adresse (lien Google Maps), commentaire, champs personnalisés dynamiques, compteur filleuls, onglet Suivi Gratuité (5 slots + 1 doré par prestation), +RDV depuis la fiche
- **Rendez-vous**: création/modification/suppression, détection Pack Famille auto (45€), supplément carburant tiers (2.5€/10km), prix final écrasable, bouton gratuité sur prestations à 5/5, validation paiement multi-modal (CB/Chèque/Espèces/Virement/Lien), passage en "Terminé"
- **Comptabilité**: CA brut, URSSAF 22% (Math.ceil), consommables 2€/client, frais fixes 352€, carburant balance (facturé vs réel), marge nette, règlements par mode, bouton URSSAF Déclaré/Payé + lien autoentrepreneur.urssaf.fr par mois, RAZ mois
- **Dashboard**: RDV aujourd'hui/demain, anniversaires 7j, clients non vus >30j, CA, marge, KM + balance exact, panier moyen (jour/mois/année), gratuités (aujourd'hui/mois), stock donut chart, prévisionnel CA (LineChart), alertes stock, détail rentabilité
- **Stock**: CRUD, filtre par tag (Shampoing/Couleur/Soin/Coupe/Autre), alerte seuil, donut chart
- **Réglages**: variables comptables éditables (prix litre, taux URSSAF, tranche km, etc.), gestion prestations

## Test status
- 19/19 tests backend passés (iteration_1.json, 100%)

## P0/P1/P2 backlog
- **P1**: PWA manifest + installable, notifications anniversaire push 1 semaine avant
- **P1**: Calendrier vue semaine/mois (actuellement liste)
- **P2**: Export comptabilité PDF/CSV pour comptable
- **P2**: Envoi SMS/Email réel pour relances clients non vus et lien de paiement
- **P2**: Import contacts depuis le carnet téléphonique
- **P2**: Système de sauvegarde/export des données
