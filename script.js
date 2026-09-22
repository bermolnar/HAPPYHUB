const newsGrid = document.getElementById("news-grid");
const heroStats = document.getElementById("hero-stats");

const dateFormatter = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" });

function formatRelative(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "ma";
  if (diffDays === 1) return "tegnap";
  if (diffDays < 7) return `${diffDays} napja`;
  return dateFormatter.format(date);
}

function renderNews(items) {
  if (!items.length) {
    newsGrid.innerHTML = '<p class="news-error">Jelenleg nincs megjeleníthető hír, nézz vissza hamarosan.</p>';
    return;
  }

  newsGrid.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("a");
    card.className = "news-card";
    card.href = item.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    card.innerHTML = `
      <div class="news-card-top">
        <span class="news-source">${escapeHtml(item.source)}</span>
        <span class="news-date">${escapeHtml(formatRelative(item.publishedAt))}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="news-excerpt">${escapeHtml(item.excerpt)}</p>
      <span class="news-cta">Elolvasom az eredeti cikket →</span>
    `;
    newsGrid.appendChild(card);
  }

  heroStats.textContent = `🌞 ${items.length} jó hír vár rád`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function loadNews() {
  try {
    const res = await fetch("data/news.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    renderNews(items);
  } catch (err) {
    console.error("Nem sikerült betölteni a híreket:", err);
    newsGrid.innerHTML = '<p class="news-error">Nem sikerült betölteni a híreket. Próbáld frissíteni az oldalt.</p>';
  }
}

loadNews();
