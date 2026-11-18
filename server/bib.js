import { parseBibEntries } from "./files.js";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "on", "in", "for", "to", "with", "and", "or", "at", "by", "from", "is", "are", "über", "der", "die", "das",
  "ein", "eine", "einer", "eines", "und", "oder", "zur", "zum", "von", "im", "in", "mit", "für", "auf", "aus", "bei", "des", "dem",
  "den", "als", "zu", "an", "am", "vom", "einem", "einen", "ist", "sind", "unter", "nach", "vor", "wie", "was",
]);

function asciiFold(s) {
  return String(s)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");
}

function decodeHtml(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function firstAuthorLastName(author) {
  if (!author) return "";
  const first = String(author).split(/\s+and\s+/i)[0].trim();
  if (!first) return "";
  if (first.includes(",")) return first.split(",")[0].trim();
  const parts = first.split(/\s+/);
  return parts[parts.length - 1];
}

export function makeKey({ author, year, title }, existingKeys = new Set()) {
  const last = asciiFold(firstAuthorLastName(author)).toLowerCase() || "unbekannt";
  const y = String(year || "").match(/\d{4}/)?.[0] || "oJ";
  const words = String(title || "")
    .replace(/[{}]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const word = asciiFold(words[0] || "").toLowerCase();
  let key = `${last}${y}${word}`;
  if (!existingKeys.has(key)) return key;
  for (const suffix of "abcdefghijklmnopqrstuvwxyz") {
    if (!existingKeys.has(key + suffix)) return key + suffix;
  }
  return `${key}${Date.now()}`;
}

const FIELD_ORDER = [
  "author", "editor", "title", "subtitle", "journal", "journaltitle", "booktitle", "year", "date", "volume", "number", "pages",
  "publisher", "address", "location", "edition", "series", "institution", "school", "type", "howpublished", "doi", "isbn", "issn",
  "url", "urldate", "eprint", "eprinttype", "archiveprefix", "primaryclass", "note", "keywords", "abstract",
];

export function formatBibtex({ type, key, fields }) {
  const names = Object.keys(fields).filter((k) => fields[k] !== undefined && fields[k] !== null && String(fields[k]).trim() !== "");
  names.sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a);
    const ib = FIELD_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
  });
  const width = Math.max(...names.map((n) => n.length), 6);
  const lines = names.map((n) => `  ${n.padEnd(width)} = {${String(fields[n]).trim()}}`);
  return `@${type}{${key},\n${lines.join(",\n")}\n}\n`;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": "ThesisLeaf/2.0 (lokaler LaTeX-Editor)", ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

export function classifyQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return { kind: "empty", value: "" };
  const doi = q.replace(/^doi:\s*/i, "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").match(/10\.\d{4,9}\/[^\s"<>]+/);
  if (doi) return { kind: "doi", value: doi[0].replace(/[.,;)]+$/, "") };
  const arx = q.match(/(?:arxiv:|arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (arx && /arxiv|^\d{4}\.\d{4,5}(v\d+)?$/i.test(q)) return { kind: "arxiv", value: arx[1] };
  const digits = q.replace(/[-\s]/g, "").replace(/^isbn:?/i, "");
  if (/^(97[89])?\d{9}[\dXx]$/.test(digits)) return { kind: "isbn", value: digits };
  if (/^https?:\/\//i.test(q)) return { kind: "url", value: q };
  return { kind: "unknown", value: q };
}

async function lookupDoi(doi) {
  const res = await fetchWithTimeout(`https://doi.org/${encodeURI(doi)}`, {
    headers: { Accept: "application/x-bibtex; charset=utf-8" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`DOI nicht gefunden (HTTP ${res.status})`);
  const text = decodeHtml(await res.text());
  const [entry] = parseBibEntries(text);
  if (!entry) throw new Error("Antwort enthielt keinen BibTeX-Eintrag");
  const fields = {};
  for (const [k, v] of Object.entries(entry.fields)) {
    if (["month", "issn", "isbn"].includes(k) && !v) continue;
    fields[k.toLowerCase()] = v;
  }
  if (!fields.doi) fields.doi = doi;
  delete fields.url;
  if (fields.journal && !fields.journaltitle) {
    /* biblatex versteht journal als Alias */
  }
  return { type: entry.type, fields, source: "doi.org" };
}

async function lookupIsbn(isbn) {
  const ol = await fetchWithTimeout(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  if (ol.ok) {
    const data = await ol.json();
    const book = data[`ISBN:${isbn}`];
    if (book) {
      const fields = {
        author: (book.authors || []).map((a) => a.name).join(" and "),
        title: book.title,
        subtitle: book.subtitle,
        publisher: (book.publishers || []).map((p) => p.name).join(" and "),
        year: String(book.publish_date || "").match(/\d{4}/)?.[0],
        isbn,
        address: (book.publish_places || []).map((p) => p.name)[0],
        pagetotal: book.number_of_pages ? String(book.number_of_pages) : undefined,
      };
      return { type: "book", fields, source: "openlibrary.org" };
    }
  }
  const gb = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  if (gb.ok) {
    const data = await gb.json();
    const info = data.items?.[0]?.volumeInfo;
    if (info) {
      return {
        type: "book",
        fields: {
          author: (info.authors || []).join(" and "),
          title: info.title,
          subtitle: info.subtitle,
          publisher: info.publisher,
          year: String(info.publishedDate || "").match(/\d{4}/)?.[0],
          isbn,
          pagetotal: info.pageCount ? String(info.pageCount) : undefined,
        },
        source: "books.google.com",
      };
    }
  }
  throw new Error("ISBN in keiner Datenbank gefunden");
}

async function lookupArxiv(id) {
  const res = await fetchWithTimeout(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`arXiv nicht erreichbar (HTTP ${res.status})`);
  const xml = await res.text();
  const entry = xml.split("<entry>")[1];
  if (!entry) throw new Error("arXiv-Eintrag nicht gefunden");
  const get = (tag) => decodeHtml((entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || "").replace(/\s+/g, " ").trim();
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => decodeHtml(m[1]).trim());
  const published = get("published");
  const doi = (entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/) || [])[1];
  const primary = (entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [])[1];
  return {
    type: "misc",
    fields: {
      author: authors.join(" and "),
      title: get("title"),
      year: published.slice(0, 4),
      eprint: id,
      eprinttype: "arxiv",
      primaryclass: primary,
      doi: doi ? doi.trim() : undefined,
      url: `https://arxiv.org/abs/${id}`,
      urldate: today(),
    },
    source: "arxiv.org",
  };
}

async function lookupUrl(url) {
  let title = "";
  let site = "";
  let author = "";
  let date = "";
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: "text/html" } }, 10000);
    if (res.ok) {
      const html = (await res.text()).slice(0, 400000);
      const og = (name) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, "i")) || [])[1];
      title = decodeHtml(og("og:title") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim();
      site = decodeHtml(og("og:site_name") || "");
      author = decodeHtml(og("author") || og("article:author") || "");
      date = (og("article:published_time") || og("date") || "").match(/\d{4}/)?.[0] || "";
    }
  } catch {
    /* ohne Metadaten weiter */
  }
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return {
    type: "online",
    fields: {
      author: author || undefined,
      title: title || host || url,
      organization: site || undefined,
      year: date || undefined,
      url,
      urldate: today(),
    },
    source: host || "url",
  };
}

