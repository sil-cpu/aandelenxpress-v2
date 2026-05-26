# Formulier workflow spec (3 formulieren, 1 kernlogica)

## Doel
Deze spec legt vast hoe we 3 aparte formulieren houden, terwijl de onderliggende beslislogica uit 1 master-workflow komt.

- Formulier A: `vragenlijst.html` (Werkmaatschappij / standaard BV)
- Formulier B: `vragenlijst-bv-holding.html` (Holding + Werkmaatschappij)
- Formulier C: `vragenlijst-geruisloos.html` (Geruisloze inbreng)

## Kernprincipe
Alle formulieren gebruiken dezelfde bouwblokken (modules). Het verschil zit in:

1. instappunt
2. welke modules actief zijn
3. hoeveel keer modules herhalen
4. welke velden verplicht zijn per route

---

## 1. Master workflow (kanonieke flow)

### 1.1 Start
1. `spoed` keuze
2. `contactEmail`
3. route-keuze:
- `holding_only`
- `holding_plus_working`
- `working_only`

### 1.2 Entiteit loops
- `holdingCount` bepaalt aantal herhalingen van Holding modules
- `workingCount` bepaalt aantal herhalingen van Working BV modules

### 1.3 Modulevolgorde per entiteit
Per Holding of Working BV:

1. Basis entiteit
- naam
- telefoon
- email
- doel (voor working)
- aantal aandeelhouders
- aandelenverdeling

2. Aandeelhouder module (per aandeelhouder)
- keuze: natuurlijke persoon of rechtspersoon
- natuurlijke persoon -> NP module
- rechtspersoon -> RP module

3. Taal module (gekoppeld aan natuurlijke persoon)

4. Eenmanszaak/VOF module (gekoppeld aan natuurlijke persoon)

5. Adres module
- zelfde als aandeelhouder of ander adres
- bij "zelfde" en 1 aandeelhouder: vraag "welke aandeelhouder" verbergen

6. Bestuurder module
- aandeelhouders zijn bestuurders?
- zo nee: bestuurders loop met NP/RP keuze

7. Accountant module

8. KVK module 1

9. KVK module 2

10. Eindpagina
- opmerkingen
- akkoord verklaringen
- vereiste uploads

---

## 2. Reusable modules

### 2.1 NP (Natuurlijke Persoon) module
Verplicht:
- naam
- geboortedatum
- email
- telefoon
- iban

Beslisregels:
- heeft BSN?
- indien nee: buitenlandse adreslogica
- indien ja: BSN verplicht
- woonadres NL?
- indien nee: buitenlandse adreslogica

Uploads:
- PEP
- PDC/datacard

### 2.2 RP (Rechtspersoon) module
Tak 1: Nederlandse BV
- naam
- kvk nummer
- kvk uittreksel upload
- ubo uittreksel upload
- aandeelhoudersregister upload

Tak 2: Buitenlandse rechtspersoon
- land
- registratieland
- adres
- bewijs registratie upload
- aandeelhoudersregister upload
- ubo verklaring upload
- statuten upload

Vervolg:
- aantal directeuren (1..4)
- per directeur: natuurlijke persoon? ja -> NP, nee -> RP branch
- aantal UBO's (1..4) met NP-loop

### 2.3 Taal module
- NL niveau C1+?
- ENG niveau C1+?
- als beide nee: moedertaal + C2 talen verplicht

### 2.4 Eenmanszaak/VOF module
- heeft eenmanszaak of vof?
- heeft dezelfde naam als BV?
- wat gebeurt er met de eenmanszaak/vof?

### 2.5 Adres modules
- Foreign address logic
- Company address logic

### 2.6 Bestuurder module
- aandeelhouders zijn bestuurders?
- zo nee: aantal bestuurders loop
- per bestuurder: is dit een aandeelhouder?
- als ja en meer dan 1 aandeelhouder: selectie "welke aandeelhouder"
- als nee: NP + Taal

### 2.7 Accountant module
- werkt met fiscalist/accountant/admin?
- zo ja: kantoor + contact + email + telefoon

### 2.8 KVK modules
KVK 1:
- fulltime aantal
- parttime aantal
- bedrijfsplan upload

KVK 2:
- import (ja/nee)
- export (ja/nee)
- verkoopkanalen
- als kanaal anders gekozen: toelichting verplicht
- groothandel (ja/nee)

---

## 3. Formulier A: Werkmaatschappij / standaard BV
Bestand: `public/vragenlijst.html`

Instappunt:
- route is impliciet `working_only`

Actieve modules:
1. Start
2. Working BV modules (1 keer)
3. Eindpagina

Regels:
- `holding` modules niet tonen
- aandeelhouder loop minimaal 1, maximaal 4
- bij 1 aandeelhouder: vraag "welke aandeelhouder" verbergen

---

## 4. Formulier B: Holding + Werkmaatschappij
Bestand: `public/vragenlijst-bv-holding.html`

Instappunt:
- route is `holding_plus_working`

Actieve modules:
1. Start
2. Holding loop (1..4)
3. Working loop (1..4)
4. Eindpagina

Regels:
- vraag om `holdingCount`
- vraag om `workingCount` pas na laatste holding
- alleen laatste round eindigt op END PAGE

---

## 5. Formulier C: Geruisloze inbreng
Bestand: `public/vragenlijst-geruisloos.html`

Instappunt:
- route is `geruisloze_inbreng`

Actieve modules:
1. Start
2. Basis BV/holding context
3. NP/RP modules
4. Adres/Bestuurder/Accountant
5. KVK 1 + KVK 2
6. Extra uploads geruisloos
7. Eindpagina

Regels:
- extra validaties op inbreng-documentatie
- behoud van dezelfde NP/RP/taal regels als andere formulieren

---

## 6. Uniforme validatieregels

1. Lege verplichte vraag stopt progressie
2. Verborgen velden mogen geen fout geven
3. Voorwaardelijke verplichtingen:
- `kanaalAndersOmschrijving` alleen verplicht als `kanaalAnders=true`
- `welkeAandeelhouder` alleen verplicht als optie zichtbaar is
4. Uploads per tak verplicht volgens module
5. Loops valideren per item (geen globale skip)

---

## 7. State model (advies)

Gebruik 1 gedeelde state-structuur in alle formulieren:

- `routeType`
- `spoed`
- `contact`
- `entities.holdings[]`
- `entities.workings[]`
- `shareholders[]`
- `directors[]`
- `uploads{}`
- `kvk{}`
- `finalDeclaration{}`

Voordelen:
- 1 manier van opslaan
- 1 manier van renderen
- eenvoudiger PDF/document output

---

## 8. Implementatievolgorde

1. Shared workflow config in code gebruiken
2. Module visibility rules centreren
3. Loop-rendering centreren (holding/working/shareholder/director)
4. Uniforme validator toepassen
5. Mapping naar bestaand submit payload

---

## 9. Wat nu al waar is in de huidige app

- Er zijn 3 aparte formulieren
- Grote delen van de modules bestaan al
- Conditionele delen voor taal/import/export/accountant bestaan deels al

## 10. Wat nog nodig is voor volledige 1-op-1 workflow

- Volledige loop-engine voor holdings/workings/directors/ubo
- Striktere module-level visibility rules
- Volledige mapping van alle uploads per tak
- Uniforme server-side validatie op dezelfde regels
