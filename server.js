require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const emails = require('./emails');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const app = express();
const DOSSIER_AUTO_TRASH_MS = 14 * 24 * 60 * 60 * 1000;
const PRICING_MARKER = '[AX_PRICING]';
const BRANDING_BUCKET = 'branding-assets';
const FILE_BUCKET = 'dossier-files';
const LEGACY_BRANDING_PREFIX = '__BRANDING__:';

// ── Supabase client (service role bypasses RLS) ────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('FATAL: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist. Stel deze in als environment variables.');
    process.exit(1);
}
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Helper: camelCase ↔ snake_case mapping voor reseller_requests ──────────
function reqToRow(r) {
    const pricingBlob = r.pricing ? `${PRICING_MARKER}${JSON.stringify(r.pricing)}` : '';
    const cleanNote = (r.opmerkingen || '').trim();
    const opmerkingen = pricingBlob ? (cleanNote ? `${cleanNote}\n\n${pricingBlob}` : pricingBlob) : cleanNote;
    return {
        id:                r.id,
        reseller_id:       r.resellerId,
        reseller_name:     r.resellerName,
        reseller_company:  r.resellerCompany,
        access_token:      r.accessToken,
        client_name:       r.clientName,
        client_email:      r.clientEmail,
        client_phone:      r.clientPhone || '',
        oprichting_type:   r.oprichtingType,
        gewenst_naam:      r.gewenstNaam,
        doel:              r.doel,
        aandeelhouders:    r.aandeelhouders || 1,
        kapitaal:          r.kapitaal || 0.01,
        start_saldo:       r.startSaldo || 0,
        opmerkingen,
        status:            r.status,
        created_at:        r.createdAt,
        approved_at:       r.approvedAt || null,
        approved_by:       r.approvedBy || null,
        rejection_reason:  r.rejectionReason || null,
        status_updated_at: r.statusUpdatedAt || null,
        activities:        r.activities || []
    };
}

function rowToReq(row) {
    if (!row) return null;
    const lifecycle = getDossierLifecycle(row.activities || []);
    const parsed = parsePricingFromOpmerkingen(row.opmerkingen || '');
    return {
        id:               row.id,
        resellerId:       row.reseller_id,
        resellerName:     row.reseller_name,
        resellerCompany:  row.reseller_company,
        accessToken:      row.access_token,
        clientName:       row.client_name,
        clientEmail:      row.client_email,
        clientPhone:      row.client_phone,
        oprichtingType:   row.oprichting_type,
        gewenstNaam:      row.gewenst_naam,
        doel:             row.doel,
        aandeelhouders:   row.aandeelhouders,
        kapitaal:         row.kapitaal,
        startSaldo:       row.start_saldo,
        opmerkingen:      parsed.opmerkingen,
        pricing:          parsed.pricing,
        status:           row.status,
        createdAt:        row.created_at,
        approvedAt:       row.approved_at,
        approvedBy:       row.approved_by,
        rejectionReason:  row.rejection_reason,
        statusUpdatedAt:  row.status_updated_at,
        activities:       row.activities || [],
        archivedAt:       lifecycle.archivedAt,
        trashedAt:        lifecycle.trashedAt
    };
}

function parsePricingFromOpmerkingen(rawText) {
    const text = String(rawText || '');
    const idx = text.lastIndexOf(PRICING_MARKER);
    if (idx === -1) return { opmerkingen: text, pricing: null };

    const before = text.slice(0, idx).replace(/\n\s*$/g, '').trim();
    const jsonPart = text.slice(idx + PRICING_MARKER.length).trim();
    let pricing = null;
    try {
        pricing = JSON.parse(jsonPart);
    } catch (e) {
        pricing = null;
    }
    return { opmerkingen: before, pricing };
}

function getDossierLifecycle(activities) {
    let archivedAt = null;
    let trashedAt = null;

    for (const entry of activities || []) {
        if (!entry || !entry.type) continue;
        if (entry.type === 'archived') {
            archivedAt = entry.timestamp || new Date().toISOString();
            trashedAt = null;
        }
        if (entry.type === 'unarchived') {
            archivedAt = null;
            trashedAt = null;
        }
        if (entry.type === 'trashed') {
            archivedAt = null;
            trashedAt = entry.timestamp || new Date().toISOString();
        }
    }

    if (archivedAt && !trashedAt) {
        const autoTrashAt = new Date(new Date(archivedAt).getTime() + DOSSIER_AUTO_TRASH_MS).toISOString();
        if (Date.now() >= new Date(autoTrashAt).getTime()) {
            archivedAt = null;
            trashedAt = autoTrashAt;
        }
    }

    return { archivedAt, trashedAt };
}

function isDossierTrashed(row) {
    return !!getDossierLifecycle(row?.activities || []).trashedAt;
}

function addActivity(request, type, message, author) {
    if (!request.activities) request.activities = [];
    request.activities.push({
        id: Date.now() + Math.random(),
        type,
        message,
        author: author || null,
        timestamp: new Date().toISOString()
    });
}

function generateToken() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let t = '';
    for (let i = 0; i < 8; i++) t += chars[Math.floor(Math.random() * chars.length)];
    return t;
}

function generateDossierNr() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let part = '';
    for (let i = 0; i < 6; i++) part += chars[Math.floor(Math.random() * chars.length)];
    return 'AX-' + part;
}

function generateSmartToken() {
    // 8-char random token, uppercase, no confusable chars (0/O, 1/I/L)
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(8);
    return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

function tokenMatches(storedToken, providedToken) {
    const a = String(storedToken || '').trim().toLowerCase();
    const b = String(providedToken || '').trim().toLowerCase();
    return !!a && !!b && a === b;
}

function sanitizeSlug(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
}

function buildVragenlijstUrl(request) {
    const base = process.env.SITE_URL || 'https://aandelenxpress-v2.vercel.app';
    const id = request?.id || '';
    const product = String(request?.oprichtingType || 'bv').trim();
    const token = request?.accessToken ? '&token=' + encodeURIComponent(request.accessToken) : '';
    return `${base}/vragenlijst-bv-holding?nr=${encodeURIComponent(id)}&product=${encodeURIComponent(product)}${token}`;
}

function defaultBrandingForUser(user) {
    return {
        resellerEmail: user?.email || '',
        company: user?.company || user?.name || 'Partner',
        logoUrl: '',
        primaryColor: '#1A3B70',
        secondaryColor: '#F2F6FB',
        accentColor: '#0F1D3A',
        slug: sanitizeSlug((user?.company || user?.name || '').replace(/\s+/g, '')) || ''
    };
}

function normalizeBrandingPayload(input, fallback = {}) {
    return {
        resellerEmail: String(input?.resellerEmail || fallback?.resellerEmail || '').trim().toLowerCase(),
        company: String(input?.company || fallback?.company || '').trim(),
        logoUrl: String(input?.logoUrl || '').trim(),
        primaryColor: String(input?.primaryColor || '#1A3B70').trim() || '#1A3B70',
        secondaryColor: String(input?.secondaryColor || '#F2F6FB').trim() || '#F2F6FB',
        accentColor: String(input?.accentColor || '#0F1D3A').trim() || '#0F1D3A',
        slug: sanitizeSlug(input?.slug || fallback?.slug || ''),
        updatedAt: new Date().toISOString()
    };
}

async function ensureBrandingBucket() {
    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const exists = (buckets || []).some(b => b.name === BRANDING_BUCKET);
        if (!exists) {
            await supabase.storage.createBucket(BRANDING_BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024 });
        }
        const fileExists = (buckets || []).some(b => b.name === FILE_BUCKET);
        if (!fileExists) {
            await supabase.storage.createBucket(FILE_BUCKET, { public: false, fileSizeLimit: 20 * 1024 * 1024 });
        }
    } catch (_) {}
}

async function getLegacyBrandingByEmail(email) {
    const key = `${LEGACY_BRANDING_PREFIX}${String(email || '').trim().toLowerCase()}`;
    const { data: row } = await supabase
        .from('email_templates')
        .select('name, body')
        .eq('name', key)
        .single();
    if (!row) return null;

    let parsed = {};
    try { parsed = JSON.parse(row.body || '{}'); } catch (_) { parsed = {}; }
    return normalizeBrandingPayload(parsed, { resellerEmail: email });
}

async function getBrandingByEmail(email, fallbackUser) {
    const target = String(email || '').trim().toLowerCase();
    const { data: row } = await supabase
        .from('reseller_branding')
        .select('*')
        .eq('reseller_email', target)
        .single();

    if (row) {
        return {
            rowId: row.reseller_email,
            email: target,
            branding: normalizeBrandingPayload({
                resellerEmail: row.reseller_email,
                company: row.company,
                logoUrl: row.logo_url,
                primaryColor: row.primary_color,
                secondaryColor: row.secondary_color,
                accentColor: row.accent_color,
                slug: row.slug,
                updatedAt: row.updated_at
            }, { resellerEmail: target })
        };
    }

    const legacy = await getLegacyBrandingByEmail(target);
    if (legacy) {
        await supabase.from('reseller_branding').upsert({
            reseller_email: target,
            company: legacy.company,
            logo_url: legacy.logoUrl,
            primary_color: legacy.primaryColor,
            secondary_color: legacy.secondaryColor,
            accent_color: legacy.accentColor,
            slug: legacy.slug || sanitizeSlug((fallbackUser?.company || fallbackUser?.name || '').replace(/\s+/g, '')),
            updated_at: new Date().toISOString()
        });
        return {
            rowId: target,
            email: target,
            branding: normalizeBrandingPayload(legacy, { resellerEmail: target })
        };
    }

    return {
        rowId: null,
        email: target,
        branding: normalizeBrandingPayload({}, defaultBrandingForUser(fallbackUser || { email: target }))
    };
}

async function saveBrandingByEmail(email, brandingInput, fallbackUser) {
    const target = String(email || '').trim().toLowerCase();
    const existing = await getBrandingByEmail(target, fallbackUser);
    const branding = normalizeBrandingPayload(brandingInput, existing.branding);

    await supabase.from('reseller_branding').upsert({
        reseller_email: target,
        company: branding.company,
        logo_url: branding.logoUrl,
        primary_color: branding.primaryColor,
        secondary_color: branding.secondaryColor,
        accent_color: branding.accentColor,
        slug: branding.slug,
        updated_at: new Date().toISOString()
    });

    return branding;
}

async function getBrandingBySlug(slug) {
    const target = sanitizeSlug(slug);
    if (!target) return null;
    const { data: row } = await supabase
        .from('reseller_branding')
        .select('*')
        .eq('slug', target)
        .single();
    if (!row) return null;
    return {
        rowId: row.reseller_email,
        email: row.reseller_email,
        branding: normalizeBrandingPayload({
            resellerEmail: row.reseller_email,
            company: row.company,
            logoUrl: row.logo_url,
            primaryColor: row.primary_color,
            secondaryColor: row.secondary_color,
            accentColor: row.accent_color,
            slug: row.slug,
            updatedAt: row.updated_at
        }, { resellerEmail: row.reseller_email })
    };
}

async function getBrandingBySlugWithFallback(slug) {
    const target = sanitizeSlug(slug);
    if (!target) return null;

    const fromTable = await getBrandingBySlug(target);
    if (fromTable) return fromTable;

    const { data: users } = await supabase
        .from('users')
        .select('email,name,company,type,status')
        .eq('type', 'reseller')
        .eq('status', 'active');

    const candidate = (users || []).find(u => {
        const base = String(u.company || u.name || '');
        const slugDash = sanitizeSlug(base);
        const slugCompact = sanitizeSlug(base.replace(/\s+/g, ''));
        return slugDash === target || slugCompact === target;
    });
    if (!candidate) return null;

    const defaultBrand = normalizeBrandingPayload({}, defaultBrandingForUser(candidate));
    const aliases = [
        sanitizeSlug(String(candidate.company || candidate.name || '')),
        sanitizeSlug(String(candidate.company || candidate.name || '').replace(/\s+/g, ''))
    ].filter(Boolean);
    const preferredSlug = aliases.includes(target) ? target : (aliases[0] || target);

    await supabase.from('reseller_branding').upsert({
        reseller_email: candidate.email,
        company: defaultBrand.company,
        logo_url: defaultBrand.logoUrl,
        primary_color: defaultBrand.primaryColor,
        secondary_color: defaultBrand.secondaryColor,
        accent_color: defaultBrand.accentColor,
        slug: preferredSlug,
        updated_at: new Date().toISOString()
    });

    return {
        rowId: candidate.email,
        email: candidate.email,
        branding: {
            ...defaultBrand,
            resellerEmail: candidate.email,
            slug: preferredSlug
        }
    };
}

// ── Auth middleware ────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect('/login');
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.type === 'admin') return next();
    res.redirect('/login');
}

function isSuperAdmin(user) {
    const superEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@aandelenxpress.nl').toLowerCase();
    return user?.is_super_admin === true || (user?.email || '').toLowerCase() === superEmail;
}

function requireSuperAdmin(req, res, next) {
    if (req.session?.user?.type === 'admin' && isSuperAdmin(req.session.user)) return next();
    res.status(403).json({ error: 'Alleen super admins hebben toegang' });
}

// ── Express middleware ─────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '25mb' }));
app.use(cookieSession({
    name: 'aax_session',
    keys: ['aandelenxpress-secret-key-2026'],
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
}));

// Redirect .html URLs to clean URLs (301 for SEO)
const protectedPages = ['admin-dashboard', 'reseller-dashboard', 'blog-admin', 'dossier-detail', 'partner-detail', 'dossier-status'];
app.get('/:page.html', (req, res, next) => {
    const page = req.params.page;
    if (page === 'vragenlijst-bv-holding-preview') {
        return res.redirect(302, '/vragenlijst-bv-holding?preview=1');
    }
    if (protectedPages.includes(page)) return next();
    if (page === 'index') return res.redirect(301, '/');
    return res.redirect(301, `/${page}`);
});

app.get('/vragenlijst-bv-holding-preview', (req, res) => {
    return res.redirect(302, '/vragenlijst-bv-holding?preview=1');
});

app.get('/vragenlijst-bv-oprichten', (req, res) => {
    const q = new URLSearchParams(req.query || {});
    if (!q.get('product')) q.set('product', 'bv');
    return res.redirect(302, '/vragenlijst-bv-holding?' + q.toString());
});

app.get('/vragenlijst-holding-oprichten', (req, res) => {
    const q = new URLSearchParams(req.query || {});
    if (!q.get('product')) q.set('product', 'holding');
    return res.redirect(302, '/vragenlijst-bv-holding?' + q.toString());
});

app.get('/vragenlijst-eenmanszaak-naar-bv', (req, res) => {
    const q = new URLSearchParams(req.query || {});
    if (!q.get('product')) q.set('product', 'eenmanszaak-omzetten');
    return res.redirect(302, '/vragenlijst-bv-holding?' + q.toString());
});

app.get('/vragenlijst-vof-naar-bv', (req, res) => {
    const q = new URLSearchParams(req.query || {});
    if (!q.get('product')) q.set('product', 'vof-naar-bv');
    return res.redirect(302, '/vragenlijst-bv-holding?' + q.toString());
});

app.get('/vragenlijst-eenmanszaak-naar-bv-holding', (req, res) => {
    const q = new URLSearchParams(req.query || {});
    if (!q.get('product')) q.set('product', 'eenmanszaak-omzetten-bv-holding');
    return res.redirect(302, '/vragenlijst-bv-holding?' + q.toString());
});

app.get('/vragenlijst-vof-naar-bv-holding', (req, res) => {
    const q = new URLSearchParams(req.query || {});
    if (!q.get('product')) q.set('product', 'vof-naar-bv-holding');
    return res.redirect(302, '/vragenlijst-bv-holding?' + q.toString());
});

