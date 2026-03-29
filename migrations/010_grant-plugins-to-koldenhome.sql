-- Fix: tables created by koldenhome_migrations don't inherit default privileges
-- set by postgres. Grant on plugins table and fix default privileges for future tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON plugins TO koldenhome;
GRANT USAGE, SELECT ON plugins_id_seq TO koldenhome;
ALTER DEFAULT PRIVILEGES FOR ROLE koldenhome_migrations IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO koldenhome;
ALTER DEFAULT PRIVILEGES FOR ROLE koldenhome_migrations IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO koldenhome;
