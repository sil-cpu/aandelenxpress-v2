/**
 * AandelenXpress — Transactional Email Module
 * 
 * Gebruikt Resend voor alle transactionele emails.
 * 
 * ⚠️  Tijdelijk: geen eigen domein geverifieerd.
 *     from:  onboarding@resend.dev  (verplicht zolang geen domein geverifieerd)
 *     to:    TEST_EMAIL in .env     (redirect alle emails naar test-adres)
 * 
 * Zodra domein geverifieerd:
 *   1. Verander FROM_ADDRESS naar bijv. 'noreply@aandelenxpress.nl'
 *   2. Verwijder TEST_EMAIL uit .env → echte ontvanger wordt gebruikt
 */

require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ─ Configuratie ─────────────────────────────────────────────────────────────
const FROM_ADDRESS = 'AandelenXpress <onboarding@resend.dev>'; // ← vervang na domeinverificatie
const ADMIN_EMAIL  = 'admin@aandelenxpress.nl';
const BRAND        = 'AandelenXpress';
const SITE_URL     = process.env.SITE_URL || 'https://aandelenxpress.vercel.app';

/**
 * Stuur een email. Als TEST_EMAIL in .env staat, wordt het echte 'to'-adres
 * vervangen zodat alle mails naar één testadres gaan.
 */
async function sendEmail({ to, subject, html }) {
    const recipient = process.env.TEST_EMAIL || to;

    try {
        const result = await resend.emails.send({
            from:    FROM_ADDRESS,
            to:      recipient,
            subject: subject,
            html:    html,
        });
        console.log(`[email] Sent "${subject}" → ${recipient}`, result?.data?.id || '');
        return result;
    } catch (err) {
        // Emails mogen de server NOOIT laten crashen
        console.error(`[email] FAILED "${subject}" → ${recipient}:`, err?.message || err);
        return null;
    }
}

// ─ Email templates ───────────────────────────────────────────────────────────