// Static files
const publicPath = path.join(__dirname, 'public');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css'))              res.set('Content-Type', 'text/css; charset=utf-8');
        else if (filePath.endsWith('.js'))          res.set('Content-Type', 'application/javascript; charset=utf-8');
        else if (filePath.endsWith('.json'))        res.set('Content-Type', 'application/json');
        else if (filePath.endsWith('.svg'))         res.set('Content-Type', 'image/svg+xml');
        else if (filePath.endsWith('.avif'))        res.set('Content-Type', 'image/avif');
        else if (filePath.endsWith('.png'))         res.set('Content-Type', 'image/png');
        else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) res.set('Content-Type', 'image/jpeg');
        else if (filePath.endsWith('.gif'))         res.set('Content-Type', 'image/gif');
    },
    index: ['index.html']
}));

// ── Static pages ───────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/reset-password.html', (req, res) => res.redirect(301, '/reset-password'));
app.get('/privacybeleid', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacybeleid.html')));
app.get('/algemene-voorwaarden', (req, res) => res.sendFile(path.join(__dirname, 'public', 'algemene-voorwaarden.html')));
app.get('/klachtenprocedure', (req, res) => res.sendFile(path.join(__dirname, 'public', 'klachtenprocedure.html')));

// ── Diagnostic ─────────────────────────────────────────────────────────────
app.get('/_debug/info', (req, res) => {
    res.json({
        node_version: process.version,
        cwd:          process.cwd(),
        supabase_url: process.env.SUPABASE_URL ? '✓ set' : '✗ not set',
        supabase_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ not set',
        env:          process.env.NODE_ENV
    });
});

// ── Login / Auth ───────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email en wachtwoord vereist' });

    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    if (!user || user.password !== password) {
        const { data: pending } = await supabase.from('pending_resellers').select('email, intake_data').eq('email', email).single();
        if (pending && pending.intake_data?._status !== 'rejected') return res.status(401).json({ error: 'Uw aanmelding is ontvangen en wordt beoordeeld. U ontvangt bericht zodra uw account is goedgekeurd.' });
        if (pending && pending.intake_data?._status === 'rejected') return res.status(401).json({ error: 'Uw aanmelding is helaas niet goedgekeurd. Neem contact op met AandelenXpress voor meer informatie.' });
        return res.status(401).json({ error: 'Ongeldig e-mailadres of wachtwoord' });
    }
    if (user.status === 'inactive') return res.status(401).json({ error: 'Uw account is gedeactiveerd. Neem contact op met AandelenXpress.' });

    req.session.user = {
        email, name: user.name, company: user.company, type: user.type,
        permissions: user.permissions || null,
        isSuperAdmin: isSuperAdmin(user)
    };
    res.json({ success: true, redirect: user.type === 'admin' ? '/admin-dashboard' : '/reseller-dashboard' });
});

app.get('/api/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

// ── Password-reset helpers ─────────────────────────────────────────────────
const RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET || 'aandelenxpress-reset-2026';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateResetToken(email) {
    const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + RESET_TOKEN_TTL_MS })).toString('base64url');
    const sig = crypto.createHmac('sha256', RESET_TOKEN_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

function verifyResetToken(token) {
    try {
        const dot = token.lastIndexOf('.');
        if (dot < 1) return null;
        const payload = token.slice(0, dot);
        const sig     = token.slice(dot + 1);
        const expected = crypto.createHmac('sha256', RESET_TOKEN_SECRET).update(payload).digest('base64url');
        if (sig !== expected) return null;
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!data.email || !data.exp || Date.now() > data.exp) return null;
        return data.email;
    } catch { return null; }
}

app.post('/api/auth/forgot-password', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'E-mailadres vereist' });

    const { data: user } = await supabase.from('users').select('email,name').eq('email', email).maybeSingle();
    if (user) {
        const token    = generateResetToken(user.email);
        const base     = String(process.env.PUBLIC_BASE_URL || process.env.SITE_URL || 'https://aandelenxpress-v2.vercel.app').replace(/\/$/, '');
        const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
        await emails.sendPasswordResetEmail(user.email, user.name || user.email, resetUrl);
    }
    // Always success — prevent email enumeration
    res.json({ success: true });
});

app.post('/api/auth/reset-password-token', async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ error: 'Token en wachtwoord vereist' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'Wachtwoord min. 8 tekens' });

    const email = verifyResetToken(String(token));
    if (!email) return res.status(400).json({ error: 'Link is ongeldig of verlopen. Vraag een nieuwe aan.' });

    const { error } = await supabase.from('users').update({ password: newPassword }).eq('email', email);
    if (error) return res.status(500).json({ error: 'Fout bij opslaan. Probeer het opnieuw.' });
    res.json({ success: true });
});

app.get('/api/user', (req, res) => {
    if (req.session && req.session.user) {
        // Always recompute isSuperAdmin so old sessions (before the field was added) still work
        return res.json({ ...req.session.user, isSuperAdmin: isSuperAdmin(req.session.user) });
    }
    res.status(401).json({ error: 'Not logged in' });
});

// ── Registration ───────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    const { kantoor, kvk, naam, email, telefoon, password, password2, intake_data } = req.body;

    if (!kantoor || !kvk || !naam || !email || !telefoon || !password || !password2)
        return res.status(400).json({ error: 'Alle velden zijn verplicht' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Voer een geldig e-mailadres in' });
    if (password !== password2)
        return res.status(400).json({ error: 'Wachtwoorden komen niet overeen' });
    if (password.length < 8)
        return res.status(400).json({ error: 'Wachtwoord moet minimaal 8 tekens bevatten' });
    if (!/[A-Z]/.test(password))
        return res.status(400).json({ error: 'Wachtwoord moet minimaal één hoofdletter bevatten' });
    if (!/[0-9]/.test(password))
        return res.status(400).json({ error: 'Wachtwoord moet minimaal één cijfer bevatten' });

    const { data: existing } = await supabase.from('users').select('email').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Dit e-mailadres is al geregistreerd' });

    const { data: existingPending } = await supabase.from('pending_resellers').select('email, intake_data').eq('email', email).single();
    if (existingPending) {
        if (existingPending.intake_data?._status === 'rejected') {
            return res.status(409).json({ error: 'Dit e-mailadres is eerder afgewezen. Neem contact op met AandelenXpress.' });
        }
        return res.status(409).json({ error: 'Er staat al een aanmelding open voor dit e-mailadres' });
    }

    const row = { email, kantoor, kvk, naam, telefoon, password, aangemeld: new Date().toISOString() };
    if (intake_data && typeof intake_data === 'object') row.intake_data = intake_data;

    await supabase.from('pending_resellers').insert(row);
    emails.emailAdminNewRegistration({ name: naam, email, company: kantoor, phone: telefoon });
    emails.emailApplicantRegistrationReceived({ name: naam, email });
    res.json({ success: true });
});

// ── Admin: pending registrations ───────────────────────────────────────────
app.get('/api/admin/pending', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('pending_resellers').select('email, kantoor, kvk, naam, telefoon, aangemeld, intake_data').order('aangemeld', { ascending: false });
    // Exclude rejected records
    const pending = (data || []).filter(r => !r.intake_data?._status || r.intake_data._status !== 'rejected');
    res.json(pending);
});

app.get('/api/admin/rejected-resellers', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('pending_resellers').select('email, kantoor, kvk, naam, telefoon, aangemeld, intake_data').order('aangemeld', { ascending: false });
    const rejected = (data || []).filter(r => r.intake_data?._status === 'rejected');
    res.json(rejected);
});

app.post('/api/admin/approve', requireAdmin, async (req, res) => {
    const { email } = req.body;
    const { data: r } = await supabase.from('pending_resellers').select('*').eq('email', email).single();
    if (!r) return res.status(404).json({ error: 'Aanmelding niet gevonden' });

    await supabase.from('users').insert({
        email: r.email, password: r.password, type: 'reseller',
        name: r.naam, company: r.kantoor,
        company_id: 'reseller-' + Math.random().toString(36).substr(2, 9),
        status: 'active'
    });
    await supabase.from('pending_resellers').delete().eq('email', email);
    emails.emailResellerApproved({ name: r.naam, email: r.email });
    res.json({ success: true });
});

app.post('/api/admin/reject', requireAdmin, async (req, res) => {
    const { email } = req.body;
    const { data: r } = await supabase.from('pending_resellers').select('*').eq('email', email).single();
    if (!r) return res.status(404).json({ error: 'Aanmelding niet gevonden' });

    const updatedIntake = { ...(r.intake_data || {}), _status: 'rejected', _rejectedAt: new Date().toISOString(), _rejectionReason: req.body.reason || null };
    await supabase.from('pending_resellers').update({ intake_data: updatedIntake }).eq('email', email);
    emails.emailResellerRejected({ name: r.naam, email: r.email, reason: req.body.reason || null });
    res.json({ success: true });
});

// ── User Management ────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const type = req.query.type || 'all';
    let q = supabase.from('users').select('*');
    if (type !== 'all') q = q.eq('type', type);
    const { data } = await q;
    res.json((data || []).map(u => ({
        email: u.email, name: u.name, company: u.company,
        type: u.type, status: u.status, companyId: u.company_id,
        permissions: u.permissions || null,
        isSuperAdmin: isSuperAdmin(u)
    })));
});

app.put('/api/admin/users/:email/permissions', requireSuperAdmin, async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email ontbreekt' });
    if (isSuperAdmin({ email })) return res.status(403).json({ error: 'Kan rechten van super admin niet wijzigen' });
    const { permissions } = req.body; // null = full access, { pages:[...], statusChanges:[...] } = restricted
    const { error } = await supabase.from('users').update({ permissions: permissions ?? null }).eq('email', email).eq('type', 'admin');
    if (error) return res.status(500).json({ error: 'Opslaan mislukt. Voeg de kolom "permissions" (JSONB) toe aan de users-tabel in Supabase.' });
    res.json({ success: true });
});

app.post('/api/admin/users/add', requireAdmin, async (req, res) => {
    const { email, name, password, permissions } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'Alle velden verplicht' });
    const { error } = await supabase.from('users').insert({
        email, name, password, type: 'admin',
        company: 'AandelenXpress',
        company_id: 'aax-admin-' + Math.random().toString(36).substr(2, 5),
        status: 'active',
        permissions: permissions ?? null
    });
    if (error) return res.status(409).json({ error: 'Email bestaat al' });
    res.json({ success: true });
});

app.post('/api/admin/users/reset-password', requireAdmin, async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ error: 'Email en wachtwoord verplicht' });
    await supabase.from('users').update({ password: newPassword }).eq('email', email);
    res.json({ success: true });
});

app.post('/api/admin/users/toggle-status', requireAdmin, async (req, res) => {
    const { email } = req.body;
    const { data: user } = await supabase.from('users').select('status').eq('email', email).single();
    if (!user) return res.status(404).json({ error: 'User niet gevonden' });
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    await supabase.from('users').update({ status: newStatus }).eq('email', email);
    res.json({ success: true, status: newStatus });
});

app.post('/api/admin/users/delete', requireAdmin, async (req, res) => {
    const { email } = req.body;
    if (email === 'admin@aandelenxpress.nl') return res.status(403).json({ error: 'Kan hoofdadmin niet verwijderen' });
    await supabase.from('users').delete().eq('email', email);
    res.json({ success: true });
});

app.get('/api/reseller-branding/:email', requireLogin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email ontbreekt' });
    if (req.session.user.type !== 'admin' && req.session.user.email !== email) {
        return res.status(403).json({ error: 'Geen toegang' });
    }

    const { data: user } = await supabase.from('users').select('email,name,company,type').eq('email', email).single();
    if (!user || user.type !== 'reseller') return res.status(404).json({ error: 'Reseller niet gevonden' });

    const record = await getBrandingByEmail(email, user);
    res.json(record.branding);
});

app.put('/api/reseller-branding/:email', requireLogin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email ontbreekt' });
    if (req.session.user.type !== 'admin' && req.session.user.email !== email) {
        return res.status(403).json({ error: 'Geen toegang' });
    }

    const { data: user } = await supabase.from('users').select('email,name,company,type').eq('email', email).single();
    if (!user || user.type !== 'reseller') return res.status(404).json({ error: 'Reseller niet gevonden' });

    const incoming = req.body || {};
    const slug = sanitizeSlug(incoming.slug || '');
    if (!slug) return res.status(400).json({ error: 'Slug is verplicht' });

    const { data: duplicateRow } = await supabase
        .from('reseller_branding')
        .select('reseller_email, slug')
        .eq('slug', slug)
        .neq('reseller_email', email)
        .single();
    const duplicate = !!duplicateRow;
    if (duplicate) return res.status(409).json({ error: 'Deze URL-slug is al in gebruik' });

    const saved = await saveBrandingByEmail(email, incoming, user);
    res.json(saved);
});

app.post('/api/reseller-branding/:email/logo', requireLogin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email ontbreekt' });
    if (req.session.user.type !== 'admin' && req.session.user.email !== email) {
        return res.status(403).json({ error: 'Geen toegang' });
    }

    const { data: user } = await supabase.from('users').select('email,name,company,type').eq('email', email).single();
    if (!user || user.type !== 'reseller') return res.status(404).json({ error: 'Reseller niet gevonden' });

    const body = req.body || {};
    const fileNameRaw = String(body.fileName || body.filename || 'logo.png');
    const mimeType = String(body.mimeType || body.contentType || 'image/png').toLowerCase();
    const dataRaw = String(body.base64Data || body.data || '');
    const matches = /^data:([^;]+);base64,(.*)$/i.exec(dataRaw);
    const base64Part = matches ? matches[2] : dataRaw;

    if (!base64Part) return res.status(400).json({ error: 'Bestand ontbreekt' });
    if (!/^image\//.test(mimeType)) return res.status(400).json({ error: 'Alleen afbeelding-bestanden zijn toegestaan' });

    let fileBuffer;
    try {
        fileBuffer = Buffer.from(base64Part, 'base64');
    } catch (_) {
        return res.status(400).json({ error: 'Bestand kon niet worden verwerkt' });
    }

    if (!fileBuffer.length) return res.status(400).json({ error: 'Leeg bestand' });
    if (fileBuffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Bestand is te groot (max 5MB)' });

    const ext = mimeType.includes('jpeg') ? 'jpg'
        : mimeType.includes('svg') ? 'svg'
        : mimeType.includes('webp') ? 'webp'
        : mimeType.includes('gif') ? 'gif'
        : 'png';
    const safeBase = fileNameRaw.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'logo';
    const objectPath = `logos/${email}/${Date.now()}-${safeBase}.${ext}`;

    await ensureBrandingBucket();
    const { error: uploadError } = await supabase.storage
        .from(BRANDING_BUCKET)
        .upload(objectPath, fileBuffer, { contentType: mimeType, upsert: true });
    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: publicData } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(objectPath);
    const logoUrl = publicData?.publicUrl || '';

    const current = await getBrandingByEmail(email, user);
    const saved = await saveBrandingByEmail(email, {
        ...current.branding,
        logoUrl,
        slug: current.branding.slug || sanitizeSlug((user.company || user.name || '').replace(/\s+/g, ''))
    }, user);

    res.json({ success: true, logoUrl: saved.logoUrl, branding: saved });
});

app.get('/api/whitelabel/:slug', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const slug = sanitizeSlug(req.params.slug);
    const brandRecord = await getBrandingBySlugWithFallback(slug);
    if (!brandRecord) return res.status(404).json({ error: 'Pagina niet gevonden' });

    const { data: user } = await supabase.from('users').select('email,name,company,type,status').eq('email', brandRecord.email).single();
    if (!user || user.type !== 'reseller' || user.status === 'inactive') return res.status(404).json({ error: 'Pagina niet beschikbaar' });

    res.json({
        reseller: {
            email: user.email,
            name: user.name,
            company: user.company
        },
        branding: brandRecord.branding
    });
});

