require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const emails = require('./emails');

const PORT = process.env.PORT || 3000;

// Create Express app
const app = express();

// Approved users (starts with demo accounts, grows as resellers are approved)
const approvedUsers = {
    'demo@kantoor.nl': {
        password: '123456',
        type: 'reseller',
        name: 'Demo Kantoor',
        company: 'Van der Bergh Accountants',
        companyId: 'vdb-001',
        status: 'active'
    },
    'admin@aandelenxpress.nl': {
        password: '123456',
        type: 'admin',
        name: 'Admin User',
        company: 'AandelenXpress',
        companyId: 'aax-admin',
        status: 'active'
    }
};

// Additional test users
const testUsers = {
    'jan@bakker.nl': {
        password: '123456',
        type: 'reseller',
        name: 'Jan Bakker',
        company: 'Bakker Accountants',
        companyId: 'bakker-001',
        status: 'active'
    },
    'kees@vanderberg.nl': {
        password: '123456',
        type: 'reseller',
        name: 'Kees van Berg',
        company: 'Van der Berg & Co',
        companyId: 'vdb-002',
        status: 'active'
    }
};

// All approved users combined
const allUsers = { ...approvedUsers, ...testUsers };

// Pending reseller registrations (in-memory; resets on server restart)
const pendingResellers = [];

// Support tickets (in-memory; resets on server restart)
let ticketCounter = 1000;
const tickets = [
    { id: "TK-001", partner: "Bakker Accountants", subject: "Toegang iDIN portaal werkt niet", priority: "high", date: "2026-04-24", status: "Open", email: "contact@bakker.nl", replies: [] },
    { id: "TK-002", partner: "Van der Berg & Co", subject: "KvK bevestiging niet ontvangen", priority: "medium", date: "2026-04-23", status: "Open", email: "info@vandenberg.nl", replies: [] },
    { id: "TK-003", partner: "Dijkstra Partners", subject: "Vraag over facturatiemodel", priority: "low", date: "2026-04-22", status: "Open", email: "admin@dijkstra.nl", replies: [] },
    { id: "TK-004", partner: "Smit & Assoc.", subject: "Logo updaten in portaal", priority: "low", date: "2026-04-20", status: "Open", email: "office@smit.nl", replies: [] }
];

// Reseller requests (in-memory; resets on server restart)
let requestCounter = 5000;
const resellerRequests = [];

// Vragenlijst submissions (in-memory; resets on server restart)
const vragenlijsten = [];

// Blog posts (in-memory; resets on server restart)
let blogPostCounter = 1000;
const blogPosts = [];

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieSession({
    name: 'aax_session',
    keys: ['aandelenxpress-secret-key-2026'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
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

// Serve static files from the public directory
const publicPath = path.join(__dirname, 'public');
console.log('Serving static files from:', publicPath);

app.use(express.static(publicPath, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.json')) {
      res.set('Content-Type', 'application/json');
    } else if (filePath.endsWith('.svg')) {
      res.set('Content-Type', 'image/svg+xml');
    } else if (filePath.endsWith('.avif')) {
      res.set('Content-Type', 'image/avif');
    } else if (filePath.endsWith('.png')) {
      res.set('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.set('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.gif')) {
      res.set('Content-Type', 'image/gif');
    }
  },
  index: ['index.html']
}));

// Diagnostic endpoint (for debugging Vercel environment)
app.get('/_debug/info', (req, res) => {
    const fs = require('fs');
    const info = {
        node_version: process.version,
        cwd: process.cwd(),
        dirname: __dirname,
        public_path: path.join(__dirname, 'public'),
        public_exists: fs.existsSync(path.join(__dirname, 'public')),
        env: process.env.NODE_ENV,
        public_files: []
    };
    
    try {
        const publicDir = path.join(__dirname, 'public');
        if (fs.existsSync(publicDir)) {
            info.public_files = fs.readdirSync(publicDir).slice(0, 10);
        }
    } catch (e) {
        info.error = e.message;
    }
    
    res.json(info);
});

// Auth middleware
function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.type === 'admin') {
        next();
    } else {
        res.redirect('/login');
    }
}

// Route for the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Login page (serve the form)
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Handle login POST
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email en wachtwoord vereist' });
    }

    const user = allUsers[email];

    if (!user || user.password !== password) {
        // Give a more helpful message if the email is in pending review
        if (pendingResellers.find(r => r.email === email)) {
            return res.status(401).json({ error: 'Uw aanmelding is ontvangen en wordt beoordeeld. U ontvangt bericht zodra uw account is goedgekeurd.' });
        }
        return res.status(401).json({ error: 'Ongeldig e-mailadres of wachtwoord' });
    }

    // Set session
    req.session.user = {
        email,
        name: user.name,
        company: user.company,
        type: user.type
    };

    // Redirect based on user type
    const redirectUrl = user.type === 'admin' ? '/admin-dashboard' : '/reseller-dashboard';
    res.json({ success: true, redirect: redirectUrl });
});

