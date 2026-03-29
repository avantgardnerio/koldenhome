CREATE TABLE plugins (
    id         SERIAL PRIMARY KEY,
    type       TEXT NOT NULL,
    name       TEXT NOT NULL,
    enabled    BOOLEAN DEFAULT true,
    config     JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
