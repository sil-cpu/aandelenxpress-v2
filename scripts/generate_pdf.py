"""
AandelenXpress – Oprichtingsdocument PDF generator
Uses ReportLab AcroForm widget annotations (no FreeText, no static blue overlays).
Each answer cell IS the AcroForm text field – fillColor + borderColor on the field itself.

Usage:
  python scripts/generate_pdf.py                          → blank template
  python scripts/generate_pdf.py data.json               → pre-filled from JSON
  python scripts/generate_pdf.py --dossier AX-LMVY5D     → pre-filled from Supabase
"""

import sys
import os
import json
from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Constants ───────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4          # 595.28 × 841.89 pt
ML, MR, MT, MB = 40, 40, 50, 55

LABEL_W  = 285               # question label column width
FIELD_W  = PAGE_W - ML - MR - LABEL_W  # answer field column width  (~230)
ROW_H    = 26                # default row height (comfortable for typing)
SEC_H    = 30                # section header height
TH_H     = 22                # table header height

# Colours
C_DARK   = HexColor('#1A3B70')
C_LT     = HexColor('#DBEAFE')
C_BDR    = HexColor('#CBD5E1')
C_THBG   = HexColor('#EFF6FF')
C_TEXT   = HexColor('#111827')
C_GRAY   = HexColor('#5E6C84')
C_WHITE  = white
C_WHDIM  = HexColor('#CCCCCC')

FIELD_X  = ML + LABEL_W      # x-origin of every answer field

OUTPUT   = str(Path.home() / 'Desktop' / 'aandelenxpress_formulier.pdf')