// Handle logout
app.get('/api/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

// Reseller dashboard
app.get('/reseller-dashboard.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'reseller-dashboard.html'));
});

// Admin dashboard
app.get('/admin-dashboard.html', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// API endpoint to get current user
app.get('/api/user', (req, res) => {
    if (req.session && req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// ── Registration ──────────────────────────────────────────
app.post('/api/register', (req, res) => {
    const { kantoor, kvk, naam, email, telefoon, password, password2 } = req.body;

    if (!kantoor || !kvk || !naam || !email || !telefoon || !password || !password2) {
        return res.status(400).json({ error: 'Alle velden zijn verplicht' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Voer een geldig e-mailadres in' });
    }

    if (password !== password2) {
        return res.status(400).json({ error: 'Wachtwoorden komen niet overeen' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Wachtwoord moet minimaal 8 tekens bevatten' });
    }

    if (approvedUsers[email]) {
        return res.status(409).json({ error: 'Dit e-mailadres is al geregistreerd' });
    }

    if (pendingResellers.find(r => r.email === email)) {
        return res.status(409).json({ error: 'Er staat al een aanmelding open voor dit e-mailadres' });
    }

    pendingResellers.push({
        kantoor, kvk, naam, email, telefoon, password,
        aangemeld: new Date().toISOString()
    });

    // Transactionele emails: admin notificatie + bevestiging aan aanvrager
    emails.emailAdminNewRegistration({ name: naam, email, company: kantoor, phone: telefoon });
    emails.emailApplicantRegistrationReceived({ name: naam, email });

    res.json({ success: true });
});

// ── Admin: list pending registrations ────────────────────
app.get('/api/admin/pending', requireAdmin, (req, res) => {
    // Return everything except the password
    res.json(pendingResellers.map(({ password, ...rest }) => rest));
});

// ── Admin: approve a registration ────────────────────────
app.post('/api/admin/approve', requireAdmin, (req, res) => {
    const { email } = req.body;
    const idx = pendingResellers.findIndex(r => r.email === email);
    if (idx === -1) return res.status(404).json({ error: 'Aanmelding niet gevonden' });

    const r = pendingResellers[idx];
    allUsers[r.email] = {
        password: r.password,
        type: 'reseller',
        name: r.naam,
        company: r.kantoor,
        companyId: 'reseller-' + Math.random().toString(36).substr(2, 9),
        status: 'active'
    };
    pendingResellers.splice(idx, 1);

    // Notificeer de reseller dat zijn account is goedgekeurd
    emails.emailResellerApproved({ name: r.naam, email: r.email });

    res.json({ success: true });
});

// ── Admin: reject a registration ─────────────────────────
app.post('/api/admin/reject', requireAdmin, (req, res) => {
    const { email } = req.body;
    const idx = pendingResellers.findIndex(r => r.email === email);
    if (idx === -1) return res.status(404).json({ error: 'Aanmelding niet gevonden' });

    const r = pendingResellers[idx];
    pendingResellers.splice(idx, 1);

    // Notificeer de reseller dat zijn aanmelding is afgewezen
    emails.emailResellerRejected({ name: r.naam, email: r.email, reason: req.body.reason || null });

    res.json({ success: true });
});

// Serve registration page
app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// ──────────────────────────────────────────────────────
// ── USER MANAGEMENT (Admin only) ──────────────────────
// ──────────────────────────────────────────────────────

// Get all users (with filters)
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const type = req.query.type || 'all'; // 'admin', 'reseller', 'all'
    
    const list = Object.entries(allUsers).map(([email, u]) => ({
        email,
        name: u.name,
        company: u.company,
        type: u.type,
        status: u.status || 'active',
        companyId: u.companyId || ''
    })).filter(u => type === 'all' || u.type === type);
    
    res.json(list);
});

// Add new admin user
app.post('/api/admin/users/add', requireAdmin, (req, res) => {
    const { email, name, password } = req.body;
    
    if (!email || !name || !password) {
        return res.status(400).json({ error: 'Alle velden verplicht' });
    }
    
    if (allUsers[email]) {
        return res.status(409).json({ error: 'Email bestaat al' });
    }
    
    allUsers[email] = {
        password,
        type: 'admin',
        name,
        company: 'AandelenXpress',
        companyId: 'aax-admin-' + Math.random().toString(36).substr(2, 5),
        status: 'active'
    };
    
    res.json({ success: true });
});

// Reset user password
app.post('/api/admin/users/reset-password', requireAdmin, (req, res) => {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
        return res.status(400).json({ error: 'Email en wachtwoord verplicht' });
    }
    
    const user = allUsers[email];
    if (!user) {
        return res.status(404).json({ error: 'User niet gevonden' });
    }
    
    user.password = newPassword;
    res.json({ success: true });
});

// Toggle user status (active/inactive)
app.post('/api/admin/users/toggle-status', requireAdmin, (req, res) => {
    const { email } = req.body;
    
    const user = allUsers[email];
    if (!user) {
        return res.status(404).json({ error: 'User niet gevonden' });
    }
    
    user.status = user.status === 'active' ? 'inactive' : 'active';
    res.json({ success: true, status: user.status });
});

// Delete user
app.post('/api/admin/users/delete', requireAdmin, (req, res) => {
    const { email } = req.body;
    
    if (email === 'admin@aandelenxpress.nl') {
        return res.status(403).json({ error: 'Kan hoofdadmin niet verwijderen' });
    }
    
    if (!allUsers[email]) {
        return res.status(404).json({ error: 'User niet gevonden' });
    }
    
    delete allUsers[email];
    res.json({ success: true });
});

// ─ Reseller Request endpoints ────────────────────────────────────────────────

// POST create new reseller request
app.post('/api/reseller-requests', requireLogin, express.json(), (req, res) => {
    const { clientName, clientEmail, clientPhone, oprichtingType, gewenstNaam, doel, aandeelhouders, kapitaal, startSaldo, opmerkingen } = req.body;
    
    if (!clientName || !clientEmail || !oprichtingType || !gewenstNaam || !doel) {
        return res.status(400).json({ error: 'Verplichte velden ontbreken' });
    }
    
    const request = {
        id: `RR-${++requestCounter}`,
        resellerId: req.session.user.email,
        resellerName: req.session.user.name,
        resellerCompany: req.session.user.company,
        clientName,
        clientEmail,
        clientPhone: clientPhone || '',
        oprichtingType,
        gewenstNaam,
        doel,
        aandeelhouders: aandeelhouders || 1,
        kapitaal: kapitaal || 0.01,
        startSaldo: startSaldo || 0,
        opmerkingen: opmerkingen || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
        approvedAt: null,
        approvedBy: null,
        rejectionReason: null
    };
    
    resellerRequests.push(request);

    // Notificeer admin van nieuwe opdracht
    // ⚠️  Klant ontvangt GEEN email bij aanmaken — alleen na goedkeuring (zie approve endpoint)
    emails.emailAdminNewRequest({ request });

    res.status(201).json(request);
});

// GET my reseller requests (reseller view)
app.get('/api/my-requests', requireLogin, (req, res) => {
    const userRequests = resellerRequests.filter(r => r.resellerId === req.session.user.email);
    res.json(userRequests);
});

// GET all pending reseller requests (admin only)
app.get('/api/reseller-requests', requireAdmin, (req, res) => {
    const status = req.query.status || 'pending'; // 'pending', 'approved', 'rejected', 'all'
    const filtered = status === 'all' 
        ? resellerRequests 
        : resellerRequests.filter(r => r.status === status);
    
    res.json(filtered);
});

// PATCH approve reseller request (admin only)
app.patch('/api/reseller-requests/:id/approve', requireAdmin, express.json(), (req, res) => {
    const { id } = req.params;
    const request = resellerRequests.find(r => r.id === id);
    
    if (!request) {
        return res.status(404).json({ error: 'Aanvraag niet gevonden' });
    }
    
    // Move to approved status
    request.status = 'approved';
    request.approvedAt = new Date().toISOString();
    request.approvedBy = req.session.user.email;

    // Notificeer reseller + stuur klant email met link naar vragenlijst
    emails.emailResellerRequestApproved({ request });
    emails.emailClientCaseApproved({ request });

    res.json(request);
});

// PATCH reject reseller request (admin only)
app.patch('/api/reseller-requests/:id/reject', requireAdmin, express.json(), (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const request = resellerRequests.find(r => r.id === id);
    
    if (!request) {
        return res.status(404).json({ error: 'Aanvraag niet gevonden' });
    }
    
    // Mark as rejected
    request.status = 'rejected';
    request.rejectionReason = reason || 'Aanvraag afgewezen';

    // Notificeer reseller dat opdracht is afgewezen
    emails.emailResellerRequestRejected({ request });

    res.json(request);
});

// ─ Ticket endpoints ────────────────────────────────────────────────────────

// GET ticket (can be dossier tickets or single ticket)
app.get('/api/tickets/:id', (req, res) => {
    const { id } = req.params;
    
    // If it's a dossier number (starts with AX-), return all tickets for that dossier
    if (id.startsWith('AX-')) {
        const dossierTickets = tickets.filter(t => t.dossierNr === id);
        return res.json(dossierTickets);
    }
    
    // Otherwise, treat it as a ticket ID (TK-xxx)
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket niet gevonden' });
    }
    res.json(ticket);
});

// GET count of new/unread tickets (updates since last check)
app.get('/api/tickets-count', (req, res) => {
    const newCount = tickets.filter(t => !t.read).length;
    res.json({ count: newCount });
});

// POST create new ticket
app.post('/api/tickets', express.json(), (req, res) => {
    const { dossierNr, subject, message, senderName, senderEmail } = req.body;
    
    if (!dossierNr || !subject || !message) {
        return res.status(400).json({ error: 'Dossier, onderwerp en bericht vereist' });
    }
    
    const ticket = {
        id: `TK-${++ticketCounter}`,
        dossierNr,
        subject,
        message,
        senderName,
        senderEmail,
        status: 'open',
        read: false,
        createdAt: new Date().toISOString()
    };
    
    tickets.push(ticket);

    // Notificeer admin + stuur bevestiging aan indiener
    emails.emailAdminNewTicket({ ticket });
    emails.emailTicketSenderConfirmation({ ticket });

    res.status(201).json(ticket);
});

// PATCH mark ticket as read
app.patch('/api/tickets/:ticketId', express.json(), (req, res) => {
    const { ticketId } = req.params;
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket niet gevonden' });
    }
    
    ticket.read = true;
    res.json(ticket);
});

// GET all tickets (admin only)
app.get('/api/admin/tickets', requireAdmin, (req, res) => {
    res.json(tickets);
});

// POST reply to ticket (admin only)
app.post('/api/tickets/:ticketId/reply', requireAdmin, express.json(), (req, res) => {
    const { ticketId } = req.params;
    const { message } = req.body;
    
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket niet gevonden' });
    }
    
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Bericht is vereist' });
    }
    
    // Initialize replies array if needed
    if (!ticket.replies) {
        ticket.replies = [];
    }
    
    // Add reply and auto-set status to 'Replied' if not yet replied
    ticket.replies.push({
        author: req.session.user.name,
        email: req.session.user.email,
        message: message.trim(),
        createdAt: new Date().toISOString()
    });
    
    // Auto-update status to 'Replied' on first reply
    if (ticket.status === 'open' || ticket.status === 'Open') {
        ticket.status = 'Replied';
    }

    // Notificeer de indiener van het ticket over de reactie
    emails.emailTicketReply({
        ticket,
        replyMessage: message.trim(),
        adminName: req.session.user.name,
    });

    res.json(ticket);
});

// PATCH update ticket status (admin only)
app.patch('/api/tickets/:ticketId/status', requireAdmin, express.json(), (req, res) => {
    const { ticketId } = req.params;
    const { status } = req.body;
    
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket niet gevonden' });
    }
    
    const validStatuses = ['Open', 'Waiting', 'Replied', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Ongeldig status' });
    }
    
    ticket.status = status;
    res.json(ticket);
});

