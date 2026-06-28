-- 0008_users_profile_columns.sql
--
-- Fix : la table `users` déployée a été créée par une version antérieure SANS les
-- colonnes first_name / last_name / company. Comme 0001_core_schema.sql utilise
-- `CREATE TABLE IF NOT EXISTS users (...)`, la table existante n'a jamais été altérée
-- et ces colonnes n'ont jamais été ajoutées. Résultat : update_user_profile() les
-- filtre (absentes de existing_cols), `company` est perdu à chaque save, et le nom
-- ne survit que via un round-trip fragile full_name → split.
--
-- Cette migration ajoute les colonnes (idempotent) et rétro-remplit first/last à
-- partir du full_name existant pour ne perdre aucun nom déjà saisi.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name  TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company    TEXT;

-- Backfill : premier mot → first_name ; reste (après le 1er espace) → last_name.
UPDATE public.users
SET
  first_name = COALESCE(first_name, NULLIF(split_part(full_name, ' ', 1), '')),
  last_name  = COALESCE(
    last_name,
    CASE WHEN full_name LIKE '% %'
         THEN NULLIF(trim(substring(full_name FROM position(' ' IN full_name) + 1)), '')
         ELSE NULL END
  )
WHERE full_name IS NOT NULL AND full_name <> '';