# ── Page / cursor management ────────────────────────────────────────────────
class Doc:
    def __init__(self, path):
        self.c   = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle('Oprichtingsdocument – AandelenXpress')
        self.c.setAuthor('AandelenXpress')
        self.cur = PAGE_H - MT   # y cursor (descends)

    def _remaining(self):
        return self.cur - MB

    def ensure(self, need):
        if self._remaining() < need:
            self.c.showPage()
            self.cur = PAGE_H - MT

    def down(self, h):
        self.cur -= h

    # ── low-level drawing helpers ───────────────────────────────────────────
    def draw_rect(self, x, y, w, h, fill=None, stroke=C_BDR, sw=0.5):
        cv = self.c
        if fill:
            cv.setFillColor(fill)
        if stroke:
            cv.setStrokeColor(stroke)
        cv.setLineWidth(sw)
        if fill and stroke:
            cv.rect(x, y, w, h, fill=1, stroke=1)
        elif fill:
            cv.rect(x, y, w, h, fill=1, stroke=0)
        else:
            cv.rect(x, y, w, h, fill=0, stroke=1)

    def draw_text(self, text, x, y, font='Helvetica', size=9, color=C_TEXT,
                  max_w=None, align='left'):
        cv = self.c
        cv.setFont(font, size)
        cv.setFillColor(color)
        if max_w:
            # simple word-wrap
            words = str(text).split()
            line, lines = [], []
            for w in words:
                test = ' '.join(line + [w])
                if cv.stringWidth(test, font, size) <= max_w:
                    line.append(w)
                else:
                    if line:
                        lines.append(' '.join(line))
                    line = [w]
            if line:
                lines.append(' '.join(line))
            line_h = size * 1.35
            for i, l in enumerate(lines):
                lx = x
                if align == 'right':
                    lx = x + max_w - cv.stringWidth(l, font, size)
                cv.drawString(lx, y - i * line_h, l)
            return len(lines) * line_h
        else:
            if align == 'right':
                cv.drawRightString(x, y, str(text))
            else:
                cv.drawString(x, y, str(text))
            return size * 1.35

    # ── Section header ──────────────────────────────────────────────────────
    def section_header(self, title, meta=''):
        self.ensure(SEC_H + TH_H + ROW_H + 8)
        self.down(6)
        y = self.cur - SEC_H
        self.draw_rect(ML, y, LABEL_W + FIELD_W, SEC_H, fill=C_DARK, stroke=None)
        self.draw_text(title, ML + 10, y + 10, font='Helvetica-Bold', size=11, color=C_WHITE)
        if meta:
            tw = self.c.stringWidth(meta, 'Helvetica', 7.5)
            self.draw_text(meta, ML + LABEL_W + FIELD_W - tw - 8, y + 11,
                           font='Helvetica', size=7.5, color=C_WHDIM)
        self.cur = y

    # ── Table header ────────────────────────────────────────────────────────
    def table_header(self):
        self.ensure(TH_H + ROW_H)
        y = self.cur - TH_H
        self.draw_rect(ML,           y, LABEL_W, TH_H, fill=C_THBG, stroke=C_BDR)
        self.draw_rect(ML + LABEL_W, y, FIELD_W, TH_H, fill=C_THBG, stroke=C_BDR)
        self.draw_text('Vraag',    ML + 8,           y + 7, font='Helvetica-Bold', size=9.5)
        self.draw_text('Antwoord', ML + LABEL_W + 8, y + 7, font='Helvetica-Bold', size=9.5)
        self.cur = y

    # ── Data row: static label + AcroForm field ─────────────────────────────
    def row(self, field_name, label, value='', multiline=False, h=None):
        """
        Draw ONE row:
          - Static label text in the left column (white background)
          - Real AcroForm textfield in the right column (light-blue bg, border on the field)
        No separate blue rectangle is drawn – the field IS the visual element.
        """
        row_h = h or ROW_H
        self.ensure(row_h + 2)
        y = self.cur - row_h

        # Left cell (white, static)
        self.draw_rect(ML, y, LABEL_W, row_h, fill=C_WHITE, stroke=C_BDR)
        self.draw_text(label, ML + 8, y + (row_h - 9) / 2,
                       font='Helvetica', size=9, color=C_TEXT,
                       max_w=LABEL_W - 16)

        # Right cell: AcroForm TextField – THIS is the blue bar
        fh = row_h - 4    # 2 pt padding top/bottom
        fy = y + 2
        flags = 'multiline' if multiline else ''
        self.c.acroForm.textfield(
            name        = field_name,
            tooltip     = label,
            x           = FIELD_X + 2,
            y           = fy,
            width       = FIELD_W - 4,
            height      = fh,
            value       = str(value) if value else '',
            fillColor   = C_LT,
            borderColor = C_BDR,
            borderWidth = 0.5,
            textColor   = C_TEXT,
            fontSize    = 9,
            fontName    = 'Helvetica',
            fieldFlags  = flags,
            relative    = False,
        )
        self.cur = y

    # ── Checkbox row ────────────────────────────────────────────────────────
    def checkbox_row(self, field_name, label, checked=False):
        row_h = ROW_H
        self.ensure(row_h + 2)
        y = self.cur - row_h

        self.draw_rect(ML, y, LABEL_W, row_h, fill=C_WHITE, stroke=C_BDR)
        self.draw_text(label, ML + 8, y + (row_h - 9) / 2,
                       font='Helvetica', size=9, color=C_TEXT, max_w=LABEL_W - 16)

        # Checkbox (AcroForm widget)
        cb_size = 14
        cb_x = FIELD_X + 8
        cb_y = y + (row_h - cb_size) / 2
        self.c.acroForm.checkbox(
            name        = field_name,
            tooltip     = label,
            x           = cb_x,
            y           = cb_y,
            size        = cb_size,
            checked     = checked,
            fillColor   = C_LT,
            borderColor = C_BDR,
            borderWidth = 0.5,
            relative    = False,
        )

        # Label "Ja / Nee" hints alongside checkbox
        self.draw_text('Ja', cb_x + cb_size + 4, cb_y + 3,
                       font='Helvetica', size=8, color=C_GRAY)

        # Fill remainder of right cell border
        self.draw_rect(FIELD_X, y, FIELD_W, row_h, fill=None, stroke=C_BDR)
        self.cur = y

    def spacer(self, h=6):
        self.down(h)


