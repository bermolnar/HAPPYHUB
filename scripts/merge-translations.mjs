// Kézzel/Claude-dal futtatott segédscript: a data/pending.json-ban váró, még angol cikkekhez
// tartozó magyar fordításokat beemeli a data/news.json-ba, és törli őket a pending listából.
//
// Használat:
//   node scripts/merge-translations.mjs translations.json
//
// A translations.json tartalma egy tömb, minden eleme a pending.json egy tételének ID-jét
// és a hozzá tartozó magyar fordítást adja meg:
//   [{ "id": "a9fb297dd135", "title": "Magyar cím...", "excerpt": "Magyar kivonat..." }, ...]
//
// Azok a pending tételek, amikhez nincs fordítás a bemeneti fájlban, egyszerűen bent maradnak
// a pending.json-ban (legközelebb lehet velük folytatni).

import { readFile, writeFile } from "node:fs/promises";

const NEWS_FILE = new URL("../data/news.json", import.meta.url);
const PENDING_FILE = new URL("../data/pending.json", import.meta.url);
const MAX_ITEMS_TOTAL = 80;

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

async function main() {
  const translationsPath = process.argv[2];
  if (!translationsPath) {
    console.error("Használat: node scripts/merge-translations.mjs translations.json");
    process.exit(1);
  }

  const translations = JSON.parse(await readFile(translationsPath, "utf8"));
  if (!Array.isArray(translations)) {
    throw new Error("A fordítás-fájlnak egy JSON tömbnek kell lennie.");
  }

  const news = await loadJsonArray(NEWS_FILE);
  const pending = await loadJsonArray(PENDING_FILE);
  const pendingById = new Map(pending.map((it) => [it.id, it]));

  const newEntries = [];
  const mergedIds = new Set();

  for (const t of translations) {
    const source = pendingById.get(t.id);
    if (!source) {
      console.warn(`[warn] Nincs pending tétel ehhez az id-hoz, kihagyva: ${t.id}`);
      continue;
    }
    if (!t.title || !t.excerpt) {
      console.warn(`[warn] Hiányzó title/excerpt, kihagyva: ${t.id}`);
      continue;
    }
    newEntries.push({
      id: source.id,
      title: t.title,
      excerpt: t.excerpt,
      url: source.url,
      source: source.source,
      publishedAt: source.publishedAt,
      fetchedAt: new Date().toISOString(),
    });
    mergedIds.add(t.id);
  }

  if (newEntries.length === 0) {
    console.log("Nem sikerült egyetlen tételt sem párosítani, nem módosítok semmit.");
    return;
  }

  const mergedNews = [...newEntries, ...news]
    .filter((it, idx, arr) => arr.findIndex((o) => o.id === it.id) === idx)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS_TOTAL);

  const remainingPending = pending.filter((it) => !mergedIds.has(it.id));

  await writeFile(NEWS_FILE, JSON.stringify(mergedNews, null, 2) + "\n", "utf8");
  await writeFile(PENDING_FILE, JSON.stringify(remainingPending, null, 2) + "\n", "utf8");

  console.log(`Kész: ${newEntries.length} hír lefordítva és átemelve. data/news.json most ${mergedNews.length} hírt tartalmaz, data/pending.json-ban ${remainingPending.length} maradt.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
