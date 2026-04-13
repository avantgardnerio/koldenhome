-- 014 incorrectly included a seed INSERT. Migrations are schema-only;
-- camera rows should be managed as data (via psql or an admin UI).
DELETE FROM cameras;
