import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { XMLParser } from 'fast-xml-parser';

import { canonicalizeText, fnv1a32HexFromString, normalizeNewlines } from './text.js';

function xml() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    allowBooleanAttributes: true
  });
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveZipPath(opfDir, href) {
  const cleanHref = String(href || '').split('#')[0];
  const base = String(opfDir || '');
  const rel = cleanHref.replace(/^\/+/, '');
  let decoded = rel;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    // ignore
  }
  const joined = (base + decoded).replace(/\\/g, '/');
  const parts = joined.split('/').filter((p) => p && p !== '.');
  const stack = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/');
}

function parseXmlText(value) {
  return xml().parse(String(value || ''));
}

function readFirst(obj, ...keys) {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  return null;
}

export async function loadEpubFromBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid EPUB: container.xml not found');

  const container = parseXmlText(containerXml);
  const rootfiles = readFirst(container?.container, 'rootfiles');
  const rootfile = ensureArray(readFirst(rootfiles, 'rootfile'))[0] || null;
  const opfPath = rootfile?.['@_full-path'] || null;
  if (!opfPath) throw new Error('Invalid EPUB: OPF path not found');

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) throw new Error('Invalid EPUB: OPF file not found');

  const opf = parseXmlText(opfContent);
  const pkg = opf?.package || null;

  const metadata = pkg?.metadata || {};
  const titleNode = readFirst(metadata, 'title', 'dc:title');
  const title = typeof titleNode === 'string'
    ? titleNode
    : (typeof titleNode?.['#text'] === 'string' ? titleNode['#text'] : '');

  const manifestItems = new Map();
  const manifest = pkg?.manifest || {};
  for (const item of ensureArray(manifest.item)) {
    const id = item?.['@_id'];
    const href = item?.['@_href'];
    if (!id || !href) continue;
    manifestItems.set(String(id), {
      id: String(id),
      href: String(href),
      mediaType: item?.['@_media-type'] ? String(item['@_media-type']) : '',
      properties: item?.['@_properties'] ? String(item['@_properties']) : ''
    });
  }

  const spine = pkg?.spine || {};
  const spineIdrefs = ensureArray(spine.itemref)
    .map((it) => it?.['@_idref'])
    .filter(Boolean)
    .map(String);

  const tocId = spine?.['@_toc'] ? String(spine['@_toc']) : null;

  return { zip, opfPath, opfDir, pkg, title, manifestItems, spineIdrefs, tocId };
}

function extractCoverHref(pkg, manifestItems) {
  const metadata = pkg?.metadata || {};
  const meta = ensureArray(metadata.meta);
  const coverMeta = meta.find((m) => m?.['@_name'] === 'cover' && m?.['@_content']);
  const coverIdFromMeta = coverMeta?.['@_content'] ? String(coverMeta['@_content']) : null;
  if (coverIdFromMeta && manifestItems.has(coverIdFromMeta)) return manifestItems.get(coverIdFromMeta)?.href || null;

  for (const item of manifestItems.values()) {
    if (item.properties && item.properties.includes('cover-image')) return item.href;
  }
  for (const item of manifestItems.values()) {
    const idLower = item.id.toLowerCase();
    const hrefLower = item.href.toLowerCase();
    if ((idLower.includes('cover') || hrefLower.includes('cover')) && item.mediaType.startsWith('image/')) return item.href;
  }

  return null;
}

