CREATE TABLE dashboard_items (
    id            SERIAL PRIMARY KEY,
    node_id       INTEGER NOT NULL,
    label         TEXT NOT NULL,
    command_class INTEGER NOT NULL,
    property      TEXT NOT NULL,
    property_key  TEXT,
    endpoint      INTEGER,
    sort_order    INTEGER NOT NULL DEFAULT 0
);
