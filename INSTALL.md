# VPS Installation Instructions

Self-hosted Docker-based website hosting control panel.

## Prerequisites

- Ubuntu 22.04 LTS (or similar Linux VPS)
- Docker & Docker Compose v2+
- Domain pointed to your VPS IP (for Let's Encrypt)
- Ports 80, 443 open

## Quick Install

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group to take effect

# 2. Clone or copy project
cd /opt
git clone <your-repo> hosting-panel
cd hosting-panel

# 3. Configure environment
cp .env.example .env
nano .env
```

## Environment Variables (.env)

```env
# MySQL
MYSQL_ROOT_PASSWORD=secure_root_password
MYSQL_DATABASE=hosting_panel
MYSQL_USER=hosting
MYSQL_PASSWORD=secure_db_password

# JWT (generate: openssl rand -base64 32)
JWT_SECRET=your-super-secret-jwt-key

# Let's Encrypt
ACME_EMAIL=admin@yourdomain.com

# Panel domain (for Traefik routing)
PANEL_DOMAIN=panel.yourdomain.com
```

## Deploy

```bash
docker compose up -d
```

Wait for MySQL to be healthy (~30s), then the backend will start and seed the default admin.

## Default Login

The default admin is created automatically during installation:

- **Email:** admin@localhost
- **Password:** Admin123!

**Change this immediately after first login.**

*Note: On a fresh install, the admin is created by the database init script. If you upgraded from an older setup or the DB already existed, run the manual insert from the [Troubleshooting](#troubleshooting) section.*

## Access

- Panel: https://panel.yourdomain.com (or http://your-vps-ip if no domain)
- Ensure DNS A record points to your VPS IP

## Create Your First Project

1. Log in to the panel
2. Click "New Project"
3. Enter project name (e.g. `my-app`)
4. Upload a ZIP containing your Node.js source code (no Dockerfile required)
   - Supported: React (Vite/CRA), Next.js, NestJS, Express
   - ZIP can be the project folder or its contents (with `package.json` at root)
5. Optional: Add domain (e.g. `app.yourdomain.com`)
6. Click Create

The panel will:
- Extract the ZIP
- Build the Docker image
- Run the container with resource limits
- Auto-detect project type and generate a Dockerfile if needed
- Configure Traefik routing (if domain provided)
- Obtain SSL certificate via Let's Encrypt

## Directory Structure

```
/opt/hosting-panel/
├── backend/          # NestJS API
├── frontend/         # React dashboard
├── infra/mysql/      # DB schema
├── docker-compose.yml
└── .env
```

## Security Checklist

- [ ] Change default admin password
- [ ] Set strong JWT_SECRET
- [ ] Set strong MySQL passwords
- [ ] Restrict firewall to 80, 443, 22
- [ ] Use SSH keys, disable password auth
- [ ] Keep Docker and OS updated

## Troubleshooting

### Build fails
- Ensure ZIP contains `package.json` (Node.js project)
- Supported frameworks: React (Vite/CRA), Next.js, NestJS, Express
- Check backend logs: `docker logs hosting-backend`

### No SSL certificate
- Verify domain DNS points to VPS
- Check ACME_EMAIL is valid
- Port 80 must be reachable for HTTP challenge

### Container won't start
- Check backend logs: `docker logs hosting-backend`
- Ensure Docker socket is accessible: `ls -la /var/run/docker.sock`

### Login failed / No admin account
If the default admin wasn't created (e.g. upgrade from older setup), create it manually:

```bash
docker exec hosting-mysql mysql -u hosting -pYOUR_DB_PASSWORD hosting_panel -e 'INSERT INTO admins (email, password_hash, name, role, is_active) VALUES ("admin@localhost", "$2b$10$/cUrcOc3RFatqEnjkCHf4udOY82FBtTXTfwhNhf/ffK7oP9/JyERm", "Admin", "super_admin", 1);'
```

Replace `YOUR_DB_PASSWORD` with your MYSQL_PASSWORD from .env. Default login: admin@localhost / Admin123!

## Development

```bash
# Backend
cd backend && npm install && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev

# MySQL + Redis only
docker compose up -d mysql redis
```