app.post('/api/whitelabel/:slug/request', async (req, res) => {
    const slug = sanitizeSlug(req.params.slug);
    const brandRecord = await getBrandingBySlugWithFallback(slug);
    if (!brandRecord) return res.status(404).json({ error: 'Pagina niet gevonden' });

    const { data: reseller } = await supabase.from('users').select('*').eq('email', brandRecord.email).single();
    if (!reseller || reseller.type !== 'reseller' || reseller.status === 'inactive') {
        return res.status(404).json({ error: 'Partner niet beschikbaar' });
    }

    const { clientName, clientEmail, clientPhone, oprichtingType, gewenstNaam, doel, aandeelhouders, kapitaal, startSaldo, opmerkingen, pricing } = req.body || {};
    if (!clientName || !clientEmail || !oprichtingType || !gewenstNaam || !doel) {
        return res.status(400).json({ error: 'Verplichte velden ontbreken' });
    }

    const request = {
        id:              generateDossierNr(),
        resellerId:      reseller.email,
        resellerName:    reseller.name,
        resellerCompany: reseller.company || 'Partner',
        accessToken:     null,
        clientName,
        clientEmail,
        clientPhone:     clientPhone || '',
        oprichtingType,
        gewenstNaam,
        doel,
        aandeelhouders:  aandeelhouders || 1,
        kapitaal:        kapitaal || 0.01,
        startSaldo:      startSaldo || 0,
        opmerkingen:     opmerkingen || '',
        pricing:         pricing || null,
        status:          'pending',
        createdAt:       new Date().toISOString(),
        approvedAt: null, approvedBy: null, rejectionReason: null,
        statusUpdatedAt: null, activities: []
    };

    request.accessToken = generateSmartToken(request);
    addActivity(request, 'system', `Aanvraag ingediend via whitelabel pagina /${slug}`, null);

    const { error } = await supabase.from('reseller_requests').insert(reqToRow(request));
    if (error) return res.status(500).json({ error: error.message });

    emails.emailAdminNewRequest({ request });
    emails.emailClientNewRequest({ request });
    res.status(201).json({ success: true, dossierNr: request.id });
});

app.get('/api/admin/admins', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('users').select('email, name').eq('type', 'admin');
    res.json(data || []);
});

// ── Dossier Assignments ────────────────────────────────────────────────────
app.get('/api/dossier-assignments', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('dossier_assignments').select('*');
    const map = {};
    (data || []).forEach(a => { map[a.dossier_nr] = a.admin_name; });
    res.json(map);
});

app.patch('/api/dossier-assignments/:nr', requireAdmin, async (req, res) => {
    const { nr } = req.params;
    const { adminName } = req.body;
    if (adminName === undefined) return res.status(400).json({ error: 'adminName vereist' });

    if (!adminName) {
        await supabase.from('dossier_assignments').delete().eq('dossier_nr', nr);
    } else {
        await supabase.from('dossier_assignments').upsert({ dossier_nr: nr, admin_name: adminName });
    }

    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', nr).single();
    if (row) {
        const request = rowToReq(row);
        const actor = req.session.user.name || req.session.user.email;
        const msg = adminName ? `Dossier toegewezen aan ${adminName} door ${actor}` : `Toewijzing verwijderd door ${actor}`;
        addActivity(request, 'system', msg, null);
        await supabase.from('reseller_requests').update({ activities: request.activities }).eq('id', nr);
    }
    res.json({ success: true, nr, assignedTo: adminName || null });
});

// ── Reseller Requests ──────────────────────────────────────────────────────
app.post('/api/reseller-requests', requireLogin, async (req, res) => {
    const { clientName, clientEmail, clientPhone, oprichtingType, gewenstNaam, doel, aandeelhouders, kapitaal, startSaldo, opmerkingen, pricing } = req.body;

    if (!clientName || !clientEmail || !oprichtingType || !gewenstNaam || !doel)
        return res.status(400).json({ error: 'Verplichte velden ontbreken' });

    let resellerUser = req.session.user;
    let resellerId   = req.session.user.email;

    if (req.session.user.type === 'admin' && req.body.onBehalfOf) {
        const { data: onBehalf } = await supabase.from('users').select('*').eq('email', req.body.onBehalfOf).single();
        if (onBehalf) { resellerUser = onBehalf; resellerId = req.body.onBehalfOf; }
    }

    const request = {
        id:              generateDossierNr(),
        resellerId,
        resellerName:    resellerUser.name,
        resellerCompany: resellerUser.company || 'AandelenXpress',
        accessToken:     null,
        clientName, clientEmail,
        clientPhone:     clientPhone || '',
        oprichtingType, gewenstNaam, doel,
        aandeelhouders:  aandeelhouders || 1,
        kapitaal:        kapitaal || 0.01,
        startSaldo:      startSaldo || 0,
        opmerkingen:     opmerkingen || '',
        pricing:         pricing || null,
        status:          'pending',
        createdAt:       new Date().toISOString(),
        approvedAt: null, approvedBy: null, rejectionReason: null,
        activities: []
    };
    request.accessToken = generateSmartToken(request);
    addActivity(request, 'system', `Dossier aangemaakt door ${resellerUser.name || resellerId}`, null);

    const { error } = await supabase.from('reseller_requests').insert(reqToRow(request));
    if (error) return res.status(500).json({ error: error.message });

    emails.emailAdminNewRequest({ request });
    res.status(201).json(request);
});

app.get('/api/my-requests', requireLogin, async (req, res) => {
    const { data } = await supabase
        .from('reseller_requests').select('*')
        .eq('reseller_id', req.session.user.email)
        .order('created_at', { ascending: false });
    res.json((data || []).map(rowToReq).filter(request => !request.trashedAt));
});

app.get('/api/reseller-requests', requireAdmin, async (req, res) => {
    const status = req.query.status || 'pending';
    let q = supabase.from('reseller_requests').select('*').order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ supabase_error: error.message, code: error.code, hint: error.hint });
    const requests = (data || []).map(rowToReq);
    res.json(status === 'all' ? requests : requests.filter(request => !request.trashedAt));
});

// Public dossier status (token-protected)
app.get('/api/dossier-status/:id', async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });
    if (isDossierTrashed(row)) return res.status(404).json({ error: 'Dossier niet gevonden' });
    const { token } = req.query;
    if (!tokenMatches(row.access_token, token)) return res.status(401).json({ error: 'Ongeldig wachtwoord' });
    const typeMap = {
        'bv':'B.V.',
        'bv-holding':'B.V. + Holding',
        'holding':'Holding',
        'bv-spoed':'B.V. (spoed)',
        'eenmanszaak-omzetten':'Eenmanszaak naar B.V.',
        'vof-naar-bv':'VOF naar B.V.',
        'eenmanszaak-omzetten-bv-holding':'Eenmanszaak naar B.V. + Holding',
        'vof-naar-bv-holding':'VOF naar B.V. + Holding',
        'advies':'Advies'
    };
    const statusMap = {
        'pending':             { key:'pending',             text:'Aanvraag ingediend' },
        'approved':            { key:'vragenlijst',         text:'Vragenlijst' },
        'vragenlijst':         { key:'vragenlijst',         text:'Vragenlijst' },
        'wwft':                { key:'wwft',                text:'WWFT Check' },
        'betaling':            { key:'betaling',             text:'Betaling' },
        'ocr':                 { key:'ocr',                 text:'OCR' },
        'ocr-signed':          { key:'ocr-signed',          text:'OCR Signed' },
        'draft-accountant':    { key:'draft-accountant',    text:'Draft to Accountant' },
        'accountant-accepted': { key:'accountant-accepted', text:'Accountant accepted' },
        'draft-client':        { key:'draft-client',        text:'Draft to Client' },
        'client-signed':       { key:'client-signed',       text:'Client Signed' },
        'invitation-om':       { key:'invitation-om',       text:'Invitation OM' },
        'executed-notaris':    { key:'executed-notaris',    text:'Executed Notaris' },
        'kvk':                 { key:'kvk',                 text:'KvK inschrijving' },
        'passed-kvk':          { key:'passed-kvk',          text:'Passed by KvK' },
        'making-binders':      { key:'making-binders',      text:'Making Closing Binders' },
        'upload-binders':      { key:'upload-binders',      text:'Upload Closing Binders' },
        'complete':            { key:'complete',            text:'Case completed' },
        'complete-review':     { key:'complete-review',     text:'Case completed review' },
        'rejected':            { key:'rejected',            text:'Afgewezen' },
    };
    const s = statusMap[row.status] || { key: 'pending', text: 'In behandeling' };
    const brandRecord = await getBrandingByEmail(row.reseller_id, { email: row.reseller_id, company: row.reseller_company || '' });
    res.json({
        id: row.id,
        name: row.gewenst_naam || row.client_name,
        type: typeMap[row.oprichting_type] || row.oprichting_type || '-',
        partner: row.reseller_company || '-',
        statusKey: s.key,
        statusText: s.text,
        date: row.created_at,
        branding: brandRecord.branding,
        activities: row.activities || []
    });
});

app.post('/api/dossier-status/:id/resend-token', async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });
    if (!row.client_email) return res.status(400).json({ error: 'Geen e-mailadres bekend bij dit dossier' });
    if (!row.access_token) return res.status(400).json({ error: 'Geen toegangscode beschikbaar' });
    try {
        await emails.emailClientResendToken({ request: rowToReq(row) });
        const parts = row.client_email.split('@');
        res.json({ success: true, maskedEmail: parts[0].slice(0,2) + '***@' + parts[1] });
    } catch(e) { res.status(500).json({ error: 'Fout bij verzenden: ' + e.message }); }
});

app.get('/api/reseller-requests/:id', requireLogin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });
    if (req.session.user.type !== 'admin' && row.reseller_id !== req.session.user.email)
        return res.status(403).json({ error: 'Geen toegang' });
    if (req.session.user.type !== 'admin' && isDossierTrashed(row))
        return res.status(404).json({ error: 'Niet gevonden' });
    res.json(rowToReq(row));
});

app.patch('/api/reseller-requests/:id/details', requireLogin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });
    if (req.session.user.type !== 'admin' && row.reseller_id !== req.session.user.email)
        return res.status(403).json({ error: 'Geen toegang' });
    if (req.session.user.type !== 'admin' && isDossierTrashed(row))
        return res.status(404).json({ error: 'Niet gevonden' });

    const {
        clientName,
        clientEmail,
        clientPhone,
        pricing
    } = req.body || {};

    const hasClientChanges = clientName !== undefined || clientEmail !== undefined || clientPhone !== undefined;
    const hasPricingChanges = pricing !== undefined;
    if (!hasClientChanges && !hasPricingChanges)
        return res.status(400).json({ error: 'Geen wijzigingen opgegeven' });

    const request = rowToReq(row);

    if (clientName !== undefined) {
        if (!String(clientName).trim()) return res.status(400).json({ error: 'Bedrijfsnaam is verplicht' });
        request.clientName = String(clientName).trim();
    }
    if (clientEmail !== undefined) {
        const email = String(clientEmail).trim();
        if (!email) return res.status(400).json({ error: 'E-mailadres is verplicht' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ongeldig e-mailadres' });
        request.clientEmail = email;
    }
    if (clientPhone !== undefined) {
        request.clientPhone = String(clientPhone || '').trim();
    }

    if (hasPricingChanges) {
        if (!pricing || typeof pricing !== 'object') return res.status(400).json({ error: 'Ongeldige prijsopbouw' });
        if (!pricing.base || typeof pricing.base !== 'object') return res.status(400).json({ error: 'Basisregel ontbreekt' });
        const baseAmount = Number(pricing.base.amount || 0);
        if (!Number.isFinite(baseAmount) || baseAmount < 0) return res.status(400).json({ error: 'Ongeldig basisbedrag' });

        const extrasIn = Array.isArray(pricing.extras) ? pricing.extras : [];
        const extras = extrasIn.map(x => ({
            code: x.code || '',
            label: String(x.label || '').trim(),
            amount: Number(x.amount || 0)
        })).filter(x => x.label && Number.isFinite(x.amount) && x.amount >= 0);

        const normalizedBase = {
            code: pricing.base.code || '',
            label: String(pricing.base.label || '').trim(),
            amount: baseAmount
        };
        if (!normalizedBase.label) return res.status(400).json({ error: 'Basistitel ontbreekt' });

        const total = [normalizedBase, ...extras].reduce((sum, x) => sum + Number(x.amount || 0), 0);
        request.pricing = { base: normalizedBase, extras, total };
    }

    const actor = req.session.user.name || req.session.user.email;
    if (hasClientChanges && hasPricingChanges) {
        addActivity(request, 'system', `Klantgegevens en prijsopbouw aangepast door ${actor}`, actor);
    } else if (hasClientChanges) {
        addActivity(request, 'system', `Klantgegevens aangepast door ${actor}`, actor);
    } else if (hasPricingChanges) {
        addActivity(request, 'system', `Prijsopbouw aangepast door ${actor}`, actor);
    }

    const rowUpdate = reqToRow(request);
    const { error } = await supabase.from('reseller_requests').update({
        client_name: rowUpdate.client_name,
        client_email: rowUpdate.client_email,
        client_phone: rowUpdate.client_phone,
        opmerkingen: rowUpdate.opmerkingen,
        activities: rowUpdate.activities
    }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });

    res.json(request);
});

app.patch('/api/reseller-requests/:id/approve', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Aanvraag niet gevonden' });

    const request = rowToReq(row);
    request.status     = 'vragenlijst';
    request.approvedAt = new Date().toISOString();
    request.approvedBy = req.session.user.email;
    const approver = req.session.user.name || req.session.user.email;

    // Ensure access token exists — generate and save if missing
    if (!request.accessToken) {
        request.accessToken = generateSmartToken(request);
    }

    addActivity(request, 'system', `Dossier goedgekeurd door ${approver}. Vragenlijst email verstuurd naar ${request.clientEmail}.`, approver);

    await supabase.from('reseller_requests').update({
        status: request.status, approved_at: request.approvedAt,
        approved_by: request.approvedBy, activities: request.activities,
        access_token: request.accessToken
    }).eq('id', req.params.id);

    emails.emailResellerRequestApproved({ request });
    emails.emailClientCaseApproved({ request });
    res.json(request);
});

app.patch('/api/reseller-requests/:id/token', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });
    const newToken = (req.body && req.body.token) || generateSmartToken(rowToReq(row));
    await supabase.from('reseller_requests').update({ access_token: newToken }).eq('id', req.params.id);
    res.json({ accessToken: newToken });
});

app.patch('/api/reseller-requests/:id/status', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const valid = ['pending','vragenlijst','wwft','betaling','ocr','ocr-signed','draft-accountant','accountant-accepted','draft-client','client-signed','invitation-om','executed-notaris','kvk','passed-kvk','making-binders','upload-binders','complete','complete-review','rejected','approved'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Ongeldige status' });
    // Check status-change permissions for non-super-admins
    const actor = req.session.user;
    if (!isSuperAdmin(actor) && actor.permissions?.statusChanges && !actor.permissions.statusChanges.includes(status)) {
        return res.status(403).json({ error: 'U heeft geen toestemming om naar deze status te wijzigen' });
    }

    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });

    const request = rowToReq(row);
    const statusLabels = { pending:'Aanvraag ingediend', vragenlijst:'Vragenlijst', approved:'Vragenlijst', wwft:'WWFT Check', betaling:'Betaling', ocr:'OCR', 'ocr-signed':'OCR Signed', 'draft-accountant':'Draft to Accountant', 'accountant-accepted':'Accountant accepted', 'draft-client':'Draft to Client', 'client-signed':'Client Signed', 'invitation-om':'Invitation OM', 'executed-notaris':'Executed Notaris', kvk:'KvK inschrijving', 'passed-kvk':'Passed by KvK', 'making-binders':'Making Closing Binders', 'upload-binders':'Upload Closing Binders', complete:'Case completed', 'complete-review':'Case completed review', rejected:'Afgewezen' };
    const adminName = req.session.user.name || req.session.user.email;
    addActivity(request, 'system', `Status gewijzigd van "${statusLabels[request.status]||request.status}" naar "${statusLabels[status]||status}" door ${adminName}`, null);

    await supabase.from('reseller_requests').update({
        status, status_updated_at: new Date().toISOString(), activities: request.activities
    }).eq('id', id);

    res.json({ success: true, status });
});

