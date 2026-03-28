# KoldenHome

Z-Wave REST API proxy.

## Prerequisites

```bash
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

## Caddy Reverse Proxy

When exposing the app via Caddy, use a path whitelist to block scanners. Copy to `/etc/caddy/Caddyfile` and replace `your.domain.example` with your actual domain:

```caddyfile
# Reject scanners hitting by IP or wrong Host header
:80 {
	respond 444
}

:443 {
	tls internal
	respond 444
}

your.domain.example {
	# Only allow known paths — everything else gets 403
	@allowed {
		path / /controller /login /nodes/*
		path /api/*
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

After updating, validate and reload:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
