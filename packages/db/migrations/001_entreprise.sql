-- Create entreprise table
-- Migrated from HFSQL: Entreprise

CREATE TABLE IF NOT EXISTS entreprise (
  "IDentreprise" SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  commentaire TEXT
);
