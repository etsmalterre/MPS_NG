-- Import entreprise data from CSV exported by WinDev
-- Usage: docker exec -i mps-postgres-dev psql -U postgres -d mps_dev -f /import/001_entreprise.sql

TRUNCATE TABLE entreprise RESTART IDENTITY CASCADE;

COPY entreprise(nom, commentaire)
FROM '/data/entreprise.csv'
WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
