-- Numbered sites remain unique by consumer_number. Unnumbered sites use address + name.
-- Keep the original display values; normalization is only for identity comparison.
CREATE FUNCTION worksite_identity_text(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE PARALLEL SAFE
RETURN btrim(regexp_replace(coalesce(value, ''), E'[ \\t\\n\\r\\f\\013]+', ' ', 'g'));

ALTER TABLE worksites ALTER COLUMN consumer_number DROP NOT NULL;
ALTER TABLE worksites ADD CONSTRAINT worksites_anonymous_identity_required CHECK (
    consumer_number IS NOT NULL OR
    (worksite_identity_text(address) <> '' AND worksite_identity_text(name) <> '')
);
CREATE UNIQUE INDEX worksites_anonymous_identity ON worksites
    (worksite_identity_text(address), worksite_identity_text(name))
    WHERE consumer_number IS NULL;

-- Old number-based plans must be previewed again. New plans keep explicit internal IDs.
ALTER TABLE excel_prune_plans ADD COLUMN keep_site_ids JSONB;
