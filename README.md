# KoldenHome

Z-Wave REST API proxy.

## Prerequisites

```bash
# Node.js 24 LTS (via snap, auto-updates)
sudo snap install node --classic --channel=24

# PostgreSQL 17
sudo apt install postgresql-17

# TimescaleDB extension
sudo apt install postgresql-17-timescaledb
```

Add TimescaleDB to PostgreSQL's shared preload libraries:

```bash
# In /etc/postgresql/17/main/postgresql.conf, set:
shared_preload_libraries = 'timescaledb'
```

Then restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

## Database setup

```bash
# Create the database
sudo -u postgres psql -c "CREATE DATABASE koldenhome;"

# Create app user (DML only — SELECT, INSERT, UPDATE, DELETE)
sudo -u postgres psql -d koldenhome -c "
CREATE USER koldenhome;
GRANT CONNECT ON DATABASE koldenhome TO koldenhome;
GRANT USAGE ON SCHEMA public TO koldenhome;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO koldenhome;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO koldenhome;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO koldenhome;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO koldenhome;
"

# Create migrations user (DDL — CREATE, ALTER, DROP tables)
sudo -u postgres psql -d koldenhome -c "
CREATE USER koldenhome_migrations;
GRANT ALL ON DATABASE koldenhome TO koldenhome_migrations;
GRANT ALL ON SCHEMA public TO koldenhome_migrations;
GRANT ALL ON ALL TABLES IN SCHEMA public TO koldenhome_migrations;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO koldenhome_migrations;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO koldenhome_migrations;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO koldenhome_migrations;
"
```

Add trust auth for both users in `/etc/postgresql/17/main/pg_hba.conf` (before the default rules):

```
local   koldenhome      koldenhome                              trust
host    koldenhome      koldenhome      127.0.0.1/32            trust
host    koldenhome      koldenhome      ::1/128                 trust
local   koldenhome      koldenhome_migrations                   trust
host    koldenhome      koldenhome_migrations   127.0.0.1/32    trust
host    koldenhome      koldenhome_migrations   ::1/128         trust
```

Then reload PostgreSQL:

```bash
sudo systemctl reload postgresql
```

Migrations run automatically on server start (as `koldenhome_migrations`). The app connects as `koldenhome` at runtime.

## Run

```bash
npm install
npm start
```

Swagger UI at http://localhost:3000/docs

### Systemd service

Create `/etc/systemd/system/koldenhome.service`, replacing `<user>` and the `WorkingDirectory` with your values:

```ini
[Unit]
Description=KoldenHome Z-Wave REST API
After=network.target postgresql.service
StartLimitBurst=3
StartLimitIntervalSec=300

[Service]
Type=simple
User=<user>
WorkingDirectory=/path/to/koldenhome
ExecStart=/snap/bin/node index.js
Environment=NODE_ENV=production
SupplementaryGroups=dialout
Restart=on-failure
RestartSec=30
SyslogIdentifier=koldenhome
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable koldenhome
sudo systemctl start koldenhome
```

Logs via `journalctl -t koldenhome -f` (uses `-t` not `-u` because snap node runs under the user cgroup). Restarts on failure with a 30s delay, gives up after 3 failures in 5 minutes.

## Plugins

Plugins are DB-driven (JSONB config in `plugins` table) and loaded on driver ready. Each plugin type maps to a file in `plugins/`.

To add a plugin instance:

```sql
INSERT INTO plugins (type, name, config) VALUES
('hvac-mode', 'Main Floor HVAC', '{"sensor_node_id": 61, "thermostat_node_id": 61, "heat_below": 62, "cool_above": 74}');
```

Available plugin types:

- **hvac-mode** — Automatic heat/cool mode switching based on temperature thresholds. Dead-band hysteresis: sets Heat when temp drops below `heat_below`, Cool when temp rises above `cool_above`, holds current mode between thresholds.

## Caddy Reverse Proxy

Install Caddy as a static binary (Ubuntu repos lag too far behind on security patches):

```bash
# Download latest from https://github.com/caddyserver/caddy/releases
sudo curl -sL "https://github.com/caddyserver/caddy/releases/download/v2.11.2/caddy_2.11.2_linux_amd64.tar.gz" -o /tmp/caddy.tar.gz
sudo tar -xzf /tmp/caddy.tar.gz -C /usr/bin caddy
sudo chmod +x /usr/bin/caddy
sudo setcap cap_net_bind_service=+ep /usr/bin/caddy
```

