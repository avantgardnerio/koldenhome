ALTER TABLE dashboard_items
  ALTER COLUMN property_key TYPE integer USING property_key::integer,
  ALTER COLUMN read_property_key TYPE integer USING read_property_key::integer;
