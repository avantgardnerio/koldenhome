-- cameras.stream_id must match the stream key in go2rtc.yaml
CREATE TABLE cameras (
    stream_id  TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO cameras (stream_id, name) VALUES
    ('frontdoor', 'Front Door');
