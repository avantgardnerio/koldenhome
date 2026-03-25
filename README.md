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