app.patch('/api/reseller-requests/:id/reject', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Aanvraag niet gevonden' });

    await supabase.from('reseller_requests').update({
        status: 'rejected', rejection_reason: req.body.reason || 'Aanvraag afgewezen'
    }).eq('id', req.params.id);

    const request = rowToReq(row);
    request.status = 'rejected';
    request.rejectionReason = req.body.reason || 'Aanvraag afgewezen';
    emails.emailResellerRequestRejected({ request });
    res.json(request);
});

app.patch('/api/reseller-requests/:id/archive', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });

    const request = rowToReq(row);
    const actor = req.session.user.name || req.session.user.email;
    addActivity(request, 'archived', `Dossier gearchiveerd door ${actor}`, actor);

    const { error } = await supabase.from('reseller_requests').update({ activities: request.activities }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(request);
});

app.patch('/api/reseller-requests/:id/unarchive', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });

    const request = rowToReq(row);
    const actor = req.session.user.name || req.session.user.email;
    addActivity(request, 'unarchived', `Dossier uit archief gehaald door ${actor}`, actor);

    const { error } = await supabase.from('reseller_requests').update({ activities: request.activities }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(request);
});

app.patch('/api/reseller-requests/:id/trash', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });

    const request = rowToReq(row);
    const actor = req.session.user.name || req.session.user.email;
    addActivity(request, 'trashed', `Dossier verplaatst naar prullenbak door ${actor}`, actor);

    const { error } = await supabase.from('reseller_requests').update({ activities: request.activities }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(request);
});

app.delete('/api/reseller-requests/:id', requireAdmin, async (req, res) => {
    const { error } = await supabase.from('reseller_requests').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ── Prullenbak: export + bulk delete ──────────────────────────────────────
app.post('/api/admin/trash/export', requireAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
        return res.status(400).json({ error: 'Geen IDs opgegeven' });

    const { data: dossiers, error: e1 } = await supabase
        .from('reseller_requests').select('*').in('id', ids);
    if (e1) return res.status(500).json({ error: e1.message });

    const { data: vragenlijsten, error: e2 } = await supabase
        .from('vragenlijsten').select('*').in('case_id', ids);
    if (e2) return res.status(500).json({ error: e2.message });

    const vMap = {};
    (vragenlijsten || []).forEach(v => { vMap[v.case_id] = v; });

    res.json((dossiers || []).filter(isDossierTrashed).map(d => ({
        dossier: d,
        vragenlijst: vMap[d.id] || null
    })));
});

app.delete('/api/admin/trash/empty', requireAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
        return res.status(400).json({ error: 'Geen IDs opgegeven' });

    const { error: e1 } = await supabase.from('vragenlijsten').delete().in('case_id', ids);
    if (e1) return res.status(500).json({ error: e1.message });

    const { error: e2 } = await supabase.from('reseller_requests').delete().in('id', ids);
    if (e2) return res.status(500).json({ error: e2.message });

    res.json({ success: true, deleted: ids.length });
});

app.get('/api/reseller-requests/:id/activities', requireLogin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('id, reseller_id, activities').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });
    if (req.session.user.type !== 'admin' && row.reseller_id !== req.session.user.email)
        return res.status(403).json({ error: 'Geen toegang' });
    const activities = row.activities || [];
    const isAdmin = req.session.user.type === 'admin';
    res.json(isAdmin ? activities : activities.filter(a => a.type !== 'comment'));
});

app.post('/api/reseller-requests/:id/activities', requireAdmin, async (req, res) => {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Bericht is verplicht' });

    const { data: row } = await supabase.from('reseller_requests').select('activities').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });

    const adminName = req.session.user.name || req.session.user.email;
    const entry = { id: Date.now() + Math.random(), type: 'comment', message: message.trim(), author: adminName, timestamp: new Date().toISOString() };
    await supabase.from('reseller_requests').update({ activities: [...(row.activities || []), entry] }).eq('id', req.params.id);
    res.json(entry);
});

// ── Email templates ────────────────────────────────────────────────────────
app.post('/api/email-send', requireAdmin, async (req, res) => {
    const { to, subject, body, bodyHtml, attachment } = req.body;
    if (!to || !subject || (!body && !bodyHtml)) return res.status(400).json({ error: 'to, subject en body zijn verplicht' });
    try {
        await emails.emailCustom({ to, subject, body, bodyHtml, attachment });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: 'Fout bij verzenden: ' + e.message }); }
});

app.get('/api/email-templates', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('email_templates').select('*').order('created_at', { ascending: true });
    res.json((data || []).map(t => ({ ...t, createdAt: t.created_at })));
});

app.post('/api/email-templates', requireAdmin, async (req, res) => {
    const { name, subject, body } = req.body;
    if (!name || !subject || !body) return res.status(400).json({ error: 'name, subject en body zijn verplicht' });
    const { data: idData } = await supabase.rpc('next_template_id');
    const template = { id: idData, name, subject, body, created_at: new Date().toISOString() };
    await supabase.from('email_templates').insert(template);
    res.json({ ...template, createdAt: template.created_at });
});

app.delete('/api/email-templates/:id', requireAdmin, async (req, res) => {
    await supabase.from('email_templates').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// ── Vragenlijsten ──────────────────────────────────────────────────────────
function extractVragenlijstFileMeta(formData, keyBase) {
    const fileObj = formData?.[keyBase];
    const legacyName = formData?.[`${keyBase}Naam`];
    const legacyData = formData?.[`${keyBase}Data`];
    const objectName = fileObj && typeof fileObj === 'object'
        ? (fileObj.naam || fileObj.filename || fileObj.name || '')
        : '';
    const hasObjectData = !!(fileObj && typeof fileObj === 'object' && (fileObj.data || fileObj.content));

    return {
        name: legacyName || objectName || '',
        hasData: !!legacyData || hasObjectData
    };
}

function normalizeVragenlijstForAdmin(row) {
    const baseData = { ...(row?.data || {}) };
    const datacard = extractVragenlijstFileMeta(baseData, 'datacardBestand');
    const pep = extractVragenlijstFileMeta(baseData, 'pepBestand');
    const generatedPdf = extractVragenlijstFileMeta(baseData, 'oprichtingsDocument');

    // Never expose raw base64 blobs in admin list/detail payloads.
    delete baseData.datacardBestandData;
    delete baseData.pepBestandData;
    if (baseData.datacardBestand && typeof baseData.datacardBestand === 'object') {
        const { data, content, ...safe } = baseData.datacardBestand;
        baseData.datacardBestand = safe;
    }
    if (baseData.pepBestand && typeof baseData.pepBestand === 'object') {
        const { data, content, ...safe } = baseData.pepBestand;
        baseData.pepBestand = safe;
    }
    if (baseData.oprichtingsDocument && typeof baseData.oprichtingsDocument === 'object') {
        const { data, content, ...safe } = baseData.oprichtingsDocument;
        baseData.oprichtingsDocument = safe;
    }

    if (!baseData.gewenstNaam) baseData.gewenstNaam = baseData.bvNaam || '';
    if (!baseData.contactEmail) baseData.contactEmail = baseData.bvEmail || baseData.clientEmail || '';
    if (!baseData.typeOprichting) baseData.typeOprichting = baseData.oprichtingType || baseData.formulierType || '';

    return {
        caseId: row.case_id,
        submittedAt: row.submitted_at,
        ...baseData,
        datacardBestandNaam: datacard.name || baseData.datacardBestandNaam || '',
        pepBestandNaam: pep.name || baseData.pepBestandNaam || '',
        oprichtingsDocumentNaam: generatedPdf.name || baseData.oprichtingsDocumentNaam || '',
        datacardIngediend: !!(datacard.name || datacard.hasData),
        pepIngediend: !!(pep.name || pep.hasData),
        oprichtingsDocumentIngediend: !!(generatedPdf.name || generatedPdf.hasData)
    };
}

function getStoredVragenlijstFile(formData, keyBase, index = 0) {
    const key = String(keyBase || '');
    const pluralFallback = key.endsWith('en') ? key.slice(0, -2) : key;
    const candidates = [key, pluralFallback].filter(Boolean);

    let value = null;
    for (const candidate of candidates) {
        if (formData?.[candidate] !== undefined) {
            value = formData[candidate];
            break;
        }
    }

    const idx = Number.isFinite(Number(index)) ? Math.max(0, Number(index)) : 0;
    const selected = Array.isArray(value) ? (value[idx] || value[0] || null) : value;

    const legacyName = candidates.map(candidate => formData?.[`${candidate}Naam`]).find(Boolean) || '';
    const legacyData = candidates.map(candidate => formData?.[`${candidate}Data`]).find(Boolean) || '';

    let name = legacyName;
    let rawData = legacyData;

    if (selected && typeof selected === 'object') {
        name = name || selected.naam || selected.filename || selected.name || '';
        rawData = rawData || selected.data || selected.content || selected.base64 || '';
    } else if (typeof selected === 'string') {
        rawData = rawData || selected;
    }

    if (!rawData) return null;

    const str = String(rawData);
    const m = /^data:([^;]+);base64,(.*)$/i.exec(str);
    if (m) {
        return { name, mime: m[1] || 'application/octet-stream', base64: m[2] || '' };
    }

    return { name, mime: 'application/octet-stream', base64: str };
}

function listStoredVragenlijstFiles(formData, caseId) {
    const keys = [
        { kind: 'datacard', key: 'datacardBestanden' },
        { kind: 'pep', key: 'pepBestanden' },
        { kind: 'personeelsplan', key: 'personeelsplannen' },
        { kind: 'holding-huurovereenkomst', key: 'holdingHuurovereenkomst' },
        { kind: 'werkmij-huurovereenkomst', key: 'werkmijHuurovereenkomst' },
        { kind: 'kvk-uittreksel', key: 'omzettingKvkUittreksel' },
        { kind: 'verzendbewijs-intentie', key: 'omzettingVerzendbewijsIntentie' },
        { kind: 'ontvangst-intentie', key: 'omzettingOntvangstbewijsIntentie' },
        { kind: 'intentverklaring', key: 'omzettingIntentieverklaring' },
        { kind: 'geleideformulier', key: 'omzettingGeleideformulier' },
        { kind: 'inbrengbeschrijving', key: 'omzettingInbrengbeschrijving' },
        { kind: 'inbrengbeschrijving-holding', key: 'omzettingInbrengbeschrijvingHolding' },
        { kind: 'inbrengbeschrijving-werkmij', key: 'omzettingInbrengbeschrijvingWerkmij' },
        { kind: 'ubo-uittreksel', key: 'omzettingVofUboUittreksel' },
        { kind: 'oprichtingsdocument', key: 'oprichtingsDocument' }
    ];

    const entries = [];
    keys.forEach(({ kind, key }) => {
        const value = formData?.[key];
        const total = Array.isArray(value) ? value.length : (value ? 1 : 0);
        for (let i = 0; i < total; i += 1) {
            const file = getStoredVragenlijstFile(formData, key, i);
            if (!file || !file.base64) continue;
            const safeCaseId = encodeURIComponent(String(caseId || ''));
            const safeKind = encodeURIComponent(kind);
            const idx = Array.isArray(value) ? i : 0;
            entries.push({
                kind,
                key,
                index: idx,
                name: file.name || `${kind}-${idx + 1}.${extFromMime(file.mime)}`,
                mime: file.mime || 'application/octet-stream',
                openUrl: `/api/vragenlijsten/${safeCaseId}/files/${safeKind}?index=${idx}`,
                downloadUrl: `/api/vragenlijsten/${safeCaseId}/files/${safeKind}?index=${idx}&download=1`
            });
        }
    });
    return entries;
}

function extFromMime(mime) {
    const map = {
        'application/pdf': 'pdf',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };
    return map[String(mime || '').toLowerCase()] || 'bin';
}

function pdfLabelForKey(key) {
    const map = {
        clientName: 'Naam contactpersoon',
        clientEmail: 'E-mailadres',
        clientPhone: 'Telefoonnummer',
        gewenstNaam: 'Gewenste bedrijfsnaam',
        oprichtingType: 'Type oprichting',
        doel: 'Doel van de vennootschap',
        aandeelhouders: 'Aantal aandeelhouders',
        kapitaal: 'Startkapitaal',
        startSaldo: 'Startsaldo',
        resellerCompany: 'Partner',
        spoed: 'Spoedaanvraag',
        nederlandsTaal: 'Nederlandse documenten',
        engelsTaal: 'Engelse documenten'
    };
    if (map[key]) return map[key];
    return String(key || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^./, s => s.toUpperCase());
}

function pdfSectionTitleFromKey(key) {
        const map = {
                requestType: 'Tab 1 · Aanvraagtype',
                holding: 'Tab 2 · Oprichting document (Holding)',
                werkmij: 'Tab 3 · Oprichting document (Werkmij)',
                naturalPersons: 'Tab 4 · Natuurlijke personen',
                rechtspersonen: 'Tab 5 · Rechtspersonen',
                omzetting: 'Tab 6 · Omzettingsdocumenten',
                uploads: 'Tab 7 · Uploads',
                submit: 'Tab 8 · Indienen'
        };
        return map[key] || pdfLabelForKey(key);
}

function pdfTableValue(value) {
        const text = pdfValueToText(value);
        return text || '—';
}

function drawSectionHeading(doc, title, subtitle = '') {
    ensurePageSpace(doc, subtitle ? 40 : 30);
    doc.moveDown(0.4);
    doc.fillColor('#1A3B70').font('Helvetica-Bold').fontSize(12).text(
        title,
        doc.page.margins.left,
        doc.y,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
    );
        if (subtitle) {
            doc.moveDown(0.12);
        doc.fillColor('#5E6C84').font('Helvetica').fontSize(9).text(
            subtitle,
            doc.page.margins.left,
            doc.y,
            { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
        );
        }
        doc.moveDown(0.28);
}

function ensurePageSpace(doc, neededHeight) {
        const bottomLimit = doc.page.height - doc.page.margins.bottom;
        if (doc.y + neededHeight > bottomLimit) {
                doc.addPage();
                doc.y = doc.page.margins.top;
        }
}

function estimateTableFirstRowHeight(doc, columns, row, minRowHeight = 18) {
    if (!row || !Array.isArray(columns) || !columns.length) return 24;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalColWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0) || 1;
    const normalizedColumns = columns.map(col => ({ ...col, width: tableWidth * ((col.width || 0) / totalColWidth) }));
    const cells = normalizedColumns.map(col => pdfTableValue(typeof col.value === 'function' ? col.value(row) : row[col.key]));
    const heights = cells.map((cell, idx) => doc.heightOfString(cell, { width: normalizedColumns[idx].width - 12 }));
    return Math.max(minRowHeight, ...heights.map(h => h + 8));
}

function estimateSectionStartHeight(doc, section) {
    const tables = Array.isArray(section?.tables) ? section.tables : [];
    let needed = section?.subtitle ? 56 : 44;
    tables.slice(0, 2).forEach(table => {
        if (table?.type === 'table') {
            const firstRowHeight = estimateTableFirstRowHeight(doc, table.columns || [], (table.rows || [])[0], 18);
            needed += (table?.title ? 34 : 0) + 22 + firstRowHeight + 16;
            return;
        }
        const col1Width = 185;
        const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const valueWidth = totalWidth - col1Width - 14;
        const firstKvRow = (table?.rows || []).find(row => String(row?.label || '').trim() && pdfTableValue(row?.value));
        const kvRowHeight = firstKvRow
            ? Math.max(
                doc.heightOfString(String(firstKvRow.label || ''), { width: col1Width, align: 'left' }),
                doc.heightOfString(pdfTableValue(firstKvRow.value), { width: valueWidth, align: 'left' })
              ) + 8
            : 24;
        needed += (table?.title ? 34 : 0) + kvRowHeight + 16;
    });
    return needed;
}

function drawKeyValueTable(doc, rows, options = {}) {
        const title = options.title || '';
        const subtitle = options.subtitle || '';
        const col1Width = options.col1Width || 185;
        const rowGap = options.rowGap || 10;
        const lineColor = options.lineColor || '#E6ECF5';
        const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const valueWidth = totalWidth - col1Width - 14;
        const firstRow = (rows || []).find(row => String(row?.label || '').trim() && pdfTableValue(row?.value));
        const firstRowHeight = firstRow
            ? Math.max(
                doc.heightOfString(String(firstRow.label || ''), { width: col1Width, align: 'left' }),
                                doc.heightOfString(pdfTableValue(firstRow.value), { width: valueWidth, align: 'left' }) + (firstRow?.link ? 12 : 0)
              ) + 8
            : 24;

        ensurePageSpace(doc, (title ? 34 : 0) + firstRowHeight + rowGap + 8);

        if (title) drawSectionHeading(doc, title, subtitle);
        rows.forEach(row => {
                const label = String(row.label || '').trim();
                const value = pdfTableValue(row.value);
                if (!label || !value) return;

                const labelHeight = doc.heightOfString(label, { width: col1Width, align: 'left' });
                const valueHeight = doc.heightOfString(value, { width: valueWidth, align: 'left' });
                const linkHeight = row?.link ? 12 : 0;
                const rowHeight = Math.max(labelHeight, valueHeight + linkHeight) + 8;
                ensurePageSpace(doc, rowHeight + rowGap + 8);

                const startY = doc.y;
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1F2E4A').text(label, doc.page.margins.left, startY, { width: col1Width });
                doc.font('Helvetica').fontSize(9.5).fillColor('#0F1D3A').text(value, doc.page.margins.left + col1Width + 14, startY, { width: valueWidth });
                if (row?.link) {
                    doc.font('Helvetica').fontSize(8.8).fillColor('#1D4ED8').text(
                        'Open bestand',
                        doc.page.margins.left + col1Width + 14,
                        startY + valueHeight + 1,
                        { width: valueWidth, link: String(row.link), underline: true }
                    );
                }
                const endY = Math.max(doc.y, startY + rowHeight);
                doc.moveTo(doc.page.margins.left, endY + 2).lineTo(doc.page.width - doc.page.margins.right, endY + 2).strokeColor(lineColor).lineWidth(0.7).stroke();
                doc.y = endY + rowGap;
        });
}

function drawSimpleTable(doc, columns, rows, options = {}) {
        const title = options.title || '';
        const subtitle = options.subtitle || '';
        const headerFill = options.headerFill || '#F5F8FF';
        const borderColor = options.borderColor || '#DCE6F4';
        const textColor = options.textColor || '#0F1D3A';
        const headerColor = options.headerColor || '#1A3B70';
        const minRowHeight = options.minRowHeight || 18;
        const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const totalColWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0) || 1;
        const normalizedColumns = columns.map(col => ({ ...col, width: tableWidth * ((col.width || 0) / totalColWidth) }));

        if (title) drawSectionHeading(doc, title, subtitle);

        const previewRowHeight = rows.length
            ? estimateTableFirstRowHeight(doc, columns, rows[0], minRowHeight)
            : 24;
        ensurePageSpace(doc, 22 + previewRowHeight + 4);

        const drawHeader = () => {
            ensurePageSpace(doc, 26);
            const y = doc.y;
            doc.save();
            doc.rect(doc.page.margins.left, y, tableWidth, 22).fillAndStroke(headerFill, borderColor);
            doc.restore();
            let x = doc.page.margins.left;
            normalizedColumns.forEach(col => {
                doc.font('Helvetica-Bold').fontSize(9).fillColor(headerColor).text(col.label, x + 6, y + 5, { width: col.width - 12, ellipsis: true });
                x += col.width;
            });
            doc.y = y + 22;
        };

        drawHeader();
        if (!rows.length) {
            ensurePageSpace(doc, 24);
            doc.font('Helvetica').fontSize(9.5).fillColor('#5E6C84').text('Geen gegevens beschikbaar.', doc.page.margins.left, doc.y, { width: tableWidth });
            doc.y += 16;
            return;
        }

        rows.forEach(row => {
            const cells = normalizedColumns.map(col => pdfTableValue(typeof col.value === 'function' ? col.value(row) : row[col.key]));
            const heights = cells.map((cell, idx) => doc.heightOfString(cell, { width: normalizedColumns[idx].width - 12 }));
            const rowHeight = Math.max(minRowHeight, ...heights.map(h => h + 8));
            ensurePageSpace(doc, rowHeight + 4);

            const y = doc.y;
            doc.rect(doc.page.margins.left, y, tableWidth, rowHeight).stroke(borderColor);
            let x = doc.page.margins.left;
            normalizedColumns.forEach((col, idx) => {
                if (idx > 0) {
                    doc.moveTo(x, y).lineTo(x, y + rowHeight).strokeColor(borderColor).stroke();
                }
                doc.font('Helvetica').fontSize(9.2).fillColor(textColor).text(cells[idx], x + 6, y + 5, { width: col.width - 12 });
                x += col.width;
            });
            doc.y = y + rowHeight;
        });
        doc.moveDown(0.2);
    }

function normalizeShareholderRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => ({
        nr: index + 1,
        type: row?.type || 'np',
        naam: row?.naam || '',
        percentage: row?.percentage || '',
        sameAsShareholder: row?.sameAsShareholder ? 'Ja' : 'Nee',
        sameAsShareholderIndex: row?.sameAsShareholderIndex || '',
        entityType: row?.entityType || 'np',
        kvkNummer: row?.kvkNummer || '',
        telefoon: row?.telefoon || '',
        mailadres: row?.mailadres || '',
        adresStraat: row?.adresStraat || '',
        adresHuisnummer: row?.adresHuisnummer || '',
        adresPostcode: row?.adresPostcode || '',
        adresPlaats: row?.adresPlaats || ''
    }));
}

function normalizeNaturalPersonRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => ({
        nr: index + 1,
        role: row?.roleKey || '',
        name: [row?.voornamen, row?.achternaam].filter(Boolean).join(' ').trim(),
        hasBsn: row?.heeftBsn || '',
        bsn: row?.bsn || '',
        nlAddress: row?.nlAdresGeregistreerd || '',
        nationality: row?.nationaliteit || '',
        birthDate: row?.geboortedatum || '',
        country: row?.woonland || row?.geboorteland || '',
        address: [row?.adresStraat, row?.adresHuisnummer, row?.adresPostcode, row?.adresPlaats].filter(Boolean).join(' '),
        phone: row?.telefoon || '',
        email: row?.email || '',
        roleLabel: row?.roleTitle || row?.title || ''
    }));
}

function normalizeRpRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => ({
        nr: index + 1,
        role: row?.roleKey || '',
        kvkNummer: row?.kvkNummer || '',
        ubo: Array.isArray(row?.ubos) && row.ubos.length ? row.ubos.map(ubo => `${ubo.naam || ''} (${ubo.percentage || '0'}%)`).join('; ') : (row?.uboNaam ? `${row.uboNaam} (${row.uboPercentage || '0'}%)` : ''),
        bestuurderType: row?.bestuurderType || '',
        bestuurderNaam: row?.bestuurderNaam || '',
        roleLabel: row?.roleTitle || row?.title || ''
    }));
}

function extractFileDisplayName(value) {
    if (!value) return '';
    if (typeof value === 'object') {
        return String(value.naam || value.filename || value.name || '').trim();
    }
    const str = String(value || '').trim();
    if (!str) return '';
    if (/^data:/i.test(str)) return 'Bestand';
    return str;
}

function buildFileOpenUrl(caseId, kind, index = 0) {
    if (!caseId || !kind) return '';
    const base = String(process.env.PUBLIC_BASE_URL || process.env.APP_URL || 'https://aandelenxpress-v2.vercel.app').replace(/\/$/, '');
    const safeCaseId = encodeURIComponent(String(caseId));
    const safeKind = encodeURIComponent(String(kind));
    const safeIndex = Number.isFinite(Number(index)) ? Math.max(0, Number(index)) : 0;
    return `${base}/api/vragenlijsten/${safeCaseId}/files/${safeKind}?index=${safeIndex}`;
}

function normalizeFileRows(formData, keys, caseId) {
    return keys.flatMap(({ label, key, kind }) => {
        const value = formData?.[key];
        if (Array.isArray(value)) {
            return value.map((entry, index) => ({
                label: `${label} ${index + 1}`,
                value: extractFileDisplayName(entry) || pdfValueToText(entry) || '—',
                link: buildFileOpenUrl(caseId, kind || key, index)
            }));
        }
        if (!value) return [];
        return [{
            label,
            value: extractFileDisplayName(value) || pdfValueToText(value) || '—',
            link: buildFileOpenUrl(caseId, kind || key, 0)
        }];
    });
}

