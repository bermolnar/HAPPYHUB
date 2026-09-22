// Ez a script CSAK a GitHub Actions-ben fut (ütemezve), nem a böngészőben – a statikus
// oldal build lépés nélkül marad, csak a data/news.json-t fogyasztja.
//
// Mit csinál:
//   1. Letölti a dedikált, kifejezetten jó/pozitív híreket közlő angol RSS forrásokat.
//   2. Kiszűri, mi az, amit még nem láttunk (data/news.json alapján).
//   3. Az új cikkeket (címüket + egy rövid kivonatukat) lefordítja magyarra az Anthropic API-val.
//   4. A fordított tételeket hozzáfűzi a data/news.json-hoz, és a fájlt naprakészen tartja
//      (a legrégebbi tételeket levágja, hogy ne nőjön a végtelenségig).
//
// Szándékosan NEM másolja/fordítja le a teljes cikket – csak cím + rövid kivonat, és a lábjegyzet
// mindig a forrásra és az eredeti cikkre mutat (attribúció, szerzői jogi okokból is).

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const DATA_FILE = new URL("../data/news.json", import.meta.url);
const MAX_ITEMS_TOTAL = 80; // ennyi hírt tartunk meg összesen a JSON-ban
const MAX_NEW_PER_FEED = 4; // ennyi új cikket veszünk át forrásonként futásonként (API-költség korlát)
const ANTHROPIC_MODEL = "claude-sonnet-5";

const FEEDS = [
  { source: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/" },
  { source: "Positive News", url: "https://www.positive.news/feed/" },
  { source: "Reasons to be Cheerful", url: "https://reasonstobecheerful.world/feed/" },
  { source: "The Optimist Daily", url: "https://www.optimistdaily.com/feed/" },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: "__cdata",
});

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#8230;|…/g, "...")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "object" && "__cdata" in node) return node.__cdata;
  return String(node);
}

function idFor(url) {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

async function loadExisting() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function fetchFeedItems(feed) {
  const res = await fetch(feed.url, {
    headers: { "user-agent": "HappyHub/1.0 (+https://github.com/bermolnar/HAPPYHUB)" },
  });
  if (!res.ok) {
    console.warn(`[warn] ${feed.source}: HTTP ${res.status}, kihagyva`);
    return [];
  }
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.map((item) => {
    const link = textOf(item.link).trim();
    const title = stripHtml(textOf(item.title));
    const description = stripHtml(textOf(item.description)).slice(0, 400);
    const pubDateRaw = textOf(item.pubDate);
    const publishedAt = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString();
    return { source: feed.source, url: link, title, excerpt: description, publishedAt };
  }).filter((it) => it.url && it.title);
}

async function translateBatch(items) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Hiányzik az ANTHROPIC_API_KEY environment variable.");
  }
  if (items.length === 0) return [];

  const prompt = `Az alábbi angol nyelvű, jó híreket dolgozom fel egy magyar nyelvű, kizárólag pozitív híreket közlő oldalhoz (HappyHub).
Fordítsd magyarra természetes, újságírói stílusban az egyes cikkek CÍMÉT és egy rövid, 1-2 mondatos KIVONATÁT a megadott angol kivonat alapján.
Ne találj ki új tényeket, csak a megadott szöveg alapján fordíts/tömöríts.

Válaszolj KIZÁRÓLAG egy JSON tömbbel, semmi mással (se magyarázat, se markdown code fence). A tömb elemeinek sorrendje pontosan egyezzen a bemenettel, minden elem alakja:
{"title_hu": "...", "excerpt_hu": "..."}

Bemenet (JSON):
${JSON.stringify(items.map((it) => ({ title: it.title, excerpt: it.excerpt })), null, 2)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Anthropic API hiba: HTTP ${res.status} ${bodyText.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`Nem sikerült JSON tömböt kiolvasni a fordítás válaszából: ${text.slice(0, 300)}`);
  }
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length !== items.length) {
    throw new Error("A fordítás válasza nem egyezik a bemenet elemszámával.");
  }
  return parsed;
}

async function main() {
  const existing = await loadExisting();
  const existingUrls = new Set(existing.map((it) => it.url));

  const candidates = [];
  for (const feed of FEEDS) {
    let items = [];
    try {
      items = await fetchFeedItems(feed);
    } catch (err) {
      console.warn(`[warn] ${feed.source} letöltése sikertelen: ${err.message}`);
      continue;
    }
    const fresh = items.filter((it) => !existingUrls.has(it.url)).slice(0, MAX_NEW_PER_FEED);
    candidates.push(...fresh);
  }

  console.log(`Talált ${candidates.length} új cikket a(z) ${FEEDS.length} forrásból.`);

  if (candidates.length === 0) {
    console.log("Nincs új tartalom, nem módosítok semmit.");
    return;
  }

  const translations = await translateBatch(candidates);

  const newEntries = candidates.map((item, i) => ({
    id: idFor(item.url),
    title: translations[i].title_hu,
    excerpt: translations[i].excerpt_hu,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    fetchedAt: new Date().toISOString(),
  }));

  const merged = [...newEntries, ...existing]
    .filter((it, idx, arr) => arr.findIndex((o) => o.id === it.id) === idx) // dedup id szerint
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS_TOTAL);

  await writeFile(DATA_FILE, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(`Frissítve: data/news.json (${merged.length} hír, ${newEntries.length} új).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
