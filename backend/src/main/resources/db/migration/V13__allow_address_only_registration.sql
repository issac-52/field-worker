-- Preserve existing rows and the legacy address/name index. New registration policy is
-- enforced by the import transaction's shared lock + address check, including numbered sites.
-- Do not merge existing sites which already share an address.
ALTER TABLE worksites DROP CONSTRAINT worksites_anonymous_identity_required;
ALTER TABLE worksites ADD CONSTRAINT worksites_anonymous_identity_required CHECK (
    consumer_number IS NOT NULL OR worksite_identity_text(address) <> ''
);
