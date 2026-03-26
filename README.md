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
# Set the postgres user password to 'postgres'
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"

# Create the database
PGPASSWORD=postgres psql -U postgres -c "CREATE DATABASE koldenhome;"
```

Migrations run automatically on server start.

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
