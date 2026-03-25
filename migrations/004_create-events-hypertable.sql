CREATE TABLE events (
    time     TIMESTAMPTZ NOT NULL,
    node_id  INTEGER NOT NULL,
    property TEXT NOT NULL,
    value    JSONB
);

SELECT create_hypertable('events', 'time');
