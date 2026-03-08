# Supabase for Hosting Panel

## Shared Supabase (Recommended – like MySQL + phpMyAdmin)

One Supabase stack for all projects. Set up once from the main Dashboard, then add project DBs from each project page.

- **Main page**: "Setup Shared Supabase" – one-time setup
- **Project page**: "Setup Supabase" – adds this project's DB to the shared stack

**Resource usage**: ~12 shared containers + 2 per project (PostgREST, Realtime) instead of ~12 per project.

See [SHARED-SUPABASE-DESIGN.md](SHARED-SUPABASE-DESIGN.md) for architecture.

---

## Per-Domain (Legacy)

Each domain/project gets its own full Supabase instance with isolated:
- PostgreSQL database
- Auth (GoTrue)
- Storage
- PostgREST API
- Realtime

**Same Docker images, multiple containers** – all projects use the official Supabase images with different container names, ports, and volumes.

## Quick Start

```bash
# Ensure hosting_network exists (from hosting panel)
docker network create hosting_network 2>/dev/null || true

# Create a new Supabase instance for a domain
./create-project.sh bolt3 bolt3.pdfsaas.com

# Stop a project
./stop-project.sh bolt3
```

**Before creating:** Add DNS `api.bolt3.pdfsaas.com` → your server IP so Traefik can route.

## Requirements

- Docker & Docker Compose
- Traefik on `hosting_network` (from hosting panel)
- DNS: `api.{domain}` must point to your server
- Script clones Supabase repo on first run (~2 min)

## Architecture

```
api.bolt3.pdfsaas.com  ──Traefik──►  supabase-bolt3-kong:8000
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              supabase-bolt3-auth   supabase-bolt3-rest   supabase-bolt3-storage
                    │                    │                    │
                    └────────────────────┼────────────────────┘
                                         ▼
                              supabase-bolt3-db (PostgreSQL)
```

## Per-Project Resources

| Resource     | Naming                      |
|-------------|-----------------------------|
| Containers  | supabase-{slug}-*           |
| Volumes     | supabase_{slug}_db_data, etc. |
| Network     | supabase_{slug}_default     |

## Running Migrations

After creating a project, run your Bolt/Supabase migrations:

```bash
# Using Supabase CLI (install: npm i -g supabase)
supabase link --project-ref bolt3
supabase db push

# Or manually via psql:
docker exec -i supabase-bolt3-db psql -U postgres < your-migrations.sql
```

## Environment Variables for Your App

Set in your Bolt app's env (or hosting panel project env):

```
VITE_SUPABASE_URL=https://api.bolt3.pdfsaas.com
VITE_SUPABASE_ANON_KEY=<from projects/bolt3/.env ANON_KEY>
```