# ── Cover page ───────────────────────────────────────────────────────────────
def draw_cover(doc, data):
    c, cur = doc.c, doc

    # Top accent bar
    cur.draw_rect(ML, PAGE_H - MT - 4, LABEL_W + FIELD_W, 4, fill=C_DARK, stroke=None)

    cur.down(10)
    cur.draw_text('Oprichtingsdocument', ML, cur.cur - 22,
                  font='Helvetica-Bold', size=22, color=C_DARK)
    cur.down(30)
    company = data.get('gewenstNaam') or data.get('request', {}).get('gewenstNaam', '—')
    cur.draw_text(company, ML, cur.cur - 14,
                  font='Helvetica-Bold', size=14, color=C_TEXT)
    cur.down(20)

    product    = data.get('oprichtingType') or data.get('request', {}).get('oprichtingType', '')
    stap_count = data.get('_stapCount', 7)
    veld_count = data.get('_veldCount', 64)
    cur.draw_text(f'Stappen: {stap_count} | Velden: {veld_count}',
                  ML, cur.cur - 11, font='Helvetica', size=9, color=C_GRAY)
    cur.down(22)

    # Meta table
    meta = [
        ('Dossiernummer:',    data.get('caseId', '—')),
        ('Product:',          product or '—'),
        ('Partner:',          data.get('request', {}).get('resellerCompany', '—')),
        ('Klantcontact:',     f"{data.get('request', {}).get('clientName', '')} ({data.get('request', {}).get('clientEmail', '')})"),
        ('Datum gegenereerd:', data.get('_date', '')),
    ]
    for key, val in meta:
        if not val or val == ' ()':
            continue
        cur.draw_text(key, ML,      cur.cur - 11, font='Helvetica-Bold', size=9, color=C_DARK)
        cur.draw_text(val, ML + 145, cur.cur - 11, font='Helvetica',     size=9, color=C_TEXT)
        cur.down(16)

    cur.down(14)
    cur.draw_rect(ML, cur.cur, LABEL_W + FIELD_W, 0.7, fill=None, stroke=C_BDR, sw=0.7)
    cur.down(18)


