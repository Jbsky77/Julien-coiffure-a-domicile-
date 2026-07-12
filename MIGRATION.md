# Migration Supabase et Vercel

## Architecture

- Le frontend React est compilé dans `frontend/build`.
- L'API FastAPI est exposée par la fonction Vercel `api/index.py`.
- Les anciennes collections MongoDB sont conservées sous forme de documents JSONB privés dans Supabase.
- Seule l'API serveur possède la clé secrète Supabase. Le navigateur ne reçoit jamais cette clé.

## Variables Vercel requises

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret, côté serveur uniquement)
- `REACT_APP_BACKEND_URL` peut rester vide : le frontend appelle `/api` sur le même domaine.

## Données

La sauvegarde `backups/backup_post_phase1_20260712_105552.json` sert de source à l'import initial.
Chaque collection est insérée dans `public.app_documents` avec une clé stable (`_id`, `id`, ou une clé générée).