function getPdfSections({ caseId, request, formData }) {
    const product = String(formData?.oprichtingType || request?.oprichtingType || '').toLowerCase();
    const holdingEntities = Array.isArray(formData?.holdingEntities) ? formData.holdingEntities : [];
    const holdingAandeelhouders = normalizeShareholderRows(formData?.holdingAandeelhouders || []);
    const holdingBestuurders = normalizeShareholderRows(formData?.holdingBestuurders || []);
    const werkmijAandeelhouders = normalizeShareholderRows(formData?.werkmijAandeelhouders || []);
    const werkmijBestuurders = normalizeShareholderRows(formData?.werkmijBestuurders || []);
    const bestaandHoldingBestuurders = normalizeShareholderRows(formData?.bestaandHoldingBestuurders || []);
    const naturalPersons = normalizeNaturalPersonRows(formData?.naturalPersons || []);
    const rechtspersonen = normalizeRpRows(formData?.rechtspersonen || []);

    const requestTypeRows = [
        { label: 'Product', value: pdfLabelForKey(product || formData?.product || request?.oprichtingType || '') },
        { label: 'Type oprichting', value: formData?.typeOprichting || request?.oprichtingType || '' },
        { label: 'Gewenste naam', value: request?.gewenstNaam || formData?.gewenstNaam || '' },
        { label: 'Partner', value: request?.resellerCompany || formData?.resellerCompany || '' },
        { label: 'Contact', value: request?.clientName || formData?.clientName || '' },
        { label: 'E-mail', value: request?.clientEmail || formData?.clientEmail || '' },
        { label: 'Aantal aandeelhouders', value: formData?.aandeelhouders || '' },
        { label: 'Status', value: formData?.reviewStatus || request?.status || '' }
    ].filter(row => row.value);

    const holdingSummaryRows = [
        { label: 'Naam bedrijf', value: formData?.holdingNaamBedrijf || '' },
        { label: 'Telefoon', value: formData?.holdingTelefoon || '' },
        { label: 'Mailadres', value: formData?.holdingMailadres || '' },
        { label: 'Adres bron', value: formData?.holdingAdresBron || '' },
        { label: 'Adres afwijkend', value: formData?.holdingAdresAfwijkendAandeelhouder ? 'Ja' : 'Nee' },
        { label: 'Zelfde als aandeelhouder', value: formData?.holdingAdresZelfdeAandeelhouderIndex || '' }
    ].filter(row => row.value);

    const werkmijSummaryRows = [
        { label: 'Naam bedrijf', value: formData?.werkmijNaamBedrijf || '' },
        { label: 'Telefoon', value: formData?.werkmijTelefoon || '' },
        { label: 'Mailadres', value: formData?.werkmijMailadres || '' },
        { label: 'Adres afwijkend', value: formData?.werkmijAdresAfwijkendAandeelhouder ? 'Ja' : 'Nee' },
        { label: 'Zelfde als aandeelhouder', value: formData?.werkmijAdresZelfdeAandeelhouderIndex || '' },
        { label: 'Activiteiten', value: formData?.werkmijActiviteiten || '' }
    ].filter(row => row.value);

    const holdingEntityRows = holdingEntities.map((entity, index) => ({
        nr: index + 1,
        naam: entity.naamBedrijf || '',
        telefoon: entity.telefoon || '',
        mailadres: entity.mailadres || '',
        adres: [entity.adresStraat, entity.adresHuisnummer, entity.adresPostcode, entity.adresPlaats].filter(Boolean).join(' '),
        percentage: entity.percentage || ''
    }));

    const fileRows = normalizeFileRows(formData, [
        { label: 'Datacard', key: 'datacardBestanden', kind: 'datacard' },
        { label: 'PEP-verklaring', key: 'pepBestanden', kind: 'pep' },
        { label: 'Personeelsplan', key: 'personeelsplannen', kind: 'personeelsplan' },
        { label: 'Huurovereenkomst holding', key: 'holdingHuurovereenkomst', kind: 'holding-huurovereenkomst' },
        { label: 'Huurovereenkomst werkmij', key: 'werkmijHuurovereenkomst', kind: 'werkmij-huurovereenkomst' },
        { label: 'Kvk uittreksel omzetting', key: 'omzettingKvkUittreksel', kind: 'kvk-uittreksel' },
        { label: 'Verzendbewijs intentie', key: 'omzettingVerzendbewijsIntentie', kind: 'verzendbewijs-intentie' },
        { label: 'Ontvangstbewijs intentie', key: 'omzettingOntvangstbewijsIntentie', kind: 'ontvangst-intent' },
        { label: 'Intentieverklaring', key: 'omzettingIntentieverklaring', kind: 'intentverklaring' },
        { label: 'Geleideformulier', key: 'omzettingGeleideformulier', kind: 'geleideformulier' },
        { label: 'Inbrengbeschrijving', key: 'omzettingInbrengbeschrijving', kind: 'inbrengbeschrijving' },
        { label: 'Inbrengbeschrijving holding', key: 'omzettingInbrengbeschrijvingHolding', kind: 'inbrengbeschrijving-holding' },
        { label: 'Inbrengbeschrijving werkmij', key: 'omzettingInbrengbeschrijvingWerkmij', kind: 'inbrengbeschrijving-werkmij' },
        { label: 'UBO-uittreksel', key: 'omzettingVofUboUittreksel', kind: 'ubo-uittreksel' }
    ], caseId);

    return [
        {
            key: 'requestType',
            title: pdfSectionTitleFromKey('requestType'),
            subtitle: 'Kerngegevens van het dossier en gekozen product.',
            tables: [{ type: 'kv', title: '', rows: requestTypeRows }]
        },
        {
            key: 'holding',
            title: pdfSectionTitleFromKey('holding'),
            subtitle: 'Alle gegevens van de holding in tab-vorm.',
            tables: [
                { type: 'kv', title: 'Samenvatting', rows: holdingSummaryRows },
                { type: 'kv', title: 'Type-indeling', rows: [
                    { label: 'Legenda', value: 'NP = Natuurlijk persoon, RP = Rechtspersoon' }
                ] },
                { type: 'table', title: 'Holding tabellen', columns: [
                    { label: '#', key: 'nr', width: 0.08 },
                    { label: 'Naam bedrijf', key: 'naam', width: 0.28 },
                    { label: 'Telefoon', key: 'telefoon', width: 0.16 },
                    { label: 'Mailadres', key: 'mailadres', width: 0.22 },
                    { label: 'Adres', key: 'adres', width: 0.26 }
                ], rows: holdingEntityRows },
                { type: 'table', title: 'Holding aandeelhouders', columns: [
                    { label: '#', key: 'nr', width: 0.06 },
                    { label: 'Naam', key: 'naam', width: 0.34 },
                    { label: 'Percentage', key: 'percentage', width: 0.14 },
                    { label: 'Vorm', key: 'entityType', width: 0.20, value: row => row.entityType === 'rp' ? 'Rechtspersoon' : 'Natuurlijk persoon' },
                    { label: 'Adres', key: 'adres', width: 0.26, value: row => [row.adresStraat, row.adresHuisnummer, row.adresPostcode, row.adresPlaats].filter(Boolean).join(' ') }
                ], rows: holdingAandeelhouders },
                { type: 'table', title: 'Holding bestuurders', columns: [
                    { label: '#', key: 'nr', width: 0.06 },
                    { label: 'Naam', key: 'naam', width: 0.36 },
                    { label: 'KvK', key: 'kvkNummer', width: 0.16 },
                    { label: 'Mail', key: 'mailadres', width: 0.18 },
                    { label: 'Adres', key: 'adres', width: 0.24, value: row => [row.adresStraat, row.adresHuisnummer, row.adresPostcode, row.adresPlaats].filter(Boolean).join(' ') }
                ], rows: holdingBestuurders }
            ]
        },
        {
            key: 'werkmij',
            title: pdfSectionTitleFromKey('werkmij'),
            subtitle: 'Opzet van de werkmaatschappij en aandeelhoudersstructuur.',
            tables: [
                { type: 'kv', title: 'Samenvatting', rows: werkmijSummaryRows },
                { type: 'kv', title: 'Type-indeling', rows: [
                    { label: 'Legenda', value: 'NP = Natuurlijk persoon, RP = Rechtspersoon' }
                ] },
                { type: 'table', title: 'Werkmij aandeelhouders', columns: [
                    { label: '#', key: 'nr', width: 0.06 },
                    { label: 'Naam', key: 'naam', width: 0.34 },
                    { label: 'Percentage', key: 'percentage', width: 0.14 },
                    { label: 'Vorm', key: 'entityType', width: 0.22, value: row => row.entityType === 'rp' ? 'Rechtspersoon' : 'Natuurlijk persoon' },
                    { label: 'Adres', key: 'adres', width: 0.24, value: row => [row.adresStraat, row.adresHuisnummer, row.adresPostcode, row.adresPlaats].filter(Boolean).join(' ') }
                ], rows: werkmijAandeelhouders },
                { type: 'table', title: 'Werkmij bestuurders', columns: [
                    { label: '#', key: 'nr', width: 0.06 },
                    { label: 'Naam', key: 'naam', width: 0.36 },
                    { label: 'KvK', key: 'kvkNummer', width: 0.16 },
                    { label: 'Mail', key: 'mailadres', width: 0.18 },
                    { label: 'Adres', key: 'adres', width: 0.24, value: row => [row.adresStraat, row.adresHuisnummer, row.adresPostcode, row.adresPlaats].filter(Boolean).join(' ') }
                ], rows: werkmijBestuurders }
            ]
        },
        {
            key: 'naturalPersons',
            title: pdfSectionTitleFromKey('naturalPersons'),
            subtitle: 'Alle natuurlijke personen uit de dossieropbouw.',
            tables: [{ type: 'table', title: 'Personenoverzicht', columns: [
                { label: '#', key: 'nr', width: 0.05 },
                { label: 'Rol', key: 'roleLabel', width: 0.16 },
                { label: 'Naam', key: 'name', width: 0.22 },
                { label: 'BSN', key: 'bsn', width: 0.12 },
                { label: 'NL adres', key: 'nlAddress', width: 0.10 },
                { label: 'Nationaliteit', key: 'nationality', width: 0.14 },
                { label: 'Adres', key: 'address', width: 0.21 }
            ], rows: naturalPersons }]
        },
        {
            key: 'rechtspersonen',
            title: pdfSectionTitleFromKey('rechtspersonen'),
            subtitle: 'Alle rechtspersonen met KvK, UBO en bestuurderstype.',
            tables: [{ type: 'table', title: 'Rechtspersonenoverzicht', columns: [
                { label: '#', key: 'nr', width: 0.05 },
                { label: 'Rol', key: 'roleLabel', width: 0.18 },
                { label: 'KvK', key: 'kvkNummer', width: 0.12 },
                { label: 'UBO(s)', key: 'ubo', width: 0.38 },
                { label: 'Bestuurder', key: 'bestuurderNaam', width: 0.27, value: row => {
                    const bestuurderType = row.bestuurderType === 'rp' ? 'Rechtspersoon' : (row.bestuurderType ? 'Natuurlijk persoon' : '');
                    if (!bestuurderType) return row.bestuurderNaam || '';
                    if (!row.bestuurderNaam) return bestuurderType;
                    return `${bestuurderType} - ${row.bestuurderNaam}`;
                } }
            ], rows: rechtspersonen.concat(normalizeShareholderRows(bestaandHoldingBestuurders)) }]
        },
        {
            key: 'omzetting',
            title: pdfSectionTitleFromKey('omzetting'),
            subtitle: 'Documenten voor omzetting en inbrengbeschrijvingen.',
            tables: [{ type: 'kv', title: 'Documentstatus', rows: [
                { label: 'Kvk uittreksel ontvangen', value: formData?.omzettingKvkUittreksel ? 'Ja' : 'Nee' },
                { label: 'Verzendbewijs intentie', value: formData?.omzettingVerzendbewijsIntentie ? 'Ja' : 'Nee' },
                { label: 'Ontvangstbewijs intentie', value: formData?.omzettingOntvangstbewijsIntentie ? 'Ja' : 'Nee' },
                { label: 'Intentieverklaring', value: formData?.omzettingIntentieverklaring ? 'Ja' : 'Nee' },
                { label: 'Geleideformulier', value: formData?.omzettingGeleideformulier ? 'Ja' : 'Nee' },
                { label: 'Inbrengbeschrijving holding', value: Array.isArray(formData?.omzettingInbrengbeschrijvingHolding) ? `${formData.omzettingInbrengbeschrijvingHolding.length} bestand(en)` : (formData?.omzettingInbrengbeschrijvingHolding ? '1 bestand' : 'Nee') },
                { label: 'Inbrengbeschrijving werkmij', value: formData?.omzettingInbrengbeschrijvingWerkmij ? 'Ja' : 'Nee' },
                { label: 'UBO-uittreksel', value: Array.isArray(formData?.omzettingVofUboUittreksel) ? `${formData.omzettingVofUboUittreksel.length} bestand(en)` : (formData?.omzettingVofUboUittreksel ? '1 bestand' : 'Nee') }
            ] }, { type: 'kv', title: 'Bestanden', rows: fileRows }]
        },
        {
            key: 'uploads',
            title: pdfSectionTitleFromKey('uploads'),
            subtitle: 'Samenvatting van alle geüploade bestanden per categorie.',
            tables: [{ type: 'kv', title: 'Uploadoverzicht', rows: fileRows }]
        },
        {
            key: 'submit',
            title: pdfSectionTitleFromKey('submit'),
            subtitle: 'Laatste status van review en verzending.',
            tables: [{ type: 'kv', title: 'Indieningsgegevens', rows: [
                { label: 'Review status', value: formData?.reviewStatus || 'pending' },
                { label: 'Reviewed by', value: formData?.reviewedBy || '' },
                { label: 'Reviewed at', value: formData?.reviewedAt || '' },
                { label: 'Ingediend op', value: formData?.submittedAt || '' },
                { label: 'Opmerkingen', value: formData?.opmerkingen || '' }
            ] }]
        }
    ];
}

function pdfValueToText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Ja' : 'Nee';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(v => pdfValueToText(v)).filter(Boolean).join(', ');
    if (typeof value === 'object') {
        if (value.naam || value.filename || value.name) return `Bestand: ${value.naam || value.filename || value.name}`;
        return '';
    }
    return String(value).trim();
}

function collectPdfRows(formData) {
    const skip = new Set([
        'token', 'reviewStatus', 'reviewFeedback', 'reviewedBy', 'reviewedAt',
        'submittedAt', 'submitted_at', 'draftSavedAt', 'isDraft', 'caseId',
        'datacardBestandData', 'pepBestandData', 'oprichtingsDocument'
    ]);
    return Object.keys(formData || {})
        .filter(k => !skip.has(k))
        .map(k => ({ label: pdfLabelForKey(k), value: pdfValueToText(formData[k]) }))
        .filter(row => row.value)
        .sort((a, b) => a.label.localeCompare(b.label, 'nl'));
}

