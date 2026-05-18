/**
 * Eenmalig migratiescript: data/db.json → Supabase
 * Gebruik: node scripts/migrate-db.js
 * Vereist: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in .env
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

async function migrate() {
    console.log('⏳ Starten met migratie van db.json naar Supabase...\n');

    if (!fs.existsSync(DB_PATH)) {
        console.error('❌ data/db.json niet gevonden');
        process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

    // ── Reseller requests ──────────────────────────────────────
    const requests = db.resellerRequests || [];
    if (requests.length > 0) {
        console.log(`📂 ${requests.length} reseller requests migreren...`);
        const rows = requests.map(r => ({
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
        }));
        const { error } = await supabase.from('reseller_requests').upsert(rows, { onConflict: 'id' });
        if (error) console.error('  ❌ Fout bij reseller_requests:', error.message);
        else console.log('  ✅ Reseller requests gemigreerd');
    }

    // ── Blog posts ─────────────────────────────────────────────
    const blogPosts = db.blogPosts || [];
    if (blogPosts.length > 0) {
        console.log(`📝 ${blogPosts.length} blog posts migreren...`);
        const rows = blogPosts.map(p => ({
            id:         p.id,
            title:      p.title,
            excerpt:    p.excerpt || '',
            content:    p.content,
            image:      p.image || null,
            categories: p.categories || [],
            featured:   p.featured || false,
            published:  p.published || false,
            author:     p.author || '',
            created_at: p.createdAt,
            updated_at: p.updatedAt || p.createdAt
        }));
        const { error } = await supabase.from('blog_posts').upsert(rows, { onConflict: 'id' });
        if (error) console.error('  ❌ Fout bij blog_posts:', error.message);
        else console.log('  ✅ Blog posts gemigreerd');
    } else {
        console.log('📝 Geen blog posts om te migreren');
    }

    // ── Email templates ────────────────────────────────────────
    const emailTemplates = db.emailTemplates || [];
    if (emailTemplates.length > 0) {
        console.log(`📧 ${emailTemplates.length} email templates migreren...`);
        const rows = emailTemplates.map(t => ({
            id:         t.id,
            name:       t.name,
            subject:    t.subject,
            body:       t.body,
            created_at: t.createdAt
        }));
        const { error } = await supabase.from('email_templates').upsert(rows, { onConflict: 'id' });
        if (error) console.error('  ❌ Fout bij email_templates:', error.message);
        else console.log('  ✅ Email templates gemigreerd');
    }

    // ── Vragenlijsten ──────────────────────────────────────────
    const vragenlijsten = db.vragenlijsten || [];
    if (vragenlijsten.length > 0) {
        console.log(`📋 ${vragenlijsten.length} vragenlijsten migreren...`);
        const rows = vragenlijsten.map(v => ({
            case_id:      v.caseId,
            data:         v,
            submitted_at: v.submittedAt || new Date().toISOString()
        }));
        const { error } = await supabase.from('vragenlijsten').upsert(rows, { onConflict: 'case_id' });
        if (error) console.error('  ❌ Fout bij vragenlijsten:', error.message);
        else console.log('  ✅ Vragenlijsten gemigreerd');
    } else {
        console.log('📋 Geen vragenlijsten om te migreren');
    }

    console.log('\n✅ Migratie voltooid!');
}

migrate().catch(err => {
    console.error('❌ Onverwachte fout:', err.message);
    process.exit(1);
});
