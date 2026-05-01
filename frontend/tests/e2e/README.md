# E2E Tests — Coiffure à domicile Julien Bouche

Tests Playwright qui couvrent les deux features les plus différenciantes de l'app :

- **`smart-slots.spec.js`** : suggestions de créneaux intelligentes (`/rdv/nouveau`)
- **`social-generator.spec.js`** : générateur de visuels Avant·Après (`/clients/:id` onglet Photos)

## Prérequis

Le backend et le frontend doivent être démarrés (gérés par supervisor en local).
La variable `REACT_APP_BACKEND_URL` est lue automatiquement depuis `frontend/.env`.

## Lancer les tests

```bash
cd /app/frontend

# Tous les tests, desktop + mobile
yarn test:e2e

# Desktop uniquement
yarn test:e2e --project=desktop-chrome

# Mobile uniquement
yarn test:e2e --project=mobile

# Mode UI interactif
yarn test:e2e:headed

# Voir le dernier rapport HTML
yarn test:e2e:report
```

## Architecture

- `helpers.js` : seed et cleanup via l'API publique (création/suppression de clients de test).
  Les clients créés portent le nom `E2E *` et sont supprimés à la fin de chaque suite.
- `playwright.config.js` : 2 projets (`desktop-chrome` 1280×900, `mobile` Pixel 5).
- Pas d'auth nécessaire — l'app utilise un utilisateur local hardcodé côté backend.

## Couverture

### Smart slots
- Sélection client + date → carte de suggestions visible
- Bouton "Suggérer" → appel `/api/slots/suggest` → affichage d'au moins une suggestion
- Clic sur une suggestion → champ date mis à jour, suggestions masquées
- Cas sans suggestions exploitables → pas de crash UI

### Social generator
- Onglet Photos → carte avant/après visible
- Visuel carré 1080×1080 → preview + boutons télécharger/partager
- Visuel story 1080×1920 → dimensions correctes du canvas généré
- Téléchargement → fichier `.jpg` valide via `page.waitForEvent('download')`
