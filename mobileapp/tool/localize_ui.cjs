// Lists mobile UI strings to help maintain the Amharic dictionary.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.dart') && !file.endsWith('translations_am.dart')) files.push(file);
  }
}
walk(path.join(root, 'lib'));
function stringAt(text, start) {
  const quote = text[start];
  const triple = text.slice(start, start + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  const raw = text[start - 1] === 'r' && !/[A-Za-z0-9_]/.test(text[start - 2] || '');
  let pos = start + delimiter.length, value = '', parameter = 0;
  while (pos < text.length) {
    if (text.slice(pos, pos + delimiter.length) === delimiter) return {end: pos + delimiter.length, value, raw};
    if (!raw && text[pos] === '\\') {
      const next = text[pos + 1];
      value += ({n: '\n', r: '\r', t: '\t'})[next] ?? next;
      pos += 2;
    } else if (!raw && text[pos] === '$' && text[pos + 1] === '{') {
      let depth = 1;
      pos += 2;
      while (pos < text.length && depth) {
        if (text[pos] === "'" || text[pos] === '"') pos = stringAt(text, pos).end;
        else { if (text[pos] === '{') depth++; if (text[pos] === '}') depth--; pos++; }
      }
      value += '{p' + (++parameter) + '}';
    } else if (!raw && text[pos] === '$' && /[A-Za-z_]/.test(text[pos + 1] || '')) {
      pos++;
      while (/[A-Za-z0-9_]/.test(text[pos] || '')) pos++;
      value += '{p' + (++parameter) + '}';
    } else value += text[pos++];
  }
  throw new Error('Unclosed Dart string');
}
const web = fs.readFileSync(path.resolve(root, '../Client/src/app/core/i18n.ts'), 'utf8');
const translations = new Map();
for (const match of web.matchAll(/^\s*'((?:\\.|[^'])*)':\s*'((?:\\.|[^'])*)',?\s*$/gm)) {
  const decode = value => value.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
  let key = decode(match[1]), value = decode(match[2]), serial = 0;
  key = key.replace(/\{([^}]+)\}/g, (_, name) => {
    const placeholder = 'p' + (++serial);
    value = value.replaceAll('{' + name + '}', '{' + placeholder + '}');
    return '{' + placeholder + '}';
  });
  translations.set(key, value);
}
const inventory = new Map();
// Mobile copy takes precedence over reused web translations.
function readPairs(file) {
  const text = fs.readFileSync(file, 'utf8'), pairs = [];
  for (let pos = 0; pos < text.length;) {
    if (text[pos] !== "'" && text[pos] !== '"') { pos++; continue; }
    const key = stringAt(text, pos); pos = key.end;
    let next = pos;
    while (/\s/.test(text[next] || '') && next < text.length) next++;
    if (text[next] !== ':') continue;
    next++;
    while (/\s/.test(text[next] || '') && next < text.length) next++;
    if (text[next] !== "'" && text[next] !== '"') continue;
    const value = stringAt(text, next); pos = value.end;
    pairs.push([key.value, value.value]);
  }
  return pairs;
}
for (const [key, value] of readPairs(path.join(root, 'lib/core/translations_am.dart'))) translations.set(key, value);
for (const [key, clear] of readPairs(path.join(root, 'lib/core/localization.dart'))) {
  if (translations.has(clear)) translations.set(key, translations.get(clear));
}
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (let pos = 0; pos < text.length;) {
    if (text.slice(pos, pos + 2) === '//') { const end = text.indexOf('\n', pos); pos = end < 0 ? text.length : end; continue; }
    if (text.slice(pos, pos + 2) === '/*') { const end = text.indexOf('*/', pos + 2); pos = end < 0 ? text.length : end + 2; continue; }
    if (text[pos] !== "'" && text[pos] !== '"') { pos++; continue; }
    const token = stringAt(text, pos); pos = token.end;
    const value = token.value;
    const fixed = value.replace(/\{[^}]+\}/g, '');
    if (token.raw || /^https?:/.test(value) || /^(?:package:|dart:)/.test(value) || !/[A-Za-z]/.test(fixed)) continue;
    if (!/\s/.test(value) && !/^[A-Z][a-z]+$/.test(value) && !['PIN', 'QR', 'Language'].includes(value)) continue;
    if (!inventory.has(value)) inventory.set(value, {key: value, am: translations.get(value) || '', files: []});
    inventory.get(value).files.push(path.relative(root, file).replaceAll('\\', '/'));
  }
}
const result = [...inventory.values()].sort((a, b) => a.key.localeCompare(b.key));
fs.writeFileSync(path.join(__dirname, 'ui_strings.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({strings: result.length, reused: result.filter(item => item.am).length,
  missing: result.filter(item => !item.am).map(item => item.key)}));
