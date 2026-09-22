# HappyHub

Magyar nyelvű oldal, amely **kizárólag pozitív híreket** gyűjt össze a világból, a cél a pozitív
világkép erősítése.

## Hogyan működik

- A megjelenő oldal (`index.html` + `styles.css` + `script.js`) build nélküli, statikus oldal –
  a `data/news.json`-t olvassa ki futásidőben és jeleníti meg kártyákként.
- A tartalom két lépésben áll össze, **nincs szükség külső AI API-kulcsra**:
  1. **Automatikus gyűjtés** (`.github/workflows/update-news.yml`, naponta 3x): a
     `scripts/fetch-news.mjs` letölt néhány dedikált, kizárólag jó híreket közlő angol RSS forrást
     (Good News Network, Positive News, Reasons to be Cheerful, The Optimist Daily), kiszűri az
     újakat, és a még LEFORDÍTATLAN cikkeket a `data/pending.json`-ba írja. Ez a lépés commitol,
     ha van új jelölt.
  2. **Fordítás Claude-dal, kézzel/interaktívan**: amikor legközelebb egy Claude Code munkamenetben
     dolgozunk az oldalon, Claude elolvassa a `data/pending.json`-t, lefordítja az új tételek
     címét és rövid kivonatát magyarra, majd a `scripts/merge-translations.mjs`-szel átemeli őket a
     `data/news.json`-ba (és törli a pending listából). Ez a lépés jelenleg **nem automatikus** –
     nincs ütemezve, csak akkor történik meg, amikor kérjük.
  - Egyik lépés sem másolja/fordítja le a teljes cikket – szerzői jogi okokból is csak egy rövid
    összefoglaló kerül át, és mindig az eredeti cikkre mutató link jelenik meg forrásmegjelöléssel.
- Az oldal GitHub Pages-en fut, tehát minden `data/news.json`-t érintő commit után magától
  frissül az élő oldal.

## Futtatás / tesztelés helyben

```sh
python3 -m http.server 8000
# majd: http://localhost:8000
```

A gyűjtő/fordító scriptek futtatásához Node.js kell (helyben ~/.local alá lett telepítve, ha nincs
globálisan telepítve):

```sh
npm install
npm run fetch-news                       # új angol jelöltek a data/pending.json-ba
npm run merge-translations translations.json  # lefordított tételek átemelése a data/news.json-ba
```

## Deploy

GitHub Pages-ről fut, a `main` branch gyökeréből. Nincs build lépés, nincs Rackhost/FTP – az oldal
teljesen a GitHub-on él, minden frissítés automatikus commit útján kerül ki.

## Amit még érdemes átgondolni

- Jelenleg csak angol nyelvű forrásokból dolgozunk (nincs kifejezetten jó híreket közlő magyar
  RSS forrás), ezért minden hír fordítva jelenik meg. Ha kerül elő releváns magyar forrás, érdemes
  hozzáadni a `scripts/fetch-news.mjs` `FEEDS` listájához.
- A fordítási lépés jelenleg kézi/interaktív (a `data/pending.json` gyűlhet, ha egy ideig nem
  nyitunk munkamenetet) – ha ez idővel gondot okoz, érdemes lehet visszatérni egy API-kulcs alapú
  automatikus fordításra.
- Borítóképek a hírkártyákhoz: még nincs megoldva, lásd a nyitott feladatok között.