function layout(bodyHtml) {
    return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${BRAND}</title>
  <style>
    body { margin:0; padding:0; background:#f5f6fa; font-family:Arial,sans-serif; color:#222; }
    .wrap { max-width:580px; margin:40px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
    .header { background:#1a2e5a; padding:28px 32px; }
    .header h1 { margin:0; color:#fff; font-size:22px; letter-spacing:.5px; }
    .header span { color:#4fc3f7; }
    .body { padding:28px 32px; font-size:15px; line-height:1.7; }
    .body h2 { color:#1a2e5a; margin-top:0; }
    .info-box { background:#f0f4ff; border-left:4px solid #1a2e5a; padding:12px 16px; border-radius:4px; margin:16px 0; font-size:14px; }
    .btn { display:inline-block; margin:20px 0; padding:12px 28px; background:#1a2e5a; color:#fff; border-radius:5px; text-decoration:none; font-weight:bold; font-size:15px; }
    .footer { background:#f5f6fa; padding:16px 32px; font-size:12px; color:#888; border-top:1px solid #eee; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Aandelen<span>Xpress</span></h1>
    </div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">
      © ${new Date().getFullYear()} ${BRAND} · Dit is een automatisch bericht, niet beantwoorden.
    </div>
  </div>
</body>
</html>`;
}

// ─── Registratie ──────────────────────────────────────────────────────────────

/** Admin: nieuwe reseller heeft zich aangemeld */
async function emailAdminNewRegistration({ name, email, company, phone }) {
    return sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[${BRAND}] Nieuwe reseller-aanmelding: ${name}`,
        html:    layout(`
            <h2>Nieuwe reseller-aanmelding</h2>
            <p>Er is een nieuwe aanmelding binnengekomen en wacht op jouw goedkeuring.</p>
            <div class="info-box">
                <strong>Naam:</strong> ${name}<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Bedrijf:</strong> ${company || '—'}<br>
                <strong>Telefoon:</strong> ${phone || '—'}
            </div>
            <a class="btn" href="https://aandelenxpress.vercel.app/admin-dashboard">Beheer dashboard</a>
        `),
    });
}

/** Aanvrager: bevestiging van ontvangst registratie */
async function emailApplicantRegistrationReceived({ name, email }) {
    return sendEmail({
        to:      email,
        subject: `${BRAND} — Aanmelding ontvangen`,
        html:    layout(`
            <h2>Bedankt voor je aanmelding, ${name}!</h2>
            <p>We hebben je aanvraag voor een reseller-account goed ontvangen. 
               Ons team beoordeelt je aanmelding zo snel mogelijk.</p>
            <p>Je ontvangt een email zodra je account is goedgekeurd of als we meer informatie nodig hebben.</p>
            <p>Heb je vragen? Neem contact op via <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a>.</p>
        `),
    });
}

// ─── Account goedkeuring / afwijzing ─────────────────────────────────────────

/** Reseller: account goedgekeurd */
async function emailResellerApproved({ name, email }) {
    return sendEmail({
        to:      email,
        subject: `${BRAND} — Je account is goedgekeurd! 🎉`,
        html:    layout(`
            <h2>Welkom bij ${BRAND}, ${name}!</h2>
            <p>Goed nieuws: je reseller-account is <strong>goedgekeurd</strong>. 
               Je kunt nu inloggen en direct aan de slag.</p>
            <div class="info-box">
                <strong>Inloggen:</strong> gebruik het email-adres waarmee je je hebt aangemeld<br>
                <strong>Wachtwoord:</strong> het wachtwoord dat je hebt ingesteld bij registratie
            </div>
            <a class="btn" href="https://aandelenxpress.vercel.app/login">Inloggen</a>
            <p>Vragen? Mail naar <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a>.</p>
        `),
    });
}

/** Reseller: account afgewezen */
async function emailResellerRejected({ name, email, reason }) {
    return sendEmail({
        to:      email,
        subject: `${BRAND} — Aanmelding niet goedgekeurd`,
        html:    layout(`
            <h2>Aanmelding beoordeeld</h2>
            <p>Beste ${name},</p>
            <p>Na beoordeling kunnen we je aanmelding helaas niet goedkeuren.</p>
            ${reason ? `<div class="info-box"><strong>Reden:</strong> ${reason}</div>` : ''}
            <p>Heb je vragen of denk je dat dit een vergissing is? 
               Neem contact met ons op via <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a>.</p>
        `),
    });
}

// ─── Reseller requests (opdrachten) ──────────────────────────────────────────

/** Admin: nieuwe BV-opdracht ingediend */
async function emailAdminNewRequest({ request }) {
    const { id, resellerName, resellerCompany, clientName, clientEmail, oprichtingType, gewenstNaam } = request;
    return sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[${BRAND}] Nieuwe opdracht ${id}: ${oprichtingType} — ${gewenstNaam}`,
        html:    layout(`
            <h2>Nieuwe BV-opdracht ontvangen</h2>
            <p>Partner <strong>${resellerName}</strong> (${resellerCompany}) heeft een nieuwe opdracht ingediend.</p>
            <div class="info-box">
                <strong>Opdracht-ID:</strong> ${id}<br>
                <strong>Type:</strong> ${oprichtingType}<br>
                <strong>Gewenste naam:</strong> ${gewenstNaam}<br>
                <strong>Klant:</strong> ${clientName} (${clientEmail})
            </div>
            <a class="btn" href="https://aandelenxpress.vercel.app/admin-dashboard">Bekijken in dashboard</a>
        `),
    });
}

/** Klant: bevestiging van ontvangst + link naar statuspagina / vragenlijst */
async function emailClientNewRequest({ request }) {
    const { id, clientName, clientEmail, oprichtingType, gewenstNaam, resellerName, resellerCompany } = request;
    const statusUrl = `${SITE_URL}/dossier-status?nr=${id}`;

    return sendEmail({
        to:      clientEmail,
        subject: `Uw BV-aanvraag is ontvangen — ${gewenstNaam}`,
        html:    layout(`
            <h2>Bedankt, ${clientName}!</h2>
            <p>Uw aanvraag voor de oprichting van <strong>${gewenstNaam}</strong> is goed ontvangen 
               via uw adviseur <strong>${resellerName}</strong> (${resellerCompany}).</p>
            <div class="info-box">
                <strong>Type:</strong> ${oprichtingType}<br>
                <strong>Gewenste naam:</strong> ${gewenstNaam}<br>
                <strong>Referentienummer:</strong> ${id}
            </div>
            <p><strong>Wat zijn de volgende stappen?</strong><br>
               Via onderstaande link kunt u de voortgang van uw dossier volgen, 
               de vragenlijst invullen en documenten aanleveren.</p>
            <a class="btn" href="${statusUrl}">Mijn dossier bekijken &amp; vragenlijst invullen</a>
            <p style="font-size:13px;color:#888;margin-top:24px;">
                Bewaar deze email — de link hierboven geeft u toegang tot uw persoonlijke dossier.<br>
                Heeft u vragen? Neem contact op met uw adviseur 
                of mail naar <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a>.
            </p>
        `),
    });
}

/** Reseller: opdracht goedgekeurd door admin */
async function emailResellerRequestApproved({ request }) {
    const { id, resellerName, clientName, oprichtingType, gewenstNaam } = request;
    // We sturen naar het ingelogde reseller-account — haal email op via resellerId
    return sendEmail({
        to:      request.resellerId, // resellerId = email van reseller
        subject: `${BRAND} — Opdracht ${id} goedgekeurd`,
        html:    layout(`
            <h2>Opdracht goedgekeurd</h2>
            <p>Beste ${resellerName},</p>
            <p>Je opdracht is <strong>goedgekeurd</strong> en wordt in behandeling genomen.</p>
            <div class="info-box">
                <strong>Opdracht-ID:</strong> ${id}<br>
                <strong>Type:</strong> ${oprichtingType}<br>
                <strong>Gewenste naam:</strong> ${gewenstNaam}<br>
                <strong>Klant:</strong> ${clientName}
            </div>
            <a class="btn" href="https://aandelenxpress.vercel.app/reseller-dashboard">Bekijken in dashboard</a>
        `),
    });
}

/** Reseller: opdracht afgewezen door admin */
async function emailResellerRequestRejected({ request }) {
    const { id, resellerName, oprichtingType, gewenstNaam, rejectionReason } = request;
    return sendEmail({
        to:      request.resellerId,
        subject: `${BRAND} — Opdracht ${id} niet goedgekeurd`,
        html:    layout(`
            <h2>Opdracht afgewezen</h2>
            <p>Beste ${resellerName},</p>
            <p>Je opdracht <strong>${id}</strong> (${oprichtingType} — ${gewenstNaam}) is helaas niet goedgekeurd.</p>
            ${rejectionReason ? `<div class="info-box"><strong>Reden:</strong> ${rejectionReason}</div>` : ''}
            <p>Neem contact op voor meer informatie: <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a></p>
        `),
    });
}

// ─── Support tickets ──────────────────────────────────────────────────────────

/** Admin: nieuw support ticket */
async function emailAdminNewTicket({ ticket }) {
    const { id, dossierNr, subject, message, senderName, senderEmail } = ticket;
    return sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[${BRAND}] Nieuw ticket ${id}: ${subject}`,
        html:    layout(`
            <h2>Nieuw support ticket</h2>
            <div class="info-box">
                <strong>Ticket-ID:</strong> ${id}<br>
                <strong>Dossier:</strong> ${dossierNr}<br>
                <strong>Onderwerp:</strong> ${subject}<br>
                <strong>Van:</strong> ${senderName || '—'} (${senderEmail || '—'})
            </div>
            <p><strong>Bericht:</strong><br>${message.replace(/\n/g, '<br>')}</p>
            <a class="btn" href="https://aandelenxpress.vercel.app/admin-dashboard">Ticket beantwoorden</a>
        `),
    });
}

/** Ticketindiener: bevestiging van ontvangst */
async function emailTicketSenderConfirmation({ ticket }) {
    const { id, subject, senderName, senderEmail } = ticket;
    if (!senderEmail) return null;
    return sendEmail({
        to:      senderEmail,
        subject: `${BRAND} — Ticket ontvangen: ${subject}`,
        html:    layout(`
            <h2>Ticket ontvangen</h2>
            <p>Beste ${senderName || 'klant'},</p>
            <p>Je support ticket is goed ontvangen. Ons team zal zo snel mogelijk reageren.</p>
            <div class="info-box">
                <strong>Ticket-ID:</strong> ${id}<br>
                <strong>Onderwerp:</strong> ${subject}
            </div>
            <p>Bewaar dit email-adres voor eventuele follow-up vragen.</p>
        `),
    });
}

/** Ticketindiener: admin heeft gereageerd */
async function emailTicketReply({ ticket, replyMessage, adminName }) {
    const { id, subject, senderName, senderEmail } = ticket;
    if (!senderEmail) return null;
    return sendEmail({
        to:      senderEmail,
        subject: `${BRAND} — Reactie op je ticket: ${subject}`,
        html:    layout(`
            <h2>Reactie op je ticket</h2>
            <p>Beste ${senderName || 'klant'},</p>
            <p>Je hebt een reactie ontvangen op ticket <strong>${id}</strong>.</p>
            <div class="info-box">
                <strong>Onderwerp:</strong> ${subject}<br>
                <strong>Van:</strong> ${adminName || 'AandelenXpress Team'}
            </div>
            <p><strong>Bericht:</strong><br>${replyMessage.replace(/\n/g, '<br>')}</p>
            <p>Heb je nog vragen? Neem contact op via <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a>.</p>
        `),
    });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
    emailAdminNewRegistration,
    emailApplicantRegistrationReceived,
    emailResellerApproved,
    emailResellerRejected,
    emailAdminNewRequest,
    emailClientNewRequest,
    emailResellerRequestApproved,
    emailResellerRequestRejected,
    emailAdminNewTicket,
    emailTicketSenderConfirmation,
    emailTicketReply,
};
