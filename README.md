# AutoDeploy Hosting Panel

Self-hosted Docker-based website hosting control panel. Deploy websites from ZIP or Git, each running in isolated containers with resource limits, Traefik routing, and Let's Encrypt SSL.

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript
- **Backend:** NestJS, TypeScript
- **Database:** MySQL (admin metadata, projects, domains)
- **Queue:** Redis + BullMQ
- **Container:** Docker (dockerode)
- **Proxy:** Traefik (auto SSL, routing)
- **Real-time:** WebSocket (Socket.IO)

## Features

- Admin auth (JWT)
- Create project from ZIP upload
- Build Docker image, run with `--memory`, `--cpus`, `--security-opt no-new-privileges`
- Container controls: Start, Stop, Restart, Delete
- Real-time Docker stats via WebSocket
- Live logs viewer
- Domain/subdomain/wildcard support
- Traefik + Let's Encrypt integration
- Environment variables management

## Quick Start

```bash
# Copy env
cp .env.example .env
# Edit .env with your values

# Deploy
docker compose up -d
```

Default login: `admin@localhost` / `Admin123!`

See [INSTALL.md](INSTALL.md) for full VPS setup.

## Project Structure

```
├── backend/           # NestJS API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── projects/
│   │   │   ├── domains/
│   │   │   ├── docker/
│   │   │   └── logs/
│   │   └── database/
│   └── Dockerfile
├── frontend/          # React dashboard
├── infra/mysql/       # DB schema
├── docker-compose.yml
└── INSTALL.md
```
