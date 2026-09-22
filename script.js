const newsGrid = document.getElementById("news-grid");
const heroStats = document.getElementById("hero-stats");
const categoryFilters = document.getElementById("category-filters");

const dateFormatter = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" });

let allItems = [];
let categoriesById = new Map();
let activeCategory = "all";

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function renderFilters() {
  const categories = [...categoriesById.values()];

  const allPill = document.createElement("button");
  allPill.type = "button";
  allPill.className = "filter-pill" + (activeCategory === "all" ? " active" : "");
  allPill.dataset.category = "all";
  allPill.textContent = "🌈 Összes";
  allPill.style.setProperty("--pill-color", "#78716c");

  categoryFilters.innerHTML = "";
  categoryFilters.appendChild(allPill);

  for (const cat of categories) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "filter-pill" + (activeCategory === cat.id ? " active" : "");
    pill.dataset.category = cat.id;
    pill.textContent = `${cat.emoji} ${cat.label}`;
    pill.style.setProperty("--pill-color", cat.color);
    categoryFilters.appendChild(pill);
  }

  categoryFilters.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-pill");
    if (!btn) return;
    activeCategory = btn.dataset.category;
    renderFilters();
    renderNews();
  });
}

function renderNews() {
  const items = activeCategory === "all" ? allItems : allItems.filter((it) => it.category === activeCategory);

  if (!items.length) {
    newsGrid.innerHTML = '<p class="news-error">Ebben a kategóriában jelenleg nincs hír, nézz vissza hamarosan.</p>';
  } else {
    newsGrid.innerHTML = "";
    for (const item of items) {
      const cat = categoriesById.get(item.category);
      const card = document.createElement("a");
      card.className = "news-card";
      card.href = item.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";

      if (cat) {
        const { r, g, b } = hexToRgb(cat.color);
        card.style.setProperty("--card-accent", cat.color);
        card.style.setProperty("--card-accent-soft", `rgba(${r}, ${g}, ${b}, 0.14)`);
      }

      const catLabel = cat ? `${cat.emoji} ${cat.label}` : "Jó hír";

      card.innerHTML = `
        <div class="news-card-top">
          <span class="news-category">${escapeHtml(catLabel)}</span>
          <span class="news-date">${escapeHtml(formatRelative(item.publishedAt))}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="news-excerpt">${escapeHtml(item.excerpt)}</p>
        <div class="news-card-bottom">
          <span class="news-source">Forrás: ${escapeHtml(item.source)}</span>
          <span class="news-cta">Elolvasom →</span>
        </div>
      `;
      newsGrid.appendChild(card);
    }
  }

  const countLabel = activeCategory === "all" ? `${allItems.length} jó hír vár rád` : `${items.length} jó hír ebben a kategóriában`;
  heroStats.textContent = `🌞 ${countLabel}`;
}

async function loadNews() {
  try {
    const [newsRes, categoriesRes] = await Promise.all([
      fetch("data/news.json", { cache: "no-store" }),
      fetch("data/categories.json", { cache: "no-store" }),
    ]);
    if (!newsRes.ok) throw new Error(`HTTP ${newsRes.status} (news)`);
    if (!categoriesRes.ok) throw new Error(`HTTP ${categoriesRes.status} (categories)`);

    const [items, categories] = await Promise.all([newsRes.json(), categoriesRes.json()]);
    categoriesById = new Map(categories.map((c) => [c.id, c]));

    allItems = items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    renderFilters();
    renderNews();
  } catch (err) {
    console.error("Nem sikerült betölteni a híreket:", err);
    newsGrid.innerHTML = '<p class="news-error">Nem sikerült betölteni a híreket. Próbáld frissíteni az oldalt.</p>';
  }
}

loadNews();