// ─ Vragenlijst endpoints ────────────────────────────────────────────────────

// GET public case info (only for approved cases — used by vragenlijst page)
app.get('/api/request-info/:id', (req, res) => {
    const request = resellerRequests.find(r => r.id === req.params.id);
    if (!request || request.status !== 'approved') {
        return res.status(404).json({ error: 'Dossier niet gevonden of nog niet goedgekeurd' });
    }
    res.json({
        id: request.id,
        clientName: request.clientName,
        clientEmail: request.clientEmail,
        oprichtingType: request.oprichtingType,
        gewenstNaam: request.gewenstNaam,
        resellerName: request.resellerName,
        resellerCompany: request.resellerCompany,
    });
});

// POST submit vragenlijst (public — client fills this in)
app.post('/api/vragenlijst', express.json({ limit: '25mb' }), (req, res) => {
    const { caseId, spoed, nederlandsTaal, engelsTaal, taalOpmerking, contactEmail,
            sector, typeOprichting, datacardBestand, pepBestand, opmerkingen } = req.body;

    if (!caseId || !spoed || !contactEmail || !sector || !typeOprichting) {
        return res.status(400).json({ error: 'Verplichte velden ontbreken' });
    }

    const request = resellerRequests.find(r => r.id === caseId && r.status === 'approved');
    if (!request) {
        return res.status(404).json({ error: 'Opdracht niet gevonden of nog niet goedgekeurd' });
    }

    // Upsert: overschrijf als de klant al eerder indiende
    const existing = vragenlijsten.findIndex(v => v.caseId === caseId);
    const submission = {
        caseId,
        clientName: request.clientName,
        clientEmail: request.clientEmail,
        resellerCompany: request.resellerCompany,
        gewenstNaam: request.gewenstNaam,
        oprichtingType: request.oprichtingType,
        spoed,
        nederlandsTaal,
        engelsTaal,
        taalOpmerking: taalOpmerking || '',
        contactEmail,
        sector,
        typeOprichting,
        datacardBestandNaam: datacardBestand ? datacardBestand.naam : null,
        datacardBestandData: datacardBestand ? datacardBestand.data : null,
        pepBestandNaam: pepBestand ? pepBestand.naam : null,
        pepBestandData: pepBestand ? pepBestand.data : null,
        opmerkingen: opmerkingen || '',
        submittedAt: new Date().toISOString(),
    };

    if (existing !== -1) {
        vragenlijsten[existing] = submission;
    } else {
        vragenlijsten.push(submission);
    }

    // Notificeer admin
    emails.emailAdminVragenlijstSubmitted({ submission });

    res.json({ success: true });
});

