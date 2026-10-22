/* Daily Hub
   Every card shows one thing. Which thing is decided by today's date, so it
   stays the same all day and changes at midnight. Ticks and saves live in
   localStorage, and every read or write is wrapped so nothing can break. */

(() => {
  "use strict";

  const STORE_KEY = "daily-hub.v1";
  const DAY_MS = 86400000;

  /* ---------- Dates ---------- */

  const now = new Date();
  const todayKey = localDateKey(now);
  const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
  // Weeks start on Monday. 1 Jan 1970 was a Thursday, so shift by 3 days.
  const weekNumber = Math.floor((dayNumber + 3) / 7);
  const weekKey = "week-" + weekNumber;

  function localDateKey(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* ---------- Picking ---------- */

  // A small seeded random generator, so a shuffle is the same on every device.
  function seeded(seedText) {
    let h = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i++) {
      h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Each list is shuffled once in a fixed order, then we walk through it one
  // step per day. Every item appears before anything repeats.
  function pick(list, name, step) {
    if (!list || !list.length) return null;
    const order = list.map((_, i) => i);
    const rand = seeded("daily-hub:" + name);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const cycle = Math.floor(step / list.length);
    // Rotate the order a little each cycle so the sequence does not feel identical.
    return list[order[(step + cycle * 7) % list.length]];
  }

  /* ---------- Storage ---------- */

  function emptyState() {
    return { days: {}, weeks: {}, saved: [], notes: {} };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyState();
      const data = JSON.parse(raw);
      return {
        days: data.days || {},
        weeks: data.weeks || {},
        saved: Array.isArray(data.saved) ? data.saved : [],
        notes: data.notes || {},
      };
    } catch (e) {
      return emptyState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* Private browsing or full storage: the page still works for today. */
    }
  }

  const state = load();

  function isDone(id) {
    return !!(state.days[todayKey] && state.days[todayKey][id]);
  }

  function toggleDone(id) {
    const day = state.days[todayKey] || (state.days[todayKey] = {});
    if (day[id]) delete day[id];
    else day[id] = true;
    persist();
    return !!day[id];
  }

  function isWatched(id) {
    return !!(state.weeks[weekKey] && state.weeks[weekKey][id]);
  }

  function toggleWatched(id) {
    const week = state.weeks[weekKey] || (state.weeks[weekKey] = {});
    if (week[id]) delete week[id];
    else week[id] = true;
    persist();
    return !!week[id];
  }

  // Notes are optional and kept per day: notes["2026-10-22"].mind = { prompt, text }.
  function getNote(id) {
    const day = state.notes[todayKey];
    return (day && day[id] && day[id].text) || "";
  }

  function setNote(id, prompt, text) {
    const day = state.notes[todayKey] || (state.notes[todayKey] = {});
    if (text.trim()) day[id] = { prompt, text };
    else delete day[id];
    if (!Object.keys(day).length) delete state.notes[todayKey];
    persist();
  }

  function allNotes() {
    const out = [];
    Object.keys(state.notes).sort().reverse().forEach((day) => {
      Object.values(state.notes[day]).forEach((n) => out.push({ day, ...n }));
    });
    return out;
  }

  function savedKey(type, id) {
    return type + ":" + id;
  }

  function isSaved(type, id) {
    const key = savedKey(type, id);
    return state.saved.some((s) => s.key === key);
  }

  function toggleSaved(item) {
    const i = state.saved.findIndex((s) => s.key === item.key);
    if (i >= 0) state.saved.splice(i, 1);
    else state.saved.unshift({ ...item, savedOn: todayKey });
    persist();
    updateSavedCount();
    return i < 0;
  }

  /* ---------- Data ---------- */

  async function getJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  /* ---------- Small helpers ---------- */

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  const HEART_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z"/></svg>';

  function heartButton(item) {
    const saved = isSaved(item.type, item.id);
    const btn = el(
      '<button class="heart' + (saved ? " is-saved" : "") + '" aria-pressed="' + saved +
      '" aria-label="' + (saved ? "Remove from saved" : "Save") + '">' + HEART_SVG + "</button>"
    );
    btn.addEventListener("click", () => {
      const on = toggleSaved({ ...item, key: savedKey(item.type, item.id) });
      btn.classList.toggle("is-saved", on);
      btn.setAttribute("aria-pressed", on);
      btn.setAttribute("aria-label", on ? "Remove from saved" : "Save");
    });
    return btn;
  }

  function tickButton(id, label, doneLabel, opts) {
    const weekly = opts && opts.weekly;
    const done = weekly ? isWatched(id) : isDone(id);
    const btn = el(
      '<button class="tick' + (done ? " is-done" : "") + '" aria-pressed="' + done + '">' +
      esc(done ? doneLabel : label) + "</button>"
    );
    btn.addEventListener("click", () => {
      const on = weekly ? toggleWatched(id) : toggleDone(id);
      btn.classList.toggle("is-done", on);
      btn.setAttribute("aria-pressed", on);
      btn.textContent = on ? doneLabel : label;
    });
    return btn;
  }

  // Artwork images are stored with the app (public domain copies), so they
  // load fast, work offline and do not depend on a museum's server.
  function artImage(art) {
    return "images/art/" + art.id + ".jpg";
  }



  function youtube(query) {
    return "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
  }

  function jubileeSearch(query) {
    return "https://www.youtube.com/@jubilee/search?query=" + encodeURIComponent(query);
  }

  function imageSearch(query) {
    return "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(query);
  }

  function mapLink(place) {
    return "https://www.google.com/maps/search/" + encodeURIComponent(place);
  }

  function linkButton(href, label, cls) {
    return '<a class="pill-link' + (cls ? " " + cls : "") + '" target="_blank" rel="noopener" href="' + esc(href) + '">' + esc(label) + "</a>";
  }

  // Small line icons, one per area, used on the Today tiles.
  const ICONS = {
    art: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="8.5" r="1.5"/>',
    place: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    politics: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    debate: '<path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-4"/>',
    watch: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
    move: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    mind: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.3 0 3 5.5 1.7 5.5 4.6 0 1.3-1.3 2.4-3 2.4-1.2 0-2.3-.6-2.8-1.6M12 5.5v1.5M12 17v1.5"/>',
  };

  function icon(name) {
    return '<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICONS[name] || "") + "</svg></span>";
  }

  // An optional place to write. Nothing is required; it saves as you type.
  function noteBox(id, prompt, placeholder) {
    const box = el(
      '<div class="note">' +
        '<textarea class="note__input" rows="3" placeholder="' + esc(placeholder || "Write it down, if you like. Only you can see this.") + '"></textarea>' +
        '<p class="note__status" aria-live="polite"></p>' +
      "</div>"
    );
    const input = box.querySelector("textarea");
    const status = box.querySelector(".note__status");
    input.value = getNote(id);
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setNote(id, prompt, input.value);
        status.textContent = input.value.trim() ? "Saved" : "";
      }, 400);
    });
    return box;
  }

  function fact(label, text) {
    return '<li><span class="facts__label">' + esc(label) + "</span><span>" + esc(text) + "</span></li>";
  }

  function lessonTag(lesson) {
    return '<p class="lesson-tag">' + esc(lesson.strandName) + " · " + esc(lesson.unit) +
      ' <span>Lesson ' + (lesson.index + 1) + " of " + lesson.total + "</span></p>";
  }

  /* ---------- Lesson cards ---------- */

  function classicArtCard(l) {
    const a = l.item;
    const bio = a.bio || {};
    const card = el(
      '<article class="card art">' +
        '<div class="art__frame"><img alt="" decoding="async"></div>' +
        lessonTag(l) +
        '<h2 class="card__title">' + esc(a.title) + "</h2>" +
        '<p class="card__meta">' + esc(a.artist) + " · " + esc(a.date) + "</p>" +
        '<div class="card__body">' +
          '<p class="facts__label">Why it matters</p>' +
          "<p>" + esc(a.why) + "</p>" +
        "</div>" +
        '<div class="artist">' +
          '<p class="facts__label">About the artist</p>' +
          '<p class="artist__name">' + esc(a.artist) + " <span>" + esc(bio.life || "") + "</span></p>" +
          '<ul class="facts">' +
            (bio.from ? fact("Where from", bio.from) : "") +
            (bio.who ? fact("Who they were", bio.who) : "") +
            (bio.goodAt ? fact("What they were good at", bio.goodAt) : "") +
          "</ul>" +
        "</div>" +
        '<div class="card__links">' +
          linkButton(youtube(a.title + " " + a.artist + " art history"), "Watch a video about it", "pill-link--solid") +
          linkButton(youtube(a.artist + " biography documentary"), "About " + a.artist.split(" ").pop()) +
        "</div>" +
      "</article>"
    );
    const img = card.querySelector("img");
    img.alt = a.title + " by " + a.artist;
    img.addEventListener("load", () => img.classList.add("is-loaded"));
    img.addEventListener("error", () => { card.querySelector(".art__frame").remove(); });
    img.src = artImage(a);
    card.prepend(heartButton({
      type: "art", id: a.id, title: a.title, sub: a.artist + ", " + a.date, thumb: artImage(a),
      link: "https://www.artic.edu/artworks/" + a.id,
    }));
    return card;
  }

  function contemporaryCard(l) {
    const c = l.item;
    const card = el(
      '<article class="card contemp">' +
        '<div class="contemp__band">' +
          lessonTag(l) +
          '<h2 class="contemp__name">' + esc(c.name) + "</h2>" +
          '<p class="card__meta">' + esc(c.from) + " · " + esc(c.medium) + "</p>" +
        "</div>" +
        '<div class="artist">' +
          '<p class="facts__label">About the artist</p>' +
          '<ul class="facts">' + fact("Who they are", c.who) + fact("What they're good at", c.goodAt) + "</ul>" +
        "</div>" +
        '<div class="card__body">' +
          '<p class="facts__label">Key work</p>' +
          '<p class="contemp__work">' + esc(c.work) + " <span>" + esc(c.year) + "</span></p>" +
          "<p>" + esc(c.about) + "</p>" +
          '<ul class="facts">' + fact("The politics", c.politics) + fact("Look for", c.lookFor) + "</ul>" +
        "</div>" +
        '<div class="card__links">' +
          linkButton(imageSearch(c.search), "See the work", "pill-link--solid") +
          linkButton(youtube(c.video), "Watch on YouTube") +
        "</div>" +
      "</article>"
    );
    card.prepend(heartButton({
      type: "contemporary", id: c.id, title: c.name, sub: c.work + ", " + c.year, link: imageSearch(c.search),
    }));
    return card;
  }

  function placeCard(l) {
    const p = l.item;
    const card = el(
      '<article class="card place">' +
        lessonTag(l) +
        '<div class="place__head">' +
          '<img class="place__flag" alt="Flag of ' + esc(p.name) + '" src="https://flagcdn.com/' + p.code.toLowerCase() + '.svg">' +
          '<h2 class="card__title">' + esc(p.name) + "</h2>" +
        "</div>" +
        '<p class="card__meta">Capital ' + esc(p.capital) + " · " + esc(p.languages) + "</p>" +
        '<div class="card__body">' +
          '<p class="facts__label">Geography</p>' +
          '<ul class="facts">' + fact("Where it is", p.where) + fact("The land", p.land) + "</ul>" +
          '<p class="facts__label section-gap">Politics</p>' +
          '<ul class="facts">' + fact("How it's governed", p.government) + fact("The big question", p.issue) + "</ul>" +
          '<p class="facts__label section-gap">Culture</p>' +
          '<ul class="facts">' +
            fact("A dish", p.dish) + fact(p.personRole || "An artist or writer", p.person) +
            fact("A custom", p.custom) + fact("Did you know", p.fact) +
          "</ul>" +
        "</div>" +
        '<div class="card__links">' +
          linkButton(mapLink(p.name), "See it on a map", "pill-link--solid") +
          linkButton(youtube(p.name + " geography explained"), "Watch an explainer") +
        "</div>" +
      "</article>"
    );
    const flag = card.querySelector(".place__flag");
    flag.addEventListener("error", () => flag.remove());
    card.prepend(heartButton({
      type: "place", id: p.code, title: p.name, sub: p.unit,
      thumb: "https://flagcdn.com/w160/" + p.code.toLowerCase() + ".png",
    }));
    return card;
  }

  function politicsCard(l) {
    const x = l.item;
    let body = "";
    if (l.kind === "ideology") {
      body =
        '<p class="card__lede">' + esc(x.oneLine) + "</p>" +
        '<ul class="facts">' +
          fact("What it believes", x.believes) + fact("Where it came from", x.origins) +
          fact("Its strongest critics say", x.critics) + fact("Names to know", x.thinkers) +
        "</ul>";
    } else {
      body = "<p>" + esc(x.explain) + "</p>";
      if (x.sides) {
        body += '<div class="sides">' +
          '<div class="side"><p class="facts__label">One side</p><p>' + esc(x.sides.for) + "</p></div>" +
          '<div class="side"><p class="facts__label">The other side</p><p>' + esc(x.sides.against) + "</p></div>" +
        "</div>";
      }
      if (x.terms) {
        body += '<p class="facts__label section-gap">Key terms</p><p class="terms">' +
          x.terms.map((t) => "<span>" + esc(t) + "</span>").join("") + "</p>";
      }
      if (x.think) body += '<p class="facts__label section-gap">Think about</p><p class="think">' + esc(x.think) + "</p>";
    }
    const title = l.kind === "ideology" ? x.name : x.title;
    const card = el(
      '<article class="card politics">' +
        lessonTag(l) +
        '<h2 class="card__title">' + esc(title) + "</h2>" +
        '<div class="card__body">' + body + "</div>" +
        '<div class="card__links">' +
          linkButton(youtube(x.video || title + " explained"), "Watch an explainer", "pill-link--solid") +
        "</div>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "politics", id: x.id, title, sub: l.unit, link: youtube(x.video || title + " explained") }));
    return card;
  }

  function lessonCard(l) {
    if (l.strand === "art") return l.kind === "classic" ? classicArtCard(l) : contemporaryCard(l);
    if (l.strand === "geo") return placeCard(l);
    return politicsCard(l);
  }

  /* ---------- Other cards ---------- */

  function watchCard(w) {
    const card = el(
      '<article class="card watch">' +
        '<p class="card__kicker">' + esc(weekendLabel()) + "</p>" +
        '<h2 class="card__title">' + esc(w.title) + "</h2>" +
        '<p class="card__meta">' + esc(w.year) + " · " + esc(w.director) + " · " + esc(w.minutes) + " min" +
          '<span class="watch__type">' + esc(w.kind) + "</span></p>" +
        '<div class="card__body">' +
          "<p>" + esc(w.why) + "</p>" +
          '<ul class="facts">' +
            '<li><span class="facts__label">Watch for</span><ul class="watch__list">' +
              w.watchFor.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></li>" +
            '<li><span class="facts__label">After</span><span class="after">' + esc(w.after) + "</span></li>" +
          "</ul>" +
        "</div>" +
        '<div class="card__links">' +
          linkButton("https://www.justwatch.com/uk/search?q=" + encodeURIComponent(w.title), "Where to watch", "pill-link--solid") +
          linkButton(youtube(w.title + " " + w.year + " trailer"), "Trailer") +
        "</div>" +
        '<div class="card__foot"></div>' +
      "</article>"
    );
    card.querySelector(".card__foot").append(tickButton("watch:" + w.id, "Watched", "Watched", { weekly: true }));
    card.append(noteBox("watch:" + w.id, w.after, "Your thoughts after watching, if you like."));
    card.prepend(heartButton({
      type: "watch", id: w.id, title: w.title, sub: w.year + " · " + w.director,
      link: "https://www.justwatch.com/uk/search?q=" + encodeURIComponent(w.title),
    }));
    return card;
  }

  function quietCard(kicker, title, body, tick) {
    const card = el(
      '<article class="card card--quiet">' +
        '<p class="card__kicker">' + esc(kicker) + "</p>" +
        '<h2 class="card__title">' + esc(title) + "</h2>" +
        (body ? '<div class="card__body"><p class="card__small">' + body + "</p></div>" : "") +
        '<div class="card__foot"></div>' +
      "</article>"
    );
    if (tick) card.querySelector(".card__foot").append(tick);
    return card;
  }

  function moveCard(meal) {
    const card = el(
      '<article class="card card--quiet">' +
        '<p class="card__kicker">Move</p>' +
        '<div class="move__row"><h2 class="card__title">A walk, any length</h2></div>' +
        '<div class="move__meal">' +
          '<span class="facts__label">A simple meal idea</span>' +
          '<p class="move__meal-name">' + esc(meal.name) + "</p>" +
          '<p class="card__small">' + esc(meal.how) + "</p>" +
        "</div>" +
      "</article>"
    );
    card.querySelector(".move__row").append(tickButton("walk", "Walked", "Walked"));
    return card;
  }

  function quoteCard(q) {
    const card = el(
      '<article class="card">' +
        '<p class="card__kicker">Thought for today</p>' +
        '<blockquote class="quote">' + esc(q.text) + "</blockquote>" +
        '<p class="quote__who">' + esc(q.who) + "</p>" +
        '<div class="card__body"><p class="card__small">' + esc(q.context) + "</p></div>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "idea", id: q.id, title: '"' + q.text + '"', sub: q.who }));
    return card;
  }

  const DEBATE_QUESTION = "What was the strongest point from the side you disagreed with?";
  const NHS_LINK = "https://www.nhs.uk/nhs-services/mental-health-services/find-nhs-talking-therapies-for-anxiety-and-depression/";

  function jubileeCard(j, skill) {
    const card = el(
      '<article class="card jubilee">' +
        '<p class="card__kicker">Watch a debate</p>' +
        '<h2 class="card__title">Jubilee: ' + esc(j.series) + "</h2>" +
        '<div class="card__body">' +
          '<p class="card__small">' + esc(j.what) + "</p>" +
          '<div class="lens">' +
            '<span class="facts__label">Watch it through this lens</span>' +
            "<p><strong>" + esc(skill.name) + ".</strong> " + esc(skill.watchFor) + "</p>" +
          "</div>" +
        "</div>" +
        '<div class="card__links">' + linkButton(jubileeSearch(j.query), "Find one on YouTube", "pill-link--solid") + "</div>" +
        '<div class="card__foot"></div>' +
      "</article>"
    );
    card.querySelector(".card__foot").append(tickButton("jubilee", "Watched one", "Watched one"));
    return card;
  }

  function skillCard(skill) {
    const card = el(
      '<article class="card">' +
        '<p class="card__kicker">Debate skill</p>' +
        '<h2 class="card__title">' + esc(skill.name) + "</h2>" +
        '<div class="card__body">' +
          "<p>" + esc(skill.idea) + "</p>" +
          '<ul class="facts">' + fact("Try it", skill.tryIt) + "</ul>" +
        "</div>" +
        '<div class="card__links">' + linkButton(youtube(skill.video), "Watch a video on this", "pill-link--solid") + "</div>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "skill", id: skill.id, title: skill.name, sub: skill.tryIt, link: youtube(skill.video) }));
    return card;
  }

  function reflectionCard() {
    const card = quietCard("After a debate", DEBATE_QUESTION, "", tickButton("debate", "Reflected", "Reflected"));
    card.append(noteBox("debate", DEBATE_QUESTION, "The point, in a line or two, if you like."));
    return card;
  }

  function moneyCard(m) {
    return quietCard("Money · " + m.track, m.item.step, esc(m.item.note || ""), tickButton("money", "Done", "Done"));
  }

  function mindCard(prompt) {
    const card = quietCard("Mind", prompt, "", tickButton("mind", "Sat with it", "Sat with it"));
    card.querySelector(".card__foot").prepend(el(
      '<a class="card__link" target="_blank" rel="noopener" href="' + NHS_LINK + '">NHS Talking Therapies: refer yourself</a>'
    ));
    card.append(noteBox("mind", prompt));
    return card;
  }

  /* ---------- The course ---------- */

  // The course runs one lesson per day by date, in order, from its first day.
  // Each strand loops back to the start when it reaches the end.
  const COURSE_START = Math.floor(Date.UTC(2026, 9, 23) / DAY_MS);
  const courseDay = Math.max(0, dayNumber - COURSE_START);

  const weekday = now.getDay();
  const isWeekend = weekday === 5 || weekday === 6 || weekday === 0;

  function weekendLabel() {
    return isWeekend ? "Your weekend film" : "Film for the weekend";
  }

  function buildCourse(art, artists, contemporary, places, ideas, politics) {
    const strand = (key, name, items) => items.map((x, i) => ({ ...x, strand: key, strandName: name, index: i, total: items.length }));

    const classic = (art || [])
      .filter((a) => a.image)
      .sort((a, b) => a.order - b.order)
      .map((a) => ({ kind: "classic", unit: a.movement, title: a.title, item: { ...a, bio: (artists || {})[a.artist] } }));
    const modern = (contemporary || [])
      .slice()
      .sort((a, b) => a.year_sort - b.year_sort)
      .map((c) => ({ kind: "contemporary", unit: "Contemporary", title: c.name, item: c }));

    const geo = (places || []).map((p) => ({ kind: "place", unit: p.unit, title: p.name, item: p }));

    const pol = [];
    for (const u of (politics && politics.units) || []) {
      if (u.from === "ideologies") {
        for (const i of (ideas && ideas.ideologies) || []) pol.push({ kind: "ideology", unit: u.name, title: i.name, item: i });
      } else {
        for (const l of u.lessons) pol.push({ kind: l.sides ? "debate" : "lesson", unit: u.name, title: l.title, item: l });
      }
    }

    return {
      art: strand("art", "Art", classic.concat(modern)),
      geo: strand("geo", "Geography", geo),
      politics: strand("politics", "Politics", pol),
    };
  }

  function todaysLesson(list) {
    return list && list.length ? list[courseDay % list.length] : null;
  }

  let picksPromise = null;

  function loadPicks() {
    if (picksPromise) return picksPromise;
    const files = ["art", "artists", "contemporary", "places", "ideas", "politics", "watch", "debate", "move", "money", "mind"];
    picksPromise = Promise.all(files.map((n) => getJSON("data/" + n + ".json"))).then(
      ([art, artists, contemporary, places, ideas, politics, watch, debate, move, money, mind]) => {
        const course = buildCourse(art, artists, contemporary, places, ideas, politics);
        return {
          course,
          art: todaysLesson(course.art),
          geo: todaysLesson(course.geo),
          politics: todaysLesson(course.politics),
          quote: ideas && pick(ideas.quotes, "quotes", dayNumber),
          watch: watch && pick(watch, "watch", weekNumber),
          jubilee: debate && pick(debate.jubilee, "jubilee", dayNumber),
          skill: debate && pick(debate.skills, "skills", dayNumber),
          meal: move && pick(move, "move", dayNumber),
          money: money && pickMoney(money),
          mind: mind && pick(mind, "mind", dayNumber),
        };
      }
    );
    return picksPromise;
  }

  // Money rotates between three tracks: debt, job, side income.
  function pickMoney(money) {
    const tracks = [
      ["Debt", money.debt],
      ["Job", money.job],
      ["Side income", money.side],
    ];
    const [track, list] = tracks[dayNumber % 3];
    const item = pick(list, "money-" + track, Math.floor(dayNumber / 3));
    return item ? { track, item } : null;
  }

  /* ---------- Today tiles ---------- */

  // A dashboard tile. Tapping it opens the full card; a tick inside works on the spot.
  function tile(o) {
    const t = el(
      '<article class="tile' + (o.cls ? " " + o.cls : "") + '" tabindex="0" role="link" aria-label="Open ' + esc(o.kicker) + '">' +
        (o.thumb ? '<div class="tile__media"><img alt="" fetchpriority="high" src="' + esc(o.thumb) + '"></div>' : "") +
        '<div class="tile__text">' +
          '<p class="tile__kicker">' + icon(o.icon) + esc(o.kicker) + "</p>" +
          '<h3 class="tile__title">' + esc(o.title) + "</h3>" +
          (o.sub ? '<p class="tile__sub">' + esc(o.sub) + "</p>" : "") +
          (o.body ? '<p class="tile__body">' + esc(o.body) + "</p>" : "") +
        "</div>" +
      "</article>"
    );
    const img = t.querySelector(".tile__media img");
    if (img) img.addEventListener("error", () => img.parentElement.remove());
    if (o.tick) t.append(o.tick);
    const open = (e) => {
      if (e.target.closest(".tick, a")) return;
      location.hash = o.view;
    };
    t.addEventListener("click", open);
    t.addEventListener("keydown", (e) => { if (e.key === "Enter") open(e); });
    return t;
  }

  function lessonLink(l) {
    return "lesson/" + l.strand + "/" + l.index;
  }

  function lessonCount(l) {
    return l.strandName + " · Lesson " + (l.index + 1) + " of " + l.total;
  }

  function renderToday(root, p) {
    const grid = el('<div class="dash"></div>');
    const add = (node) => node && grid.append(node);

    const watchTile = p.watch && tile({
      icon: "watch", cls: "tile--watch", view: "watch", kicker: weekendLabel(), title: p.watch.title,
      sub: p.watch.year + " · " + p.watch.director + " · " + p.watch.minutes + " min",
      tick: tickButton("watch:" + p.watch.id, "Watched", "Watched", { weekly: true }),
    });

    if (isWeekend) add(watchTile);

    if (p.art) {
      const a = p.art.item;
      add(p.art.kind === "classic"
        ? tile({
            icon: "art", cls: "tile--art", view: lessonLink(p.art), kicker: lessonCount(p.art), title: a.title,
            sub: a.artist + " · " + a.movement, body: a.bio ? a.bio.who : a.why, thumb: artImage(a),
          })
        : tile({
            icon: "art", cls: "tile--contemp", view: lessonLink(p.art), kicker: lessonCount(p.art), title: a.name,
            sub: a.work + ", " + a.year, body: a.who,
          }));
    }
    if (p.geo) add(tile({
      icon: "place", view: lessonLink(p.geo), kicker: lessonCount(p.geo), title: p.geo.item.name,
      sub: p.geo.unit, body: p.geo.item.issue, thumb: "https://flagcdn.com/w160/" + p.geo.item.code.toLowerCase() + ".png", cls: "tile--flag",
    }));
    if (p.politics) add(tile({
      icon: "politics", view: lessonLink(p.politics), kicker: lessonCount(p.politics),
      title: p.politics.title, sub: p.politics.unit,
    }));
    if (!isWeekend) add(watchTile);
    if (p.quote) add(tile({ icon: "idea", cls: "tile--wide tile--quote", view: "course", kicker: "Thought for today", title: '"' + p.quote.text + '"', sub: p.quote.who }));
    if (p.jubilee && p.skill) add(tile({
      icon: "debate", view: "debate", kicker: "Debate", title: "Jubilee: " + p.jubilee.series,
      sub: "Skill: " + p.skill.name, tick: tickButton("jubilee", "Watched one", "Watched one"),
    }));
    add(tile({
      icon: "debate", view: "debate", kicker: "Reflect", title: "The strongest point from the other side?",
      tick: tickButton("debate", "Reflected", "Reflected"),
    }));
    if (p.mind) add(tile({
      icon: "mind", cls: "tile--wide", view: "wellbeing", kicker: "Mind", title: p.mind,
      sub: getNote("mind") ? "You wrote something today" : "Tap to write it down, if you like",
    }));
    if (p.meal) add(tile({
      icon: "move", view: "wellbeing", kicker: "Move", title: "A walk, any length", sub: "Meal idea: " + p.meal.name,
      tick: tickButton("walk", "Walked", "Walked"),
    }));
    if (p.money) add(tile({
      icon: "money", view: "money", kicker: "Money · " + p.money.track, title: p.money.item.step,
      tick: tickButton("money", "Done", "Done"),
    }));

    root.append(grid);
  }

  /* ---------- Course view ---------- */

  function renderCourse(root, p) {
    root.append(el(
      '<header class="course-head">' +
        '<p class="card__kicker">Your course</p>' +
        '<h2 class="course-head__title">Day ' + (courseDay + 1) + "</h2>" +
        '<p class="card__small">One lesson in each subject, every day. Miss a day and nothing changes: browse any lesson below whenever you like.</p>' +
      "</header>"
    ));
    for (const l of [p.art, p.geo, p.politics]) if (l) root.append(lessonCard(l));
    if (p.quote) root.append(quoteCard(p.quote));

    const outline = el('<section class="outline"><h2 class="outline__title">The full course</h2></section>');
    for (const [key, list] of Object.entries(p.course)) {
      if (!list.length) continue;
      const todayIndex = courseDay % list.length;
      const strand = el(
        '<details class="outline__strand"' + (key === "art" ? " open" : "") + ">" +
          "<summary><span>" + esc(list[0].strandName) + "</span><span class=\"outline__count\">" + list.length + " lessons</span></summary>" +
        "</details>"
      );
      let unit = null;
      let ul = null;
      for (const l of list) {
        if (l.unit !== unit) {
          unit = l.unit;
          strand.append(el('<p class="outline__unit">' + esc(unit) + "</p>"));
          ul = el('<ol class="outline__list"></ol>');
          strand.append(ul);
        }
        const isToday = l.index === todayIndex;
        ul.append(el(
          '<li><a href="#' + lessonLink(l) + '"' + (isToday ? ' class="is-today"' : "") + ">" +
            '<span class="outline__n">' + (l.index + 1) + "</span>" + esc(l.title) +
            (isToday ? '<span class="outline__badge">Today</span>' : "") +
          "</a></li>"
        ));
      }
      outline.append(strand);
    }
    root.append(outline);
  }

  function renderLesson(root, p, strandKey, index) {
    const list = p.course[strandKey];
    const l = list && list[index];
    root.append(el('<a class="back" href="#course">Back to the course</a>'));
    if (!l) {
      root.append(el('<p class="empty">That lesson could not be found.</p>'));
      return;
    }
    root.append(lessonCard(l));
    const nav = el('<nav class="lesson-nav"></nav>');
    if (index > 0) nav.append(el('<a href="#' + lessonLink(list[index - 1]) + '">Previous</a>'));
    if (index < list.length - 1) nav.append(el('<a href="#' + lessonLink(list[index + 1]) + '">Next</a>'));
    root.append(nav);
  }

  /* ---------- Saved ---------- */

  const SAVED_GROUPS = [
    ["art", "Art"],
    ["contemporary", "Contemporary artists"],
    ["place", "Places"],
    ["politics", "Politics"],
    ["idea", "Quotes"],
    ["skill", "Debate skills"],
    ["watch", "Films and documentaries"],
  ];

  function renderSaved(root) {
    const notes = allNotes();
    if (!state.saved.length && !notes.length) {
      root.append(el('<p class="empty">Nothing saved yet. Tap the heart on anything you would like to keep, or write a note on the Mind, Debate or Film cards.</p>'));
      return;
    }
    if (notes.length) {
      const group = el('<section class="saved__group"><h2>Your notes</h2></section>');
      for (const n of notes) {
        group.append(el(
          '<div class="saved__note">' +
            '<p class="saved__sub">' + esc(formatDay(n.day)) + " · " + esc(n.prompt) + "</p>" +
            '<p class="saved__note-text">' + esc(n.text) + "</p>" +
          "</div>"
        ));
      }
      root.append(group);
    }
    for (const [type, title] of SAVED_GROUPS) {
      const items = state.saved.filter((s) => s.type === type);
      if (!items.length) continue;
      const group = el('<section class="saved__group"><h2>' + esc(title) + "</h2></section>");
      for (const item of items) {
        const row = el(
          '<div class="saved__item">' +
            (item.thumb ? '<img class="saved__thumb" alt="" loading="lazy" src="' + esc(item.thumb) + '">' : "") +
            '<div class="saved__text">' +
              '<p class="saved__title">' +
                (item.link ? '<a href="' + esc(item.link) + '" target="_blank" rel="noopener">' + esc(item.title) + "</a>" : esc(item.title)) +
              "</p>" +
              '<p class="saved__sub">' + esc(item.sub || "") + "</p>" +
            "</div>" +
          "</div>"
        );
        row.append(heartButton(item));
        group.append(row);
      }
      root.append(group);
    }
  }

  function formatDay(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }

  function updateSavedCount() {
    const n = state.saved.length;
    document.getElementById("saved-count").textContent = n ? "(" + n + ")" : "";
  }

  /* ---------- Views ---------- */

  const VIEWS = {
    today: (root, p) => renderToday(root, p),
    course: (root, p) => renderCourse(root, p),
    debate: (root, p) => {
      if (p.jubilee && p.skill) root.append(jubileeCard(p.jubilee, p.skill));
      if (p.skill) root.append(skillCard(p.skill));
      root.append(reflectionCard());
    },
    watch: (root, p) => { if (p.watch) root.append(watchCard(p.watch)); },
    wellbeing: (root, p) => {
      if (p.mind) root.append(mindCard(p.mind));
      if (p.meal) root.append(moveCard(p.meal));
    },
    money: (root, p) => { if (p.money) root.append(moneyCard(p.money)); },
    saved: (root) => renderSaved(root),
  };

  // "#lesson/art/12" opens one lesson; anything else is a tab name.
  function parseHash() {
    const parts = location.hash.replace("#", "").split("/");
    if (parts[0] === "lesson" && parts.length === 3) return { view: "lesson", tab: "course", strand: parts[1], index: Number(parts[2]) };
    const name = VIEWS[parts[0]] ? parts[0] : "today";
    return { view: name, tab: name };
  }

  async function render(route) {
    const root = document.getElementById("view");
    const p = route.view === "saved" ? null : await loadPicks();
    root.innerHTML = "";
    root.className = "view view--" + route.view;
    if (route.view === "lesson") renderLesson(root, p, route.strand, route.index);
    else VIEWS[route.view](root, p);
    if (!root.children.length) {
      root.append(el('<p class="empty">Today\'s page could not load. It will be here when you are back online.</p>'));
    }
  }

  /* ---------- Tabs ---------- */

  function showView() {
    const route = parseHash();
    document.querySelectorAll(".tabs__btn").forEach((b) => {
      const on = b.getAttribute("href") === "#" + route.tab;
      b.classList.toggle("is-active", on);
      if (on) {
        b.setAttribute("aria-current", "page");
        b.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else {
        b.removeAttribute("aria-current");
      }
    });
    render(route);
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", showView);

  /* ---------- Start ---------- */

  document.getElementById("today-date").textContent = now.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
  updateSavedCount();
  showView();

  // If the app is left open past midnight, refresh when it is looked at again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && localDateKey(new Date()) !== todayKey) location.reload();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then((reg) => reg.update())
        .catch(() => {});
    });
  }
})();
