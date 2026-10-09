/* Portable-export dependency bundler. This file contains no third-party library code. */
(() => {
  'use strict';

  const assets = Object.freeze([
    { packageName: 'molstar', version: '5.11.0', kinds: ['protein', 'multistructure'], path: 'vendor/molstar-5.11.0/molstar.js', sourceUrl: 'https://cdn.jsdelivr.net/npm/molstar@5.11.0/build/viewer/molstar.js', mime: 'text/javascript', type: 'script' },
    { packageName: 'molstar', version: '5.11.0', kinds: ['protein', 'multistructure'], path: 'vendor/molstar-5.11.0/molstar.css', sourceUrl: 'https://cdn.jsdelivr.net/npm/molstar@5.11.0/build/viewer/molstar.css', mime: 'text/css', type: 'css' },
    { packageName: 'molstar', version: '5.11.0', kinds: ['protein', 'multistructure'], path: 'vendor/molstar-5.11.0/LICENSE', sourceUrl: 'https://cdn.jsdelivr.net/npm/molstar@5.11.0/LICENSE', mime: 'text/plain', type: 'license' },
    { packageName: 'js-yaml', version: '5.4.1', kinds: ['protein'], path: 'vendor/js-yaml-5.4.1/js-yaml.umd.min.js', sourceUrl: 'https://cdn.jsdelivr.net/npm/js-yaml@5.4.1/dist/browser/js-yaml.umd.min.js', mime: 'text/javascript', type: 'script' },
    { packageName: 'js-yaml', version: '5.4.1', kinds: ['protein'], path: 'vendor/js-yaml-5.4.1/LICENSE', sourceUrl: 'https://cdn.jsdelivr.net/npm/js-yaml@5.4.1/LICENSE', mime: 'text/plain', type: 'license' }
  ].map(asset => Object.freeze({ ...asset, kinds: Object.freeze(asset.kinds) })));

  const SOURCE_CACHE = new Map();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const TIMEOUT_MS = 60000;
  const MAX_ASSET_BYTES = 50 * 1024 * 1024;

  async function download(sourceUrl) {
    if (!SOURCE_CACHE.has(sourceUrl)) {
      const pending = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await fetch(sourceUrl, {
            mode: 'cors', credentials: 'omit', redirect: 'error',
            cache: 'force-cache', referrerPolicy: 'no-referrer', signal: controller.signal
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const declaredSize = Number(response.headers.get('content-length'));
          if (declaredSize > MAX_ASSET_BYTES) throw new Error('Dependency exceeds the 50 MiB download limit.');
          const mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (mime === 'text/html' || mime === 'application/xhtml+xml') throw new Error('The server returned HTML instead of a dependency.');
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new Error('The dependency download is empty or too large.');
          const start = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
          if (/^(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(start)) throw new Error('The server returned HTML instead of a dependency.');
          return { bytes, mime };
        } catch (error) {
          const detail = error?.name === 'AbortError' ? 'The download timed out after 60 seconds.' : error?.message || String(error);
          throw new Error(`Could not bundle ${sourceUrl}. ${detail} Connect to the internet and try the portable export again. No incomplete portable ZIP was generated.`);
        } finally {
          clearTimeout(timeout);
        }
      })();
      SOURCE_CACHE.set(sourceUrl, pending);
      pending.catch(() => SOURCE_CACHE.delete(sourceUrl));
    }
    return SOURCE_CACHE.get(sourceUrl);
  }

  function toDataUrl(bytes, mime) {
    let binary = '';
    for (let start = 0; start < bytes.length; start += 16384) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 16384));
    }
    return `data:${mime};base64,${btoa(binary)}`;
  }

  function assetMime(url, received) {
    const known = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject' };
    return known[url.pathname.split('.').pop().toLowerCase()] || received || 'application/octet-stream';
  }

  async function bundleStylesheet(asset, bytes) {
    let css = decoder.decode(bytes);
    // Imports need a CSS parser to flatten safely. Stop if a future upstream
    // build adds them instead of silently exporting a stylesheet that needs HTTP.
    const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/@import\s/i.test(uncommented)) throw new Error(`Cannot make ${asset.path} portable: its stylesheet contains an @import directive.`);
    const packageBase = `https://cdn.jsdelivr.net/npm/${asset.packageName}@${asset.version}/`;
    const urls = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"\s][^)]*?))\s*\)/gi;
    const replacements = [];
    const embeddedSources = [];
    for (const match of css.matchAll(urls)) {
      const reference = (match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (!reference || /^(?:data:|#)/i.test(reference)) continue;
      if (reference.includes('\\')) throw new Error(`Cannot safely bundle an escaped CSS asset URL in ${asset.path}.`);
      const url = new URL(reference, asset.sourceUrl);
      if (!url.href.startsWith(packageBase) || url.search) {
        throw new Error(`Cannot make ${asset.path} portable: CSS asset ${url.href} is outside the pinned dependency package.`);
      }
      const fragment = url.hash;
      url.hash = '';
      const downloaded = await download(url.href);
      replacements.push({ index: match.index, length: match[0].length, value: `url("${toDataUrl(downloaded.bytes, assetMime(url, downloaded.mime))}${fragment}")` });
      embeddedSources.push({ sourceUrl: url.href, bytes: downloaded.bytes.byteLength });
    }
    // Apply backwards to preserve the original match offsets.
    for (const replacement of replacements.reverse()) {
      css = css.slice(0, replacement.index) + replacement.value + css.slice(replacement.index + replacement.length);
    }
    return { bytes: encoder.encode(css), embeddedSources };
  }

  async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) return null;
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
  }

  async function collect(moduleKinds, onProgress = () => {}) {
    const kinds = new Set(typeof moduleKinds === 'string' ? [moduleKinds] : moduleKinds || []);
    const required = assets.filter(asset => asset.kinds.some(kind => kinds.has(kind)));
    if (!required.length) return [];
    const result = [];
    const manifest = {
      format: 'evosupplement-portable-dependencies', schemaVersion: 1,
      note: 'Pinned libraries downloaded during export. CSS URL assets, if present, are embedded as data URLs. External links and remote resources inside user content still require internet.',
      packages: [...new Set(required.map(asset => asset.packageName))].map(name => ({
        name, version: required.find(asset => asset.packageName === name).version,
        license: 'MIT', repository: name === 'molstar' ? 'https://github.com/molstar/molstar' : 'https://github.com/nodeca/js-yaml'
      })),
      files: []
    };
    for (const asset of required) {
      onProgress({ completed: result.length, total: required.length, path: asset.path, label: `Bundling ${asset.packageName} ${asset.version}: ${asset.path.split('/').pop()}` });
      const downloaded = await download(asset.sourceUrl);
      let bytes = downloaded.bytes.slice();
      let embeddedSources = [];
      const text = decoder.decode(bytes);
      if (asset.type === 'script' && (bytes.length < 1000 || !new RegExp(asset.packageName === 'molstar' ? 'molstar' : 'yaml', 'i').test(text))) {
        SOURCE_CACHE.delete(asset.sourceUrl);
        throw new Error(`The downloaded ${asset.packageName} script does not appear to be the expected library. Portable export stopped.`);
      }
      if (asset.type === 'license' && !/Permission is hereby granted/i.test(text)) {
        SOURCE_CACHE.delete(asset.sourceUrl);
        throw new Error(`The license download for ${asset.packageName} is invalid. Portable export stopped.`);
      }
      if (asset.type === 'css') {
        if (bytes.length < 100 || !text.includes('{')) throw new Error(`The downloaded ${asset.packageName} stylesheet is invalid. Portable export stopped.`);
        ({ bytes, embeddedSources } = await bundleStylesheet(asset, bytes));
      }
      result.push({ path: asset.path, bytes, mime: asset.mime, sourceUrl: asset.sourceUrl });
      manifest.files.push({ path: asset.path, sourceUrl: asset.sourceUrl, bytes: bytes.byteLength, sha256: await sha256(bytes), ...(embeddedSources.length ? { embeddedSources } : {}) });
    }
    result.push({ path: 'vendor/THIRD-PARTY.json', bytes: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`), mime: 'application/json' });
    onProgress({ completed: required.length, total: required.length, path: 'vendor/THIRD-PARTY.json', label: 'Offline libraries and licenses are ready.' });
    return result;
  }

  window.EvoSupplementPortableVendor = Object.freeze({ assets, collect });
})();