// GET all vragenlijst submissions (admin only)
app.get('/api/admin/vragenlijsten', requireAdmin, (req, res) => {
    // Return without raw file data to keep response small
    const result = vragenlijsten.map(({ datacardBestandData, pepBestandData, ...rest }) => rest);
    res.json(result);
});

// ─ Blog endpoints ──────────────────────────────────────────────────────────

// GET all published blog posts (public)
app.get('/api/blog/posts', (req, res) => {
    const draft = req.query.draft === 'true';
    const filtered = draft ? blogPosts : blogPosts.filter(p => p.published);
    res.json(filtered);
});

// POST create new blog post (admin only)
app.post('/api/blog/posts', requireAdmin, (req, res) => {
    const { title, excerpt, content, categories, featured, published, author } = req.body;
    
    if (!title || !content) {
        return res.status(400).json({ error: 'Titel en inhoud verplicht' });
    }
    
    const post = {
        id: `blog-${++blogPostCounter}`,
        title,
        excerpt: excerpt || title.substring(0, 100),
        content,
        categories: categories || [],
        featured: featured || false,
        published: published || false,
        author: author || req.session.user.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    blogPosts.push(post);
    res.status(201).json(post);
});

// GET single blog post (public)
app.get('/api/blog/posts/:id', (req, res) => {
    const { id } = req.params;
    const post = blogPosts.find(p => p.id === id);
    
    if (!post || (!post.published && (!req.session || !req.session.user || req.session.user.type !== 'admin'))) {
        return res.status(404).json({ error: 'Post niet gevonden' });
    }
    
    res.json(post);
});

// PATCH update blog post (admin only)
app.patch('/api/blog/posts/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { title, excerpt, content, categories, featured, published, author } = req.body;
    const post = blogPosts.find(p => p.id === id);
    
    if (!post) {
        return res.status(404).json({ error: 'Post niet gevonden' });
    }
    
    if (title) post.title = title;
    if (excerpt !== undefined) post.excerpt = excerpt;
    if (content) post.content = content;
    if (categories) post.categories = categories;
    if (featured !== undefined) post.featured = featured;
    if (published !== undefined) post.published = published;
    if (author) post.author = author;
    post.updatedAt = new Date().toISOString();
    
    res.json(post);
});

// DELETE blog post (admin only)
app.delete('/api/blog/posts/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const idx = blogPosts.findIndex(p => p.id === id);
    
    if (idx === -1) {
        return res.status(404).json({ error: 'Post niet gevonden' });
    }
    
    blogPosts.splice(idx, 1);
    res.json({ success: true });
});

// Fallback: Serve public files directly if static middleware didn't catch them
app.use((req, res, next) => {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', req.path);
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            // Determine MIME type and serve
            if (filePath.endsWith('.css')) {
                res.set('Content-Type', 'text/css; charset=utf-8');
            } else if (filePath.endsWith('.js')) {
                res.set('Content-Type', 'application/javascript; charset=utf-8');
            }
            return res.sendFile(filePath);
        }
    } catch (e) {
        // Continue to next middleware
    }
    next();
});

// Export app for Vercel
module.exports = app;

// Start server if running directly (not as a Vercel function)
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