# ── Section builder ──────────────────────────────────────────────────────────
def build_sections(doc, data):
    fd  = data.get('formData', data)   # allow flat or nested
    req = data.get('request', {})

    def g(key, fallback=''):
        v = fd.get(key, fallback)
        if v is None or v is False:
            return ''
        if v is True:
            return 'Ja'
        return str(v).strip()

    def is_checked(key):
        v = fd.get(key)
        return v in (True, 'true', 'ja', 'Ja', 'yes', 'Yes', '1', 1)

    product = (g('oprichtingType') or req.get('oprichtingType', 'bv')).lower()
    is_holding   = 'holding' in product
    is_omzetting = any(x in product for x in ('omzetten', 'omzetting', 'vof', 'emz'))

    # ── Stap 1 – Aanvraagtype ─────────────────────────────────────────────
    doc.section_header('Aanvraagtype', 'Product: ' + (product or 'bv') + ' | Stap 1 | Veldcount: 8')
    doc.table_header()
    doc.row('stap1_bedrijfsnaam',      '1. Gewenste bedrijfsnaam',                       g('gewenstNaam') or req.get('gewenstNaam', ''))
    doc.row('stap1_product_type',      '2. Product type',                                g('oprichtingType') or req.get('oprichtingType', ''))
    doc.row('stap1_spoed',             '3. Spoedaanvraag',                               g('spoed'))
    doc.row('stap1_sector',            '4. Sector',                                      g('sector'))
    doc.row('stap1_doel',              '5. Doel van de BV',                              g('doel'))
    doc.row('stap1_kapitaal',          '6. Startkapitaal',                               g('kapitaal'))
    doc.row('stap1_bestaande_holding', '7. Bestaande holding als aandeelhouder',         g('singleBvExistingHoldings'))
    doc.row('stap1_aandeelhouder',     '8. Wie worden aandeelhouder(s)?',                g('existingHoldingOwner'))
    doc.spacer()

    # ── Stap 2 – Oprichting document (Holding) ────────────────────────────
    if is_holding:
        doc.section_header('Oprichting document (Holding)', f'Product: {product} | Stap 2 | Veldcount: 15')
        doc.table_header()
        doc.row('stap2_naam_bedrijf',         '1. Naam bedrijf',                        g('holdingNaamBedrijf'))
        doc.row('stap2_telefoon',             '2. Telefoonnummer',                      g('holdingTelefoon'))
        doc.row('stap2_mail',                 '3. Mailadres',                           g('holdingMailadres'))
        doc.row('stap2_straat',               '4. Straat',                              g('holdingAdresStraat'))
        doc.row('stap2_huisnummer',           '5. Huisnummer',                          g('holdingAdresHuisnummer'))
        doc.row('stap2_postcode',             '6. Postcode',                            g('holdingAdresPostcode'))
        doc.row('stap2_plaatsnaam',           '7. Plaatsnaam',                          g('holdingAdresPlaats'))
        doc.row('stap2_accountant_naam',      '8. Naam accountantskantoor',             g('holdingAccountantNaam'))
        doc.row('stap2_accountant_contact',   '9. Contactpersoon accountant',           g('holdingAccountantContact'))
        doc.row('stap2_accountant_telefoon', '10. Telefoonnummer accountant',           g('holdingAccountantTelefoon'))
        doc.row('stap2_accountant_mail',     '11. Mailadres accountant',                g('holdingAccountantMail'))
        doc.checkbox_row('stap2_bestuurders_zelfde',
                         '12. Zijn de bestuurders dezelfde als de aandeelhouders?',
                         is_checked('holdingDirectorsSameAsShareholders'))
        doc.row('stap2_personeel_meer15',    '13. Meer dan 15 uur per week',            g('holdingPersoneelMeer15'))
        doc.row('stap2_personeel_minder15',  '14. Minder dan 15 uur per week',         g('holdingPersoneelMinder15'))
        doc.row('stap2_overige',             '15. Overige',                             g('holdingOverige'))
        doc.spacer()

    # ── Stap 3 – Oprichting document (Werkmaatschappij) ───────────────────
    doc.section_header('Oprichting document (Werkmaatschappij)', f'Product: {product} | Stap 3 | Veldcount: 9')
    doc.table_header()
    doc.row('stap3_naam_bedrijf',       '1. Naam bedrijf',                              g('werkmijNaamBedrijf'))
    doc.row('stap3_telefoon',           '2. Telefoonnummer',                            g('werkmijTelefoon'))
    doc.row('stap3_mail',               '3. Mailadres',                                 g('werkmijMailadres'))
    doc.row('stap3_accountant_naam',    '4. Naam accountantskantoor',                   g('werkmijAccountantNaam'))
    doc.row('stap3_accountant_contact', '5. Contactpersoon accountant',                 g('werkmijAccountantContact'))
    doc.row('stap3_accountant_tel',     '6. Telefoonnummer accountant',                 g('werkmijAccountantTelefoon'))
    doc.row('stap3_accountant_mail',    '7. Mailadres accountant',                      g('werkmijAccountantMail'))
    doc.checkbox_row('stap3_bestuurders_zelfde',
                     '8. Zijn de bestuurders dezelfde als de aandeelhouders?',
                     is_checked('werkmijDirectorsSameAsShareholders'))
    doc.row('stap3_overige',            '9. Overige',                                   g('werkmijOverige'))
    doc.spacer()

    # ── Stap 4 – Natuurlijke personen ─────────────────────────────────────
    persons = fd.get('naturalPersons', [])
    if not isinstance(persons, list):
        persons = []
    # Always show at least 1 person block
    persons = persons if persons else [{}]

    NP_KEYS = [
        ('voornamen',            'Voornamen'),
        ('achternaam',           'Achternaam'),
        ('geboortedatum',        'Geboortedatum'),
        ('geboorteland',         'Geboorteland'),
        ('heeftBsn',             'Heeft BSN-nummer?'),
        ('bsn',                  'Nederlands BSN'),
        ('nlAdresGeregistreerd', 'Geregistreerd NL-adres'),
        ('nationaliteit',        'Nationaliteit'),
        ('burgerlijkeStaat',     'Burgerlijke staat'),
        ('iban',                 'Persoonlijk IBAN'),
        ('telefoon',             'Persoonlijk telefoonnummer'),
        ('email',                'Persoonlijk e-mailadres'),
        ('taalniveau',           'Nederlands taalniveau'),
        ('buitenlandsAdres',     'Volledig buitenlands woonadres'),
    ]
    veld_count_np = len(NP_KEYS) * max(len(persons), 1)
    doc.section_header('Natuurlijke personen', f'Product: {product} | Stap 4 | Veldcount: {veld_count_np}')
    for pi, p in enumerate(persons):
        if not isinstance(p, dict):
            p = {}
        doc.table_header()
        if len(persons) > 1:
            doc.ensure(ROW_H)
            doc.draw_text(f'Persoon {pi + 1}', ML + 8, doc.cur - ROW_H + 8,
                          font='Helvetica-Bold', size=9.5, color=C_DARK)
            doc.down(ROW_H)
        for ki, (key, lbl) in enumerate(NP_KEYS):
            v = p.get(key, '')
            if v is True: v = 'Ja'
            if v is False: v = 'Nee'
            doc.row(f'stap4_p{pi+1}_{key}', f'{ki+1}. {lbl}', str(v) if v else '')
    doc.spacer()

    # ── Stap 5 – Omzettingsdocumenten ────────────────────────────────────
    if is_omzetting:
        doc.section_header('Omzettingsdocumenten', f'Product: {product} | Stap 5 | Veldcount: 6')
        doc.table_header()
        doc.row('stap5_bron_type',     '1. Type brononderneming',                       g('omzettingBronType'))
        doc.row('stap5_bron_naam',     '2. Naam EMZ/VOF',                               g('omzettingBronNaam'))
        doc.row('stap5_bron_kvk',      '3. KVK-nummer EMZ/VOF',                        g('omzettingBronKvk'))
        doc.row('stap5_bron_zetel',    '4. Statutaire zetel EMZ/VOF',                  g('omzettingBronZetel'))
        doc.row('stap5_bron_eigenaren','5. Eigenaar(s) + aandelenverdeling',            g('omzettingBronEigenaren'), multiline=True, h=40)
        doc.row('stap5_bron_doel',     '6. Doel van de EMZ/VOF',                       g('omzettingBronDoel'))
        doc.spacer()

    # ── Stap 6 – Uploads ─────────────────────────────────────────────────
    doc.section_header('Uploads', f'Product: {product} | Stap 6 | Veldcount: 5')
    doc.table_header()
    doc.row('stap6_datacard',          '1. Datacard / PDC bestand(en)',                 '')
    doc.row('stap6_pep',               '2. PEP verklaring(en)',                         '')
    doc.row('stap6_personeelsplan',    '3. Personeelsplan / bedrijfsplan(nen)',          '')
    doc.row('stap6_huur_holding',      '4. Huurovereenkomst holding',                   '')
    doc.row('stap6_huur_werkmij',      '5. Huurovereenkomst werkmaatschappij',          '')
    doc.spacer()

    # ── Stap 7 – Indienen ─────────────────────────────────────────────────
    doc.section_header('Indienen', f'Product: {product} | Stap 7 | Veldcount: 1')
    doc.table_header()
    doc.checkbox_row('stap7_legal_consent',
                     '1. Akkoord met algemene voorwaarden',
                     is_checked('legalConsent'))
    doc.spacer()


