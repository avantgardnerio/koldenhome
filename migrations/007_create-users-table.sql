CREATE TABLE users (
    id         SERIAL PRIMARY KEY,
    google_id  TEXT UNIQUE NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT,
    picture    TEXT,
    role       TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);
