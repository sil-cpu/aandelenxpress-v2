-- ============================================================
-- AandelenXpress – Supabase schema
-- Voer dit eenmalig uit in de Supabase SQL Editor
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    email       TEXT PRIMARY KEY,
    password    TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'reseller',
    name        TEXT NOT NULL,
    company     TEXT,
    company_id  TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pending reseller registrations
CREATE TABLE IF NOT EXISTS pending_resellers (
    email      TEXT PRIMARY KEY,
    kantoor    TEXT,
    kvk        TEXT,
    naam       TEXT,
    telefoon   TEXT,
    password   TEXT,
    aangemeld  TIMESTAMPTZ DEFAULT NOW()
);

-- Reseller requests (dossiers)
CREATE TABLE IF NOT EXISTS reseller_requests (
    id                TEXT PRIMARY KEY,
    reseller_id       TEXT NOT NULL,
    reseller_name     TEXT,
    reseller_company  TEXT,
    access_token      TEXT,
    client_name       TEXT,
    client_email      TEXT,
    client_phone      TEXT,
    oprichting_type   TEXT,
    gewenst_naam      TEXT,
    doel              TEXT,
    aandeelhouders    INTEGER DEFAULT 1,
    kapitaal          NUMERIC DEFAULT 0.01,
    start_saldo       NUMERIC DEFAULT 0,
    opmerkingen       TEXT,
    status            TEXT NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    approved_at       TIMESTAMPTZ,
    approved_by       TEXT,
    rejection_reason  TEXT,
    status_updated_at TIMESTAMPTZ,
    activities        JSONB DEFAULT '[]'::jsonb
);

-- Vragenlijst submissions
CREATE TABLE IF NOT EXISTS vragenlijsten (
    case_id      TEXT PRIMARY KEY,
    data         JSONB NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blog posts
CREATE TABLE IF NOT EXISTS blog_posts (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    excerpt     TEXT,
    content     TEXT,
    image       TEXT,
    categories  JSONB DEFAULT '[]'::jsonb,
    featured    BOOLEAN DEFAULT FALSE,
    published   BOOLEAN DEFAULT FALSE,
    author      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Support tickets
CREATE TABLE IF NOT EXISTS tickets (
    id           TEXT PRIMARY KEY,
    dossier_nr   TEXT,
    partner      TEXT,
    subject      TEXT NOT NULL,
    message      TEXT,
    sender_name  TEXT,
    sender_email TEXT,
    priority     TEXT DEFAULT 'medium',
    status       TEXT DEFAULT 'open',
    read         BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    replies      JSONB DEFAULT '[]'::jsonb
);

-- Dossier assignments (welke admin is verantwoordelijk)
CREATE TABLE IF NOT EXISTS dossier_assignments (
    dossier_nr TEXT PRIMARY KEY,
    admin_name TEXT
);

-- ── Sequences voor ID generatie ──────────────────────────────
CREATE SEQUENCE IF NOT EXISTS blog_post_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS template_seq  START 2;
CREATE SEQUENCE IF NOT EXISTS ticket_seq    START 1005;

-- Atomaire ID functies (safe voor concurrent requests)
CREATE OR REPLACE FUNCTION next_blog_post_id() RETURNS TEXT AS $$
    SELECT 'blog-' || nextval('blog_post_seq')::text;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION next_template_id() RETURNS TEXT AS $$
    SELECT 'T-' || nextval('template_seq')::text;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION next_ticket_id() RETURNS TEXT AS $$
    SELECT 'TK-' || nextval('ticket_seq')::text;
$$ LANGUAGE SQL;

-- ── Seed: standaard gebruikers ───────────────────────────────
INSERT INTO users (email, password, type, name, company, company_id, status) VALUES
    ('admin@aandelenxpress.nl', '123456', 'admin',    'Admin User',    'AandelenXpress',          'aax-admin',    'active'),
    ('demo@kantoor.nl',         '123456', 'reseller', 'Demo Kantoor',  'Van der Bergh Accountants','vdb-001',      'active'),
    ('jan@bakker.nl',           '123456', 'reseller', 'Jan Bakker',    'Bakker Accountants',       'bakker-001',   'active'),
    ('kees@vanderberg.nl',      '123456', 'reseller', 'Kees van Berg', 'Van der Berg & Co',        'vdb-002',      'active')
ON CONFLICT (email) DO NOTHING;

-- ── Seed: demo support tickets ───────────────────────────────
INSERT INTO tickets (id, partner, subject, priority, created_at, status, read, replies) VALUES
    ('TK-1001', 'Bakker Accountants', 'Toegang iDIN portaal werkt niet',  'high',   '2026-04-24T00:00:00Z', 'Open', FALSE, '[]'),
    ('TK-1002', 'Van der Berg & Co',  'KvK bevestiging niet ontvangen',   'medium', '2026-04-23T00:00:00Z', 'Open', FALSE, '[]'),
    ('TK-1003', 'Dijkstra Partners',  'Vraag over facturatiemodel',        'low',    '2026-04-22T00:00:00Z', 'Open', FALSE, '[]'),
    ('TK-1004', 'Smit & Assoc.',      'Logo updaten in portaal',           'low',    '2026-04-20T00:00:00Z', 'Open', FALSE, '[]')
ON CONFLICT (id) DO NOTHING;

-- ── Seed: bestaande email template ───────────────────────────
INSERT INTO email_templates (id, name, subject, body, created_at) VALUES
    ('T-1', 'test', 'test',
     'Hi Sil,<div><br></div><div>Dit is een test email ik ben benieuwd hoe die aankomt.&nbsp;</div><div><br></div><div>Met vriendelijke groet,&nbsp;<br>Sil Muller</div>',
     '2026-05-15T18:40:23.815Z')
ON CONFLICT (id) DO NOTHING;
