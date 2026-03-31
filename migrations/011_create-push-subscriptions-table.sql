CREATE TABLE push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    keys       JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
