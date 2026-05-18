require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const fs = require('fs');
const emails = require('./emails');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const app = express();

// ── Supabase client (service role bypasses RLS) ────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Helper: camelCase ↔ snake_case mapping voor reseller_requests ──────────
function reqToRow(r) {
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
        opmerkingen:       r.opmerkingen || '',
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
        opmerkingen:      row.opmerkingen,
        status:           row.status,
        createdAt:        row.created_at,
        approvedAt:       row.approved_at,
        approvedBy:       row.approved_by,
        rejectionReason:  row.rejection_reason,
        statusUpdatedAt:  row.status_updated_at,
        activities:       row.activities || []
    };
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

function generateSmartToken(request) {
    const firstName = (request.clientName || '').split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const bvName = (request.gewenstNaam || '').toLowerCase().replace(/\s+b\.?v\.?$/i, '').replace(/[^a-z0-9]/g, '');
    return (firstName + bvName).slice(0, 20) || generateToken();
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
const protectedPages = ['admin-dashboard', 'reseller-dashboard', 'blog-admin', 'dossier-detail', 'ticket-detail', 'partner-detail', 'dossier-status'];
app.get('/:page.html', (req, res, next) => {
    const page = req.params.page;
    if (protectedPages.includes(page)) return next();
    if (page === 'index') return res.redirect(301, '/');
    return res.redirect(301, `/${page}`);
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
        const { data: pending } = await supabase.from('pending_resellers').select('email').eq('email', email).single();
        if (pending) return res.status(401).json({ error: 'Uw aanmelding is ontvangen en wordt beoordeeld. U ontvangt bericht zodra uw account is goedgekeurd.' });
        return res.status(401).json({ error: 'Ongeldig e-mailadres of wachtwoord' });
    }
    if (user.status === 'inactive') return res.status(401).json({ error: 'Uw account is gedeactiveerd. Neem contact op met AandelenXpress.' });

    req.session.user = { email, name: user.name, company: user.company, type: user.type };
    res.json({ success: true, redirect: user.type === 'admin' ? '/admin-dashboard' : '/reseller-dashboard' });
});

app.get('/api/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

app.get('/api/user', (req, res) => {
    if (req.session && req.session.user) return res.json(req.session.user);
    res.status(401).json({ error: 'Not logged in' });
});

// ── Registration ───────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    const { kantoor, kvk, naam, email, telefoon, password, password2 } = req.body;

    if (!kantoor || !kvk || !naam || !email || !telefoon || !password || !password2)
        return res.status(400).json({ error: 'Alle velden zijn verplicht' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Voer een geldig e-mailadres in' });
    if (password !== password2)
        return res.status(400).json({ error: 'Wachtwoorden komen niet overeen' });
    if (password.length < 8)
        return res.status(400).json({ error: 'Wachtwoord moet minimaal 8 tekens bevatten' });

    const { data: existing } = await supabase.from('users').select('email').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Dit e-mailadres is al geregistreerd' });

    const { data: existingPending } = await supabase.from('pending_resellers').select('email').eq('email', email).single();
    if (existingPending) return res.status(409).json({ error: 'Er staat al een aanmelding open voor dit e-mailadres' });

    await supabase.from('pending_resellers').insert({ email, kantoor, kvk, naam, telefoon, password, aangemeld: new Date().toISOString() });
    emails.emailAdminNewRegistration({ name: naam, email, company: kantoor, phone: telefoon });
    emails.emailApplicantRegistrationReceived({ name: naam, email });
    res.json({ success: true });
});

// ── Admin: pending registrations ───────────────────────────────────────────
app.get('/api/admin/pending', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('pending_resellers').select('email, kantoor, kvk, naam, telefoon, aangemeld').order('aangemeld', { ascending: false });
    res.json(data || []);
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

    await supabase.from('pending_resellers').delete().eq('email', email);
    emails.emailResellerRejected({ name: r.naam, email: r.email, reason: req.body.reason || null });
    res.json({ success: true });
});

// ── User Management ────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const type = req.query.type || 'all';
    let q = supabase.from('users').select('email, name, company, type, status, company_id');
    if (type !== 'all') q = q.eq('type', type);
    const { data } = await q;
    res.json((data || []).map(u => ({ ...u, companyId: u.company_id })));
});

app.post('/api/admin/users/add', requireAdmin, async (req, res) => {
    const { email, name, password } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'Alle velden verplicht' });
    const { error } = await supabase.from('users').insert({
        email, name, password, type: 'admin',
        company: 'AandelenXpress',
        company_id: 'aax-admin-' + Math.random().toString(36).substr(2, 5),
        status: 'active'
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
    const { clientName, clientEmail, clientPhone, oprichtingType, gewenstNaam, doel, aandeelhouders, kapitaal, startSaldo, opmerkingen } = req.body;

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
    res.json((data || []).map(rowToReq));
});

