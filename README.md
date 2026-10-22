# Daily Hub

A daily page with a running course in art, geography and politics, plus a debate, a weekend film and small wellbeing and money steps. The course moves on one lesson a day by date, starting 23 October 2026; any lesson can be opened from the Course tab. The film changes every Monday.

## How it works

- `index.html`, `style.css`, `app.js`: the page, the look and the logic. No build step.
- `data/*.json`: all the content. Edit these to add or change items. Lists can be any length.
- `images/art/`: public domain artwork images (copies from Wikimedia Commons; originals at the Art Institute of Chicago). Artworks in `art.json` without an `image` are skipped.
- `sw.js` and `manifest.json`: make it installable on a phone and usable offline.
- Ticks and saves are stored in your browser only (`localStorage`). They do not sync between devices yet.

## Google Calendar

`calendar.ics` holds a daily learning slot (19:30 to 19:50) and a Saturday film night for the year ahead. Subscribe from the "Add to Google Calendar" button in the app. To change the times, edit the top of `tools/build-calendar.mjs` and run:

```bash
node tools/build-calendar.mjs
```

A GitHub Action (`.github/workflows/calendar.yml`) rebuilds it every Monday so it stays a year ahead.

## Run it locally

```bash
python3 -m http.server 4180
```

Then open http://localhost:4180.

## Publishing changes

Edit files, then:

```bash
git add -A && git commit -m "Update content" && git push
```

GitHub Pages republishes within a minute or two. If your phone shows the old version, close and reopen the app.
