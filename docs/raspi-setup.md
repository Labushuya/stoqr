# Raspberry Pi Setup Guide for stoqr

Self-hosting stoqr on a Raspberry Pi 4 or 5 with Docker, Traefik reverse proxy, and Pi-Hole DNS.

---

## 1. Prerequisites

### Hardware

- Raspberry Pi 4 (4 GB RAM minimum) or Raspberry Pi 5
- MicroSD card (32 GB+) or USB SSD (recommended for reliability)
- Static IP assigned via your router DHCP reservation

### Operating System

Install **Raspberry Pi OS Lite (64-bit)** — Bookworm or later.

> 64-bit OS is required. stoqr images are built for `linux/arm64`. Do not use 32-bit (armv7) OS.

Verify architecture after boot:

```bash
uname -m
# Expected: aarch64
```

### System updates

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates gnupg lsb-release
```

### Static IP (optional but recommended)

Edit `/etc/dhcpcd.conf` or configure a DHCP reservation in your router. Note the Pi's IP — you will need it for Pi-Hole and Traefik.

---

## 2. Docker and Docker Compose Installation

Docker's official `convenience script` works on Pi OS arm64.

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Add your user to the `docker` group so you do not need `sudo` for every command:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker version
docker compose version
```

Docker Compose v2 is bundled with Docker Engine — no separate install needed.

### Enable Docker on boot

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

---

## 3. Creating the Proxy Network for Traefik

Traefik and all services that need external access must share a Docker network. Create it once — it persists across compose restarts.

```bash
docker network create proxy
```

Verify:

```bash
docker network ls | grep proxy
```

If you run multiple stacks, always attach them to this network. The network name `proxy` is referenced in the stoqr compose file and in the Traefik configuration.

### Traefik (minimal setup)

If you do not already have Traefik running, create a minimal stack:

```bash
mkdir -p ~/traefik && cat > ~/traefik/docker-compose.yml << 'EOF'
services:
  traefik:
    image: traefik:v3
    container_name: traefik
    restart: unless-stopped
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=proxy"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"   # Traefik dashboard
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
    networks:
      - proxy

networks:
  proxy:
    external: true
EOF

docker compose -f ~/traefik/docker-compose.yml up -d
```

Traefik dashboard: `http://<pi-ip>:8080`

---

## 4. DNS Setup in Pi-Hole

Pi-Hole is used to resolve `stoqr.home.example.com` (or your chosen local domain) to the Pi's IP without touching your public DNS.

### Add a local A-record

1. Open the Pi-Hole web interface: `http://<pi-ip>/admin`
2. Navigate to **Local DNS > DNS Records**
3. Add:

   | Domain | IP |
   |---|---|
   | `stoqr.home.example.com` | `<pi-ip>` |

4. Click **Add**

### Verify resolution

From any device using Pi-Hole as DNS resolver:

```bash
nslookup stoqr.home.example.com
# Should return your Pi's IP
```

> Replace `home.example.com` with your actual local domain suffix throughout this guide.

---

## 5. Cloning stoqr and Configuring .env

```bash
git clone https://github.com/your-org/stoqr.git ~/stoqr
cd ~/stoqr
```

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
nano .env
```

Key variables to configure:

```dotenv
# Application
APP_URL=https://stoqr.home.example.com
APP_SECRET_KEY=<generate with: openssl rand -hex 32>

# Database
DB_HOST=db
DB_PORT=5432
DB_NAME=stoqr
DB_USER=stoqr
DB_PASSWORD=<strong-password>

# Domain (used by Traefik labels)
DOMAIN=stoqr.home.example.com

# Optional: mail
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
```

> Never commit `.env` to version control. The `.gitignore` should already exclude it.

---

## 6. First Run and Database Migration

### Start the stack

```bash
cd ~/stoqr
docker compose up -d
```

Check that all containers are running:

```bash
docker compose ps
```

### Run database migrations

Wait a few seconds for the database container to be ready, then:

```bash
docker compose exec app <migration-command>
```

Replace `<migration-command>` with the project-specific migration command, for example:

- Django: `python manage.py migrate`
- Node/Prisma: `npx prisma migrate deploy`
- Alembic: `alembic upgrade head`

Check the project README for the exact command.

### Verify the application

Open `https://stoqr.home.example.com` in your browser (or `http://` if TLS is not yet configured). You should see the stoqr login or setup screen.

### Create the first admin user

```bash
docker compose exec app <create-user-command>
```

---