# ── Footer ────────────────────────────────────────────────────────────────────
def draw_footer(doc):
    doc.ensure(30)
    doc.down(12)
    y = doc.cur
    doc.draw_rect(ML, y, LABEL_W + FIELD_W, 0.7, fill=None, stroke=C_BDR, sw=0.7)
    footer = 'Automatisch gegenereerd door AandelenXpress op basis van de ingevulde vragenlijst.'
    fw = doc.c.stringWidth(footer, 'Helvetica', 8.5)
    doc.draw_text(footer, ML + (LABEL_W + FIELD_W - fw) / 2, y - 14,
                  font='Helvetica', size=8.5, color=C_GRAY)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    import datetime
    import io

    data = {}
    stdout_mode = False

    # Load data from arguments
    if len(sys.argv) >= 2:
        if sys.argv[1] == '--stdin':
            # Read JSON from stdin, write PDF bytes to stdout (for server.js integration)
            data = json.load(sys.stdin)
            stdout_mode = True
        elif sys.argv[1] == '--dossier':
            # Fetch from Supabase
            dossier_id = sys.argv[2] if len(sys.argv) > 2 else None
            if dossier_id:
                data = fetch_from_supabase(dossier_id)
        else:
            # Load from JSON file
            with open(sys.argv[1]) as f:
                data = json.load(f)

    data.setdefault('_date', datetime.datetime.now().strftime('%-d-%-m-%Y, %H:%M:%S'))
    data.setdefault('_stapCount', 7)
    data.setdefault('_veldCount', 64)

    if stdout_mode:
        # Write PDF bytes directly to stdout (used by server.js subprocess)
        buf = io.BytesIO()
        doc = Doc(buf)
        draw_cover(doc, data)
        build_sections(doc, data)
        draw_footer(doc)
        doc.c.save()
        sys.stdout.buffer.write(buf.getvalue())
    else:
        doc = Doc(OUTPUT)
        draw_cover(doc, data)
        build_sections(doc, data)
        draw_footer(doc)
        doc.c.save()
        print(f'Opgeslagen: {OUTPUT}')


