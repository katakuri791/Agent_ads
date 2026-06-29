-- Statut du token Meta par compte (détection / alerte expiration).
-- Les tokens Facebook long-lived expirent ~60 jours après création. Sans signal,
-- le dashboard affiche des données figées en silence. Le worker facebook_sync
-- marque token_status='expired' dès qu'une erreur OAuthException (code 190) est
-- détectée ; l'UI affiche alors une bannière d'alerte. Additif, non destructif.
ALTER TABLE meta_accounts
  ADD COLUMN IF NOT EXISTS token_status TEXT DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS token_expires_hint TIMESTAMPTZ;
