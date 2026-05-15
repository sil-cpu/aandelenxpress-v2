/**
 * AandelenXpress — Transactional Email Module
 * 
 * Gebruikt Resend voor alle transactionele emails.
 * Domein aandelenxpress.nl is geverifieerd in Resend (15 mei 2026).
 */

require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ─ Configuratie ─────────────────────────────────────────────────────────────
const FROM_ADDRESS = 'AandelenXpress <noreply@aandelenxpress.nl>';
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
    body { margin:0; padding:0; background:#f0f4f8; font-family:Arial,sans-serif; color:#222; }
    .wrap { max-width:580px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.10); border-top:4px solid #1A3B70; }
    .header { background:#fff; padding:20px 32px 16px; border-bottom:1px solid #EEF2FF; }
    .header img { display:block; height:40px; max-width:240px; }

    .body { padding:28px 32px; font-size:15px; line-height:1.7; }
    .body h2 { color:#0F1D3A; margin-top:0; font-size:1.2em; }
    .info-box { background:#F5F8FF; border-left:4px solid #1A3B70; padding:12px 16px; border-radius:4px; margin:16px 0; font-size:14px; }
    .btn { display:inline-block; margin:20px 0; padding:13px 28px; background:#1A3B70; color:#fff; border-radius:8px; text-decoration:none; font-weight:bold; font-size:15px; }
    .footer { background:#F8FAFD; padding:16px 32px; font-size:12px; color:#94A3B8; border-top:1px solid #E8EDF5; text-align:center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <img src="${SITE_URL}/logo-email.png" alt="AandelenXpress" height="36" style="height:36px;max-width:240px;display:block;">
    </div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${BRAND} &nbsp;&middot;&nbsp; Dit is een automatisch bericht, niet beantwoorden.
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
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="https://aandelenxpress.vercel.app/admin-dashboard">Beheer dashboard</a>
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
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="https://aandelenxpress.vercel.app/login">Inloggen</a>
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
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="https://aandelenxpress.vercel.app/admin-dashboard">Bekijken in dashboard</a>
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
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="${statusUrl}">Mijn dossier bekijken &amp; vragenlijst invullen</a>
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
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="https://aandelenxpress.vercel.app/reseller-dashboard">Bekijken in dashboard</a>
        `),
    });
}

/** Klant: opdracht goedgekeurd — link naar vragenlijst + statuspagina met wachtwoord */
async function emailClientCaseApproved({ request }) {
    const { id, clientName, clientEmail, oprichtingType, gewenstNaam, resellerName, resellerCompany, accessToken } = request;
    const formSlug = oprichtingType === 'eenmanszaak-omzetten' ? 'vragenlijst-geruisloos'
                   : oprichtingType === 'bv-holding'           ? 'vragenlijst-bv-holding'
                   : 'vragenlijst';
    const vragenlijstUrl = `${SITE_URL}/${formSlug}?nr=${id}`;
    const statusUrl      = `${SITE_URL}/dossier-status?nr=${id}`;
    const wachtwoord     = accessToken || '—';

    return sendEmail({
        to:      clientEmail,
        subject: `Uw BV-aanvraag is geaccepteerd — vul de vragenlijst in`,
        html:    layout(`
            <h2>Goed nieuws, ${clientName}!</h2>
            <p>Uw aanvraag voor de oprichting van <strong>${gewenstNaam}</strong> is geaccepteerd
               door uw adviseur <strong>${resellerName}</strong> (${resellerCompany}).</p>
            <div class="info-box">
                <strong>Type:</strong> ${oprichtingType}<br>
                <strong>Gewenste naam:</strong> ${gewenstNaam}<br>
                <strong>Referentienummer:</strong> ${id}
            </div>

            <p><strong>Volgende stap: vul de vragenlijst in</strong><br>
               Om uw BV zo snel mogelijk op te richten hebben wij enkele gegevens van u nodig.
               Dit duurt gemiddeld 10–20 minuten.</p>

            <div style="background:#1a2e5a;border-radius:8px;padding:20px 24px;margin:20px 0;text-align:center;">
                <p style="color:#fff;margin:0 0 8px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;">Uw toegangscode voor het formulier</p>
                <p style="color:#fff;font-family:monospace;font-size:28px;font-weight:700;letter-spacing:6px;margin:0;">${wachtwoord}</p>
                <p style="color:rgba(255,255,255,.6);margin:8px 0 0;font-size:12px;">Bewaar deze code — u heeft hem nodig om het formulier te openen.</p>
            </div>

            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="${vragenlijstUrl}">Vragenlijst openen &rarr;</a>

            <p style="margin-top:28px;"><strong>Uw dossier volgen:</strong></p>
            <div class="info-box">
                <strong>Statuspagina:</strong> <a href="${statusUrl}">${statusUrl}</a><br>
                <strong>Toegangscode:</strong> <span style="font-family:monospace;">${wachtwoord}</span>
            </div>

            <div style="background:#fff8e1;border:1px solid #ffe082;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin-top:20px;font-size:13px;color:#78350f;">
                <strong>&#x1F512; Vertrouwelijk</strong> — Deel deze toegangscode en links niet met anderen.
                Uw formulier bevat gevoelige persoonsgegevens.
            </div>

            <p style="font-size:13px;color:#888;margin-top:24px;">
                Heeft u vragen? Neem contact op met uw adviseur of mail naar
                <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a>.
            </p>
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
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="https://aandelenxpress.vercel.app/admin-dashboard">Ticket beantwoorden</a>
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

/** Admin: klant heeft vragenlijst ingevuld */
async function emailAdminVragenlijstSubmitted({ submission }) {
    const { caseId, clientName, clientEmail, resellerCompany, gewenstNaam, oprichtingType,
            spoed, sector, typeOprichting, contactEmail,
            datacardBestandNaam, pepBestandNaam, opmerkingen, submittedAt } = submission;

    const datum = new Date(submittedAt).toLocaleString('nl-NL', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[${BRAND}] Vragenlijst ingevuld — ${gewenstNaam} (${caseId})`,
        html:    layout(`
            <h2>Vragenlijst ingevuld door klant</h2>
            <p><strong>${clientName}</strong> heeft de vragenlijst ingevuld voor opdracht <strong>${caseId}</strong>.</p>
            <div class="info-box">
                <strong>Klant:</strong> ${clientName} (${clientEmail})<br>
                <strong>Contact e-mail:</strong> ${contactEmail}<br>
                <strong>Partner:</strong> ${resellerCompany}<br>
                <strong>Gewenste naam:</strong> ${gewenstNaam}<br>
                <strong>Type:</strong> ${oprichtingType}<br>
                <strong>Spoed:</strong> ${spoed === 'spoed' ? '⚡ Ja — binnen 48 uur' : 'Nee — standaard'}<br>
                <strong>Sector:</strong> ${sector}<br>
                <strong>Type oprichting:</strong> ${typeOprichting}<br>
                <strong>Datacard:</strong> ${datacardBestandNaam || '—'}<br>
                <strong>PEP-verklaring:</strong> ${pepBestandNaam || '—'}<br>
                <strong>Ingediend op:</strong> ${datum}
            </div>
            ${opmerkingen ? `<p><strong>Opmerkingen klant:</strong><br>${opmerkingen.replace(/\n/g, '<br>')}</p>` : ''}
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="https://aandelenxpress.vercel.app/admin-dashboard">Bekijken in dashboard</a>
        `),
    });
}

/** Klant: betalingsverzoek — stap na vragenlijst */
async function emailClientBetaling({ request }) {
    const { id, clientName, clientEmail, gewenstNaam, resellerName, resellerCompany } = request;
    const statusUrl = `${SITE_URL}/dossier-status?nr=${id}`;
    return sendEmail({
        to:      clientEmail,
        subject: `Betalingsverzoek — BV-oprichting ${gewenstNaam}`,
        html:    layout(`
            <h2>Betalingsverzoek voor uw BV-oprichting</h2>
            <p>Beste ${clientName},</p>
            <p>Uw vragenlijst is ontvangen en verwerkt. De volgende stap is de betaling voor de oprichting van <strong>${gewenstNaam}</strong>.</p>
            <div class="info-box">
                <strong>Referentienummer:</strong> ${id}<br>
                <strong>Gewenste naam:</strong> ${gewenstNaam}<br>
                <strong>Adviseur:</strong> ${resellerName} (${resellerCompany})
            </div>
            <p>U ontvangt binnenkort een factuur via uw adviseur of per mail. Na ontvangst van de betaling gaan wij direct door met de verdere afhandeling.</p>
            <a class="btn" style="color:#ffffff;-webkit-text-fill-color:#ffffff;" href="${statusUrl}">Dossier bekijken</a>
            <p style="font-size:13px;color:#888;margin-top:24px;">
                Vragen over de betaling? Mail naar <a href="mailto:info@aandelenxpress.nl">info@aandelenxpress.nl</a>.
            </p>
        `),
    });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

async function emailCustom({ to, subject, body, bodyHtml }) {
    const content = bodyHtml || (body || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    const html = layout(`<h2 style="margin-top:0;color:#0F1D3A;">${subject}</h2><div style="line-height:1.8;">${content}</div>`);
    return sendEmail({ to, subject, html });
}

module.exports = {
    emailCustom,
    emailAdminNewRegistration,
    emailApplicantRegistrationReceived,
    emailResellerApproved,
    emailResellerRejected,
    emailAdminNewRequest,
    emailClientNewRequest,
    emailResellerRequestApproved,
    emailClientCaseApproved,
    emailClientBetaling,
    emailResellerRequestRejected,
    emailAdminNewTicket,
    emailTicketSenderConfirmation,
    emailTicketReply,
    emailAdminVragenlijstSubmitted,
};
