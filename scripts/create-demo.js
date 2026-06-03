const http = require('http');

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3000, method, path,
      headers: {
        'Content-Type': 'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
        ...(cookie && { 'Cookie': cookie })
      }
    };
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, headers: res.headers, body: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // 1. Login as admin
  const login = await req('POST', '/api/login', { email: 'admin@aandelenxpress.nl', password: '123456' });
  const cookie = login.headers['set-cookie'] && login.headers['set-cookie'][0].split(';')[0];
  if (!cookie) { console.error('Login mislukt', login.body); return; }
  console.log('Ingelogd als admin');

  // 2. Create 3 demo dossiers
  const dossiers = [
    { clientName: 'Jan de Vries', clientEmail: 'jan@demo.nl', clientPhone: '+31612345678', oprichtingType: 'bv-holding',          gewenstNaam: 'Demo Holding B.V.',     doel: 'Holding voor werkmaatschappij', aandeelhouders: 1 },
    { clientName: 'Sara Jansen',  clientEmail: 'sara@demo.nl', clientPhone: '+31698765432', oprichtingType: 'eenmanszaak-omzetten', gewenstNaam: 'Jansen Bouw B.V.',      doel: 'Geruisloze inbreng vanuit eenmanszaak', aandeelhouders: 1 },
    { clientName: 'Mark Bakker',  clientEmail: 'mark@demo.nl', clientPhone: '+31655544433', oprichtingType: 'bv',                   gewenstNaam: 'Bakker Transport B.V.', doel: 'Transport en logistiek', aandeelhouders: 2 },
  ];

  const created = [];
  for (const d of dossiers) {
    const r = await req('POST', '/api/reseller-requests', d, cookie);
    if (r.status === 201) { created.push(r.body); console.log('Aangemaakt:', r.body.id, r.body.oprichtingType); }
    else { console.error('Aanmaken mislukt', d.oprichtingType, r.body); }
  }

  // 3. Approve all
  for (const d of created) {
    const r = await req('PATCH', '/api/reseller-requests/' + d.id + '/approve', {}, cookie);
    if (r.status === 200) console.log('Goedgekeurd:', d.id);
    else console.error('Approve mislukt', d.id, r.body);
  }

  // 4. Print links
  console.log('\n=== DEMO LINKS ===');
  for (const d of created) {
    const form = 'vragenlijst-bv-holding';
    console.log(d.oprichtingType.padEnd(25), 'http://localhost:3000/' + form + '?nr=' + d.id + '&product=' + encodeURIComponent(d.oprichtingType || 'bv-holding'));
    console.log('  token (wachtwoord):', d.accessToken);
  }
}

main().catch(console.error);
