#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const server = require('../server');
const { buildVragenlijstPdfBuffer, supabase, rowToReq } = server;

(async () => {
    // Most recent dossiers sorted by created_at
    const { data: reqRows } = await supabase
        .from('reseller_requests')
        .select('id, created_at, gewenst_naam')
        .order('created_at', { ascending: false })
        .limit(30);

    if (!reqRows?.length) { console.error('Geen dossiers gevonden.'); process.exit(1); }

    let request, formData, caseId, naam, datum;
    for (const r of reqRows) {
        const { data: vl } = await supabase
            .from('vragenlijsten').select('*').eq('case_id', r.id).single();
        if (vl) {
            const { data: req } = await supabase
                .from('reseller_requests').select('*').eq('id', r.id).single();
            request  = rowToReq(req);
            formData = vl.data || {};
            caseId   = r.id;
            naam     = r.gewenst_naam || '—';
            datum    = r.created_at;
            break;
        }
    }

    if (!caseId) { console.error('Geen dossier met vragenlijst gevonden.'); process.exit(1); }

    console.log(`Dossier: ${caseId} (${naam}) — ${datum}`);

    const pdfBuffer = await buildVragenlijstPdfBuffer({ caseId, request, formData });
    const safeName  = caseId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath   = path.join(os.homedir(), 'Desktop', `oprichtingsdocument-${safeName}.pdf`);
    fs.writeFileSync(outPath, pdfBuffer);

    console.log(`Opgeslagen: ${outPath} (${pdfBuffer.length} bytes)`);
    process.exit(0);
})();
