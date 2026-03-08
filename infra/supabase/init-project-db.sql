-- Minimal init for a new project database in shared Supabase
-- Run via init-project-db.sh which substitutes variables

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Realtime schema
CREATE SCHEMA IF NOT EXISTS _realtime;
ALTER SCHEMA _realtime OWNER TO postgres;
GRANT ALL ON SCHEMA _realtime TO postgres, anon, authenticated, service_role;

-- Grants for PostgREST roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA _realtime TO anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO anon, authenticated, service_role;