Use a path whitelist to block scanners. Copy to `/etc/caddy/Caddyfile` and replace `your.domain.example` with your actual domain:

```caddyfile
{
	admin off
}

# Reject scanners hitting by IP or wrong Host header
:80 {
	log {
		output file /var/log/caddy/access.log
	}
	respond 444
}

:443 {
	tls internal
	log {
		output file /var/log/caddy/access.log
	}
	respond 444
}

your.domain.example {
	log {
		output file /var/log/caddy/access.log
	}
	header -Server

	# Only allow known paths — everything else gets 403
	@allowed {
		path / /battery /cameras /controller /login /nodes/*
		path /api/*
		path /cam/*
		path /manifest.json /sw.js
		path /css/* /js/* /icon-*.png
		path /node_modules/preact/dist/preact.mjs
		path /node_modules/preact/hooks/dist/hooks.mjs
		path /node_modules/htm/dist/htm.mjs
		path /node_modules/htm/preact/index.mjs
	}

	handle @allowed {
		reverse_proxy localhost:3000
	}

	handle {
		respond 403
	}
}
```

Harden the systemd unit with an override at `/etc/systemd/system/caddy.service.d/override.conf`:

```ini
[Service]
CapabilityBoundingSet=cap_net_bind_service
AmbientCapabilities=cap_net_bind_service
NoNewPrivileges=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/caddy /var/log/caddy
PrivateTmp=yes
ProtectControlGroups=yes
ProtectKernelModules=yes
ProtectKernelTunables=yes
```

After updating, validate and reload:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl reload caddy
```

## Cameras (go2rtc)

RTSP-capable cameras are proxied through [go2rtc](https://github.com/AlexxIT/go2rtc), which converts
RTSP to browser-friendly MP4/WebRTC/HLS. The Express app serves a Cameras page that lists enabled
entries from the `cameras` table and plays the stream on click.

### Install go2rtc

```bash
sudo curl -sL "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64" \
  -o /usr/local/bin/go2rtc
sudo chmod 0755 /usr/local/bin/go2rtc
sudo useradd --system --no-create-home --shell /usr/sbin/nologin go2rtc
sudo mkdir -p /etc/go2rtc
```

Create `/etc/go2rtc/go2rtc.yaml` (must be readable by the `go2rtc` user):

```yaml
streams:
  # Key here must match cameras.stream_id in the DB
  frontdoor: rtsp://admin:@192.168.0.3:554/h264Preview_01_sub

api:
  listen: "127.0.0.1:8084"   # Express proxies /cam/* → go2rtc
  origin: "*"                 # Accept any Origin (Express sits in front)

webrtc:
  listen: ":8555"
```

```bash
sudo chown go2rtc:go2rtc /etc/go2rtc/go2rtc.yaml
sudo chmod 0640 /etc/go2rtc/go2rtc.yaml
```

Create `/etc/systemd/system/go2rtc.service`:

```ini
[Unit]
Description=go2rtc streaming server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=go2rtc
Group=go2rtc
ExecStart=/usr/local/bin/go2rtc -config /etc/go2rtc/go2rtc.yaml
Restart=on-failure
RestartSec=5

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true
SystemCallArchitectures=native
# NOTE: do NOT set MemoryDenyWriteExecute=true — it breaks Go's runtime

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now go2rtc
```

### Register a camera

```sql
INSERT INTO cameras (stream_id, name) VALUES ('frontdoor', 'Front Door');
```

The `stream_id` must match the key in `/etc/go2rtc/go2rtc.yaml`. After editing go2rtc config:

```bash
sudo systemctl restart go2rtc
```

### Access control

The PWA always hits `/cam/*` on Express, which proxies (HTTP + WebSocket) to go2rtc on
`127.0.0.1:8084` behind `requireAuth`. Works identically on LAN (direct to Express :3000)
and WAN (through Caddy → Express). go2rtc can be bound to 127.0.0.1 only since nothing
else talks to it directly.

### Reolink camera activation (one-time, if needed)

Reolink cameras ship with RTSP/HTTP/ONVIF disabled — only the proprietary Baichuan protocol on
port 9000 works out of the box. To enable RTSP without installing the Reolink app, use
[neolink](https://github.com/QuantumEntangledAndy/neolink) once:

```bash
cargo install --git https://github.com/QuantumEntangledAndy/neolink neolink
# write a temporary neolink.toml with camera uid/address
neolink services <name> rtsp on
```

After RTSP is on, neolink is no longer needed — delete the temp config (contains credentials).
