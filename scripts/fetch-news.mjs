// Ez a script CSAK a GitHub Actions-ben fut (ütemezve), nem a böngészőben – a statikus
// oldal build lépés nélkül marad, csak a data/news.json-t fogyasztja.
//
// Mit csinál:
//   1. Letölti a dedikált, kifejezetten jó/pozitív híreket közlő angol RSS forrásokat.
//   2. Kiszűri, mi az, amit még nem láttunk (sem a data/news.json-ban, sem a data/pending.json-ban).
//   3. Az új (még angol, LEFORDÍTATLAN) cikkeket hozzáfűzi a data/pending.json-hoz.
//
// A fordítást SZÁNDÉKOSAN nem ez a script végzi (nincs hozzá külső AI API-kulcs) – azt Claude
// végzi kézzel/interaktívan egy munkamenetben, majd a scripts/merge-translations.mjs-szel kerülnek
// át a lefordított tételek a data/pending.json-ból a data/news.json-ba. Lásd README.md.
//
// Szándékosan NEM másolja/fordítja le a teljes cikket – csak cím + rövid kivonat, és a lábjegyzet
// mindig a forrásra és az eredeti cikkre mutat (attribúció, szerzői jogi okokból is).

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const NEWS_FILE = new URL("../data/news.json", import.meta.url);
const PENDING_FILE = new URL("../data/pending.json", import.meta.url);
const MAX_NEW_PER_FEED = 4; // ennyi új cikket veszünk át forrásonként futásonként
const MAX_PENDING_TOTAL = 60; // ne nőjön a végtelenségig, ha senki nem fordítja le egy ideig

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
    .replace(/&#821[678];/g, "'")
    .replace(/&#822[01];/g, '"')
    .replace(/&#821[12];/g, "-")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
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

async function loadJsonArray(fileUrl) {
  try {
    const raw = await readFile(fileUrl, "utf8");
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

async function main() {
  const existingNews = await loadJsonArray(NEWS_FILE);
  const existingPending = await loadJsonArray(PENDING_FILE);
  const knownUrls = new Set([...existingNews.map((it) => it.url), ...existingPending.map((it) => it.url)]);

  const candidates = [];
  for (const feed of FEEDS) {
    let items = [];
    try {
      items = await fetchFeedItems(feed);
    } catch (err) {
      console.warn(`[warn] ${feed.source} letöltése sikertelen: ${err.message}`);
      continue;
    }
    const fresh = items.filter((it) => !knownUrls.has(it.url)).slice(0, MAX_NEW_PER_FEED);
    candidates.push(...fresh);
  }

  console.log(`Talált ${candidates.length} új (még lefordítatlan) cikket a(z) ${FEEDS.length} forrásból.`);

  if (candidates.length === 0) {
    console.log("Nincs új tartalom, nem módosítok semmit.");
    return;
  }

  const newPendingEntries = candidates.map((item) => ({
    id: idFor(item.url),
    title: item.title,
    excerpt: item.excerpt,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    fetchedAt: new Date().toISOString(),
  }));

  const mergedPending = [...existingPending, ...newPendingEntries]
    .filter((it, idx, arr) => arr.findIndex((o) => o.id === it.id) === idx)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_PENDING_TOTAL);

  await writeFile(PENDING_FILE, JSON.stringify(mergedPending, null, 2) + "\n", "utf8");
  console.log(`Frissítve: data/pending.json (${mergedPending.length} fordításra váró hír, ${newPendingEntries.length} új).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
