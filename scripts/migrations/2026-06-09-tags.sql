-- Tags system migration
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS tag_definitions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#1A3B70',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dossier_tags (
    dossier_nr  TEXT NOT NULL,
    tag_id      TEXT NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
    PRIMARY KEY (dossier_nr, tag_id)
);

-- Seed three default tags
INSERT INTO tag_definitions (id, name, color) VALUES
    ('urgent',   'Urgent',   '#E53E3E'),
    ('opvolgen', 'Opvolgen', '#DD6B20'),
    ('upsell',   'Upsell',   '#7B2D8B')
ON CONFLICT (id) DO NOTHING;