app.get('/api/reseller-requests', requireAdmin, async (req, res) => {
    const status = req.query.status || 'pending';
    let q = supabase.from('reseller_requests').select('*').order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    const { data } = await q;
    res.json((data || []).map(rowToReq));
});

// Public dossier status (token-protected)
app.get('/api/dossier-status/:id', async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Dossier niet gevonden' });
    const { token } = req.query;
    if (!token || row.access_token !== token) return res.status(401).json({ error: 'Ongeldig wachtwoord' });
    const typeMap = { 'bv':'B.V.', 'bv-holding':'Holdings B.V.', 'bv-spoed':'B.V. (spoed)', 'eenmanszaak-omzetten':'Eenmanszaak naar B.V.', 'advies':'Advies' };
    const statusMap = {
        'pending':     { key:'pending',     text:'Aanvraag ingediend' },
        'approved':    { key:'vragenlijst', text:'Vragenlijst' },
        'vragenlijst': { key:'vragenlijst', text:'Vragenlijst' },
        'betaling':    { key:'betaling',    text:'Betaling' },
        'notary':      { key:'notary',      text:'Notariele Akte' },
        'kvk':         { key:'kvk',         text:'KvK inschrijving' },
        'complete':    { key:'complete',    text:'Voltooid' },
        'rejected':    { key:'rejected',    text:'Afgewezen' },
    };
    const s = statusMap[row.status] || { key: 'pending', text: 'In behandeling' };
    res.json({ id: row.id, name: row.gewenst_naam || row.client_name, type: typeMap[row.oprichting_type] || row.oprichting_type || '-', partner: row.reseller_company || '-', statusKey: s.key, statusText: s.text, date: row.created_at });
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
    res.json(rowToReq(row));
});

app.patch('/api/reseller-requests/:id/approve', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Aanvraag niet gevonden' });

    const request = rowToReq(row);
    request.status     = 'vragenlijst';
    request.approvedAt = new Date().toISOString();
    request.approvedBy = req.session.user.email;
    const approver = req.session.user.name || req.session.user.email;
    addActivity(request, 'system', `Dossier goedgekeurd door ${approver}. Vragenlijst email verstuurd naar ${request.clientEmail}.`, approver);

    await supabase.from('reseller_requests').update({
        status: request.status, approved_at: request.approvedAt,
        approved_by: request.approvedBy, activities: request.activities
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
    const valid = ['pending', 'vragenlijst', 'betaling', 'notary', 'kvk', 'complete', 'rejected', 'approved'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Ongeldige status' });

    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });

    const request = rowToReq(row);
    const statusLabels = { pending:'Aanvraag ingediend', vragenlijst:'Vragenlijst', approved:'Vragenlijst', betaling:'Betaling', notary:'Notariele Akte', kvk:'KvK inschrijving', complete:'Voltooid', rejected:'Afgewezen' };
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

app.get('/api/reseller-requests/:id/activities', requireLogin, async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('id, reseller_id, activities').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Niet gevonden' });
    if (req.session.user.type !== 'admin' && row.reseller_id !== req.session.user.email)
        return res.status(403).json({ error: 'Geen toegang' });
    res.json(row.activities || []);
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

// ── Tickets ────────────────────────────────────────────────────────────────
app.get('/api/tickets/:id', async (req, res) => {
    const { id } = req.params;
    if (id.startsWith('AX-') || id.startsWith('RR-')) {
        const { data } = await supabase.from('tickets').select('*').eq('dossier_nr', id);
        return res.json(data || []);
    }
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket niet gevonden' });
    res.json(ticket);
});

app.get('/api/tickets-count', async (req, res) => {
    const { count } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('read', false);
    res.json({ count: count || 0 });
});

app.post('/api/tickets', async (req, res) => {
    const { dossierNr, subject, message, senderName, senderEmail } = req.body;
    if (!dossierNr || !subject || !message) return res.status(400).json({ error: 'Dossier, onderwerp en bericht vereist' });

    const { data: idData } = await supabase.rpc('next_ticket_id');
    const now = new Date().toISOString();
    const ticketRow = { id: idData, dossier_nr: dossierNr, subject, message, sender_name: senderName, sender_email: senderEmail, status: 'open', read: false, created_at: now, replies: [] };
    await supabase.from('tickets').insert(ticketRow);

    const ticketEmail = { id: ticketRow.id, dossierNr, subject, message, senderName, senderEmail, status: 'open', read: false, createdAt: now, replies: [] };
    emails.emailAdminNewTicket({ ticket: ticketEmail });
    emails.emailTicketSenderConfirmation({ ticket: ticketEmail });
    res.status(201).json(ticketEmail);
});

app.patch('/api/tickets/:ticketId', async (req, res) => {
    const { data: ticket } = await supabase.from('tickets').update({ read: true }).eq('id', req.params.ticketId).select().single();
    if (!ticket) return res.status(404).json({ error: 'Ticket niet gevonden' });
    res.json(ticket);
});

app.get('/api/admin/tickets', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
    res.json(data || []);
});

app.post('/api/tickets/:ticketId/reply', requireAdmin, async (req, res) => {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Bericht is vereist' });

    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', req.params.ticketId).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket niet gevonden' });

    const reply = { author: req.session.user.name, email: req.session.user.email, message: message.trim(), createdAt: new Date().toISOString() };
    const replies = [...(ticket.replies || []), reply];
    const newStatus = (ticket.status === 'open' || ticket.status === 'Open') ? 'Replied' : ticket.status;
    await supabase.from('tickets').update({ replies, status: newStatus }).eq('id', req.params.ticketId);
    emails.emailTicketReply({ ticket: { ...ticket, replies, status: newStatus }, replyMessage: message.trim(), adminName: req.session.user.name });
    res.json({ ...ticket, replies, status: newStatus });
});