## 7. Watchtower for Automatic Updates

Watchtower polls registries and restarts containers when new images are available.

```bash
mkdir -p ~/watchtower && cat > ~/watchtower/docker-compose.yml << 'EOF'
services:
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_SCHEDULE=0 0 3 * * *   # daily at 03:00
      - WATCHTOWER_NOTIFICATIONS=shoutrrr  # optional
    command: stoqr-app stoqr-db            # limit to stoqr containers
EOF

docker compose -f ~/watchtower/docker-compose.yml up -d
```

> Pass container names as arguments to limit Watchtower to specific services. Omit arguments to watch all containers.

Check logs to confirm Watchtower is running:

```bash
docker logs watchtower
```

---

## 8. Database Backup (cron)

### Backup script

```bash
mkdir -p ~/backups

cat > ~/backups/stoqr-backup.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/stoqr"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_DIR="$HOME/stoqr"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

# Dump PostgreSQL
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  pg_dump -U stoqr stoqr | gzip > "$BACKUP_DIR/stoqr_$TIMESTAMP.sql.gz"

# Remove backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "[$(date)] Backup completed: stoqr_$TIMESTAMP.sql.gz"
EOF

chmod +x ~/backups/stoqr-backup.sh
```

Test the script manually first:

```bash
~/backups/stoqr-backup.sh
ls -lh ~/backups/stoqr/
```

### Schedule via cron

```bash
crontab -e
```

Add the following line to run a backup every day at 02:30:

```
30 2 * * * /home/<your-user>/backups/stoqr-backup.sh >> /home/<your-user>/backups/stoqr-backup.log 2>&1
```

Replace `<your-user>` with your actual username.

### Restore a backup

```bash
gunzip -c ~/backups/stoqr/stoqr_<timestamp>.sql.gz | \
  docker compose -f ~/stoqr/docker-compose.yml exec -T db \
  psql -U stoqr stoqr
```

---

## 9. Troubleshooting

### Container fails to start: `exec format error`

The image was built for `amd64` only. stoqr must publish a multi-arch image including `linux/arm64`. Check the image manifest:

```bash
docker manifest inspect <image-name> | grep -A2 '"platform"'
```

If `arm64` is missing, open an issue with the stoqr project or build locally:

```bash
docker buildx build --platform linux/arm64 -t stoqr-local . --load
```

### Database connection refused on first start

The app may start before PostgreSQL is ready. Either:

- Add a `healthcheck` + `depends_on: condition: service_healthy` to the compose file, or
- Restart the app container manually after the database is up:

```bash
docker compose restart app
```

### Pi runs out of memory

With 4 GB RAM, stoqr + Postgres + Traefik + Watchtower is comfortable. With 2 GB, disable swap and consider tuning PostgreSQL:

```bash
# /etc/postgresql/*/main/postgresql.conf equivalents via env:
POSTGRES_SHARED_BUFFERS=128MB
POSTGRES_WORK_MEM=4MB
```

### Traefik shows "404 page not found"

- Confirm the `proxy` network is attached to both Traefik and the stoqr `app` container.
- Check that the Traefik labels in `docker-compose.yml` match the domain in your `.env`.
- Run `docker inspect <app-container> | grep -A10 Networks` to verify network membership.

### Time/timezone issues in logs

Set the Pi timezone:

```bash
sudo timedatectl set-timezone Europe/Berlin
```

Pass the timezone to containers via the compose file:

```yaml
environment:
  - TZ=Europe/Berlin
```

### SD card corruption after power loss

Use a quality USB SSD instead of an SD card for the Pi's root filesystem. At minimum, move the Docker data directory to the SSD:

```bash
sudo systemctl stop docker
sudo mv /var/lib/docker /mnt/ssd/docker
sudo ln -s /mnt/ssd/docker /var/lib/docker
sudo systemctl start docker
```

---

## Quick Reference

| Task | Command |
|---|---|
| Start stoqr | `docker compose -f ~/stoqr/docker-compose.yml up -d` |
| Stop stoqr | `docker compose -f ~/stoqr/docker-compose.yml down` |
| View logs | `docker compose -f ~/stoqr/docker-compose.yml logs -f` |
| Run migration | `docker compose -f ~/stoqr/docker-compose.yml exec app <cmd>` |
| Manual backup | `~/backups/stoqr-backup.sh` |
| Traefik dashboard | `http://<pi-ip>:8080` |
| Pi-Hole admin | `http://<pi-ip>/admin` |
