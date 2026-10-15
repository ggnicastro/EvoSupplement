/* EvoSupplement Project Style Manager — local, transactional Builder-state editing. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EvoStyleCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';
  const VERSION = '1.2.0';
  const LAYERS = ['taxonomy', 'neighborhood', 'architecture', 'network'];
  const SHAPES = ['rounded', 'rectangle', 'capsule', 'ellipse', 'hexagon', 'chevron', 'arrow', 'diamond'];
  const MANIFEST = 'evosupplement-builder-state.json';
  const COLOR_ROLES = { neighborhood: 'colors', architecture: 'architectureColors', taxonomy: 'taxonomyColors', network: 'colors' };
  const PALETTE = ['#4f8fd9', '#e09245', '#67a96b', '#b56ac4', '#d55d68', '#5aa7a7', '#c69c3c', '#7c83d4', '#b0724a', '#4d9f79', '#d177a8', '#71859a', '#8a70b8', '#5f9cc9', '#9e8f3f', '#c7634f', '#6f9d52', '#9a6d91'];
  const NETWORK_PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ab', '#6f93c3', '#d98c55', '#8f63a8', '#65a9a2', '#8fbb62', '#c5a13b', '#d16d75', '#8097ad'];
  const NETWORK_HINTS = { Arc2_FHA: '#86b7e8', Arc2_classical: '#ef8e91', Arc2_core: '#cf87c7', Transcription: '#82c995', Envelope: '#f2b46f', Lipid_traff_T3: '#d7b57e', Conflict: '#b99bd3', Clp: '#e6bd43', pep_tm: '#b9cb7e', Pex: '#77cbc5', Center: '#9ca3af', Unassigned: '#b8c0cc' };
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clean = value => String(value ?? '').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const map = () => Object.create(null);
  const keyOf = (id, role) => `${id}::${role}`;
  const sameBytes = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => value === b[index]);
  function fail(message) { throw new Error(message); }
  function checkObject(value, context) { if (!object(value)) fail(`${context} must be a mapping.`); return value; }
  function special(name) { return ['SIG', 'TM', 'LIPO'].includes(clean(name).toUpperCase()); }
  function automaticColor(name) { let h = 2166136261; for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); } return PALETTE[(h >>> 0) % PALETTE.length]; }
  function color(value, context) {
    const text = clean(value).toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(text)) return '#' + text.slice(1).split('').map(c => c + c).join('');
    if (/^#[0-9a-f]{6}$/.test(text)) return text;
    // Existing network dictionaries also support CSS functional/alpha colors.
    if (/^#[0-9a-f]{4}$|^#[0-9a-f]{8}$/.test(text) || /^(?:rgb|hsl)a?\([\d\s.,%+\-/]+\)$/.test(text)) return text;
    fail(`${context}: “${String(value)}” is not a supported color. Use a quoted hexadecimal color such as "#4f8fd9".`);
  }

  // The project modules use simple YAML. Reject unsupported syntax explicitly
  // instead of silently dropping settings while rewriting embedded styles.
  function stripComment(text) {
    let quote = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (quote === "'" && ch === "'" && text[i + 1] === "'") { i++; continue; }
      if (quote && ch === quote) quote = '';
      else if (!quote && (ch === '"' || ch === "'")) quote = ch;
      else if (!quote && ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
    }
    if (quote) fail('Unterminated quoted YAML value.');
    return text.trimEnd();
  }
  function splitPair(text) {
    let quote = '', depth = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote === '"' && c === '\\') { i++; continue; }
      if (quote === "'" && c === "'" && text[i + 1] === "'") { i++; continue; }
      if (quote && c === quote) quote = '';
      else if (!quote && (c === '"' || c === "'")) quote = c;
      else if (!quote) { if (c === '[' || c === '{') depth++; if (c === ']' || c === '}') depth--; if (c === ':' && depth === 0) return [text.slice(0, i).trim(), text.slice(i + 1).trim()]; }
    }
    return null;
  }
  function scalar(text) {
    if (!text) return '';
    if (text[0] === '"') { try { return JSON.parse(text); } catch (_) { fail('Invalid double-quoted YAML value.'); } }
    if (text[0] === "'") { if (!/^'(?:[^']|'')*'$/.test(text)) fail('Invalid single-quoted YAML value.'); return text.slice(1, -1).replace(/''/g, "'"); }
    if (/^[\[\{]/.test(text)) { try { return JSON.parse(text); } catch (_) { fail('Inline YAML collections must use JSON syntax (quoted strings).'); } }
    if (/^[&*!|>]|^<<\s*:/.test(text)) fail('YAML anchors, aliases, tags and multiline scalars are not supported by these viewer formats.');
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (/^(null|~)$/i.test(text)) return null;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return Number(text);
    return text;
  }
  function parseYaml(text, context = 'YAML') {
    try {
      const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).map((line, index) => {
        if (/^\s*\t/.test(line)) fail(`Tabs in indentation at line ${index + 1}.`);
        const value = stripComment(line);
        return { value: value.trim(), indent: value.length - value.trimStart().length, line: index + 1 };
      }).filter(line => line.value && line.value !== '---' && line.value !== '...');
      if (!lines.length) return map();
      if (lines.length === 1 && lines[0].value === '{}') return map();
      if (lines[0].indent !== 0) fail('Top-level YAML keys must not be indented.');
      let cursor = 0;
      function block(indent) {
        const isArray = /^-\s/.test(lines[cursor]?.value || '');
        const result = isArray ? [] : map();
        while (cursor < lines.length && lines[cursor].indent >= indent) {
          const row = lines[cursor];
          if (row.indent !== indent) fail(`Unexpected indentation at line ${row.line}.`);
          if (isArray) {
            if (!/^-\s/.test(row.value)) fail(`Mixed sequence and mapping at line ${row.line}.`);
            result.push(scalar(row.value.slice(2).trim())); cursor++;
            if (cursor < lines.length && lines[cursor].indent > indent) fail('Nested sequence entries are not supported.');
          } else {
            const pair = splitPair(row.value);
            if (!pair || !pair[0]) fail(`Expected key: value at line ${row.line}.`);
            const key = String(scalar(pair[0]));
            if (key === '<<') fail('YAML merge keys are not supported.');
            if (own(result, key)) fail(`Duplicate YAML key “${key}” at line ${row.line}.`);
            cursor++;
            if (pair[1]) { result[key] = scalar(pair[1]); if (cursor < lines.length && lines[cursor].indent > indent) fail(`Unexpected nested value after “${key}”.`); }
            else result[key] = cursor < lines.length && lines[cursor].indent > indent ? block(lines[cursor].indent) : map();
          }
        }
        return result;
      }
      return checkObject(block(0), context);
    } catch (error) { fail(`${context}: ${error.message}`); }
  }
  function dumpYaml(value) {
    const lines = [];
    function write(obj, indent) {
      for (const [key, child] of Object.entries(obj)) {
        const prefix = ' '.repeat(indent) + (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key)) + ':';
        if (object(child) && Object.keys(child).length) { lines.push(prefix); write(child, indent + 2); }
        else lines.push(prefix + ' ' + JSON.stringify(child));
      }
    }
    write(value, 0);
    return lines.length ? lines.join('\n') + '\n' : '{}\n';
  }
  function flatYaml(value) { return Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => `${JSON.stringify(key)}: ${JSON.stringify(value[key])}`).join('\n') + '\n'; }
  function parseFlat(text, context, type = 'color') {
    let parsed = parseYaml(text, context);
    if (type === 'color' && object(parsed.colors)) parsed = parsed.colors;
    if (type === 'shape' && object(parsed.shapes)) parsed = parsed.shapes;
    const out = map();
    for (const [key, raw] of Object.entries(parsed)) {
      let value = raw;
      if (object(raw)) value = type === 'color' ? (raw.color ?? raw.Color ?? raw.hex ?? raw.fill) : raw.shape;
      if (type === 'color') out[key] = color(value, `${context}, ${key}`);
      else if (type === 'shape') { if (!SHAPES.includes(value)) fail(`${context}, ${key}: unsupported shape “${value}”.`); out[key] = value; }
      else { if (typeof value !== 'string' && typeof value !== 'number') fail(`${context}, ${key}: renames must be text.`); out[key] = clean(value); }
    }
    return out;
  }
  function renamePlan(input = {}) {
    checkObject(input, 'Rename plan');
    const out = map();
    for (const [name, raw] of Object.entries(input)) {
      if (typeof raw !== 'string' && typeof raw !== 'number') fail(`Rename “${name}”: the new name must be text.`);
      const target = clean(raw);
      if (!name || name !== clean(name) || /[\x00-\x1f\x7f]/.test(name)) fail('Rename source names must be nonempty current labels without surrounding whitespace or control characters.');
      if (!target || /[\x00-\x1f\x7f]/.test(String(raw))) fail(`Rename “${name}”: the new name must be nonempty text without control characters.`);
      if (target !== name) out[name] = target;
    }
    return out;
  }
  function parseRenameYaml(text) {
    const parsed = parseYaml(text, 'Rename plan YAML');
    return renamePlan(object(parsed.renames) ? parsed.renames : parsed);
  }
  function lookup(mapping, name, insensitive = false) { if (own(mapping, name)) return mapping[name]; if (insensitive) { const key = Object.keys(mapping).reverse().find(k => k.toLocaleLowerCase() === name.toLocaleLowerCase()); if (key !== undefined) return mapping[key]; } return undefined; }
  function safePath(path) { return typeof path === 'string' && !!path && !/[\\\x00-\x1f]/.test(path) && !path.startsWith('/') && !/^[a-z]:/i.test(path) && !path.split('/').some(part => !part || part === '.' || part === '..'); }
  function zipLibrary() { const lib = root.JSZip || root.window?.JSZip; if (!lib) fail('The local ZIP library did not load. Reload the page.'); return lib; }
  async function loadArchive(input, options = {}) {
    const JSZip = zipLibrary();
    const data = input && typeof input.arrayBuffer === 'function' ? await input.arrayBuffer() : input;
    const zip = await JSZip.loadAsync(data, { checkCRC32: true });
    for (const entry of Object.values(zip.files)) if (!entry.dir && (!safePath(entry.name) || entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) fail('The ZIP contains an unsafe file path.');
    const manifests = Object.values(zip.files).filter(e => !e.dir && (e.name === MANIFEST || e.name.endsWith('/' + MANIFEST)));
    if (manifests.length !== 1) fail('Choose one ZIP created with Builder “Save state”. Publication ZIPs are not supported here.');
    const path = manifests[0].name, prefix = path.slice(0, -MANIFEST.length);
    let recipe; try { recipe = JSON.parse(await manifests[0].async('string')); } catch (_) { fail('The Builder-state manifest is not valid JSON.'); }
    checkObject(recipe, 'State manifest');
    if (recipe.format !== 'evosupplement-builder-state' || Number(recipe.schemaVersion) !== 1) fail('Unsupported Builder state format or schema version.');
    checkObject(recipe.project, 'Builder project');
    if (Number(recipe.project.schemaVersion) !== 1) fail('Unsupported Builder project schema version.');
    if (!Array.isArray(recipe.project.sections) || !Array.isArray(recipe.assets)) fail('The state lacks a section or attached-file inventory.');
    const instances = [], items = new Map(), sectionIds = new Set();
    for (const section of recipe.project.sections) {
      checkObject(section, 'Section');
      if (typeof section.id !== 'string' || sectionIds.has(section.id) || !Array.isArray(section.items)) fail('Invalid or duplicate section in state.');
      sectionIds.add(section.id);
      for (const item of section.items) {
        checkObject(item, 'Item');
        if (typeof item.id !== 'string' || !item.id || items.has(item.id)) fail('Invalid or duplicate item ID in state.');
        items.set(item.id, item);
        if (LAYERS.includes(item.kind)) instances.push({ itemId: item.id, title: item.title || item.id, sectionTitle: section.title || section.id, layer: item.kind });
      }
    }
    const assets = new Map(), files = new Map(), usedPaths = new Set();
    for (const asset of recipe.assets) {
      checkObject(asset, 'Attached file');
      const cover = asset.scope === 'project';
      if (cover ? (asset.role !== 'cover' || asset.itemId !== undefined) : (asset.scope !== undefined || !items.has(asset.itemId))) fail('An attachment refers to an invalid project item.');
      if (typeof asset.role !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(asset.role)) fail('Invalid attachment role.');
      if (asset.kind !== 'file' || !safePath(asset.path) || !asset.path.startsWith('uploads/')) fail('Invalid original-file path in state.');
      if (typeof asset.originalName !== 'string' || !Number.isSafeInteger(asset.size) || asset.size < 0) fail('Invalid original-file metadata in state.');
      if (asset.mime !== undefined && typeof asset.mime !== 'string') fail('Invalid attachment MIME type.');
      if (asset.lastModified !== undefined && (!Number.isSafeInteger(asset.lastModified) || asset.lastModified < 0)) fail('Invalid attachment modification date.');
      const key = keyOf(cover ? '__project__' : asset.itemId, asset.role);
      if (assets.has(key) || usedPaths.has(asset.path)) fail('The state contains duplicate attachments.');
      const entry = zip.file(prefix + asset.path); if (!entry) fail(`Missing attachment: ${asset.originalName}.`);
      const bytes = await entry.async('uint8array'); if (bytes.length !== asset.size) fail(`Attachment size mismatch: ${asset.originalName}.`);
      assets.set(key, asset); files.set(key, bytes); usedPaths.add(asset.path);
    }
    const extension = recipe.project.styleManager;
    if (extension !== undefined && (!object(extension) || extension.schemaVersion !== 1 || !Array.isArray(extension.groups))) fail('Unsupported saved Style Manager settings.');
    const groups = extension ? clone(extension.groups) : [];
    const assigned = new Set();
    for (const group of groups) {
      if (!object(group) || typeof group.id !== 'string' || !Array.isArray(group.layers)) fail('Invalid saved palette group.');
      for (const layer of group.layers) { if (!LAYERS.includes(layer) || assigned.has(layer)) fail('Saved palette groups overlap or contain an unknown layer.'); assigned.add(layer); }
    }
    return { name: options.name || input?.name || 'builder-state.zip', title: recipe.project.project?.title || recipe.project.project?.repositoryName || 'Builder project', instances, groups, recipe, zip, prefix, manifestPath: path, assets, files, items, updates: new Map() };
  }
  function attachment(session, id, role) { const key = keyOf(id, role); return session.updates.get(key)?.bytes || session.files.get(key); }
  function textOf(session, id, role) { const bytes = attachment(session, id, role); return bytes ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : ''; }
  function table(text, context) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const split = line => { const out = []; let value = '', quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (quoted && line[i + 1] === '"') { value += c; i++; } else quoted = !quoted; } else if (c === '\t' && !quoted) { out.push(value.trim()); value = ''; } else value += c; } if (quoted) fail(`${context}: unclosed TSV quote.`); out.push(value.trim()); return out; };
    const headers = split(lines[0]); if (new Set(headers).size !== headers.length) fail(`${context}: duplicate TSV column.`);
    return lines.slice(1).map(line => { const cells = split(line), out = map(); headers.forEach((h, i) => { out[h] = cells[i] || ''; }); return out; });
  }
  function selectedLayers(layers) { if (!Array.isArray(layers) || !layers.length || layers.some(layer => !LAYERS.includes(layer))) fail('Select at least one supported module layer.'); return [...new Set(layers)].sort((a, b) => LAYERS.indexOf(a) - LAYERS.indexOf(b)); }
  function readPalette(session, instance, role, type = 'color') { const text = textOf(session, instance.itemId, role); return text.trim() ? parseFlat(text, `${instance.title} / ${role}`, type) : map(); }
  function source(instance, originalId, name, value, shape, kind) { return { ...instance, originalId, name, color: value || '', shape: shape || '', kind }; }
  function observe(frequencies, id, entity, occurrence = entity) {
    let record = frequencies.get(id);
    if (!record) { record = { entities: new Set(), occurrences: new Set() }; frequencies.set(id, record); }
    record.entities.add(entity); record.occurrences.add(occurrence);
  }
  function geneIdentity(entry, gene, index) {
    const assembly = gene.assembly || entry.assembly || '';
    if (entry.coordinateSource !== 'synthetic' && entry.nucleotide) return JSON.stringify(['locus', assembly, entry.nucleotide, gene.start, gene.end, gene.strand]);
    // Compact coordinates are synthetic and shift between overlapping blocks.
    // A supplied PID is stable; generated unknown IDs are local to one block.
    if (gene.pid && !gene.pid.startsWith('unknown_')) return JSON.stringify(entry.coordinateSource === 'synthetic' ? ['pid', assembly, gene.pid] : ['pid', assembly, gene.pid, gene.start, gene.end, gene.strand]);
    return JSON.stringify(['block', entry.id, index]);
  }

  function neighborhood(session, instance, warnings) {
    const renames = readPalette(session, instance, 'rename', 'rename'), colors = readPalette(session, instance, 'colors');
    const foldedRenames = new Map(Object.entries(renames).map(([key, value]) => [key.toLocaleLowerCase(), value]));
    const foldedColors = new Map(Object.entries(colors).map(([key, value]) => [key.toLocaleLowerCase(), value]));
    const renameFor = id => own(renames, id) ? renames[id] : foldedRenames.get(id.toLocaleLowerCase());
    const colorFor = id => own(colors, id) ? colors[id] : foldedColors.get(id.toLocaleLowerCase());
    const ids = new Set(Object.keys(renames)), frequencies = new Map();
    const markerIds = new Set();
    const marker = name => ['TM', 'SIG', 'SIF'].includes(clean(name).toUpperCase());
    const text = textOf(session, instance.itemId, 'neighborhoods');
    if (text.trim()) {
      const viewer = root.NeighborhoodViewer || root.window?.NeighborhoodViewer;
      if (!viewer?.parseInput) fail('The local Neighborhood parser did not load. Reload the page.');
      const item = session.items.get(instance.itemId);
      const parsed = viewer.parseInput(text, { renames, colors, config: { inputFormat: item.config?.inputFormat || 'auto', markerDomains: { TM: { width: 4, color: '#f4cf3a', position: 'ordered' }, SIG: { width: 5, color: '#d62828', position: 'start' }, SIF: { width: 5, color: '#d62828', position: 'start' } } } });
      for (const entry of parsed.entries || []) for (const [geneIndex, gene] of (entry.genes || []).entries()) {
        const entity = geneIdentity(entry, gene, geneIndex);
        for (const [domainIndex, domain] of (gene.domains || []).entries()) if (domain.rawName && domain.rawName !== '?') {
          ids.add(domain.rawName); if (domain.marker) markerIds.add(domain.rawName);
          const position = Number.isFinite(domain.proteinStart) && Number.isFinite(domain.proteinEnd) ? [domain.proteinStart, domain.proteinEnd] : [Number.isFinite(domain.order) ? domain.order : domainIndex];
          observe(frequencies, domain.rawName, entity, JSON.stringify([entity, domain.rawName, ...position]));
        }
      }
    } else warnings.push(`${instance.title}: no neighborhood table attached; inventory uses YAML entries only.`);
    const resolve = id => clean(renameFor(id)) || id;
    const finalNames = new Set([...ids].map(resolve));
    const foldedNames = new Map(); for (const name of finalNames) if (!foldedNames.has(name.toLocaleLowerCase())) foldedNames.set(name.toLocaleLowerCase(), name);
    const resolvePaletteKey = key => finalNames.has(key) ? key : foldedNames.get(key.toLocaleLowerCase()) || resolve(key);
    const records = [...ids].filter(id => !markerIds.has(id) && !marker(id) && !marker(resolve(id))).map(id => { const name = resolve(id); return source(instance, id, name, colorFor(name) || colorFor(id) || '#d7dce2', '', 'domain'); });
    for (const [key, value] of Object.entries(colors)) if (!markerIds.has(key) && !marker(key) && !marker(resolvePaletteKey(key))) records.push(source(instance, key, resolvePaletteKey(key), value, '', 'color dictionary'));
    warnings.push(`${instance.title}: TM, SIG and SIF retain the Neighborhood viewer’s fixed marker colors.`);
    return { instance, records, renames, ids, resolve, markerIds, marker, frequencies };
  }
  function architecture(session, instance, warnings) {
    const text = textOf(session, instance.itemId, 'architectureYaml');
    const curation = text.trim() ? parseYaml(text, `${instance.title} / architecture YAML`) : map();
    const styles = curation.styles === undefined ? map() : checkObject(curation.styles, 'Architecture styles');
    const colors = readPalette(session, instance, 'architectureColors'), shapes = readPalette(session, instance, 'architectureShapes', 'shape');
    const ids = new Set(Object.keys(styles)), frequencies = new Map();
    const data = textOf(session, instance.itemId, 'architectureData');
    for (const [index, row] of table(data, instance.title).entries()) {
      if (row.domain) ids.add(row.domain);
      const start = Number(row.start), end = Number(row.end), plen = Number(row.plen);
      // Match the viewer's skipped-row rules; malformed annotations must not
      // inflate a frequency even when their style remains in the inventory.
      if (row.pid && row.domain && [start, end, plen].every(Number.isFinite) && start >= 1 && end >= start && plen >= 1 && end <= plen) observe(frequencies, row.domain, row.pid, String(index));
    }
    if (!data.trim()) warnings.push(`${instance.title}: no architecture table attached; inventory uses YAML entries only.`);
    const resolve = id => clean(styles[id]?.display_name ?? styles[id]?.label ?? id) || id;
    const finalNames = new Set([...ids].map(resolve));
    const resolvePaletteKey = id => finalNames.has(id) ? id : resolve(id);
    const records = [];
    for (const id of ids) {
      if (special(id)) continue;
      const style = styles[id] === undefined ? map() : checkObject(styles[id], `${instance.title} style ${id}`);
      const name = resolve(id);
      const value = lookup(colors, name) || (!finalNames.has(id) ? lookup(colors, id) : undefined) || (style.color ? color(style.color, `${instance.title}, ${id}`) : '#cbd5e1');
      const shape = lookup(shapes, name) || (!finalNames.has(id) ? lookup(shapes, id) : undefined) || style.shape || 'rounded';
      if (!SHAPES.includes(shape)) fail(`${instance.title}, ${id}: unsupported shape “${shape}”.`);
      records.push(source(instance, id, name, value, shape, 'domain'));
    }
    for (const [id, value] of Object.entries(colors)) if (!special(id)) records.push(source(instance, id, resolvePaletteKey(id), value, '', 'color dictionary'));
    for (const [id, shape] of Object.entries(shapes)) if (!special(id)) records.push(source(instance, id, resolvePaletteKey(id), '', shape, 'shape dictionary'));
    warnings.push(`${instance.title}: SIG, TM and LIPO retain the Architecture viewer’s fixed colors and symbols.`);
    return { instance, records, curation, styles, ids, resolve, colors, shapes, frequencies };
  }
  function taxonomy(session, instance, warnings) {
    const text = textOf(session, instance.itemId, 'taxonomyYaml');
    const curation = text.trim() ? parseYaml(text, `${instance.title} / taxonomy YAML`) : map();
    const overrides = curation.overrides === undefined ? map() : checkObject(curation.overrides, 'Taxonomy overrides');
    const colors = readPalette(session, instance, 'taxonomyColors');
    const catalog = new Map(), frequencies = new Map(), rows = table(textOf(session, instance.itemId, 'taxonomyResolved'), instance.title);
    for (const [rowIndex, row] of rows.entries()) {
      const ids = (row.lineage_taxids || '').split('|').map(clean), names = (row.lineage_names || '').split('|').map(clean), ranks = (row.lineage_ranks || '').split('|').map(clean);
      const rowTaxa = new Set();
      ids.forEach((id, index) => { if (id) { catalog.set(id, { id, name: names[index] || id, rank: ranks[index] === 'superkingdom' ? 'domain' : ranks[index] }); rowTaxa.add(id); } });
      for (const key of Object.keys(row)) if (key.endsWith('_taxid') && row[key] && row[key.replace(/_taxid$/, '_name')]) { const id = row[key]; if (!catalog.has(id)) catalog.set(id, { id, name: row[key.replace(/_taxid$/, '_name')], rank: key.slice(0, -6) }); rowTaxa.add(id); }
      // Records, rather than unique protein IDs, match the Sankey input unit.
      // A lineage/standard-rank duplicate counts once; ancestor-child labels
      // merged later also count the associated record only once.
      for (const id of rowTaxa) observe(frequencies, id, String(rowIndex), JSON.stringify([rowIndex, id]));
    }
    for (const [id, raw] of Object.entries(overrides)) { const override = checkObject(raw, `${instance.title} override ${id}`); if (!catalog.has(id)) catalog.set(id, { id, name: override.source_name || id, rank: override.display_rank || override.source_rank || '' }); }
    const final = node => clean(overrides[node.id]?.display_name) || node.name;
    const byFinal = new Map(), byOriginal = new Map();
    const indexNode = (index, key, node) => { if (!index.has(key)) index.set(key, []); index.get(key).push(node); };
    for (const node of catalog.values()) { indexNode(byFinal, final(node), node); indexNode(byOriginal, node.id, node); if (node.name !== node.id) indexNode(byOriginal, node.name, node); }
    const nodesForKey = key => byFinal.get(key) || byOriginal.get(key) || [];
    const records = [];
    for (const [key, value] of Object.entries(colors)) {
      const nodes = nodesForKey(key);
      if (!nodes.length) records.push({ ...source(instance, key, key, value, '', 'taxon color category'), dictionary: true });
      else for (const node of nodes) records.push({ ...source(instance, key, final(node), value, '', 'taxon color category'), dictionary: true });
    }
    for (const [id, override] of Object.entries(overrides)) if (override.color) records.push(source(instance, id, final(catalog.get(id)), color(override.color, `${instance.title}, ${id}`), '', 'taxon override'));
    // Add automatic categories in the selected coloring mode, without changing
    // inherited colors of descendant nodes or overriding layout.color_by.
    const by = clean(curation.layout?.color_by || 'domain');
    const targets = [...catalog.values()].filter(node => by === 'self' || (overrides[node.id]?.display_rank || node.rank) === by || node.rank === 'domain');
    for (const node of targets) {
      const name = final(node), override = overrides[node.id];
      const value = override?.color || colors[name] || colors[node.name] || colors[node.id] || automaticColor(name);
      records.push(source(instance, node.id, name, color(value, `${instance.title}, ${name}`), '', 'taxon color category'));
    }
    // Names below the selected color rank are still editable. They must not
    // acquire a new palette entry or override inherited ancestor colors.
    const styledIds = new Set(records.filter(rec => !rec.dictionary).map(rec => rec.originalId));
    for (const node of catalog.values()) if (!styledIds.has(node.id)) records.push(source(instance, node.id, final(node), '', '', 'taxon label'));
    if (by.startsWith('depth:')) warnings.push(`${instance.title}: depth-based automatic colors depend on the displayed tree. Existing dictionary colors and explicit overrides are included; new automatic depth categories are not inferred.`);
    return { instance, records, curation, overrides, catalog, final, frequencies };
  }
  function network(session, instance, warnings) {
    const text = textOf(session, instance.itemId, 'nodes');
    const nodes = text.trim() ? parseYaml(text, `${instance.title} / network nodes`) : map();
    const colors = readPalette(session, instance, 'colors'), groups = new Set();
    const groupFor = raw => { const value = clean(raw.Function); return !value || /^(?:\.?(?:nan)|null|none|undefined|~)$/i.test(value) ? 'Unassigned' : value; };
    const normalizeGroup = value => clean(value).replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    const normalizedColors = new Map(Object.entries(colors).map(([key, value]) => [normalizeGroup(key), value]));
    const annotated = new Set(), canonical = new Map();
    const included = raw => typeof raw === 'boolean' ? raw : typeof raw === 'number' ? raw === 1 : ['1', 'true', 'yes', 'y', 'include'].includes(normalizeGroup(raw));
    for (const [id, raw] of Object.entries(nodes)) {
      checkObject(raw, `${instance.title}, node ${id}`); const group = groupFor(raw);
      groups.add(group); annotated.add(normalizeGroup(id));
      const label = /^(?:\.?(?:nan)|null|none|undefined|~)$/i.test(clean(raw.Display_name)) ? id : clean(raw.Display_name) || id;
      const identity = normalizeGroup(label); annotated.add(identity);
      if (!canonical.has(identity)) canonical.set(identity, []);
      canonical.get(identity).push({ group, included: included(raw.Include) });
    }
    const unannotated = new Set();
    const unannotatedIdentities = new Set();
    for (const row of table(textOf(session, instance.itemId, 'edges'), instance.title)) for (const key of ['source', 'target']) if (clean(row[key]) && !annotated.has(normalizeGroup(row[key]))) {
      unannotated.add(clean(row[key]));
      if (clean(row.source) && clean(row.target) && Number.isFinite(Number(row.edge_count)) && Number(row.edge_count) >= 0) unannotatedIdentities.add(normalizeGroup(row[key]));
    }
    if (unannotated.size) groups.add('Unassigned');
    const records = []; let index = 0;
    for (const group of [...groups].sort((a, b) => a.localeCompare(b))) {
      const supplied = normalizedColors.get(normalizeGroup(group));
      const value = supplied || NETWORK_HINTS[group] || NETWORK_PALETTE[index++ % NETWORK_PALETTE.length];
      records.push(source(instance, group, group, value, '', 'network Function group'));
    }
    const foldedGroups = new Map(); for (const name of groups) { const token = normalizeGroup(name); if (!foldedGroups.has(token)) foldedGroups.set(token, []); foldedGroups.get(token).push(name); }
    for (const [group, value] of Object.entries(colors)) {
      const matches = groups.has(group) ? [group] : foldedGroups.get(normalizeGroup(group)) || [];
      for (const name of matches.length ? matches : [group]) records.push(source(instance, group, name, value, '', 'network group dictionary'));
    }
    warnings.push(`${instance.title}: Network colors refer to Function groups. Renamed node labels and computed community colors are separate; the configured coloring mode is preserved.`);
    if ([...groups].some(group => !normalizedColors.has(normalizeGroup(group)))) warnings.push(`${instance.title}: groups without a saved color use suggested defaults. Automatic colors can depend on the currently included network nodes.`);
    function frequencyForPlan(renames) {
      const frequencies = new Map(), renamed = name => own(renames, name) ? renames[name] : name;
      for (const [identity, entries] of canonical) {
        // The viewer merges aliases with the same display label. The preferred
        // Function may change when a plan renames a group to/from Unassigned.
        const chosen = entries.find(entry => entry.included && renamed(entry.group) !== 'Unassigned') || entries.find(entry => renamed(entry.group) !== 'Unassigned') || entries[0];
        observe(frequencies, chosen.group, identity);
      }
      for (const identity of unannotatedIdentities) observe(frequencies, 'Unassigned', identity);
      return frequencies;
    }
    return { instance, records, nodes, groupFor, unannotated, frequencyForPlan, frequencies: frequencyForPlan({}) };
  }
  const ADAPTERS = { neighborhood, architecture, taxonomy, network };
  async function analyze(session, layers, options = {}) {
    const renames = renamePlan(options.renames || {});
    const selected = selectedLayers(layers), warnings = [], models = [], entries = new Map(), accumulators = new Map();
    const instances = session.instances.filter(instance => selected.includes(instance.layer));
    for (const instance of instances) {
      const model = ADAPTERS[instance.layer](session, instance, warnings); models.push(model);
    }
    // A canonical name in another selected figure must never be interpreted as
    // this figure's legacy raw ID. Build the vocabulary across the whole group
    // before attributing dictionary keys, including persisted shared entries.
    const finalNames = new Set();
    for (const model of models) {
      for (const rec of model.records) if (!rec.dictionary && !rec.kind.includes('dictionary')) finalNames.add(rec.name);
      if (model.catalog) for (const node of model.catalog.values()) finalNames.add(model.final(node));
    }
    for (const group of session.groups) if (group.layers.some(layer => selected.includes(layer))) for (const name of [...Object.keys(group.colors || {}), ...Object.keys(group.shapes || {})]) finalNames.add(name);
    for (const model of models) {
      for (const rec of model.records) {
        if ((rec.dictionary || rec.kind.includes('dictionary')) && finalNames.has(rec.originalId)) rec.name = rec.originalId;
        if (model.instance.layer === 'architecture' && rec.kind === 'domain') {
          const style = model.styles[rec.originalId] || {};
          rec.color = lookup(model.colors, rec.name) || (!finalNames.has(rec.originalId) ? lookup(model.colors, rec.originalId) : undefined) || (style.color ? color(style.color, `${model.instance.title}, ${rec.originalId}`) : '#cbd5e1');
          rec.shape = lookup(model.shapes, rec.name) || (!finalNames.has(rec.originalId) ? lookup(model.shapes, rec.originalId) : undefined) || style.shape || 'rounded';
        }
      }
    }
    const originalNames = new Map();
    for (const model of models) for (const rec of model.records) { if (!originalNames.has(rec.name)) originalNames.set(rec.name, new Set()); originalNames.get(rec.name).add(model); }
    for (const [name, target] of Object.entries(renames)) {
      if (!originalNames.has(name)) fail(`Rename “${name}”: this is not a current final name in the selected layers. Import a plan for the current labels, not original data IDs.`);
      for (const model of originalNames.get(name)) {
        if (model.instance.layer === 'neighborhood' && (model.marker(target) || target === '?' || target === '-')) fail(`Rename “${name}”: “${target}” is a reserved Neighborhood marker or unknown-domain label.`);
        if (model.instance.layer === 'architecture' && special(target)) fail(`Rename “${name}”: “${target}” is a reserved Architecture feature label.`);
        if (model.instance.layer === 'network' && /^(?:\.?(?:nan)|null|none|undefined|~)$/i.test(target)) fail(`Rename “${name}”: Network treats “${target}” as an empty Function group.`);
        if (model.instance.layer === 'network' && name === 'Unassigned' && model.unannotated.size) fail(`${model.instance.title}: annotate the unassigned edge endpoints in the Network editor before renaming their Function group. Original edge data will be preserved.`);
      }
    }
    // Apply the plan once to the current vocabulary. A→B and B→C means two
    // simultaneous renames; it never sends A transitively to C.
    for (const model of models) {
      if (model.frequencyForPlan) model.frequencies = model.frequencyForPlan(renames);
      for (const rec of model.records) {
        if (!clean(rec.name)) continue;
        rec.previousName = rec.name;
        rec.name = own(renames, rec.name) ? renames[rec.name] : rec.name;
        let entry = entries.get(rec.name);
        if (!entry) {
          entry = { name: rec.name, key: rec.name, label: rec.name, colors: [], shapes: [], sources: [], previousNames: [], frequency: map(), frequenciesByInstance: map(), instanceCount: 0 };
          entries.set(rec.name, entry); accumulators.set(rec.name, { names: new Set(), colors: new Set(), shapes: new Set(), sources: new Set(), instances: new Map() });
        }
        const accumulator = accumulators.get(rec.name);
        if (!accumulator.names.has(rec.previousName)) { accumulator.names.add(rec.previousName); entry.previousNames.push(rec.previousName); }
        if (rec.color && !accumulator.colors.has(rec.color)) { accumulator.colors.add(rec.color); entry.colors.push(rec.color); }
        if (rec.shape && !accumulator.shapes.has(rec.shape)) { accumulator.shapes.add(rec.shape); entry.shapes.push(rec.shape); }
        const observed = rec.dictionary || rec.kind.includes('dictionary') ? undefined : model.frequencies.get(rec.originalId);
        rec.frequency = { count: observed?.entities.size || 0, occurrences: observed?.occurrences.size || 0 };
        const sourceKey = JSON.stringify([rec.itemId, rec.originalId, rec.color, rec.shape, rec.kind]);
        if (!accumulator.sources.has(sourceKey)) { accumulator.sources.add(sourceKey); entry.sources.push(rec); }
        if (!accumulator.instances.has(rec.itemId)) accumulator.instances.set(rec.itemId, { layer: rec.layer, entities: new Set(), occurrences: new Set() });
        const counts = accumulator.instances.get(rec.itemId);
        if (observed) {
          for (const entity of observed.entities) counts.entities.add(entity);
          for (const occurrence of observed.occurrences) counts.occurrences.add(occurrence);
        }
      }
    }
    const result = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of result) {
      for (const [itemId, counts] of accumulators.get(entry.name).instances) {
        const count = counts.entities.size, occurrences = counts.occurrences.size;
        entry.frequenciesByInstance[itemId] = { layer: counts.layer, count, occurrences };
        if (!entry.frequency[counts.layer]) entry.frequency[counts.layer] = { count: 0, occurrences: 0, instanceCount: 0 };
        entry.frequency[counts.layer].count += count; entry.frequency[counts.layer].occurrences += occurrences;
        if (count) { entry.frequency[counts.layer].instanceCount++; entry.instanceCount++; }
      }
      entry.colorEditable = entry.sources.some(rec => rec.kind !== 'taxon label'); entry.colorConflict = entry.colors.length > 1; entry.shapeConflict = entry.shapes.length > 1; entry.suggestedColor = entry.colorEditable ? entry.colors[0] || automaticColor(entry.name) : ''; entry.suggestedShape = entry.shapes[0] || '';
    }
    if (!instances.length) warnings.push('This state has no instances of the selected layers.');
    return { entries: result, warnings: [...new Set(warnings)], instances, layers: selected, models, renames };
  }
  function ensureChoices(analysis, choices, includeShapes) {
    const colors = map(), shapes = map();
    for (const entry of analysis.entries) {
      const decision = choices instanceof Map ? choices.get(entry.name) : own(choices, entry.name) ? choices[entry.name] : undefined;
      const selected = typeof decision === 'string' ? { color: decision } : decision || {};
      if (entry.colorEditable !== false) {
        if (!selected.color && entry.colorConflict) fail(`Choose a color for “${entry.name}” before applying the group.`);
        colors[entry.name] = color(selected.color || entry.suggestedColor, entry.name);
      }
      if (includeShapes && entry.shapes.length) {
        if (!selected.shape && entry.shapeConflict) fail(`Choose a shape for “${entry.name}” before applying the group.`);
        const shape = selected.shape || entry.suggestedShape;
        if (!SHAPES.includes(shape)) fail(`Unsupported shape for “${entry.name}”.`);
        shapes[entry.name] = shape;
      }
    }
    // All four viewers accept 6-digit hex; other CSS formats are retained on
    // input for inspection, but require an explicit portable replacement.
    if (analysis.layers.some(layer => layer !== 'network')) for (const [name, value] of Object.entries(colors)) if (!/^#[0-9a-f]{6}$/.test(value)) fail(`Choose a six-digit hexadecimal color for “${name}” to share it with all selected viewers.`);
    if (analysis.layers.includes('network')) {
      const normalized = new Map();
      for (const [name, value] of Object.entries(colors)) {
        const token = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
        const previous = normalized.get(token);
        if (previous && previous.value !== value) fail(`Network treats “${previous.name}” and “${name}” as the same group. Choose the same color for both names.`);
        normalized.set(token, { name, value });
      }
    }
    return { colors, shapes };
  }
  async function applyGroup(session, layers, choices = {}, options = {}) {
    const selected = selectedLayers(layers), id = options.id || `palette-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const previous = session.groups.find(group => group.id === id);
    if (previous && JSON.stringify(selectedLayers(previous.layers)) !== JSON.stringify(selected)) fail('To change a group’s layers, reload the original state and create new groups.');
    for (const group of session.groups) if (group.id !== id && group.layers.some(layer => selected.includes(layer))) fail(`A selected layer already belongs to “${group.name}”. Edit that group or choose unassigned layers.`);
    const analysis = await analyze(session, selected, { renames: options.renames || {} });
    if (!analysis.instances.length || !analysis.entries.length) fail('There are no names or styles to unify in the selected layers.');
    const renames = analysis.renames;
    const renamed = name => own(renames, name) ? renames[name] : name;
    const includeShapes = options.includeShapes !== false;
    const palette = ensureChoices(analysis, choices, includeShapes);
    const colorYaml = flatYaml(palette.colors), shapeYaml = flatYaml(palette.shapes), staged = new Map();
    function stage(instance, role, text, filename) {
      const bytes = new TextEncoder().encode(text);
      if (sameBytes(bytes, attachment(session, instance.itemId, role))) return;
      staged.set(keyOf(instance.itemId, role), { itemId: instance.itemId, role, filename, bytes, modifiedAt: Date.now() });
    }
    for (const model of analysis.models) {
      const { instance } = model;
      stage(instance, COLOR_ROLES[instance.layer], colorYaml, 'unified-colors.yaml');
      if (instance.layer === 'neighborhood') {
        const mapping = Object.assign(map(), model.renames); let changed = false;
        for (const originalId of model.ids) {
          const name = model.resolve(originalId);
          if (model.markerIds.has(originalId) || model.marker(originalId) || model.marker(name) || !own(renames, name)) continue;
          mapping[originalId] = renamed(name); changed = true;
        }
        if (changed) stage(instance, 'rename', flatYaml(mapping), 'domain-rename.yaml');
      }
      if (instance.layer === 'architecture') {
        const curation = clone(model.curation); curation.styles = curation.styles || {};
        const domainRecords = model.records.filter(rec => rec.kind === 'domain');
        const byId = new Map(domainRecords.map(rec => [rec.originalId, rec]));
        const changedNames = model.records.some(rec => rec.name !== rec.previousName);
        for (const originalId of model.ids) {
          if (special(originalId)) continue;
          const previousName = model.resolve(originalId), name = renamed(previousName);
          const style = own(curation.styles, originalId) ? curation.styles[originalId] : {};
          if (name !== previousName) style.display_name = name;
          if (own(palette.colors, name)) style.color = palette.colors[name];
          if (includeShapes && own(palette.shapes, name)) style.shape = palette.shapes[name];
          else if (!includeShapes && changedNames && byId.has(originalId)) style.shape = byId.get(originalId).shape;
          Object.defineProperty(curation.styles, originalId, { value: style, enumerable: true, configurable: true, writable: true });
        }
        stage(instance, 'architectureYaml', dumpYaml(curation), 'domain-architecture.yaml');
        if (includeShapes && Object.keys(palette.shapes).length) stage(instance, 'architectureShapes', shapeYaml, 'unified-shapes.yaml');
        else if (!includeShapes && changedNames && attachment(session, instance.itemId, 'architectureShapes')) {
          // Preserve effective per-domain shapes while moving dictionary keys.
          // If a rename merges differently shaped domains, their embedded styles
          // retain those shapes and the now-ambiguous shared key is omitted.
          const dictionary = map(), candidates = new Map();
          for (const [name, value] of Object.entries(model.shapes)) if (special(name)) dictionary[name] = value;
          for (const rec of model.records.filter(rec => rec.kind === 'shape dictionary')) {
            if (!candidates.has(rec.name)) candidates.set(rec.name, new Set());
            candidates.get(rec.name).add(rec.shape);
          }
          for (const [name, values] of candidates) if (values.size === 1) dictionary[name] = [...values][0];
          const grouped = new Map();
          for (const rec of domainRecords) { if (!grouped.has(rec.name)) grouped.set(rec.name, new Set()); grouped.get(rec.name).add(rec.shape); }
          for (const [name, values] of grouped) {
            if (values.size === 1) dictionary[name] = [...values][0];
            else delete dictionary[name];
          }
          for (const rec of domainRecords) if (grouped.get(rec.name).size > 1 && !grouped.has(rec.originalId)) delete dictionary[rec.originalId];
          stage(instance, 'architectureShapes', flatYaml(dictionary), 'architecture-shapes.yaml');
        }
      }
      if (instance.layer === 'taxonomy') {
        const curation = clone(model.curation); let changed = false;
        for (const node of model.catalog.values()) {
          const name = model.final(node);
          if (!own(renames, name)) continue;
          curation.overrides = curation.overrides || {};
          const override = own(curation.overrides, node.id) ? curation.overrides[node.id] : {};
          override.display_name = renamed(name);
          Object.defineProperty(curation.overrides, node.id, { value: override, enumerable: true, configurable: true, writable: true });
          changed = true;
        }
        for (const [taxid, override] of Object.entries(curation.overrides || {})) {
          const name = renamed(model.final(model.catalog.get(taxid)));
          if (override.color && own(palette.colors, name)) { override.color = palette.colors[name]; changed = true; }
        }
        if (changed) stage(instance, 'taxonomyYaml', dumpYaml(curation), 'taxonomy-sankey.yaml');
      }
      if (instance.layer === 'network') {
        const nodes = clone(model.nodes); let changed = false;
        for (const raw of Object.values(nodes)) { const name = model.groupFor(raw); if (own(renames, name)) { raw.Function = renamed(name); changed = true; } }
        if (changed) stage(instance, 'nodes', dumpYaml(nodes), 'network-nodes.yaml');
      }
    }
    const updatedAt = new Date().toISOString();
    const renameHistory = Array.isArray(previous?.renameHistory) ? clone(previous.renameHistory) : [];
    if (Object.keys(renames).length) renameHistory.push({ appliedAt: updatedAt, renames: clone(renames) });
    // This is an exportable record of the last rename operation, never a
    // pending plan. Applying palette edits does not replay or erase it.
    const lastRenames = Object.keys(renames).length ? renames : previous?.renames || map();
    const group = { id, name: clean(options.name) || previous?.name || selected.join(' + '), layers: selected, ...palette, renames: clone(lastRenames), renameYaml: flatYaml(lastRenames), renameHistory, colorYaml, shapeYaml, includeShapes, instanceCount: analysis.instances.length, updatedAt };
    // Commit only after every adapter, decision and serialized payload succeeded.
    for (const [key, value] of staged) session.updates.set(key, value);
    session.groups = session.groups.filter(group => group.id !== id).concat([group]);
    return group;
  }
  async function exportState(session, options = {}) {
    const JSZip = zipLibrary(), zip = new JSZip(), recipe = clone(session.recipe), now = Date.now();
    // Preserve every untouched archive entry, including opaque nested package
    // bytes and unrecognized extension assets. ZIP compression itself may differ.
    for (const entry of Object.values(session.zip.files)) {
      if (entry.dir || entry.name === session.manifestPath) continue;
      zip.file(entry.name, await entry.async('uint8array'), { binary: true, date: entry.date, comment: entry.comment, unixPermissions: entry.unixPermissions });
    }
    const assets = new Map(recipe.assets.map(asset => [keyOf(asset.scope === 'project' ? '__project__' : asset.itemId, asset.role), asset]));
    const paths = new Set(recipe.assets.map(asset => asset.path)); let index = recipe.assets.length;
    for (const [key, update] of session.updates) {
      let asset = assets.get(key);
      if (!asset) {
        let path; do { path = `uploads/style-manager-${String(++index).padStart(6, '0')}/${update.filename}`; } while (paths.has(path) || zip.file(session.prefix + path));
        asset = { itemId: update.itemId, role: update.role, kind: 'file', path, originalName: update.filename, mime: 'text/yaml', size: update.bytes.length, lastModified: update.modifiedAt };
        recipe.assets.push(asset); assets.set(key, asset); paths.add(path);
      } else if (!sameBytes(update.bytes, session.files.get(key))) { asset.size = update.bytes.length; asset.lastModified = update.modifiedAt; }
      zip.file(session.prefix + asset.path, update.bytes, { binary: true });
    }
    recipe.project.styleManager = { ...(recipe.project.styleManager || {}), schemaVersion: 1, version: VERSION, groups: clone(session.groups) };
    recipe.savedAt = new Date(now).toISOString();
    zip.file(session.manifestPath, JSON.stringify(recipe, null, 2));
    return zip.generateAsync({ type: options.type || 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' });
  }
  return Object.freeze({ VERSION, LAYERS: Object.freeze(LAYERS), SHAPES: Object.freeze(SHAPES), loadArchive, analyze, applyGroup, exportState, parseYaml, parseRenameYaml, dumpYaml, flatYaml });
});
