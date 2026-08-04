
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'rejection_reasons',
  '["Document illisible","Document expiré","Photo non conforme","Identité non vérifiable","Informations incohérentes"]'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
