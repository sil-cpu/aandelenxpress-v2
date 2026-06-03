const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const extracted = {
  "bv": {
    steps: [
      { stepTitle: "Stap 1", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Bij 1 BV: zijn bestaande holding(s) aandeelhouder?i", name: "singleBvExistingHoldings", type: "select", required: true }
      ]},
      { stepTitle: "Stap 2", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "werkmijNaamBedrijf", type: "text", required: true },
        { label: "Telefoonnummer", name: "werkmijTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "werkmijMailadres", type: "email", required: true },
        { label: "Werk je al met een boekhouder/accountant?", name: "werkmijHasAccountant", type: "select", required: true },
        { label: "Naam accountantskantoor", name: "werkmijAccountantNaam", type: "text", required: true },
        { label: "Contactpersoon", name: "werkmijAccountantContact", type: "text", required: true },
        { label: "Telefoonnummer", name: "werkmijAccountantTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "werkmijAccountantMail", type: "email", required: true },
        { label: "Type", name: "", type: "select", required: true },
        { label: "Naam", name: "", type: "text", required: true },
        { label: "Percentage", name: "", type: "number", required: true },
        { label: "werkmijDirectorsSameAsShareholders", name: "werkmijDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "werkmijAdresAfwijkendAandeelhouder", name: "werkmijAdresAfwijkendAandeelhouder", type: "checkbox", required: false },
        { label: "Zelfde woonadres als welke aandeelhouder?i", name: "werkmijAdresZelfdeAandeelhouderIndex", type: "select", required: true },
        { label: "Doel van de BV (wat gaat de BV doen)i", name: "werkmijActiviteiten", type: "textarea", required: true },
        { label: "werkmijImport", name: "werkmijImport", type: "checkbox", required: false },
        { label: "werkmijExport", name: "werkmijExport", type: "checkbox", required: false },
        { label: "detailWinkel", name: "detailWinkel", type: "checkbox", required: false },
        { label: "detailMarkt", name: "detailMarkt", type: "checkbox", required: false },
        { label: "detailStraat", name: "detailStraat", type: "checkbox", required: false },
        { label: "detailInternet", name: "detailInternet", type: "checkbox", required: false },
        { label: "detailHuis", name: "detailHuis", type: "checkbox", required: false },
        { label: "detailPostorder", name: "detailPostorder", type: "checkbox", required: false },
        { label: "detailOthers", name: "detailOthers", type: "checkbox", required: false },
        { label: "Groothandel *: verkoopt u aan andere ondernemingen?", name: "werkmijGroothandel", type: "select", required: true },
        { label: "Meer dan 15 uur per week", name: "werkmijPersoneelMeer15", type: "number", required: true },
        { label: "Minder dan 15 uur per week", name: "werkmijPersoneelMinder15", type: "number", required: true },
        { label: "Overige", name: "werkmijOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 3", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Voornamen", name: "", type: "text", required: true },
        { label: "Achternaam", name: "", type: "text", required: true },
        { label: "Geboortedatum", name: "", type: "date", required: true },
        { label: "Geboorteland", name: "", type: "text", required: true },
        { label: "Heb je een BSN nummer?i", name: "", type: "select", required: true },
        { label: "Nederlands BSN", name: "", type: "text", required: true },
        { label: "Heb je een geregistreerd woonadres in Nederland?i", name: "", type: "select", required: true },
        { label: "Nationaliteit", name: "", type: "text", required: true },
        { label: "Burgerlijke staat", name: "", type: "select", required: true },
        { label: "Persoonlijk IBAN", name: "", type: "text", required: true },
        { label: "Persoonlijk telefoonnummer", name: "", type: "text", required: true },
        { label: "Persoonlijk emailadres", name: "", type: "email", required: true },
        { label: "Nederlands taalniveaui", name: "", type: "select", required: true },
        { label: "Heeft deze persoon een eenmanszaak/VOF?i", name: "", type: "select", required: true },
        { label: "Wat gaat er gebeuren met de eenmanszaak/VOF?i", name: "", type: "select", required: false },
        { label: "Volledig buitenlands woonadresi", name: "", type: "textarea", required: true },
        { label: "Upload utility bill (bewijs buitenlands adres)i", name: "", type: "file", required: true }
      ]},
      { stepTitle: "Stap 4", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Datacard / PDC bestand(en)", name: "", type: "file", required: false },
        { label: "PEP verklaring(en)", name: "", type: "file", required: false },
        { label: "Personeelsplan / bedrijfsplan(nen)", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 5", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "legalConsent", name: "legalConsent", type: "checkbox", required: false }
      ]}
    ]
  },
  "bv-holding": {
    steps: [
      { stepTitle: "Stap 1", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Wie worden aandeelhouder(s) van de nieuwe werkmaatschappij?i", name: "existingHoldingOwner", type: "select", required: true }
      ]},
      { stepTitle: "Stap 2", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "holdingNaamBedrijf", type: "text", required: true },
        { label: "Telefoonnummer", name: "holdingTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "holdingMailadres", type: "email", required: true },
        { label: "Werk je al met een boekhouder/accountant?", name: "holdingHasAccountant", type: "select", required: true },
        { label: "Naam accountantskantoor", name: "holdingAccountantNaam", type: "text", required: true },
        { label: "Contactpersoon", name: "holdingAccountantContact", type: "text", required: true },
        { label: "Telefoonnummer", name: "holdingAccountantTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "holdingAccountantMail", type: "email", required: true },
        { label: "Type", name: "", type: "select", required: true },
        { label: "Naam", name: "", type: "text", required: true },
        { label: "Percentage", name: "", type: "number", required: true },
        { label: "holdingDirectorsSameAsShareholders", name: "holdingDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "holdingAdresAfwijkendAandeelhouder", name: "holdingAdresAfwijkendAandeelhouder", type: "checkbox", required: false },
        { label: "Zelfde woonadres als welke aandeelhouder?i", name: "holdingAdresZelfdeAandeelhouderIndex", type: "select", required: true },
        { label: "Meer dan 15 uur per week", name: "holdingPersoneelMeer15", type: "number", required: true },
        { label: "Minder dan 15 uur per week", name: "holdingPersoneelMinder15", type: "number", required: true },
        { label: "Overige", name: "holdingOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 3", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "werkmijNaamBedrijf", type: "text", required: true },
        { label: "Telefoonnummer", name: "werkmijTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "werkmijMailadres", type: "email", required: true },
        { label: "Werk je al met een boekhouder/accountant?", name: "werkmijHasAccountant", type: "select", required: true },
        { label: "Naam accountantskantoor", name: "werkmijAccountantNaam", type: "text", required: true },
        { label: "Contactpersoon", name: "werkmijAccountantContact", type: "text", required: true },
        { label: "Telefoonnummer", name: "werkmijAccountantTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "werkmijAccountantMail", type: "email", required: true },
        { label: "werkmijDirectorsSameAsShareholders", name: "werkmijDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "werkmijAdresAfwijkendAandeelhouder", name: "werkmijAdresAfwijkendAandeelhouder", type: "checkbox", required: false },
        { label: "Zelfde woonadres als welke aandeelhouder?i", name: "werkmijAdresZelfdeAandeelhouderIndex", type: "select", required: true },
        { label: "Doel van de BV (wat gaat de BV doen)i", name: "werkmijActiviteiten", type: "textarea", required: true },
        { label: "werkmijImport", name: "werkmijImport", type: "checkbox", required: false },
        { label: "werkmijExport", name: "werkmijExport", type: "checkbox", required: false },
        { label: "detailWinkel", name: "detailWinkel", type: "checkbox", required: false },
        { label: "detailMarkt", name: "detailMarkt", type: "checkbox", required: false },
        { label: "detailStraat", name: "detailStraat", type: "checkbox", required: false },
        { label: "detailInternet", name: "detailInternet", type: "checkbox", required: false },
        { label: "detailHuis", name: "detailHuis", type: "checkbox", required: false },
        { label: "detailPostorder", name: "detailPostorder", type: "checkbox", required: false },
        { label: "detailOthers", name: "detailOthers", type: "checkbox", required: false },
        { label: "Groothandel *: verkoopt u aan andere ondernemingen?", name: "werkmijGroothandel", type: "select", required: true },
        { label: "Meer dan 15 uur per week", name: "werkmijPersoneelMeer15", type: "number", required: true },
        { label: "Minder dan 15 uur per week", name: "werkmijPersoneelMinder15", type: "number", required: true },
        { label: "Overige", name: "werkmijOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 4", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Voornamen", name: "", type: "text", required: true },
        { label: "Achternaam", name: "", type: "text", required: true },
        { label: "Geboortedatum", name: "", type: "date", required: true },
        { label: "Geboorteland", name: "", type: "text", required: true },
        { label: "Heb je een BSN nummer?i", name: "", type: "select", required: true },
        { label: "Nederlands BSN", name: "", type: "text", required: true },
        { label: "Heb je een geregistreerd woonadres in Nederland?i", name: "", type: "select", required: true },
        { label: "Nationaliteit", name: "", type: "text", required: true },
        { label: "Burgerlijke staat", name: "", type: "select", required: true },
        { label: "Persoonlijk IBAN", name: "", type: "text", required: true },
        { label: "Persoonlijk telefoonnummer", name: "", type: "text", required: true },
        { label: "Persoonlijk emailadres", name: "", type: "email", required: true },
        { label: "Nederlands taalniveaui", name: "", type: "select", required: true },
        { label: "Heeft deze persoon een eenmanszaak/VOF?i", name: "", type: "select", required: true },
        { label: "Wat gaat er gebeuren met de eenmanszaak/VOF?i", name: "", type: "select", required: false },
        { label: "Volledig buitenlands woonadresi", name: "", type: "textarea", required: true },
        { label: "Upload utility bill (bewijs buitenlands adres)i", name: "", type: "file", required: true }
      ]},
      { stepTitle: "Stap 5", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Datacard / PDC bestand(en)", name: "", type: "file", required: false },
        { label: "PEP verklaring(en)", name: "", type: "file", required: false },
        { label: "Personeelsplan / bedrijfsplan(nen)", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 6", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "legalConsent", name: "legalConsent", type: "checkbox", required: false }
      ]}
    ]
  },
  "holding": {
    steps: [
      { stepTitle: "Stap 1", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "holdingNaamBedrijf", type: "text", required: true },
        { label: "Telefoonnummer", name: "holdingTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "holdingMailadres", type: "email", required: true },
        { label: "Werk je al met een boekhouder/accountant?", name: "holdingHasAccountant", type: "select", required: true },
        { label: "Naam accountantskantoor", name: "holdingAccountantNaam", type: "text", required: true },
        { label: "Contactpersoon", name: "holdingAccountantContact", type: "text", required: true },
        { label: "Telefoonnummer", name: "holdingAccountantTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "holdingAccountantMail", type: "email", required: true },
        { label: "Type", name: "", type: "select", required: true },
        { label: "Naam", name: "", type: "text", required: true },
        { label: "Percentage", name: "", type: "number", required: true },
        { label: "holdingDirectorsSameAsShareholders", name: "holdingDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "holdingAdresAfwijkendAandeelhouder", name: "holdingAdresAfwijkendAandeelhouder", type: "checkbox", required: false },
        { label: "Zelfde woonadres als welke aandeelhouder?i", name: "holdingAdresZelfdeAandeelhouderIndex", type: "select", required: true },
        { label: "Wordt de holding eigenaar van nog op te richten BV's?i", name: "holdingEigendomNieuweBvs", type: "select", required: true },
        { label: "Meer dan 15 uur per week", name: "holdingPersoneelMeer15", type: "number", required: true },
        { label: "Minder dan 15 uur per week", name: "holdingPersoneelMinder15", type: "number", required: true },
        { label: "Overige", name: "holdingOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 2", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Voornamen", name: "", type: "text", required: true },
        { label: "Achternaam", name: "", type: "text", required: true },
        { label: "Geboortedatum", name: "", type: "date", required: true },
        { label: "Geboorteland", name: "", type: "text", required: true },
        { label: "Heb je een BSN nummer?i", name: "", type: "select", required: true },
        { label: "Nederlands BSN", name: "", type: "text", required: true },
        { label: "Heb je een geregistreerd woonadres in Nederland?i", name: "", type: "select", required: true },
        { label: "Nationaliteit", name: "", type: "text", required: true },
        { label: "Burgerlijke staat", name: "", type: "select", required: true },
        { label: "Persoonlijk IBAN", name: "", type: "text", required: true },
        { label: "Persoonlijk telefoonnummer", name: "", type: "text", required: true },
        { label: "Persoonlijk emailadres", name: "", type: "email", required: true },
        { label: "Nederlands taalniveaui", name: "", type: "select", required: true },
        { label: "Heeft deze persoon een eenmanszaak/VOF?i", name: "", type: "select", required: true },
        { label: "Wat gaat er gebeuren met de eenmanszaak/VOF?i", name: "", type: "select", required: false },
        { label: "Volledig buitenlands woonadresi", name: "", type: "textarea", required: true },
        { label: "Upload utility bill (bewijs buitenlands adres)i", name: "", type: "file", required: true }
      ]},
      { stepTitle: "Stap 3", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Datacard / PDC bestand(en)", name: "", type: "file", required: false },
        { label: "PEP verklaring(en)", name: "", type: "file", required: false },
        { label: "Personeelsplan / bedrijfsplan(nen)", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 4", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "legalConsent", name: "legalConsent", type: "checkbox", required: false }
      ]}
    ]
  },
  "eenmanszaak-omzetten": {
    steps: [
      { stepTitle: "Stap 1", fields: [
        { label: "Language", name: "", type: "select", required: false }
      ]},
      { stepTitle: "Stap 2", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "werkmijNaamBedrijf", type: "text", required: false },
        { label: "Telefoonnummer", name: "werkmijTelefoon", type: "text", required: false },
        { label: "Mailadres", name: "werkmijMailadres", type: "email", required: false },
        { label: "Naam accountantskantoor", name: "werkmijAccountantNaam", type: "text", required: false },
        { label: "Contactpersoon", name: "werkmijAccountantContact", type: "text", required: false },
        { label: "Telefoonnummer", name: "werkmijAccountantTelefoon", type: "text", required: false },
        { label: "Mailadres", name: "werkmijAccountantMail", type: "email", required: false },
        { label: "werkmijDirectorsSameAsShareholders", name: "werkmijDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "Overige", name: "werkmijOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 3", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Type bronondernemingi", name: "omzettingBronType", type: "select", required: false },
        { label: "Naam EMZ/VOF", name: "omzettingBronNaam", type: "text", required: false },
        { label: "KVK-nummer EMZ/VOF", name: "omzettingBronKvk", type: "text", required: false },
        { label: "Statutaire zetel EMZ/VOF", name: "omzettingBronZetel", type: "text", required: false },
        { label: "Eigenaar(s) EMZ/VOF + aandelenverdeling (bij VOF)i", name: "omzettingBronEigenaren", type: "textarea", required: false },
        { label: "Doel van de EMZ/VOFi", name: "omzettingBronDoel", type: "textarea", required: false },
        { label: "KVK-uittreksel eenmanszaak/VOFi", name: "", type: "file", required: false },
        { label: "Verzendbewijs intentieverklaring (Belastingdienst)i", name: "", type: "file", required: false },
        { label: "Bewijs van ontvangst intentieverklaringi", name: "", type: "file", required: false },
        { label: "Intentieverklaringi", name: "", type: "file", required: false },
        { label: "Geleideformulier intentieverklaringi", name: "", type: "file", required: false },
        { label: "Inbrengbeschrijvingi", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 4", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Datacard / PDC bestand(en)", name: "", type: "file", required: false },
        { label: "PEP verklaring(en)", name: "", type: "file", required: false },
        { label: "Personeelsplan / bedrijfsplan(nen)", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 5", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "legalConsent", name: "legalConsent", type: "checkbox", required: false }
      ]}
    ]
  },
  "vof-naar-bv": {
    steps: [
      { stepTitle: "Stap 1", fields: [
        { label: "Language", name: "", type: "select", required: false }
      ]},
      { stepTitle: "Stap 2", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "werkmijNaamBedrijf", type: "text", required: false },
        { label: "Telefoonnummer", name: "werkmijTelefoon", type: "text", required: false },
        { label: "Mailadres", name: "werkmijMailadres", type: "email", required: false },
        { label: "Naam accountantskantoor", name: "werkmijAccountantNaam", type: "text", required: false },
        { label: "Contactpersoon", name: "werkmijAccountantContact", type: "text", required: false },
        { label: "Telefoonnummer", name: "werkmijAccountantTelefoon", type: "text", required: false },
        { label: "Mailadres", name: "werkmijAccountantMail", type: "email", required: false },
        { label: "werkmijDirectorsSameAsShareholders", name: "werkmijDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "Overige", name: "werkmijOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 3", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Type bronondernemingi", name: "omzettingBronType", type: "select", required: false },
        { label: "Naam EMZ/VOF", name: "omzettingBronNaam", type: "text", required: false },
        { label: "KVK-nummer EMZ/VOF", name: "omzettingBronKvk", type: "text", required: false },
        { label: "Statutaire zetel EMZ/VOF", name: "omzettingBronZetel", type: "text", required: false },
        { label: "Eigenaar(s) EMZ/VOF + aandelenverdeling (bij VOF)i", name: "omzettingBronEigenaren", type: "textarea", required: false },
        { label: "Doel van de EMZ/VOFi", name: "omzettingBronDoel", type: "textarea", required: false },
        { label: "KVK-uittreksel eenmanszaak/VOFi", name: "", type: "file", required: false },
        { label: "Verzendbewijs intentieverklaring (Belastingdienst)i", name: "", type: "file", required: false },
        { label: "Bewijs van ontvangst intentieverklaringi", name: "", type: "file", required: false },
        { label: "Intentieverklaringi", name: "", type: "file", required: false },
        { label: "Geleideformulier intentieverklaringi", name: "", type: "file", required: false },
        { label: "Inbrengbeschrijvingi", name: "", type: "file", required: false },
        { label: "UBO-uittreksel VOF (indien van toepassing)i", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 4", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Datacard / PDC bestand(en)", name: "", type: "file", required: false },
        { label: "PEP verklaring(en)", name: "", type: "file", required: false },
        { label: "Personeelsplan / bedrijfsplan(nen)", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 5", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "legalConsent", name: "legalConsent", type: "checkbox", required: false }
      ]}
    ]
  },
  "eenmanszaak-omzetten-bv-holding": {
    steps: [
      { stepTitle: "Stap 1", fields: [
        { label: "Language", name: "", type: "select", required: false }
      ]},
      { stepTitle: "Stap 2", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "holdingNaamBedrijf", type: "text", required: true },
        { label: "Telefoonnummer", name: "holdingTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "holdingMailadres", type: "email", required: true },
        { label: "Naam accountantskantoor", name: "holdingAccountantNaam", type: "text", required: true },
        { label: "Contactpersoon", name: "holdingAccountantContact", type: "text", required: true },
        { label: "Telefoonnummer", name: "holdingAccountantTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "holdingAccountantMail", type: "email", required: true },
        { label: "Type", name: "", type: "select", required: true },
        { label: "Naam", name: "", type: "text", required: true },
        { label: "Percentage", name: "", type: "number", required: true },
        { label: "holdingDirectorsSameAsShareholders", name: "holdingDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "Adres van de holding BV", name: "holdingAdresBron", type: "select", required: true },
        { label: "Meer dan 15 uur per week", name: "holdingPersoneelMeer15", type: "number", required: true },
        { label: "Minder dan 15 uur per week", name: "holdingPersoneelMinder15", type: "number", required: true },
        { label: "Overige", name: "holdingOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 3", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "werkmijNaamBedrijf", type: "text", required: false },
        { label: "Telefoonnummer", name: "werkmijTelefoon", type: "text", required: false },
        { label: "Mailadres", name: "werkmijMailadres", type: "email", required: false },
        { label: "Naam accountantskantoor", name: "werkmijAccountantNaam", type: "text", required: false },
        { label: "Contactpersoon", name: "werkmijAccountantContact", type: "text", required: false },
        { label: "Telefoonnummer", name: "werkmijAccountantTelefoon", type: "text", required: false },
        { label: "Mailadres", name: "werkmijAccountantMail", type: "email", required: false },
        { label: "werkmijDirectorsSameAsShareholders", name: "werkmijDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "Overige", name: "werkmijOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 4", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Voornamen", name: "", type: "text", required: true },
        { label: "Achternaam", name: "", type: "text", required: true },
        { label: "Geboortedatum", name: "", type: "date", required: true },
        { label: "Geboorteland", name: "", type: "text", required: true },
        { label: "Heb je een BSN nummer?i", name: "", type: "select", required: true },
        { label: "Nederlands BSN", name: "", type: "text", required: true },
        { label: "Heb je een geregistreerd woonadres in Nederland?i", name: "", type: "select", required: true },
        { label: "Nationaliteit", name: "", type: "text", required: true },
        { label: "Burgerlijke staat", name: "", type: "select", required: true },
        { label: "Persoonlijk IBAN", name: "", type: "text", required: true },
        { label: "Persoonlijk telefoonnummer", name: "", type: "text", required: true },
        { label: "Persoonlijk emailadres", name: "", type: "email", required: true },
        { label: "Nederlands taalniveaui", name: "", type: "select", required: true },
        { label: "Volledig buitenlands woonadresi", name: "", type: "textarea", required: true },
        { label: "Upload utility bill (bewijs buitenlands adres)i", name: "", type: "file", required: true }
      ]},
      { stepTitle: "Stap 5", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Type bronondernemingi", name: "omzettingBronType", type: "select", required: false },
        { label: "Naam EMZ/VOF", name: "omzettingBronNaam", type: "text", required: false },
        { label: "KVK-nummer EMZ/VOF", name: "omzettingBronKvk", type: "text", required: false },
        { label: "Statutaire zetel EMZ/VOF", name: "omzettingBronZetel", type: "text", required: false },
        { label: "Eigenaar(s) EMZ/VOF + aandelenverdeling (bij VOF)i", name: "omzettingBronEigenaren", type: "textarea", required: false },
        { label: "Doel van de EMZ/VOFi", name: "omzettingBronDoel", type: "textarea", required: false },
        { label: "KVK-uittreksel eenmanszaak/VOFi", name: "", type: "file", required: false },
        { label: "Verzendbewijs intentieverklaring (Belastingdienst)i", name: "", type: "file", required: false },
        { label: "Bewijs van ontvangst intentieverklaringi", name: "", type: "file", required: false },
        { label: "Intentieverklaringi", name: "", type: "file", required: false },
        { label: "Geleideformulier intentieverklaringi", name: "", type: "file", required: false },
        { label: "Inbrengbeschrijving (holding)i", name: "", type: "file", required: false },
        { label: "Inbrengbeschrijving (werkmaatschappij)i", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 6", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Datacard / PDC bestand(en)", name: "", type: "file", required: false },
        { label: "PEP verklaring(en)", name: "", type: "file", required: false },
        { label: "Personeelsplan / bedrijfsplan(nen)", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 7", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "legalConsent", name: "legalConsent", type: "checkbox", required: false }
      ]}
    ]
  },
  "vof-naar-bv-holding": {
    steps: [
      { stepTitle: "Stap 1", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Hoeveel holdings wil je oprichten?", name: "vofHoldingCount", type: "number", required: true }
      ]},
      { stepTitle: "Stap 2", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "", type: "text", required: true },
        { label: "Telefoonnummer", name: "", type: "text", required: true },
        { label: "Mailadres", name: "", type: "email", required: true },
        { label: "Straat", name: "", type: "text", required: true },
        { label: "Huisnummer", name: "", type: "text", required: true },
        { label: "Postcode", name: "", type: "text", required: true },
        { label: "Plaatsnaam", name: "", type: "text", required: true },
        { label: "Naam accountantskantoor", name: "holdingAccountantNaam", type: "text", required: true },
        { label: "Contactpersoon", name: "holdingAccountantContact", type: "text", required: true },
        { label: "Telefoonnummer", name: "holdingAccountantTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "holdingAccountantMail", type: "email", required: true },
        { label: "Type", name: "", type: "select", required: true },
        { label: "Naam", name: "", type: "text", required: true },
        { label: "Percentage", name: "", type: "number", required: true },
        { label: "holdingDirectorsSameAsShareholders", name: "holdingDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "Meer dan 15 uur per week", name: "holdingPersoneelMeer15", type: "number", required: true },
        { label: "Minder dan 15 uur per week", name: "holdingPersoneelMinder15", type: "number", required: true },
        { label: "Overige", name: "holdingOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 3", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Naam bedrijf", name: "werkmijNaamBedrijf", type: "text", required: true },
        { label: "Telefoonnummer", name: "werkmijTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "werkmijMailadres", type: "email", required: true },
        { label: "Naam accountantskantoor", name: "werkmijAccountantNaam", type: "text", required: true },
        { label: "Contactpersoon", name: "werkmijAccountantContact", type: "text", required: true },
        { label: "Telefoonnummer", name: "werkmijAccountantTelefoon", type: "text", required: true },
        { label: "Mailadres", name: "werkmijAccountantMail", type: "email", required: true },
        { label: "Type", name: "", type: "select", required: true },
        { label: "Naam", name: "", type: "text", required: true },
        { label: "Percentage", name: "", type: "number", required: true },
        { label: "werkmijDirectorsSameAsShareholders", name: "werkmijDirectorsSameAsShareholders", type: "checkbox", required: false },
        { label: "Overige", name: "werkmijOverige", type: "textarea", required: false }
      ]},
      { stepTitle: "Stap 4", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Voornamen", name: "", type: "text", required: true },
        { label: "Achternaam", name: "", type: "text", required: true },
        { label: "Geboortedatum", name: "", type: "date", required: true },
        { label: "Geboorteland", name: "", type: "text", required: true },
        { label: "Heb je een BSN nummer?i", name: "", type: "select", required: true },
        { label: "Nederlands BSN", name: "", type: "text", required: true },
        { label: "Heb je een geregistreerd woonadres in Nederland?i", name: "", type: "select", required: true },
        { label: "Nationaliteit", name: "", type: "text", required: true },
        { label: "Burgerlijke staat", name: "", type: "select", required: true },
        { label: "Persoonlijk IBAN", name: "", type: "text", required: true },
        { label: "Persoonlijk telefoonnummer", name: "", type: "text", required: true },
        { label: "Persoonlijk emailadres", name: "", type: "email", required: true },
        { label: "Nederlands taalniveaui", name: "", type: "select", required: true },
        { label: "Volledig buitenlands woonadresi", name: "", type: "textarea", required: true },
        { label: "Upload utility bill (bewijs buitenlands adres)i", name: "", type: "file", required: true }
      ]},
      { stepTitle: "Stap 5", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Type bronondernemingi", name: "omzettingBronType", type: "select", required: false },
        { label: "Naam EMZ/VOF", name: "omzettingBronNaam", type: "text", required: false },
        { label: "KVK-nummer EMZ/VOF", name: "omzettingBronKvk", type: "text", required: false },
        { label: "Statutaire zetel EMZ/VOF", name: "omzettingBronZetel", type: "text", required: false },
        { label: "Eigenaar(s) EMZ/VOF + aandelenverdeling (bij VOF)i", name: "omzettingBronEigenaren", type: "textarea", required: false },
        { label: "Doel van de EMZ/VOFi", name: "omzettingBronDoel", type: "textarea", required: false },
        { label: "KVK-uittreksel eenmanszaak/VOFi", name: "", type: "file", required: false },
        { label: "Verzendbewijs intentieverklaring (Belastingdienst)i", name: "", type: "file", required: false },
        { label: "Bewijs van ontvangst intentieverklaringi", name: "", type: "file", required: false },
        { label: "Intentieverklaringi", name: "", type: "file", required: false },
        { label: "Geleideformulier intentieverklaringi", name: "", type: "file", required: false },
        { label: "Inbrengbeschrijving (holding)i", name: "", type: "file", required: false },
        { label: "Inbrengbeschrijving (werkmaatschappij)i", name: "", type: "file", required: false },
        { label: "UBO-uittreksel VOF (indien van toepassing)i", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 6", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "Datacard / PDC bestand(en)", name: "", type: "file", required: false },
        { label: "PEP verklaring(en)", name: "", type: "file", required: false },
        { label: "Personeelsplan / bedrijfsplan(nen)", name: "", type: "file", required: false }
      ]},
      { stepTitle: "Stap 7", fields: [
        { label: "Language", name: "", type: "select", required: false },
        { label: "legalConsent", name: "legalConsent", type: "checkbox", required: false }
      ]}
    ]
  }
};

function addHeader(doc, title, subtitle) {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(title, 40, 40);
  doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(subtitle, 40, 64);
  doc.moveTo(40, 82).lineTo(555, 82).strokeColor('#e5e7eb').stroke();
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - 50;
  if (doc.y + needed > bottom) {
    doc.addPage();
    doc.y = 40;
  }
}

function getDummyAnswer(field) {
  const label = (field.label || '').toLowerCase();
  const name = (field.name || '').toLowerCase();
  const type = (field.type || '').toLowerCase();

  if (label.includes('language')) return 'Nederlands';
  if (label.includes('naam bedrijf')) return 'Van Dijk Digital B.V.';
  if (label.includes('accountantskantoor')) return 'Scherp Administratiekantoor B.V.';
  if (label.includes('contactpersoon')) return 'M. Peters';
  if (label.includes('voornamen')) return 'Mark Johannes';
  if (label.includes('achternaam')) return 'van Dijk';
  if (label.includes('geboortedatum')) return '14-09-1988';
  if (label.includes('geboorteland')) return 'Nederland';
  if (label.includes('nationaliteit')) return 'Nederlandse';
  if (label.includes('burgerlijke staat')) return 'Gehuwd';
  if (label.includes('nederlands bsn')) return '123456782';
  if (label.includes('iban')) return 'NL91ABNA0417164300';
  if (label.includes('telefoonnummer')) return '06-24815937';
  if (label.includes('mailadres') || label.includes('emailadres')) return 'mark.vandijk@vandijkdigital.nl';
  if (label.includes('nederlands taalniveau')) return 'Goed';
  if (label.includes('doel van de bv')) return 'Softwareontwikkeling en IT-consultancy voor MKB-klanten in Nederland.';
  if (label.includes('doel van de emz/vof')) return 'Advies en implementatie van digitale marketing en automatisering.';
  if (label.includes('overige')) return 'Geen aanvullende bijzonderheden.';
  if (label.includes('eigenaar(s) emz/vof')) return 'Mark van Dijk (60%), Laura de Boer (40%).';
  if (label.includes('kvk-nummer')) return '76543210';
  if (label.includes('statutaire zetel')) return 'Amsterdam';
  if (label.includes('naam emz/vof')) return 'V.O.F. Van Dijk & De Boer';
  if (label.includes('volledig buitenlands woonadres')) return 'Geen, aanvrager woont in Nederland.';
  if (label.includes('hoeveel holdings')) return '2';
  if (label.includes('percentage')) return '50';
  if (label.includes('meer dan 15 uur')) return '2';
  if (label.includes('minder dan 15 uur')) return '1';
  if (label.includes('hasaccountant') || label.includes('boekhouder/accountant')) return 'Ja';
  if (label.includes('heeft deze persoon een eenmanszaak/vof')) return 'Ja';
  if (label.includes('wat gaat er gebeuren met de eenmanszaak/vof')) return 'Inbreng in nieuw op te richten BV';
  if (label.includes('heb je een bsn nummer')) return 'Ja';
  if (label.includes('woonadres in nederland')) return 'Ja';
  if (label.includes('groothandel')) return 'Nee';
  if (label.includes('wordt de holding eigenaar')) return 'Ja';
  if (label.includes('wie worden aandeelhouder')) return 'Bestaande holding';
  if (label.includes('bij 1 bv')) return 'Nee';
  if (label.includes('adres van de holding')) return 'Bestaand vestigingsadres';
  if (label.includes('zelfde woonadres')) return 'Aandeelhouder 1';
  if (label === 'type') return 'Natuurlijk persoon';
  if (label === 'naam') return 'Mark van Dijk';

  if (name.includes('import')) return 'Ja';
  if (name.includes('export')) return 'Nee';
  if (name.includes('detailinternet')) return 'Ja';
  if (name.includes('detailwinkel') || name.includes('detailmarkt') || name.includes('detailstraat') || name.includes('detailhuis') || name.includes('detailpostorder') || name.includes('detailothers')) return 'Nee';
  if (name.includes('legalconsent')) return 'Ja';

  if (type === 'email') return 'info@vandijkdigital.nl';
  if (type === 'tel') return '06-24815937';
  if (type === 'number') return '1';
  if (type === 'date') return '03-06-2026';
  if (type === 'checkbox') return 'Ja';
  if (type === 'select') return 'Ja';
  if (type === 'textarea') return 'Toelichting: gegevens ingevuld voor formatcontrole van de aanvraag-PDF.';
  if (type === 'file') {
    if (label.includes('pep')) return 'PEP-verklaring-mark-van-dijk.pdf';
    if (label.includes('datacard') || label.includes('pdc')) return 'datacard-mark-van-dijk.pdf';
    if (label.includes('personeelsplan') || label.includes('bedrijfsplan')) return 'bedrijfsplan-2026.pdf';
    if (label.includes('kvk-uittreksel')) return 'kvk-uittreksel-vof.pdf';
    if (label.includes('intentieverklaring')) return 'intentieverklaring-bd.pdf';
    if (label.includes('inbrengbeschrijving')) return 'inbrengbeschrijving-2026.pdf';
    if (label.includes('utility bill')) return 'utility-bill-jan-2026.pdf';
    if (label.includes('ubo-uittreksel')) return 'ubo-uittreksel-vof.pdf';
    return 'bijlage-aanvraag.pdf';
  }

  return 'Voorbeeld klantantwoord';
}

function getDemoFileUrl(field) {
  const label = String(field?.label || '').toLowerCase();
  const base = 'https://aandelenxpress-v2.vercel.app';
  const caseId = 'AX-DEMO';

  if (label.includes('datacard') || label.includes('pdc')) return `${base}/api/vragenlijsten/${caseId}/files/datacard?index=0`;
  if (label.includes('pep')) return `${base}/api/vragenlijsten/${caseId}/files/pep?index=0`;
  if (label.includes('personeelsplan') || label.includes('bedrijfsplan')) return `${base}/api/vragenlijsten/${caseId}/files/personeelsplan?index=0`;
  if (label.includes('kvk-uittreksel')) return `${base}/api/vragenlijsten/${caseId}/files/kvk-uittreksel?index=0`;
  if (label.includes('verzendbewijs')) return `${base}/api/vragenlijsten/${caseId}/files/verzendbewijs-intentie?index=0`;
  if (label.includes('ontvangst')) return `${base}/api/vragenlijsten/${caseId}/files/ontvangst-intent?index=0`;
  if (label.includes('intentieverklaring')) return `${base}/api/vragenlijsten/${caseId}/files/intentverklaring?index=0`;
  if (label.includes('geleideformulier')) return `${base}/api/vragenlijsten/${caseId}/files/geleideformulier?index=0`;
  if (label.includes('inbrengbeschrijving (holding)')) return `${base}/api/vragenlijsten/${caseId}/files/inbrengbeschrijving-holding?index=0`;
  if (label.includes('inbrengbeschrijving (werkmaatschappij)')) return `${base}/api/vragenlijsten/${caseId}/files/inbrengbeschrijving-werkmij?index=0`;
  if (label.includes('inbrengbeschrijving')) return `${base}/api/vragenlijsten/${caseId}/files/inbrengbeschrijving?index=0`;
  if (label.includes('ubo-uittreksel')) return `${base}/api/vragenlijsten/${caseId}/files/ubo-uittreksel?index=0`;
  if (label.includes('utility bill')) return `${base}/api/vragenlijsten/${caseId}/files/werkmij-huurovereenkomst?index=0`;
  return `${base}/api/vragenlijsten/${caseId}/files/oprichtingsdocument?index=0`;
}

function isLanguageField(field) {
  const label = String(field?.label || '').trim().toLowerCase();
  const name = String(field?.name || '').trim().toLowerCase();
  return label === 'language' || label === 'taal' || name === 'language' || name === 'languageselect';
}

function stepTitleFromProduct(product, stepIndex, fallback) {
  const map = {
    'bv': [
      'Aanvraagtype',
      'Oprichting document (Werkmaatschappij)',
      'Natuurlijke personen',
      'Uploads',
      'Indienen'
    ],
    'bv-holding': [
      'Aanvraagtype',
      'Oprichting document (Holding)',
      'Oprichting document (Werkmaatschappij)',
      'Natuurlijke personen',
      'Uploads',
      'Indienen'
    ],
    'holding': [
      'Oprichting document (Holding)',
      'Natuurlijke personen',
      'Uploads',
      'Indienen'
    ],
    'eenmanszaak-omzetten': [
      'Aanvraagtype',
      'Oprichting document (Werkmaatschappij)',
      'Omzettingsdocumenten',
      'Uploads',
      'Indienen'
    ],
    'vof-naar-bv': [
      'Aanvraagtype',
      'Oprichting document (Werkmaatschappij)',
      'Omzettingsdocumenten',
      'Uploads',
      'Indienen'
    ],
    'eenmanszaak-omzetten-bv-holding': [
      'Aanvraagtype',
      'Oprichting document (Holding)',
      'Oprichting document (Werkmaatschappij)',
      'Natuurlijke personen',
      'Omzettingsdocumenten',
      'Uploads',
      'Indienen'
    ],
    'vof-naar-bv-holding': [
      'Aanvraagtype',
      'Oprichting document (Holding)',
      'Oprichting document (Werkmaatschappij)',
      'Natuurlijke personen',
      'Omzettingsdocumenten',
      'Uploads',
      'Indienen'
    ]
  };

  const title = map[product]?.[stepIndex];
  return title || fallback || `Sectie ${stepIndex + 1}`;
}

function drawStepTableHeader(doc, leftX, questionW, answerW, rowH) {
  const y = doc.y;
  doc.rect(leftX, y, questionW + answerW, rowH).fillAndStroke('#eff6ff', '#cbd5e1');
  doc.moveTo(leftX + questionW, y).lineTo(leftX + questionW, y + rowH).strokeColor('#cbd5e1').stroke();

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Vraag', leftX + 8, y + 8, {
    width: questionW - 16,
    lineBreak: false
  });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Antwoord', leftX + questionW + 8, y + 8, {
    width: answerW - 16,
    lineBreak: false
  });
  doc.y = y + rowH;
}

function drawStepTableRow(doc, idx, field, leftX, questionW, answerW, minRowH, fieldName) {
  const question = `${idx}. ${field.label || '-'}`;
  const answer = getDummyAnswer(field);
  const isFile = String(field?.type || '').toLowerCase() === 'file';
  const fileUrl = isFile ? getDemoFileUrl(field) : '';

  const qH = doc.heightOfString(question, { width: questionW - 16, align: 'left' });
  const aH = doc.heightOfString(answer, { width: answerW - 16, align: 'left' });
  const linkExtra = fileUrl ? 12 : 0;
  const rowH = Math.max(minRowH, qH + 12, aH + 12 + linkExtra);

  ensureSpace(doc, rowH + 1);
  const y = doc.y;

  doc.rect(leftX, y, questionW + answerW, rowH).fillAndStroke('#ffffff', '#e2e8f0');
  doc.moveTo(leftX + questionW, y).lineTo(leftX + questionW, y + rowH).strokeColor('#e2e8f0').stroke();

  doc.font('Helvetica').fontSize(9.5).fillColor('#111827').text(question, leftX + 8, y + 6, {
    width: questionW - 16,
    align: 'left'
  });

  const inputX = leftX + questionW + 6;
  const inputY = y + 4;
  const inputW = answerW - 12;
  const inputH = rowH - 8;

  if (isFile) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(answer, inputX + 2, inputY + 2, {
      width: inputW - 4,
      align: 'left'
    });
    doc.font('Helvetica').fontSize(8.8).fillColor('#1D4ED8').text('Open bestand', inputX + 2, inputY + aH + 3, {
      width: inputW - 4,
      link: fileUrl,
      underline: true,
      align: 'left'
    });
    doc.rect(inputX, inputY, inputW, inputH).strokeColor('#cbd5e1').lineWidth(0.6).stroke();
  } else {
    doc.formText(fieldName, inputX, inputY, inputW, inputH, {
      value: answer,
      fontSize: 9,
      backgroundColor: '#f8fafc',
      borderColor: '#cbd5e1',
      textColor: '#334155'
    });
  }

  doc.y = y + rowH;
}

function generatePdf(product, data, outDir, stamp) {
  const fileName = `AandelenXpress-${product}-FORM-EXTRACT-${stamp}.pdf`;
  const outPath = path.join(outDir, fileName);
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 50, left: 40, right: 40 } });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  doc.initForm();

  const visibleSteps = data.steps.map((step) => ({
    ...step,
    fields: (step.fields || []).filter((field) => !isLanguageField(field))
  }));
  const totalFields = visibleSteps.reduce((sum, s) => sum + s.fields.length, 0);
  addHeader(doc, `Form Extract - ${product}`, `Stappen: ${data.steps.length} | Velden: ${totalFields}`);
  doc.y = 96;

  visibleSteps.forEach((step, stepIndex) => {
    ensureSpace(doc, 50);
    const stepTitleY = doc.y;
    doc.roundedRect(40, stepTitleY, 515, 24, 4).fill('#f8fafc');
    const displayStepTitle = stepTitleFromProduct(product, stepIndex, step.stepTitle);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#0f172a').text(displayStepTitle, 48, stepTitleY + 7, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`Product: ${product} | Stap ${stepIndex + 1} | Veldcount: ${step.fields.length}`, 300, stepTitleY + 8, {
      width: 248,
      align: 'right',
      lineBreak: false
    });
    doc.y = stepTitleY + 30;

    if (!step.fields.length) {
      ensureSpace(doc, 20);
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#9ca3af').text('Geen velden gevonden in deze stap.', 46, doc.y + 4);
      doc.y += 18;
    } else {
      const leftX = 40;
      const questionW = 290;
      const answerW = 225;
      const headerH = 26;
      const minRowH = 24;

      ensureSpace(doc, headerH + 2);
      drawStepTableHeader(doc, leftX, questionW, answerW, headerH);
      step.fields.forEach((field, idx) => {
        const fieldName = `${product}_step${stepIndex + 1}_field${idx + 1}`;
        drawStepTableRow(doc, idx + 1, field, leftX, questionW, answerW, minRowH, fieldName);
      });
      doc.y += 6;
    }
  });

  doc.end();
  return new Promise((resolve) => {
    stream.on('finish', () => resolve({ product, outPath, steps: visibleSteps.length, fields: totalFields }));
  });
}

(async () => {
  const desktopDir = path.join(process.env.HOME || '', 'Desktop');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const products = Object.keys(extracted);

  const results = [];
  for (const product of products) {
    const info = await generatePdf(product, extracted[product], desktopDir, stamp);
    results.push(info);
  }

  console.log('PDF generation complete.');
  results.forEach((r) => {
    console.log(`${r.product}: ${r.steps} stappen, ${r.fields} velden -> ${r.outPath}`);
  });
})();
