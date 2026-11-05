ALTER TABLE worksites ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE worksites ADD COLUMN special_condition TEXT NOT NULL DEFAULT 'NONE'
  CHECK(special_condition IN ('NONE','HOPE','LOCATION_UNKNOWN','STACKED','OTHER'));
ALTER TABLE worksites ADD COLUMN special_description TEXT NOT NULL DEFAULT '';
ALTER TABLE worksites ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE worksite_edits (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 site_id BIGINT NOT NULL REFERENCES worksites(id),
 actor_id BIGINT NOT NULL REFERENCES users(id),
 changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 before_value JSONB NOT NULL, after_value JSONB NOT NULL
);
CREATE INDEX worksite_edits_site ON worksite_edits(site_id,id);
