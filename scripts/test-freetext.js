require('dotenv').config();
const { PDFDocument, rgb, StandardFonts, PDFString, PDFName } = require('pdf-lib');
const fs = require('fs');

async function test() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const fontR = await doc.embedFont(StandardFonts.Helvetica);
    const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

    // Title
    page.drawText('Test: FreeText Annotaties', { x: 40, y: 780, font: fontB, size: 14, color: rgb(0.1, 0.23, 0.44) });
    page.drawText('Dubbelklik op een blauw veld om te bewerken', { x: 40, y: 760, font: fontR, size: 9, color: rgb(0.4, 0.4, 0.4) });

    const rows = [
        ['Gewenste bedrijfsnaam', 'haoyunlai B.V.'],
        ['Product type', 'bv-holding'],
        ['Spoedaanvraag', 'standaard'],
        ['Sector', ''],
        ['Doel van de BV', ''],
    ];

    let y = 720;
    const QW = 290, AW = 225, ML = 40, rowH = 28;
    const C_BDR = rgb(0.886, 0.910, 0.941);
    const C_LT  = rgb(0.859, 0.922, 0.996);
    const C_TXT = rgb(0.067, 0.094, 0.153);

    // Table header
    page.drawRectangle({ x: ML, y: y - 24, width: QW + AW, height: 24, color: rgb(0.93, 0.945, 0.965), borderColor: C_BDR, borderWidth: 0.5 });
    page.drawText('Vraag',    { x: ML + 8, y: y - 17, font: fontB, size: 9.5, color: C_TXT });
    page.drawText('Antwoord', { x: ML + QW + 8, y: y - 17, font: fontB, size: 9.5, color: C_TXT });
    y -= 24;

    rows.forEach(([label, value], i) => {
        // Draw cells
        page.drawRectangle({ x: ML,      y: y - rowH, width: QW, height: rowH, color: rgb(1,1,1), borderColor: C_BDR, borderWidth: 0.5 });
        page.drawRectangle({ x: ML + QW, y: y - rowH, width: AW, height: rowH, color: C_LT,       borderColor: C_BDR, borderWidth: 0.5 });

        // Question text (static)
        page.drawText(`${i+1}. ${label}`, { x: ML + 8, y: y - rowH + 9, font: fontR, size: 9.2, color: C_TXT });

        // FreeText annotation for the answer (editable in Preview / Acrobat)
        const annotRef = doc.context.register(doc.context.obj({
            Type:     'Annot',
            Subtype:  'FreeText',
            Rect:     [ML + QW + 2, y - rowH + 2, ML + QW + AW - 2, y - 2],
            Contents: PDFString.of(value || ''),
            DA:       PDFString.of('/Helv 9 Tf 0.067 0.094 0.153 rg'),
            Q:        0,     // left-aligned
            F:        4,     // printable
            BS:       doc.context.obj({ W: 0 }),  // no border
        }));
        page.node.addAnnot(annotRef);

        y -= rowH;
    });

    const bytes = await doc.save();
    const outPath = '/Users/silmuller/Desktop/test-freetext.pdf';
    fs.writeFileSync(outPath, Buffer.from(bytes));
    console.log('Saved:', outPath);
}

test().catch(console.error);
