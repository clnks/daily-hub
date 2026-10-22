# Daily Hub

A calm, one-screen daily page. Each card shows one thing, chosen by today's date, so it stays the same all day and changes at midnight. The film card changes every Monday.

## How it works

- `index.html`, `style.css`, `app.js`: the page, the look and the logic. No build step.
- `data/*.json`: all the content. Edit these to add or change items. Lists can be any length.
- `images/art/`: public domain artwork images (copies from Wikimedia Commons; originals at the Art Institute of Chicago). Artworks in `art.json` without an `image` are skipped.
- `sw.js` and `manifest.json`: make it installable on a phone and usable offline.
- Ticks and saves are stored in your browser only (`localStorage`). They do not sync between devices yet.

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
