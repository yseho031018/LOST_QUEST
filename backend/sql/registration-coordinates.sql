-- MANUAL, OPT-IN migration. Never run against an unidentified database.
-- Requires a verified restorable backup, user approval and a maintenance window.
-- First inspect SELECT DATABASE(), SHOW CREATE TABLE for both tables, and the
-- information_schema.columns query below. Run each ALTER only when BOTH columns
-- are absent on that table; stop on partial/existing/unexpected definitions.
-- MySQL DDL auto-commits. The two ALTER statements are not one transaction.
-- Adds nullable fields only; does not geocode, rewrite, or delete existing rows.

SELECT DATABASE();
SELECT table_name, column_name, column_type, is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name IN ('lost_items', 'found_items')
  AND column_name IN ('latitude', 'longitude');

ALTER TABLE lost_items
  ADD COLUMN latitude DOUBLE NULL,
  ADD COLUMN longitude DOUBLE NULL;

ALTER TABLE found_items
  ADD COLUMN latitude DOUBLE NULL,
  ADD COLUMN longitude DOUBLE NULL;

-- Recheck all four nullable DOUBLE columns. Deploy backend with ddl-auto=validate.
-- Do not DROP these columns on rollback: the previous backend can ignore them.
