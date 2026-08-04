
-- Stocke les paramètres globaux de l'application
CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

-- Valeur par défaut : toutes les localités activées (liste vide = aucune désactivée)
INSERT INTO app_settings (key, value)
VALUES ('disabled_localities', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Lecture publique (agents + demandeurs ont besoin de lire)
CREATE POLICY "Public read app_settings"
  ON app_settings FOR SELECT
  USING (true);

-- Écriture réservée superviseur/admin
CREATE POLICY "Supervisor write app_settings"
  ON app_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('supervisor','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('supervisor','admin')));
