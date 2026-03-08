# Shared Supabase Architecture

## Current vs Proposed

| | Current (per-project) | Proposed (shared) |
|---|----------------------|-------------------|
| **Setup** | Per project page | Once from main page |
| **Postgres** | 1 container per project | 1 shared container, multiple DBs |
| **Kong** | 1 per project | 1 shared, routes by Host |
| **Auth, Storage, Studio, Meta, etc.** | 1 per project | 1 shared |
| **PostgREST** | 1 per project | 1 per project (lightweight) |
| **Realtime** | 1 per project | 1 per project |
| **Total containers** | ~12 × N projects | ~12 + 2 × N projects |

**Example**: 5 projects → 60 containers today vs 22 with shared.

## Architecture (like MySQL + phpMyAdmin)

```
┌─────────────────────────────────────────────────────────────────┐
│  Shared Supabase Stack (one-time setup)                          │
├─────────────────────────────────────────────────────────────────┤
│  Postgres (1 container)                                          │
│    ├── postgres (default)     ← Auth, Storage metadata           │
│    ├── project_bolt1         ← Project 1 data                    │
│    ├── project_bolt2         ← Project 2 data                    │
│    └── ...                                                       │
│                                                                  │
│  Kong (1)  → routes api.{domain} to project-specific PostgREST   │
│  Auth (1)  → shared, single user table                           │
│  Studio (1)→ shared, like phpMyAdmin - switch DBs                │
│  Storage (1), Meta (1), Analytics (1), etc.                      │
│                                                                  │
│  Per-project (2 containers each):                                │
│  ├── PostgREST (connects to project_bolt1)                       │
│  └── Realtime (connects to project_bolt1)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Setup Flow

1. **Main page**: "Setup Shared Supabase" (one-time)
   - Runs `setup-shared-supabase.sh`
   - Creates single Supabase stack
   - Uses panel domain: `api.{PANEL_DOMAIN}` or configurable
   - Stores shared config in DB or env

2. **Project page**: "Setup Supabase" (per project)
   - Calls `add-project-to-supabase.sh` instead of `create-project.sh`
   - Creates database in shared Postgres
   - Adds Kong route for `api.{project-domain}`
   - Starts PostgREST + Realtime for this project's DB
   - Project gets unique API URL: `https://api.bolt1.pdfsaas.com`

## API URL per Project

- Shared Studio: `https://supabase.{PANEL_DOMAIN}` (one Studio for all)
- Project API: `https://api.{project-domain}` (e.g. api.bolt1.pdfsaas.com)
- Kong routes by Host to the correct PostgREST

## Migration

- Existing per-project Supabase instances continue to work
- New projects use shared setup when available
- Optional: migrate existing projects to shared (export/import DBs)