function buildVragenlijstPdfBuffer({ caseId, request, formData }) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 50, left: 40, right: 40 } });
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const product = String(formData?.formulierType || formData?.oprichtingType || request?.oprichtingType || 'bv').toLowerCase().trim();
            const SITE = String(process.env.SITE_URL || 'https://aandelenxpress-v2.vercel.app').replace(/\/$/, '');

            // ── helpers ─────────────────────────────────────────────────
            const fval = (v) => {
                if (v === null || v === undefined || v === '' || v === false) return '';
                if (typeof v === 'boolean') return 'Ja';
                if (typeof v === 'number') return String(v);
                if (Array.isArray(v)) {
                    const parts = v.map(item => {
                        if (!item) return null;
                        if (typeof item === 'object') return item.naam || item.name || item.filename || null;
                        return String(item).trim() || null;
                    }).filter(Boolean);
                    return parts.join(', ');
                }
                if (typeof v === 'object') return v.naam || v.name || v.filename || '';
                return String(v).trim();
            };
            const get = (name) => name ? fval(formData?.[name]) : '';
            const fileUrl = (kind, idx = 0) => `${SITE}/api/vragenlijsten/${encodeURIComponent(caseId)}/files/${kind}?index=${idx}`;

            const ensureSpace = (needed) => {
                const bottom = doc.page.height - doc.page.margins.bottom;
                if (doc.y + needed > bottom) { doc.addPage(); doc.y = doc.page.margins.top; }
            };

            const leftX = 40; const questionW = 290; const answerW = 225; const minRowH = 24;

            const drawHeader = (stepTitle, stepSub) => {
                ensureSpace(80);
                doc.moveDown(0.6);
                const y = doc.y;
                doc.roundedRect(leftX, y, questionW + answerW, 28, 4).fill('#1A3B70');
                doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text(stepTitle, leftX + 10, y + 8, { width: questionW + answerW - 20 });
                doc.y = y + 34;
                if (stepSub) {
                    doc.font('Helvetica').fontSize(9).fillColor('#5E6C84').text(stepSub, leftX, doc.y, { width: questionW + answerW });
                    doc.moveDown(0.3);
                }
            };

            const drawTableHeader = () => {
                ensureSpace(28);
                const y = doc.y;
                doc.rect(leftX, y, questionW + answerW, 24).fillAndStroke('#EFF6FF', '#CBD5E1');
                doc.moveTo(leftX + questionW, y).lineTo(leftX + questionW, y + 24).strokeColor('#CBD5E1').stroke();
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0F1D3A').text('Vraag', leftX + 8, y + 7, { width: questionW - 16 });
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0F1D3A').text('Antwoord', leftX + questionW + 8, y + 7, { width: answerW - 16 });
                doc.y = y + 24;
            };

            const drawRow = (idx, label, answer, fileKind, fileIdx) => {
                if (!answer && !fileKind) return;
                const question = `${idx}. ${label}`;
                const qH = doc.heightOfString(question, { width: questionW - 16 });
                const aH = doc.heightOfString(String(answer || ''), { width: answerW - 16 });
                const linkH = fileKind ? 14 : 0;
                const rowH = Math.max(minRowH, qH + 12, aH + 12 + linkH);
                ensureSpace(rowH + 2);
                const y = doc.y;
                doc.rect(leftX, y, questionW + answerW, rowH).fillAndStroke('#ffffff', '#E2E8F0');
                doc.moveTo(leftX + questionW, y).lineTo(leftX + questionW, y + rowH).strokeColor('#E2E8F0').stroke();
                doc.font('Helvetica').fontSize(9.2).fillColor('#111827').text(question, leftX + 8, y + 6, { width: questionW - 16 });
                if (answer) doc.font('Helvetica').fontSize(9.2).fillColor('#0F1D3A').text(String(answer), leftX + questionW + 8, y + 6, { width: answerW - 16 });
                if (fileKind) {
                    const url = fileUrl(fileKind, fileIdx || 0);
                    const linkY = y + 6 + (answer ? aH + 2 : 0);
                    doc.font('Helvetica').fontSize(8.5).fillColor('#1D4ED8').text('Open bestand', leftX + questionW + 8, linkY, { width: answerW - 16, link: url, underline: true });
                }
                doc.y = y + rowH;
            };

            const drawPersonBlock = (title, persons, fields) => {
                if (!Array.isArray(persons) || !persons.length) return;
                const filled = persons.filter(p => fields.some(f => fval(p[f.key])));
                if (!filled.length) return;
                drawHeader(title, '');
                filled.forEach((p, pi) => {
                    const rows = fields.map(f => ({ label: f.label, val: fval(p[f.key]) })).filter(r => r.val);
                    if (!rows.length) return;
                    ensureSpace(30);
                    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1A3B70').text(`Persoon ${pi + 1}`, leftX, doc.y);
                    doc.moveDown(0.2);
                    drawTableHeader();
                    rows.forEach((r, ri) => drawRow(ri + 1, r.label, r.val, null, null));
                    doc.moveDown(0.3);
                });
            };

            const drawFileArray = (label, arr, kind, stepIdx) => {
                if (!Array.isArray(arr) || !arr.length) return;
                arr.forEach((item, i) => {
                    const name = typeof item === 'object' ? (item.naam || item.name || item.filename || `Bestand ${i+1}`) : (String(item).trim() || `Bestand ${i+1}`);
                    drawRow(stepIdx + i, `${label} ${i + 1}`, name, kind, i);
                });
            };

            const PERSON_FIELDS = [
                { key: 'naam', label: 'Naam' }, { key: 'naamBedrijf', label: 'Naam bedrijf' },
                { key: 'geboortedatum', label: 'Geboortedatum' }, { key: 'geboorteplaats', label: 'Geboorteplaats' },
                { key: 'geboorteland', label: 'Geboorteland' }, { key: 'nationaliteit', label: 'Nationaliteit' },
                { key: 'bsn', label: 'BSN-nummer' }, { key: 'email', label: 'E-mailadres' },
                { key: 'telefoon', label: 'Telefoonnummer' }, { key: 'percentage', label: 'Percentage' },
                { key: 'adresStraat', label: 'Straat' }, { key: 'adresHuisnummer', label: 'Huisnummer' },
                { key: 'adresPostcode', label: 'Postcode' }, { key: 'adresPlaats', label: 'Woonplaats' },
                { key: 'kvkNummer', label: 'KvK-nummer' }, { key: 'rechtsvorm', label: 'Rechtsvorm' },
                { key: 'heeftBsn', label: 'Heeft BSN' }, { key: 'nlAdresGeregistreerd', label: 'NL adres geregistreerd' },
                { key: 'woonland', label: 'Woonland' },
            ];

            // ── Cover page ────────────────────────────────────────────
            doc.rect(40, 40, 515, 4).fill('#1A3B70');
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').fontSize(22).fillColor('#1A3B70').text('Oprichtingsdocument', 40, 60);
            doc.font('Helvetica-Bold').fontSize(14).fillColor('#0F1D3A').text(request?.gewenstNaam || formData?.gewenstNaam || '—', 40, 88);
            doc.moveDown(0.6);
            const meta = [
                ['Dossiernummer', caseId],
                ['Product', product],
                ['Partner', request?.resellerCompany || formData?.resellerCompany || '—'],
                ['Klantcontact', `${request?.clientName || formData?.clientName || '—'} (${request?.clientEmail || formData?.clientEmail || '—'})`],
                ['Datum gegenereerd', new Date().toLocaleString('nl-NL')],
            ];
            meta.forEach(([k, v]) => {
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#5E6C84').text(k + ':', 40, doc.y, { continued: true, width: 160 });
                doc.font('Helvetica').fontSize(9.5).fillColor('#0F1D3A').text('  ' + v);
            });
            doc.moveDown(1);
            doc.rect(40, doc.y, 515, 0.7).fill('#E8EDF5');
            doc.moveDown(1);

            // ── Product steps ─────────────────────────────────────────
            const isHolding   = ['bv-holding','holding','eenmanszaak-omzetten-bv-holding','vof-naar-bv-holding'].some(t => product.includes(t.replace('bv-holding','bv holding'))) || product.includes('holding');
            const isOmzetting = product.includes('omzetten') || product.includes('omzetting') || product.includes('vof');

            // Step 1 — Aanvraagtype
            const step1Rows = [
                ['Gewenste bedrijfsnaam', get('gewenstNaam') || request?.gewenstNaam],
                ['Product type', get('oprichtingType') || request?.oprichtingType],
                ['Type formulier', get('formulierType')],
                ['Spoedaanvraag', get('spoed')],
                ['Nederlandse documenten', get('nederlandsTaal')],
                ['Engelse documenten', get('engelsTaal')],
                ['Sector', get('sector')],
                ['Doel van de BV', get('doel')],
                ['Startkapitaal', get('kapitaal')],
                ['Startsaldo', get('startSaldo')],
                ['Aandeelhouders', get('aandeelhouders')],
                ['Bestaande holding als aandeelhouder', get('singleBvExistingHoldings')],
                ['Wie worden aandeelhouder(s)?', get('existingHoldingOwner')],
                ['Bestaande holding naam', get('bestaandHoldingNaam')],
                ['Bestaande holding KvK', get('bestaandHoldingKvk')],
            ].filter(([, v]) => v);
            if (step1Rows.length) {
                drawHeader('Stap 1 · Aanvraagtype', 'Kerngegevens van de aanvraag');
                drawTableHeader();
                step1Rows.forEach(([l, v], i) => drawRow(i + 1, l, v));
                doc.moveDown(0.4);
            }

            // Step 2 — Holding (if applicable)
            if (isHolding) {
                const holdingRows = [
                    ['Naam holding', get('holdingNaamBedrijf')],
                    ['Telefoonnummer', get('holdingTelefoon')],
                    ['Mailadres', get('holdingMailadres')],
                    ['Adres straat', get('holdingAdresStraat')],
                    ['Adres huisnummer', get('holdingAdresHuisnummer')],
                    ['Postcode', get('holdingAdresPostcode')],
                    ['Woonplaats', get('holdingAdresPlaats')],
                    ['Heeft accountant', get('holdingHasAccountant')],
                    ['Accountantskantoor', get('holdingAccountantNaam')],
                    ['Accountant e-mail', get('holdingAccountantEmail')],
                ].filter(([, v]) => v);
                if (holdingRows.length || formData?.holdingAandeelhouders?.length) {
                    drawHeader('Stap 2 · Oprichting document (Holding)', 'Gegevens van de holding B.V.');
                    if (holdingRows.length) { drawTableHeader(); holdingRows.forEach(([l, v], i) => drawRow(i + 1, l, v)); doc.moveDown(0.3); }
                    drawPersonBlock('Aandeelhouders holding', formData?.holdingAandeelhouders, PERSON_FIELDS);
                    drawPersonBlock('Bestuurders holding', formData?.holdingBestuurders, PERSON_FIELDS);
                    doc.moveDown(0.4);
                }
            }

            // Step 3 — Werkmaatschappij
            const werkmijRows = [
                ['Naam werkmaatschappij', get('werkmijNaamBedrijf')],
                ['Telefoonnummer', get('werkmijTelefoon')],
                ['Mailadres', get('werkmijMailadres')],
                ['Adres straat', get('werkmijAdresStraat')],
                ['Adres huisnummer', get('werkmijAdresHuisnummer')],
                ['Postcode', get('werkmijAdresPostcode')],
                ['Woonplaats', get('werkmijAdresPlaats')],
                ['Activiteiten / doel', get('werkmijActiviteiten')],
                ['Import registratie', get('werkmijImport')],
                ['Export registratie', get('werkmijExport')],
                ['Heeft accountant', get('werkmijHasAccountant')],
                ['Accountantskantoor', get('werkmijAccountantNaam')],
                ['Accountant e-mail', get('werkmijAccountantEmail')],
                ['Heeft werkmaatschappij', get('hasWorkmaatschappij')],
            ].filter(([, v]) => v);
            if (werkmijRows.length || formData?.werkmijAandeelhouders?.length) {
                const stepNum = isHolding ? 3 : 2;
                drawHeader(`Stap ${stepNum} · Oprichting document (Werkmaatschappij)`, 'Gegevens van de werkmaatschappij B.V.');
                if (werkmijRows.length) { drawTableHeader(); werkmijRows.forEach(([l, v], i) => drawRow(i + 1, l, v)); doc.moveDown(0.3); }
                drawPersonBlock('Aandeelhouders werkmaatschappij', formData?.werkmijAandeelhouders, PERSON_FIELDS);
                drawPersonBlock('Bestuurders werkmaatschappij', formData?.werkmijBestuurders, PERSON_FIELDS);
                doc.moveDown(0.4);
            }

            // Step 4 — Natuurlijke personen
            if (formData?.naturalPersons?.length || formData?.rechtspersonen?.length) {
                const stepNum = isHolding ? 4 : 3;
                drawHeader(`Stap ${stepNum} · Natuurlijke personen`, 'Alle personen uit de dossieropbouw');
                drawPersonBlock('Natuurlijke personen', formData?.naturalPersons, PERSON_FIELDS);
                drawPersonBlock('Rechtspersonen', formData?.rechtspersonen, [
                    { key: 'naamBedrijf', label: 'Naam bedrijf' }, { key: 'kvkNummer', label: 'KvK-nummer' },
                    { key: 'rechtsvorm', label: 'Rechtsvorm' }, { key: 'email', label: 'E-mail' },
                ]);
                doc.moveDown(0.4);
            }

            // Step — Omzetting (if applicable)
            if (isOmzetting) {
                const omzRows = [
                    ['Bron type', get('omzettingBronType')],
                    ['Naam bron', get('omzettingBronNaam')],
                    ['KvK bron', get('omzettingBronKvk')],
                    ['Zetel bron', get('omzettingBronZetel')],
                    ['Eigenaren bron', get('omzettingBronEigenaren')],
                    ['Doel bron', get('omzettingBronDoel')],
                    ['KvK uittreksel ontvangen', formData?.omzettingKvkUittreksel ? 'Ja' : ''],
                    ['Verzendbewijs intentie', formData?.omzettingVerzendbewijsIntentie ? 'Ja' : ''],
                    ['Ontvangstbewijs intentie', formData?.omzettingOntvangstbewijsIntentie ? 'Ja' : ''],
                    ['Intentieverklaring', formData?.omzettingIntentieverklaring ? 'Ja' : ''],
                    ['Geleideformulier', formData?.omzettingGeleideformulier ? 'Ja' : ''],
                ].filter(([, v]) => v);
                if (omzRows.length) {
                    drawHeader('Stap · Omzettingsdocumenten', 'Documenten voor omzetting');
                    drawTableHeader();
                    omzRows.forEach(([l, v], i) => drawRow(i + 1, l, v));
                    doc.moveDown(0.4);
                }
            }

            // Step — Uploads
            const uploadStepNum = isHolding ? (isOmzetting ? 6 : 5) : (isOmzetting ? 5 : 4);
            const hasUploads = formData?.datacardBestanden?.length || formData?.pepBestanden?.length ||
                formData?.personeelsplannen?.length || formData?.holdingHuurovereenkomst ||
                formData?.werkmijHuurovereenkomst;
            if (hasUploads) {
                drawHeader(`Stap ${uploadStepNum} · Uploads`, 'Geüploade bestanden');
                drawTableHeader();
                let ri = 1;
                const addFileRows = (arr, label, kind) => {
                    if (!Array.isArray(arr) || !arr.length) return;
                    arr.forEach((item, i) => {
                        const name = typeof item === 'object' ? (item.naam || item.name || item.filename || `Bestand ${i+1}`) : `Bestand ${i+1}`;
                        drawRow(ri++, `${label} ${i + 1}`, name, kind, i);
                    });
                };
                addFileRows(formData?.datacardBestanden, 'Datacard', 'datacard');
                addFileRows(formData?.pepBestanden, 'PEP-verklaring', 'pep');
                addFileRows(formData?.personeelsplannen, 'Personeelsplan', 'personeelsplan');
                if (formData?.holdingHuurovereenkomst) drawRow(ri++, 'Huurovereenkomst holding', fval(formData.holdingHuurovereenkomst), 'holding-huurovereenkomst', 0);
                if (formData?.werkmijHuurovereenkomst) drawRow(ri++, 'Huurovereenkomst werkmij', fval(formData.werkmijHuurovereenkomst), 'werkmij-huurovereenkomst', 0);
                doc.moveDown(0.4);
            }

            // Opmerkingen
            if (formData?.opmerkingen) {
                ensureSpace(60);
                doc.moveDown(0.5);
                doc.rect(leftX, doc.y, questionW + answerW, 20).fill('#FFFBEB');
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#92400E').text('Opmerkingen klant:', leftX + 8, doc.y + 5);
                doc.y += 22;
                doc.font('Helvetica').fontSize(9.2).fillColor('#0F1D3A').text(String(formData.opmerkingen), leftX + 8, doc.y, { width: questionW + answerW - 16 });
                doc.moveDown(0.5);
            }

            // Footer
            doc.moveDown(1.5);
            ensureSpace(30);
            doc.rect(leftX, doc.y, questionW + answerW, 0.7).fill('#E8EDF5');
            doc.moveDown(0.4);
            doc.font('Helvetica').fontSize(8.5).fillColor('#94A3B8').text('Automatisch gegenereerd door AandelenXpress op basis van de ingevulde vragenlijst.', leftX, doc.y, { width: questionW + answerW, align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

app.get('/api/request-info/:id', async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row || ['pending','rejected'].includes(row.status))
        return res.status(404).json({ error: 'Dossier niet gevonden of nog niet goedgekeurd' });
    if (isDossierTrashed(row)) return res.status(404).json({ error: 'Dossier niet gevonden of niet beschikbaar' });
    const { token } = req.query;
    if (!tokenMatches(row.access_token, token)) return res.status(401).json({ error: 'Ongeldige toegangscode' });
    const brandRecord = await getBrandingByEmail(row.reseller_id, { email: row.reseller_id, company: row.reseller_company || '' });
    res.json({
        id: row.id,
        clientName: row.client_name,
        clientEmail: row.client_email,
        oprichtingType: row.oprichting_type,
        gewenstNaam: row.gewenst_naam,
        resellerName: row.reseller_name,
        resellerCompany: row.reseller_company,
        branding: brandRecord.branding
    });
});

app.get('/api/vragenlijst/:caseId', async (req, res) => {
    const { caseId } = req.params;
    const { token } = req.query;

    if (!token) return res.status(401).json({ error: 'Ongeldige toegangscode' });

    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', caseId).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });
    if (isDossierTrashed(row)) return res.status(404).json({ error: 'Dossier niet beschikbaar' });
    if (!tokenMatches(row.access_token, token)) return res.status(401).json({ error: 'Ongeldige toegangscode' });

    const { data: saved } = await supabase.from('vragenlijsten').select('*').eq('case_id', caseId).single();
    if (!saved) return res.status(404).json({ error: 'Geen opgeslagen vragenlijst' });

    res.json({
        caseId: saved.case_id,
        submittedAt: saved.submitted_at,
        data: saved.data || {}
    });
});

app.post('/api/vragenlijst/save', async (req, res) => {
    const { caseId, token, draftData } = req.body || {};
    if (!caseId || !token) return res.status(400).json({ error: 'caseId en token zijn verplicht' });

    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', caseId).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });
    if (isDossierTrashed(row)) return res.status(404).json({ error: 'Dossier niet beschikbaar' });
    if (!tokenMatches(row.access_token, token)) return res.status(401).json({ error: 'Ongeldige toegangscode' });

    const { data: existing } = await supabase.from('vragenlijsten').select('*').eq('case_id', caseId).single();
    const base = existing?.data || {};
    const merged = {
        ...base,
        ...(draftData || {}),
        caseId,
        clientName: row.client_name,
        clientEmail: row.client_email,
        resellerCompany: row.reseller_company,
        gewenstNaam: row.gewenst_naam,
        oprichtingType: row.oprichting_type,
        isDraft: true,
        draftSavedAt: new Date().toISOString()
    };

    await supabase.from('vragenlijsten').upsert({
        case_id: caseId,
        data: merged,
        submitted_at: existing?.submitted_at || null
    });

    res.json({ success: true, savedAt: merged.draftSavedAt });
});

app.post('/api/vragenlijst', async (req, res) => {
    const { caseId, token, contactEmail } = req.body;
    if (!caseId || !contactEmail) return res.status(400).json({ error: 'Verplichte velden ontbreken' });

    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', caseId).single();
    if (!row || ['pending','rejected'].includes(row.status))
        return res.status(404).json({ error: 'Opdracht niet gevonden of nog niet goedgekeurd' });
    if (isDossierTrashed(row)) return res.status(404).json({ error: 'Opdracht niet beschikbaar' });
    if (!tokenMatches(row.access_token, token)) return res.status(401).json({ error: 'Ongeldige toegangscode' });

    const { token: _tok, ...formData } = req.body;
    const submission = {
        ...formData,
        caseId,
        clientName: row.client_name,
        clientEmail: row.client_email,
        resellerCompany: row.reseller_company,
        gewenstNaam: row.gewenst_naam,
        oprichtingType: row.oprichting_type,
        submittedAt: new Date().toISOString(),
        isDraft: false,
        reviewStatus: 'pending',
        reviewFeedback: ''
    };
    await supabase.from('vragenlijsten').upsert({ case_id: caseId, data: submission, submitted_at: submission.submittedAt });
    emails.emailAdminVragenlijstSubmitted({ submission });
    emails.emailClientVragenlijstSubmitted({ submission: { ...submission, accessToken: row.access_token } });
    res.json({ success: true });
});

app.get('/api/admin/vragenlijsten', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('vragenlijsten').select('case_id, submitted_at, data');
    const result = (data || []).map(row => normalizeVragenlijstForAdmin(row));
    res.json(result);
});

app.get('/api/vragenlijsten/:caseId', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('vragenlijsten').select('*').eq('case_id', req.params.caseId).single();
    if (!row) return res.status(404).json({ error: 'Geen vragenlijst gevonden' });
    res.json(normalizeVragenlijstForAdmin(row));
});

