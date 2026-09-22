# HappyHub

Magyar nyelvű oldal, amely **kizárólag pozitív híreket** gyűjt össze a világból, a cél a pozitív
világkép erősítése.

## Hogyan működik

- A megjelenő oldal (`index.html` + `styles.css` + `script.js`) build nélküli, statikus oldal –
  a `data/news.json`-t olvassa ki futásidőben és jeleníti meg kártyákként.
- A `data/news.json`-t **nem kézzel** töltjük fel: egy ütemezett GitHub Actions workflow
  (`.github/workflows/update-news.yml`) naponta 3x lefuttatja a `scripts/fetch-news.mjs` scriptet:
  1. Letölt néhány dedikált, kizárólag jó híreket közlő angol RSS forrást (Good News Network,
     Positive News, Reasons to be Cheerful, The Optimist Daily).
  2. Kiszűri, mi az, amit még nem láttunk korábban (URL alapján).
  3. Az új cikkek címét és egy rövid kivonatát lefordítja magyarra az Anthropic API-val (Claude).
     **Nem** másolja/fordítja le a teljes cikket – szerzői jogi okokból is csak egy rövid
     összefoglalót ad hozzá, és mindig az eredeti cikkre mutató linket jelenít meg forrásmegjelöléssel.
  4. A `data/news.json`-t frissíti (legfeljebb 80 hírt tart meg, a legrégebbieket levágja), és ha
     változott, commitolja+pusholja a repóba.
- Az oldal GitHub Pages-en fut, tehát minden ilyen automatikus commit után magától frissül az élő oldal.

## Futtatás / tesztelés helyben

```sh
python3 -m http.server 8000
# majd: http://localhost:8000
```

A hírgyűjtő script kézi futtatásához Node.js kell (helyben ~/.local alá lett telepítve, ha nincs
globálisan telepítve):

```sh
npm install
ANTHROPIC_API_KEY=sk-... npm run fetch-news
```

## Szükséges GitHub secret

- `ANTHROPIC_API_KEY` – a fordításhoz szükséges Anthropic API kulcs. A repo Settings → Secrets and
  variables → Actions alatt kell beállítani, hogy az ütemezett workflow tudjon fordítani. Enélkül a
  workflow lefut, de hibával leáll a fordítási lépésnél.

## Deploy

GitHub Pages-ről fut, a `main` branch gyökeréből. Nincs build lépés, nincs Rackhost/FTP – az oldal
teljesen a GitHub-on él, minden frissítés automatikus commit útján kerül ki.

## Amit még érdemes átgondolni

- Jelenleg csak angol nyelvű forrásokból dolgozunk (nincs kifejezetten jó híreket közlő magyar
  RSS forrás), ezért minden hír fordítva jelenik meg. Ha kerül elő releváns magyar forrás, érdemes
  hozzáadni a `scripts/fetch-news.mjs` `FEEDS` listájához.
- A fordítás cikkenkénti Anthropic API hívással jár, ami valós (bár kicsi) költséggel jár – a
  `MAX_NEW_PER_FEED` konstans korlátozza, hogy forrásonként futásonként max hány új cikket veszünk át.
