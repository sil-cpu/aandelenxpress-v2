const { PDFDocument, PDFName, PDFDict } = require('pdf-lib');
const fs = require('fs');

async function inspect() {
    const buf = fs.readFileSync('/Users/silmuller/Desktop/oprichtingsdocument-AX-LMVY5D.pdf');
    const pdf = await PDFDocument.load(buf);
    const form = pdf.getForm();
    const fields = form.getFields();

    console.log('Total form fields:', fields.length);
    fields.slice(0, 5).forEach(f => {
        console.log(' -', f.getName(), '|', f.constructor.name, '|', (() => { try { return f.getText(); } catch(e) { return '(no text)'; } })());
    });

    const acroForm = pdf.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
    console.log('AcroForm present:', !!acroForm);

    // Check page 2 annotations
    const page2 = pdf.getPages()[1];
    if (page2) {
        const annots = page2.node.lookupMaybe(PDFName.of('Annots'));
        console.log('Page 2 annots count:', annots ? (annots.asArray ? annots.asArray().length : 'exists') : 0);
    }
}

inspect().catch(console.error);
