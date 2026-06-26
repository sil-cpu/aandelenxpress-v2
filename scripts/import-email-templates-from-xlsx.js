#!/usr/bin/env node
require('dotenv').config();

const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const XLSX_PATH = process.argv[2] || findLatestTemplateXlsx();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function findLatestTemplateXlsx() {
  const downloads = path.join(process.env.HOME || '', 'Downloads');
  const files = fs.readdirSync(downloads)
    .filter((f) => /^email template-2026 AX platform( \(\d+\))?\.xlsx$/i.test(f))
    .map((name) => {
      const fullPath = path.join(downloads, name);
      const stat = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!files.length) {
    throw new Error('Geen template-xlsx gevonden in Downloads.');
  }
  return files[0].fullPath;
}

function decodeXmlText(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#39;/g, "'");
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function linkifyText(s) {
  const escaped = escapeHtml(String(s || ''));
  return escaped.replace(/(https?:\/\/[^\s<]+)/gi, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function isBulletLine(line) {
  const t = String(line || '').trim();
  return /^([•\-*]|\d+[.)])\s+/.test(t);
}

function stripBulletPrefix(line) {
  return String(line || '').trim().replace(/^([•\-*]|\d+[.)])\s+/, '').trim();
}

function textToHtmlBody(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return '';

  const lines = normalized.split('\n').map((l) => l.trimEnd());
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);

  function flushParagraph(parts, linesBuffer) {
    if (!linesBuffer.length) return;
    const paragraph = linesBuffer.map((line) => linkifyText(line.trim())).join('<br>');
    parts.push(`<p>${paragraph}</p>`);
    linesBuffer.length = 0;
  }

  function flushList(parts, bulletsBuffer) {
    if (!bulletsBuffer.length) return;
    const lis = bulletsBuffer.map((line) => `<li>${linkifyText(stripBulletPrefix(line))}</li>`).join('');
    parts.push(`<ul>${lis}</ul>`);
    bulletsBuffer.length = 0;
  }

  const htmlParts = [];
  for (const block of blocks) {
    const paraLines = [];
    const bulletLines = [];

    for (const line of block) {
      if (isBulletLine(line)) {
        flushParagraph(htmlParts, paraLines);
        bulletLines.push(line);
      } else {
        flushList(htmlParts, bulletLines);
        paraLines.push(line);
      }
    }

    flushParagraph(htmlParts, paraLines);
    flushList(htmlParts, bulletLines);
  }

  return htmlParts.join('');
}

function readTemplatesFromXlsx(filePath) {
  const zip = new AdmZip(filePath);
  const ssEntry = zip.getEntry('xl/sharedStrings.xml');
  const wsEntry = zip.getEntry('xl/worksheets/sheet1.xml');

  if (!wsEntry) {
    throw new Error('Sheet1 niet gevonden in xlsx.');
  }

  const sharedStringsXml = ssEntry ? ssEntry.getData().toString('utf8') : '';
  const sheetXml = wsEntry.getData().toString('utf8');

  const strings = [...sharedStringsXml.matchAll(/<si[\s\S]*?<\/si>/g)].map((m) => {
    const fragments = [...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXmlText(t[1]));
    return fragments.join('');
  });

  const rows = [];
  for (const row of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const nr = Number(row[1]);
    const body = row[2];
    const cells = {};

    for (const c of body.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1];
      const inner = c[2];
      const col = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      if (!col) continue;

      const type = (attrs.match(/t="(\w+)"/) || [])[1] || '';
      const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
      let value = raw;
      if (type === 's') value = strings[Number(raw)] || '';

      cells[col] = String(value || '').trim();
    }

    const statusName = (cells.A || '').trim();
    const templateText = (cells.B || '').trim();
    if (!statusName) continue;
    if (!templateText || templateText === '/') continue;

    rows.push({
      row: nr,
      name: statusName,
      subject: `${statusName} - AandelenXpress`,
      body: textToHtmlBody(templateText),
      bodyText: templateText,
    });
  }

  const aliasMap = {
    'Wwft-controle': ['WWFT-controle'],
    'Concept naar cliënt': ['Concept naar client'],
    'Ondertekend door cliënt': ['Ondertekend door client'],
    'Closing binder geüpload': ['Closing binder geupload']
  };

  const withAliases = [];
  for (const row of rows) {
    withAliases.push(row);
    const aliases = aliasMap[row.name] || [];
    for (const alias of aliases) {
      withAliases.push({
        ...row,
        name: alias,
        subject: `${alias} - AandelenXpress`
      });
    }
  }

  return withAliases;
}

async function importTemplates(templates) {
  const names = templates.map((t) => t.name);
  const { data: existingRows, error: selErr } = await supabase
    .from('email_templates')
    .select('id,name')
    .in('name', names);

  if (selErr) throw new Error(`Select bestaande templates mislukt: ${selErr.message}`);

  const existingByName = new Map((existingRows || []).map((r) => [r.name, r]));
  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    const existing = existingByName.get(tpl.name);

    if (existing) {
      const { error: updErr } = await supabase
        .from('email_templates')
        .update({ subject: tpl.subject, body: tpl.body })
        .eq('id', existing.id);

      if (updErr) {
        console.error(`Update mislukt voor "${tpl.name}": ${updErr.message}`);
        continue;
      }
      updated += 1;
      continue;
    }

    const { data: nextId, error: idErr } = await supabase.rpc('next_template_id');
    if (idErr) {
      console.error(`ID generatie mislukt voor "${tpl.name}": ${idErr.message}`);
      continue;
    }

    const { error: insErr } = await supabase.from('email_templates').insert({
      id: nextId,
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      created_at: new Date().toISOString(),
    });

    if (insErr) {
      console.error(`Insert mislukt voor "${tpl.name}": ${insErr.message}`);
      continue;
    }

    created += 1;
  }

  return { created, updated };
}

async function main() {
  try {
    console.log(`Bronbestand: ${XLSX_PATH}`);
    const templates = readTemplatesFromXlsx(XLSX_PATH);
    if (!templates.length) {
      console.log('Geen importeerbare templates gevonden (kolom A/B, body != "/").');
      return;
    }

    console.log(`Templates uit sheet: ${templates.length}`);
    const result = await importTemplates(templates);
    console.log(`Import gereed. Nieuw: ${result.created}, Geupdate: ${result.updated}`);

    const preview = templates.slice(0, 5).map((t) => `- ${t.name}`).join('\n');
    console.log('Voorbeeld geimporteerde namen:\n' + preview);
  } catch (err) {
    console.error('Import mislukt:', err.message);
    process.exit(1);
  }
}

main();