/** Freitextsuche (Titel, Autor, Stichwörter) über CrossRef – liefert Kandidaten zum Import per DOI. */
export async function searchReferences(query, rows = 10) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${rows}&select=DOI,title,author,issued,container-title,type,publisher,is-referenced-by-count`;
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 15000);
  if (!res.ok) throw new Error(`CrossRef nicht erreichbar (HTTP ${res.status})`);
  const data = await res.json();
  return (data.message?.items || []).map((it) => ({
    doi: it.DOI,
    title: decodeHtml((it.title || [])[0] || "").replace(/\s+/g, " "),
    authors: (it.author || []).map((a) => [a.family, a.given].filter(Boolean).join(", ")).slice(0, 6),
    year: it.issued?.["date-parts"]?.[0]?.[0] || "",
    venue: decodeHtml((it["container-title"] || [])[0] || it.publisher || ""),
    type: it.type || "",
    cited: it["is-referenced-by-count"] || 0,
  }));
}

/** Sucht Metadaten zu DOI, ISBN, arXiv-ID oder URL und baut einen BibTeX-Eintrag. */
export async function lookupReference(query, existingKeys = []) {
  const cls = classifyQuery(query);
  let result;
  if (cls.kind === "doi") result = await lookupDoi(cls.value);
  else if (cls.kind === "isbn") result = await lookupIsbn(cls.value);
  else if (cls.kind === "arxiv") result = await lookupArxiv(cls.value);
  else if (cls.kind === "url") result = await lookupUrl(cls.value);
  else if (cls.kind === "empty") throw new Error("Bitte DOI, ISBN, arXiv-ID oder URL eingeben");
  else throw new Error("Eingabe nicht erkannt. Unterstützt: DOI (10.xxxx/…), ISBN, arXiv-ID, URL");

  const fields = {};
  for (const [k, v] of Object.entries(result.fields)) {
    if (v === undefined || v === null || String(v).trim() === "") continue;
    fields[k] = String(v).replace(/\s+/g, " ").trim();
  }
  if (fields.title) fields.title = fields.title.replace(/^\{+|\}+$/g, "");
  const key = makeKey({ author: fields.author || fields.editor, year: fields.year || fields.date, title: fields.title }, new Set(existingKeys));
  const bibtex = formatBibtex({ type: result.type, key, fields });
  return { kind: cls.kind, key, type: result.type, fields, bibtex, source: result.source };
}

/** Prüft eine .bib-Datei auf typische Probleme (doppelte Schlüssel, fehlende Pflichtfelder). */
export function checkBib(text) {
  const entries = parseBibEntries(text);
  const issues = [];
  const seen = new Map();
  const required = {
    article: ["author", "title", "journal|journaltitle", "year|date"],
    book: ["author|editor", "title", "publisher", "year|date"],
    inproceedings: ["author", "title", "booktitle", "year|date"],
    incollection: ["author", "title", "booktitle", "year|date"],
    online: ["title", "url"],
    misc: ["title"],
    phdthesis: ["author", "title", "school|institution", "year|date"],
    mastersthesis: ["author", "title", "school|institution", "year|date"],
    thesis: ["author", "title", "institution|school", "year|date"],
    techreport: ["author|institution", "title", "year|date"],
  };
  for (const e of entries) {
    if (seen.has(e.key)) issues.push({ severity: "warning", line: e.line, message: `Schlüssel „${e.key}“ doppelt (zuerst in Zeile ${seen.get(e.key)})` });
    else seen.set(e.key, e.line);
    const req = required[e.type] || [];
    for (const r of req) {
      const alternatives = r.split("|");
      if (!alternatives.some((a) => e.fields[a])) {
        issues.push({ severity: "info", line: e.line, message: `${e.key}: Feld „${alternatives[0]}“ fehlt` });
      }
    }
    if (e.type === "online" && !e.fields.urldate) issues.push({ severity: "info", line: e.line, message: `${e.key}: Abrufdatum (urldate) fehlt` });
  }
  return { entries: entries.length, issues };
}