function guessMimeFromHref(href) {
  const lower = String(href || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

export async function extractCoverDataUrl({ zip, opfDir, pkg, manifestItems }) {
  const href = extractCoverHref(pkg, manifestItems);
  if (!href) return null;

  const path = resolveZipPath(opfDir, href);
  const file = zip.file(path) || zip.file(href);
  if (!file) return null;
  const base64 = await file.async('base64');
  const mime = guessMimeFromHref(href);
  return `data:${mime};base64,${base64}`;
}

function findNavItemHref(manifestItems) {
  for (const item of manifestItems.values()) {
    if (item.properties && item.properties.split(/\s+/).includes('nav')) return item.href;
  }
  for (const item of manifestItems.values()) {
    if (item.mediaType === 'application/xhtml+xml' && item.href.toLowerCase().includes('nav')) return item.href;
  }
  return null;
}

function findNcxHref(manifestItems, tocId) {
  if (tocId && manifestItems.has(tocId)) return manifestItems.get(tocId)?.href || null;
  for (const item of manifestItems.values()) {
    if (item.mediaType === 'application/x-dtbncx+xml') return item.href;
  }
  return null;
}

function parseNavTocLinks(navXhtml) {
  const dom = new JSDOM(navXhtml, { contentType: 'application/xhtml+xml' });
  const doc = dom.window.document;

  const navs = Array.from(doc.querySelectorAll('nav'));
  let nav = navs.find((n) => (n.getAttribute('epub:type') || '').trim() === 'toc')
    || navs.find((n) => (n.getAttribute('type') || '').trim() === 'toc')
    || navs[0]
    || null;
  if (!nav) return [];

  const links = Array.from(nav.querySelectorAll('a[href]'));
  return links
    .map((a) => ({
      title: (a.textContent || '').trim(),
      href: a.getAttribute('href') || ''
    }))
    .filter((it) => it.href);
}

function parseNcxTocLinks(ncxXml) {
  const obj = parseXmlText(ncxXml);
  const ncx = obj?.ncx || obj || {};
  const navMap = ncx?.navMap || {};

  /** @type {Array<{title: string, href: string}>} */
  const out = [];
  const walk = (navPoint) => {
    if (!navPoint) return;
    const label = navPoint.navLabel || {};
    const text = readFirst(label, 'text');
    const title = typeof text === 'string' ? text : (typeof text?.['#text'] === 'string' ? text['#text'] : '');
    const content = navPoint.content || {};
    const href = content?.['@_src'] ? String(content['@_src']) : '';
    if (href) out.push({ title: String(title || '').trim(), href });
    for (const child of ensureArray(navPoint.navPoint)) walk(child);
  };

  for (const np of ensureArray(navMap.navPoint)) walk(np);
  return out;
}

export async function extractTocEntries({ zip, opfDir, manifestItems, tocId }) {
  const navHref = findNavItemHref(manifestItems);
  if (navHref) {
    const navPath = resolveZipPath(opfDir, navHref);
    const navText = await zip.file(navPath)?.async('text');
    if (navText) {
      const links = parseNavTocLinks(navText);
      if (links.length) {
        const baseDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/') + 1) : '';
        return { kind: 'nav', entries: links, baseDir };
      }
    }
  }

  const ncxHref = findNcxHref(manifestItems, tocId);
  if (ncxHref) {
    const ncxPath = resolveZipPath(opfDir, ncxHref);
    const ncxText = await zip.file(ncxPath)?.async('text');
    if (ncxText) {
      const links = parseNcxTocLinks(ncxText);
      if (links.length) {
        const baseDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/') + 1) : '';
        return { kind: 'ncx', entries: links, baseDir };
      }
    }
  }

  return { kind: 'spine', entries: [], baseDir: opfDir || '' };
}

function findFragmentElement(doc, fragment) {
  if (!fragment) return null;
  let frag = fragment;
  try {
    frag = decodeURIComponent(String(fragment));
  } catch {
    frag = String(fragment);
  }
  const byId = doc.getElementById(fragment);
  if (byId) return byId;
  const safe = String(fragment).replace(/"/g, '\\"');
  const byName = doc.querySelector(`a[name="${safe}"]`);
  if (byName) return byName;
  const decodedById = doc.getElementById(frag);
  if (decodedById) return decodedById;
  return null;
}

function extractContentBetween(body, startEl, endEl) {
  const allNodes = Array.from(body.querySelectorAll('*'));
  const indexMap = new Map(allNodes.map((n, idx) => [n, idx]));

  const startIndex = startEl && indexMap.has(startEl) ? indexMap.get(startEl) : -1;
  const endIndex = endEl && indexMap.has(endEl) ? indexMap.get(endEl) : allNodes.length;

  const contentParts = [];
  const rawHtmlParts = [];
  const added = new Set();

  const isContentElement = (el) => (
    el.tagName === 'P' ||
    el.tagName === 'DIV' ||
    el.tagName === 'BLOCKQUOTE' ||
    el.tagName === 'UL' ||
    el.tagName === 'OL' ||
    el.tagName === 'LI' ||
    el.tagName === 'PRE' ||
    el.tagName === 'TABLE' ||
    el.tagName === 'FIGURE' ||
    el.tagName === 'SECTION' ||
    el.tagName === 'ARTICLE' ||
    el.tagName === 'H1' ||
    el.tagName === 'H2' ||
    el.tagName === 'H3' ||
    el.tagName === 'H4' ||
    el.tagName === 'H5' ||
    el.tagName === 'H6'
  );

  for (let pos = startIndex + 1; pos < endIndex; pos++) {
    const el = allNodes[pos];
    if (!el) continue;
    if (startEl && startEl.contains(el)) continue;
    if (endEl && endEl.contains(el)) break;

    let isChildOfAdded = false;
    for (const parent of added) {
      if (parent.contains(el)) {
        isChildOfAdded = true;
        break;
      }
    }
    if (isChildOfAdded) continue;

    if (!isContentElement(el)) continue;

    const text = (el.textContent || '').trim();
    if (text) contentParts.push(text);
    rawHtmlParts.push(el.outerHTML || '');
    added.add(el);
  }

  const content = canonicalizeText(contentParts.join('\n\n'));
  const rawHtml = rawHtmlParts.join('\n');
  return { content, rawHtml };
}

export async function extractChaptersByToc({ zip, baseDir, tocEntries }) {
  /** @type {Array<{title: string, href: string}>} */
  const entries = (tocEntries || []).filter((e) => e?.href);
  if (entries.length === 0) {
    return [];
  }

  const byFile = new Map();
  entries.forEach((entry, index) => {
    const href = String(entry.href || '');
    const [pathPart, fragPart] = href.split('#');
    const filePath = resolveZipPath(baseDir || '', pathPart);
    const fragment = fragPart ? String(fragPart) : null;
    const list = byFile.get(filePath) || [];
    list.push({ index, title: String(entry.title || '').trim(), href, fragment });
    byFile.set(filePath, list);
  });

  /** @type {Array<{id: string, title: string, content: string, rawHtml: string, href: string}>} */
  const chapters = [];

  for (const [filePath, list] of byFile.entries()) {
    const html = await zip.file(filePath)?.async('text');
    if (!html) continue;
    // Many EPUBs ship malformed XHTML; parse as HTML for robustness.
    const dom = new JSDOM(html, { contentType: 'text/html' });
    const doc = dom.window.document;
    const body = doc.querySelector('body');
    if (!body) continue;

    const sorted = list.slice().sort((a, b) => a.index - b.index);
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = sorted[i + 1] || null;
      let startEl = current.fragment ? findFragmentElement(doc, current.fragment) : null;
      let endEl = next?.fragment ? findFragmentElement(doc, next.fragment) : null;

      if (startEl && typeof startEl.closest === 'function') {
        const closestHeading = startEl.closest('h1,h2,h3,h4,h5,h6');
        if (closestHeading && body.contains(closestHeading)) startEl = closestHeading;
      }
      if (endEl && typeof endEl.closest === 'function') {
        const closestHeading = endEl.closest('h1,h2,h3,h4,h5,h6');
        if (closestHeading && body.contains(closestHeading)) endEl = closestHeading;
      }

      // If the fragment points to a container (e.g. <section id="...">), extract from within it.
      const containerTags = new Set(['SECTION', 'ARTICLE', 'DIV', 'MAIN']);
      const startTag = startEl?.tagName ? String(startEl.tagName).toUpperCase() : '';
      let content;
      let rawHtml;
      if (current.fragment && startEl && containerTags.has(startTag)) {
        content = extractTextContentFromBody(startEl);
        rawHtml = startEl.innerHTML || '';
      } else {
        ({ content, rawHtml } = extractContentBetween(body, startEl, endEl));
      }

      if (!content) continue;

      const hrefKey = `${filePath}#${current.fragment || ''}`;
      const id = `toc-${fnv1a32HexFromString(hrefKey)}`;
      const fallbackTitle = startEl ? (startEl.textContent || '').trim() : '';
      chapters.push({
        id,
        title: current.title || fallbackTitle || `Chapter ${chapters.length + 1}`,
        content,
        rawHtml,
        href: current.href
      });
    }
  }

  return chapters;
}

function extractTextContentFromBody(body) {
  const blocks = [];
  const elements = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li, blockquote');
  if (!elements || elements.length === 0) {
    return canonicalizeText((body.textContent || '').trim());
  }
  elements.forEach((el) => {
    const text = (el.textContent || '').trim();
    if (text) blocks.push(text);
  });
  return canonicalizeText(blocks.join('\n\n'));
}

export async function extractChaptersFromSpine({ zip, opfDir, manifestItems, spineIdrefs }) {
  const hrefs = (spineIdrefs || [])
    .map((idref) => manifestItems.get(String(idref))?.href || null)
    .filter(Boolean)
    .map(String);

  /** @type {Array<{id: string, title: string, content: string, rawHtml: string, href: string}>} */
  const chapters = [];

  for (let i = 0; i < hrefs.length; i++) {
    const href = hrefs[i];
    const filePath = resolveZipPath(opfDir || '', href);
    const html = await zip.file(filePath)?.async('text');
    if (!html) continue;

    const dom = new JSDOM(html, { contentType: 'application/xhtml+xml' });
    const doc = dom.window.document;
    const body = doc.querySelector('body');
    if (!body) continue;

    const content = extractTextContentFromBody(body);
    if (!content) continue;

    const heading = doc.querySelector('h1, h2, h3, title');
    const title = (heading?.textContent || '').trim() || `Chapter ${chapters.length + 1}`;

    chapters.push({
      id: `spine-${fnv1a32HexFromString(filePath)}`,
      title,
      content,
      rawHtml: body.innerHTML || '',
      href
    });
  }

  return chapters;
}