def fetch_from_supabase(dossier_id):
    """Fetch dossier data from Supabase (requires .env with SUPABASE_URL + SERVICE_ROLE_KEY)."""
    import urllib.request
    import urllib.parse
    import datetime

    # Read .env
    env = {}
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")

    url_base  = env.get('SUPABASE_URL', os.environ.get('SUPABASE_URL', ''))
    svc_key   = env.get('SUPABASE_SERVICE_ROLE_KEY', os.environ.get('SUPABASE_SERVICE_ROLE_KEY', ''))

    if not url_base or not svc_key:
        print('WARN: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY niet gevonden – blanco formulier.')
        return {}

    headers = {
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
        'Content-Type': 'application/json',
    }

    def supabase_get(table, params):
        qs = urllib.parse.urlencode(params)
        req = urllib.request.Request(f'{url_base}/rest/v1/{table}?{qs}', headers=headers)
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())

    # Fetch request row
    rows = supabase_get('reseller_requests', {'id': f'eq.{dossier_id}', 'limit': '1'})
    if not rows:
        print(f'Dossier {dossier_id} niet gevonden.')
        return {}
    row = rows[0]

    # Fetch vragenlijst
    vq = supabase_get('vragenlijsten', {'case_id': f'eq.{dossier_id}', 'limit': '1'})
    form_data = (vq[0].get('data') or {}) if vq else {}

    return {
        'caseId':       dossier_id,
        'formData':     form_data,
        'request':      {
            'gewenstNaam':     row.get('gewenst_naam', ''),
            'oprichtingType':  row.get('oprichting_type', ''),
            'clientName':      row.get('client_name', ''),
            'clientEmail':     row.get('client_email', ''),
            'resellerCompany': row.get('reseller_company', ''),
        },
        'gewenstNaam':    form_data.get('gewenstNaam') or row.get('gewenst_naam', ''),
        'oprichtingType': form_data.get('oprichtingType') or row.get('oprichting_type', ''),
        '_date':          datetime.datetime.now().strftime('%-d-%-m-%Y, %H:%M:%S'),
        '_stapCount':     7,
        '_veldCount':     64,
    }


if __name__ == '__main__':
    main()