app.patch('/api/tickets/:ticketId/status', requireAdmin, async (req, res) => {
    const { status } = req.body;
    const valid = ['Open', 'Waiting', 'Replied', 'Resolved', 'Closed'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Ongeldig status' });
    const { data: ticket } = await supabase.from('tickets').update({ status }).eq('id', req.params.ticketId).select().single();
    if (!ticket) return res.status(404).json({ error: 'Ticket niet gevonden' });
    res.json(ticket);
});

// ── Vragenlijsten ──────────────────────────────────────────────────────────
app.get('/api/request-info/:id', async (req, res) => {
    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', req.params.id).single();
    if (!row || row.status !== 'approved') return res.status(404).json({ error: 'Dossier niet gevonden of nog niet goedgekeurd' });
    const { token } = req.query;
    if (!token || row.access_token !== token) return res.status(401).json({ error: 'Ongeldige toegangscode' });
    res.json({ id: row.id, clientName: row.client_name, clientEmail: row.client_email, oprichtingType: row.oprichting_type, gewenstNaam: row.gewenst_naam, resellerName: row.reseller_name, resellerCompany: row.reseller_company });
});

app.post('/api/vragenlijst', async (req, res) => {
    const { caseId, token, contactEmail } = req.body;
    if (!caseId || !contactEmail) return res.status(400).json({ error: 'Verplichte velden ontbreken' });

    const { data: row } = await supabase.from('reseller_requests').select('*').eq('id', caseId).single();
    if (!row || !['approved','vragenlijst','betaling','notary','kvk','complete'].includes(row.status))
        return res.status(404).json({ error: 'Opdracht niet gevonden of nog niet goedgekeurd' });
    if (!token || row.access_token !== token) return res.status(401).json({ error: 'Ongeldige toegangscode' });

    const { token: _tok, ...formData } = req.body;
    const submission = { ...formData, caseId, clientName: row.client_name, clientEmail: row.client_email, resellerCompany: row.reseller_company, gewenstNaam: row.gewenst_naam, oprichtingType: row.oprichting_type, submittedAt: new Date().toISOString() };
    await supabase.from('vragenlijsten').upsert({ case_id: caseId, data: submission, submitted_at: submission.submittedAt });
    emails.emailAdminVragenlijstSubmitted({ submission });
    res.json({ success: true });
});

app.get('/api/admin/vragenlijsten', requireAdmin, async (req, res) => {
    const { data } = await supabase.from('vragenlijsten').select('case_id, submitted_at, data');
    const result = (data || []).map(row => {
        const { datacardBestandData, pepBestandData, ...rest } = row.data || {};
        return { caseId: row.case_id, submittedAt: row.submitted_at, ...rest };
    });
    res.json(result);
});

app.get('/api/vragenlijsten/:caseId', requireAdmin, async (req, res) => {
    const { data: row } = await supabase.from('vragenlijsten').select('*').eq('case_id', req.params.caseId).single();
    if (!row) return res.status(404).json({ error: 'Geen vragenlijst gevonden' });
    const { datacardBestandData, pepBestandData, ...rest } = row.data || {};
    res.json({ caseId: row.case_id, submittedAt: row.submitted_at, ...rest, datacardIngediend: !!row.data?.datacardBestandNaam, pepIngediend: !!row.data?.pepBestandNaam });
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
