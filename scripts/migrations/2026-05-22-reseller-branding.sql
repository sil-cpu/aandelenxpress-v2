-- Reseller whitelabel branding migration
-- Run this in Supabase SQL editor for existing environments.

CREATE TABLE IF NOT EXISTS reseller_branding (
    reseller_email   TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
    company          TEXT,
    logo_url         TEXT,
    primary_color    TEXT NOT NULL DEFAULT '#1A3B70',
    secondary_color  TEXT NOT NULL DEFAULT '#F2F6FB',
    accent_color     TEXT NOT NULL DEFAULT '#0F1D3A',
    slug             TEXT NOT NULL UNIQUE,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reseller_branding_slug ON reseller_branding(slug);
