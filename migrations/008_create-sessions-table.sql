CREATE TABLE sessions (
    sid    TEXT PRIMARY KEY,
    sess   JSONB NOT NULL,
    expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expire ON sessions (expire);
