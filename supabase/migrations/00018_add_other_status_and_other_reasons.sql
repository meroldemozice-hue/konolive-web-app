
-- 1. Extend status enum with 'other'
ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'other';

-- 2. Seed default other_reasons in app_settings
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'other_reasons',
  '["Numéro non reconnu","Demande en doublon","Dossier incomplet","Demande annulée par le client","Autre raison"]'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