app.get('/api/vragenlijsten/:caseId/files/:kind', requireLogin, async (req, res) => {
    const { caseId, kind } = req.params;
    const kindMap = {
        datacard: 'datacardBestanden',
        pep: 'pepBestanden',
        oprichtingsdocument: 'oprichtingsDocument',
        huurovereenkomst: 'holdingHuurovereenkomst',
        'holding-huurovereenkomst': 'holdingHuurovereenkomst',
        'werkmij-huurovereenkomst': 'werkmijHuurovereenkomst',
        'kvk-uittreksel': 'omzettingKvkUittreksel',
        verzekering: 'verzekering',
        'ontvangst-intent': 'omzettingOntvangstbewijsIntentie',
        'verzendbewijs-intentie': 'omzettingVerzendbewijsIntentie',
        intentverklaring: 'omzettingIntentieverklaring',
        geleideformulier: 'omzettingGeleideformulier',
        'bijlage-intent': 'omzettingGeleideformulier',
        interim: 'interim',
        'ubo-uittreksel': 'omzettingVofUboUittreksel',
        personeelsplan: 'personeelsplannen',
        inbrengbeschrijving: 'omzettingInbrengbeschrijving',
        'inbrengbeschrijving-holding': 'omzettingInbrengbeschrijvingHolding',
        'inbrengbeschrijving-werkmij': 'omzettingInbrengbeschrijvingWerkmij'
    };
    const keyBase = kindMap[kind] || null;
    if (!keyBase) return res.status(400).json({ error: 'Ongeldig bestandstype' });
    const index = Number.isFinite(Number(req.query.index)) ? Number(req.query.index) : 0;

    const { data: reqRow } = await supabase.from('reseller_requests').select('id, reseller_id').eq('id', caseId).single();
    if (!reqRow) return res.status(404).json({ error: 'Dossier niet gevonden' });
    if (req.session.user.type !== 'admin' && reqRow.reseller_id !== req.session.user.email) {
        return res.status(403).json({ error: 'Geen toegang' });
    }

    const { data: row } = await supabase.from('vragenlijsten').select('*').eq('case_id', caseId).single();
    if (!row) return res.status(404).json({ error: 'Geen vragenlijst gevonden' });

    const file = getStoredVragenlijstFile(row.data || {}, keyBase, index);
    if (!file || !file.base64) return res.status(404).json({ error: 'Bestand niet gevonden' });

    let buffer;
    try {
        buffer = Buffer.from(file.base64, 'base64');
    } catch (_) {
        return res.status(500).json({ error: 'Bestand kon niet worden gelezen' });
    }

    const fallbackName = `${kind}.${extFromMime(file.mime)}`;
    const filename = String(file.name || fallbackName).replace(/[\r\n"]/g, '_');
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';

    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.send(buffer);
});

app.get('/api/vragenlijsten/:caseId/files', requireLogin, async (req, res) => {
    const { caseId } = req.params;

    const { data: reqRow } = await supabase.from('reseller_requests').select('id, reseller_id').eq('id', caseId).single();
    if (!reqRow) return res.status(404).json({ error: 'Dossier niet gevonden' });
    if (req.session.user.type !== 'admin' && reqRow.reseller_id !== req.session.user.email) {
        return res.status(403).json({ error: 'Geen toegang' });
    }

    const { data: row } = await supabase.from('vragenlijsten').select('*').eq('case_id', caseId).single();
    if (!row) return res.status(404).json({ error: 'Geen vragenlijst gevonden' });

    const files = listStoredVragenlijstFiles(row.data || {}, caseId);
    res.json({ files });
});

// Draft PDF — generates PDF from current vragenlijst data without requiring approval
app.get('/api/vragenlijsten/:caseId/draft-pdf', requireAdmin, async (req, res) => {
    const { caseId } = req.params;
    const { data: reqRow } = await supabase.from('reseller_requests').select('*').eq('id', caseId).single();
    if (!reqRow) return res.status(404).json({ error: 'Dossier niet gevonden' });
    const { data: vlRow } = await supabase.from('vragenlijsten').select('*').eq('case_id', caseId).single();
    if (!vlRow) return res.status(404).json({ error: 'Geen vragenlijst gevonden' });
    try {
        const request = rowToReq(reqRow);
        const pdfBuffer = await buildVragenlijstPdfBuffer({ caseId, request, formData: vlRow.data || {} });
        const filename = `concept-${caseId}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (err) {
        res.status(500).json({ error: 'PDF kon niet worden gegenereerd: ' + err.message });
    }
});

app.patch('/api/vragenlijsten/:caseId/review', requireAdmin, async (req, res) => {
    const { caseId } = req.params;
    const { action, feedback } = req.body || {};
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Ongeldige actie' });

    const { data: qRow } = await supabase.from('vragenlijsten').select('*').eq('case_id', caseId).single();
    if (!qRow) return res.status(404).json({ error: 'Vragenlijst niet gevonden' });

    const { data: reqRow } = await supabase.from('reseller_requests').select('*').eq('id', caseId).single();
    if (!reqRow) return res.status(404).json({ error: 'Dossier niet gevonden' });

    const request = rowToReq(reqRow);
    const actor = req.session.user.name || req.session.user.email;
    const formData = qRow.data || {};

    if (action === 'reject' && !String(feedback || '').trim()) {
        return res.status(400).json({ error: 'Feedback is verplicht bij afkeuren' });
    }

    const reviewedData = {
        ...formData,
        reviewStatus: action === 'approve' ? 'approved' : 'rejected',
        reviewFeedback: action === 'reject' ? String(feedback).trim() : '',
        reviewedAt: new Date().toISOString(),
        reviewedBy: actor
    };

    if (action === 'approve') {
        try {
            const pdfBuffer = await buildVragenlijstPdfBuffer({ caseId, request, formData: reviewedData });
            reviewedData.oprichtingsDocument = {
                naam: `oprichtingsdocument-${caseId}.pdf`,
                mime: 'application/pdf',
                data: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
                generatedAt: new Date().toISOString(),
                generatedBy: actor
            };
        } catch (err) {
            return res.status(500).json({ error: 'PDF kon niet worden gegenereerd: ' + err.message });
        }
    }

    await supabase.from('vragenlijsten').update({ data: reviewedData }).eq('case_id', caseId);

    if (action === 'approve') {
        // Ensure access token exists — generate and save if missing
        if (!request.accessToken) {
            request.accessToken = generateSmartToken(request);
            await supabase.from('reseller_requests').update({ access_token: request.accessToken }).eq('id', caseId);
        }
        request.status = 'betaling';
        request.statusUpdatedAt = new Date().toISOString();
        addActivity(request, 'system', `Vragenlijst goedgekeurd door ${actor}. Status gewijzigd naar betaling.`, actor);
        await supabase.from('reseller_requests').update({
            status: request.status,
            status_updated_at: request.statusUpdatedAt,
            activities: request.activities
        }).eq('id', caseId);
        emails.emailClientBetaling({ request });
    } else {
        // Ensure access token exists for rejection email too
        if (!request.accessToken) {
            request.accessToken = generateSmartToken(request);
            await supabase.from('reseller_requests').update({ access_token: request.accessToken }).eq('id', caseId);
        }
        addActivity(request, 'system', `Vragenlijst afgekeurd door ${actor}. Feedback teruggestuurd naar klant.`, actor);
        await supabase.from('reseller_requests').update({ activities: request.activities }).eq('id', caseId);

        const formUrl = buildVragenlijstUrl(request);
        emails.emailClientVragenlijstRejected({ request, feedback: String(feedback).trim(), formUrl });
    }

    res.json({
        success: true,
        reviewStatus: reviewedData.reviewStatus,
        dossierStatus: action === 'approve' ? 'betaling' : request.status,
        generatedPdfDownloadUrl: action === 'approve' ? `/api/vragenlijsten/${encodeURIComponent(caseId)}/files/oprichtingsdocument?download=1` : null,
        generatedPdfName: action === 'approve' ? (reviewedData.oprichtingsDocument?.naam || '') : null
    });
});

// ── Blog ───────────────────────────────────────────────────────────────────
app.get('/api/blog/posts', async (req, res) => {
    const draft = req.query.draft === 'true';
    let q = supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (!draft) q = q.eq('published', true);
    const { data } = await q;
    res.json((data || []).map(p => ({ ...p, createdAt: p.created_at, updatedAt: p.updated_at })));
});

app.post('/api/blog/posts', requireAdmin, async (req, res) => {
    const { title, excerpt, content, categories, featured, published, author, image } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titel en inhoud verplicht' });
    const { data: idData } = await supabase.rpc('next_blog_post_id');
    const now = new Date().toISOString();
    const post = { id: idData, title, excerpt: excerpt || title.substring(0, 100), content, image: image || null, categories: categories || [], featured: featured || false, published: published || false, author: author || req.session.user.name, created_at: now, updated_at: now };
    await supabase.from('blog_posts').insert(post);
    res.status(201).json({ ...post, createdAt: post.created_at, updatedAt: post.updated_at });
});

app.get('/api/blog/posts/:id', async (req, res) => {
    const { data: p } = await supabase.from('blog_posts').select('*').eq('id', req.params.id).single();
    if (!p || (!p.published && (!req.session?.user || req.session.user.type !== 'admin')))
        return res.status(404).json({ error: 'Post niet gevonden' });
    res.json({ ...p, createdAt: p.created_at, updatedAt: p.updated_at });
});

app.patch('/api/blog/posts/:id', requireAdmin, async (req, res) => {
    const { title, excerpt, content, categories, featured, published, author, image } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined)      updates.title      = title;
    if (excerpt !== undefined)    updates.excerpt    = excerpt;
    if (content !== undefined)    updates.content    = content;
    if (image !== undefined)      updates.image      = image || null;
    if (categories !== undefined) updates.categories = categories;
    if (featured !== undefined)   updates.featured   = featured;
    if (published !== undefined)  updates.published  = published;
    if (author !== undefined)     updates.author     = author;
    const { data: p, error } = await supabase.from('blog_posts').update(updates).eq('id', req.params.id).select().single();
    if (error || !p) return res.status(404).json({ error: 'Post niet gevonden' });
    res.json({ ...p, createdAt: p.created_at, updatedAt: p.updated_at });
});

app.delete('/api/blog/posts/:id', requireAdmin, async (req, res) => {
    await supabase.from('blog_posts').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// ── Admin dashboard redirect ───────────────────────────────────────────────
app.get('/admin-dashboard.html', requireAdmin, (req, res) => {
    res.redirect(301, '/admin-dashboard');
});

app.get('/:slug', async (req, res, next) => {
    const slug = sanitizeSlug(req.params.slug);
    const reserved = new Set([
        'api', 'login', 'register', 'admin-dashboard', 'reseller-dashboard', 'blog-admin',
        'dossier-detail', 'partner-detail', 'dossier-status', 'vragenlijst',
        'vragenlijst-bv-holding', 'vragenlijst-geruisloos', 'vragenlijst-bv-oprichten',
        'vragenlijst-holding-oprichten', 'vragenlijst-eenmanszaak-naar-bv', 'vragenlijst-vof-naar-bv',
        'vragenlijst-eenmanszaak-naar-bv-holding', 'vragenlijst-vof-naar-bv-holding',
        'privacy', 'algemene-voorwaarden'
    ]);
    if (!slug || reserved.has(slug)) return next();
    const brand = await getBrandingBySlugWithFallback(slug);
    if (!brand) return next();
    res.sendFile(path.join(__dirname, 'public', 'whitelabel-start.html'));
});

// ── Fallback static ────────────────────────────────────────────────────────
app.use((req, res, next) => {
    const filePath = path.join(__dirname, 'public', req.path);
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            if (filePath.endsWith('.css'))     res.set('Content-Type', 'text/css; charset=utf-8');
            else if (filePath.endsWith('.js')) res.set('Content-Type', 'application/javascript; charset=utf-8');
            return res.sendFile(filePath);
        }
    } catch(e) {}
    next();
});

// ── Extra file upload feature ──────────────────────────────────────────────

// POST /api/dossier-files/request  — admin sends "please upload" email to client
app.post('/api/dossier-files/request', requireAdmin, async (req, res) => {
    const { dossierNr, message } = req.body || {};
    if (!dossierNr) return res.status(400).json({ error: 'dossierNr vereist' });
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', dossierNr).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });
    const request = rowToReq(row);
    const base = process.env.SITE_URL || 'https://aandelenxpress-v2.vercel.app';
    const uploadUrl = `${base}/extra-upload?nr=${encodeURIComponent(dossierNr)}&token=${encodeURIComponent(request.accessToken || '')}`;
    const adminName = req.session?.user?.name || req.session?.user?.email || 'Admin';
    const clientEmail = request.clientEmail;
    if (!clientEmail) return res.status(400).json({ error: 'Geen e-mailadres bekend voor deze klant' });
    const bodyHtml = (message || 'Wij verzoeken u aanvullende documenten te uploaden.')
        .replace(/\n/g, '<br>')
        + `<br><br><a href="${uploadUrl}" style="display:inline-block;padding:12px 24px;background:#1A3B70;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Bestanden uploaden →</a>`;
    try {
        await emails.sendEmail({ to: clientEmail, subject: `Aanvullende documenten gevraagd — ${request.bedrijfsnaam || dossierNr}`, bodyHtml });
    } catch(e) { console.warn('File request email failed:', e.message); }
    addActivity(request, 'system', `Bestandsupload gevraagd door ${adminName}. E-mail verstuurd naar ${clientEmail}.`, adminName);
    await supabase.from('reseller_requests').update({ activities: request.activities }).eq('id', dossierNr);
    res.json({ ok: true, uploadUrl });
});

// POST /api/dossier-files/upload  — client uploads files (token-authenticated)
app.post('/api/dossier-files/upload', async (req, res) => {
    const { nr, token, files } = req.body || {};
    if (!nr || !token || !Array.isArray(files) || !files.length) return res.status(400).json({ error: 'Ongeldige aanvraag' });
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', nr).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });
    if (!tokenMatches(row.access_token, token)) return res.status(401).json({ error: 'Ongeldige toegangscode' });
    const request = rowToReq(row);
    const results = [];
    for (const f of files) {
        if (!f.name || !f.base64) continue;
        const safeName = String(f.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
        const filePath = `${nr}/${Date.now()}_${safeName}`;
        const buf = Buffer.from(f.base64, 'base64');
        const { error } = await supabase.storage.from(FILE_BUCKET).upload(filePath, buf, { contentType: f.type || 'application/octet-stream', upsert: false });
        if (!error) results.push({ name: safeName, path: filePath });
    }
    if (!results.length) return res.status(500).json({ error: 'Upload mislukt' });
    const names = results.map(r => r.name).join(', ');
    addActivity(request, 'file-upload', `Klant heeft ${results.length} bestand(en) geüpload: ${names}`, null);
    await supabase.from('reseller_requests').update({ activities: request.activities }).eq('id', nr);
    res.json({ ok: true, uploaded: results.length });
});

// GET /api/dossier-files/:nr  — admin lists uploaded files
app.get('/api/dossier-files/:nr', requireAdmin, async (req, res) => {
    const nr = req.params.nr;
    const { data, error } = await supabase.storage.from(FILE_BUCKET).list(nr, { sortBy: { column: 'created_at', order: 'desc' } });
    if (error) return res.status(500).json({ error: error.message });
    const files = await Promise.all((data || []).map(async f => {
        const { data: urlData } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(`${nr}/${f.name}`, 3600);
        return { name: f.name.replace(/^\d+_/, ''), path: `${nr}/${f.name}`, url: urlData?.signedUrl || null, size: f.metadata?.size || 0, created_at: f.created_at };
    }));
    res.json(files);
});

// Export for Vercel
module.exports = app;

// Start locally
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                   AandelenXpress Server                      ║
    ║                                                              ║
    ║  🚀 Server running on: http://localhost:${PORT}              ║
    ║                                                              ║
    ║  📝 Demo Users:                                              ║
    ║     Reseller: demo@kantoor.nl / 123456                       ║
    ║     Admin:    admin@aandelenxpress.nl / 123456               ║
    ║                                                              ║
    ║  ✅ Open je browser en ga naar http://localhost:${PORT}      ║
    ║  ✅ Druk Ctrl+C om de server te stoppen                     ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
    });
}
