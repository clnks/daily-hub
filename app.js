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

  function linkButton(href, label, cls) {
    return '<a class="pill-link' + (cls ? " " + cls : "") + '" target="_blank" rel="noopener" href="' + esc(href) + '">' + esc(label) + "</a>";
  }

  // Small line icons, one per area, used on the overview tiles.
  const ICONS = {
    art: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="8.5" r="1.5"/>',
    contemp: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    place: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    debate: '<path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-4"/>',
    watch: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
    move: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    mind: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.3 0 3 5.5 1.7 5.5 4.6 0 1.3-1.3 2.4-3 2.4-1.2 0-2.3-.6-2.8-1.6M12 5.5v1.5M12 17v1.5"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
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

  /* ---------- Cards ---------- */

  function artCard(art) {
    const card = el(
      '<article class="card art tone-art">' +
        '<div class="art__frame"><img alt="" decoding="async"></div>' +
        '<p class="card__kicker">Art</p>' +
        '<h2 class="card__title">' + esc(art.title) + "</h2>" +
        '<p class="card__meta">' + esc(art.artist) + " · " + esc(art.date) + "</p>" +
        '<div class="card__body">' +
          '<p class="facts__label">Why it matters</p>' +
          "<p>" + esc(art.why) + "</p>" +
        "</div>" +
        '<div class="card__links">' +
          linkButton(youtube(art.title + " " + art.artist + " art history"), "Watch a video about it", "pill-link--solid") +
          linkButton("https://www.artic.edu/artworks/" + art.id, "See it at the museum") +
        "</div>" +
      "</article>"
    );
    const img = card.querySelector("img");
    img.alt = art.title + " by " + art.artist;
    img.addEventListener("load", () => img.classList.add("is-loaded"));
    img.addEventListener("error", () => { card.querySelector(".art__frame").remove(); });
    img.src = artImage(art);
    card.prepend(heartButton({
      type: "art", id: art.id, title: art.title,
      sub: art.artist + ", " + art.date, thumb: artImage(art),
      link: "https://www.artic.edu/artworks/" + art.id,
    }));
    return card;
  }

  function contemporaryCard(c) {
    const card = el(
      '<article class="card contemp tone-contemp">' +
        '<div class="contemp__band">' +
          '<p class="card__kicker">Contemporary art</p>' +
          '<h2 class="contemp__name">' + esc(c.name) + "</h2>" +
          '<p class="card__meta">' + esc(c.from) + " · " + esc(c.medium) + "</p>" +
        "</div>" +
        '<div class="card__body">' +
          '<p class="contemp__work">' + esc(c.work) + ' <span>' + esc(c.year) + "</span></p>" +
          "<p>" + esc(c.about) + "</p>" +
          '<ul class="facts">' +
            '<li><span class="facts__label">The politics</span><span>' + esc(c.politics) + "</span></li>" +
            '<li><span class="facts__label">Look for</span><span>' + esc(c.lookFor) + "</span></li>" +
          "</ul>" +
        "</div>" +
        '<div class="card__links">' +
          linkButton(imageSearch(c.search), "See the work", "pill-link--solid") +
          linkButton(youtube(c.video), "Watch on YouTube") +
        "</div>" +
      "</article>"
    );
    card.prepend(heartButton({
      type: "contemporary", id: c.id, title: c.name, sub: c.work + ", " + c.year,
      link: imageSearch(c.search),
    }));
    return card;
  }

  function placeCard(place) {
    const card = el(
      '<article class="card place tone-place">' +
        '<p class="card__kicker">A place</p>' +
        '<div class="place__head">' +
          '<img class="place__flag" alt="Flag of ' + esc(place.name) + '" src="https://flagcdn.com/' +
            place.code.toLowerCase() + '.svg">' +
          '<h2 class="card__title">' + esc(place.name) + "</h2>" +
        "</div>" +
        '<p class="card__meta">' + esc(place.region) + " · Capital " + esc(place.capital) + "</p>" +
        '<p class="card__meta">' + esc(place.languages) + "</p>" +
        '<ul class="facts">' +
          '<li><span class="facts__label">A dish</span><span>' + esc(place.dish) + "</span></li>" +
          '<li><span class="facts__label">' + esc(place.personRole || "An artist or writer") + "</span><span>" + esc(place.person) + "</span></li>" +
          '<li><span class="facts__label">A custom</span><span>' + esc(place.custom) + "</span></li>" +
          '<li><span class="facts__label">Did you know</span><span>' + esc(place.fact) + "</span></li>" +
        "</ul>" +
        '<div class="card__links">' +
          linkButton(youtube(place.name + " culture documentary"), "Watch something about " + place.name) +
        "</div>" +
      "</article>"
    );
    const flag = card.querySelector(".place__flag");
    flag.addEventListener("error", () => flag.remove());
    card.prepend(heartButton({
      type: "place", id: place.code, title: place.name, sub: place.dish,
      thumb: "https://flagcdn.com/w160/" + place.code.toLowerCase() + ".png",
    }));
    return card;
  }

  function quoteCard(q) {
    const card = el(
      '<article class="card idea tone-idea">' +
        '<p class="card__kicker">An idea</p>' +
        '<blockquote class="quote">' + esc(q.text) + "</blockquote>" +
        '<p class="quote__who">' + esc(q.who) + "</p>" +
        '<div class="card__body"><p class="card__small">' + esc(q.context) + "</p></div>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "idea", id: q.id, title: '"' + q.text + '"', sub: q.who }));
    return card;
  }

  function ideologyCard(i) {
    const card = el(
      '<article class="card idea tone-idea">' +
        '<p class="card__kicker">An idea</p>' +
        '<h2 class="card__title">' + esc(i.name) + "</h2>" +
        '<p class="card__meta">' + esc(i.oneLine) + "</p>" +
        '<dl class="ideology card__body">' +
          "<dt>What it believes</dt><dd>" + esc(i.believes) + "</dd>" +
          "<dt>Where it came from</dt><dd>" + esc(i.origins) + "</dd>" +
          "<dt>Its strongest critics say</dt><dd>" + esc(i.critics) + "</dd>" +
          "<dt>Names to know</dt><dd>" + esc(i.thinkers) + "</dd>" +
        "</dl>" +
        '<div class="card__links">' + linkButton(youtube(i.name + " explained"), "Watch an explainer") + "</div>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "idea", id: i.id, title: i.name, sub: i.oneLine }));
    return card;
  }

  function watchCard(w) {
    const card = el(
      '<article class="card watch tone-watch">' +
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

  function quietCard(kicker, title, body, tick, tone) {
    const card = el(
      '<article class="card card--quiet' + (tone ? " tone-" + tone : "") + '">' +
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
      '<article class="card card--quiet tone-move">' +
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

  const DEBATE_QUESTION = "What was the strongest point from the side you disagreed with?";
  const NHS_LINK = "https://www.nhs.uk/nhs-services/mental-health-services/find-nhs-talking-therapies-for-anxiety-and-depression/";

  function jubileeCard(j, skill) {
    const card = el(
      '<article class="card tone-debate jubilee">' +
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
      '<article class="card tone-skill">' +
        '<p class="card__kicker">Debate skill</p>' +
        '<h2 class="card__title">' + esc(skill.name) + "</h2>" +
        '<div class="card__body">' +
          "<p>" + esc(skill.idea) + "</p>" +
          '<ul class="facts"><li><span class="facts__label">Try it</span><span>' + esc(skill.tryIt) + "</span></li></ul>" +
        "</div>" +
        '<div class="card__links">' + linkButton(youtube(skill.video), "Watch a video on this", "pill-link--solid") + "</div>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "skill", id: skill.id, title: skill.name, sub: skill.tryIt, link: youtube(skill.video) }));
    return card;
  }

  function reflectionCard() {
    const card = quietCard(
      "After a debate", DEBATE_QUESTION, "",
      tickButton("debate", "Reflected", "Reflected"), "debate"
    );
    card.append(noteBox("debate", DEBATE_QUESTION, "The point, in a line or two, if you like."));
    return card;
  }

  function moneyCard(m) {
    return quietCard("Money · " + m.track, m.item.step, esc(m.item.note || ""), tickButton("money", "Done", "Done"), "money");
  }

  function workCard(w) {
    return quietCard("Work · GRC", w.task, esc(w.note || ""), tickButton("work", "Done", "Done"), "work");
  }

  function mindCard(prompt) {
    const card = quietCard("Mind", prompt, "", tickButton("mind", "Sat with it", "Sat with it"), "mind");
    card.querySelector(".card__foot").prepend(el(
      '<a class="card__link" target="_blank" rel="noopener" href="' + NHS_LINK + '">NHS Talking Therapies: refer yourself</a>'
    ));
    card.append(noteBox("mind", prompt));
    return card;
  }

  /* ---------- Today's picks (loaded once) ---------- */

  const weekday = now.getDay();
  const isWeekend = weekday === 5 || weekday === 6 || weekday === 0;

  function weekendLabel() {
    return isWeekend ? "Your weekend film" : "Film for the weekend";
  }

  let picksPromise = null;

  function loadPicks() {
    if (picksPromise) return picksPromise;
    const files = ["art", "contemporary", "places", "ideas", "watch", "debate", "move", "money", "work", "mind"];
    picksPromise = Promise.all(files.map((n) => getJSON("data/" + n + ".json"))).then(
      ([art, contemporary, places, ideas, watch, debate, move, money, work, mind]) => {
        // Ideas alternate: a quote one day, an ideology the next.
        const half = Math.floor(dayNumber / 2);
        const isQuote = dayNumber % 2 === 0;
        return {
          art: art && pick(art.filter((a) => a.image), "art", dayNumber),
          contemporary: contemporary && pick(contemporary, "contemporary", dayNumber),
          place: places && pick(places, "places", dayNumber),
          quote: ideas && isQuote ? pick(ideas.quotes, "quotes", half) : null,
          ideology: ideas && !isQuote ? pick(ideas.ideologies, "ideologies", half) : null,
          watch: watch && pick(watch, "watch", weekNumber),
          jubilee: debate && pick(debate.jubilee, "jubilee", dayNumber),
          skill: debate && pick(debate.skills, "skills", dayNumber),
          meal: move && pick(move, "move", dayNumber),
          money: money && pickMoney(money),
          work: work && pick(work, "work", dayNumber),
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

  /* ---------- Overview tiles ---------- */

  // A dashboard tile. Tapping it opens the full card in its tab;
  // a tick inside the tile works on the spot.
  function tile(o) {
    const t = el(
      '<article class="tile tone-' + o.tone + (o.cls ? " " + o.cls : "") + '" tabindex="0" role="link" aria-label="Open ' + esc(o.kicker) + '">' +
        (o.thumb ? '<div class="tile__media"><img alt="" fetchpriority="high" src="' + esc(o.thumb) + '"></div>' : "") +
        '<div class="tile__text">' +
          '<p class="tile__kicker">' + icon(o.icon || o.tone) + esc(o.kicker) + "</p>" +
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

  function renderOverview(root, p) {
    const grid = el('<div class="dash"></div>');
    const add = (node) => node && grid.append(node);

    const watchTile = p.watch && tile({
      tone: "watch", cls: "tile--watch", view: "watch", kicker: weekendLabel(), title: p.watch.title,
      sub: p.watch.year + " · " + p.watch.director + " · " + p.watch.minutes + " min",
      tick: tickButton("watch:" + p.watch.id, "Watched", "Watched", { weekly: true }),
    });

    // At the weekend the film comes first.
    if (isWeekend) add(watchTile);
    if (p.art) add(tile({
      tone: "art", cls: "tile--art", view: "learn", kicker: "Art", title: p.art.title,
      sub: p.art.artist + ", " + p.art.date, body: p.art.why, thumb: artImage(p.art),
    }));
    if (p.contemporary) add(tile({
      tone: "contemp", cls: "tile--contemp", view: "learn", kicker: "Contemporary art", title: p.contemporary.name,
      sub: p.contemporary.work + ", " + p.contemporary.year, body: p.contemporary.politics,
    }));
    if (!isWeekend) add(watchTile);
    if (p.jubilee && p.skill) add(tile({
      tone: "debate", cls: "tile--wide", view: "debate", kicker: "Debate", title: "Jubilee: " + p.jubilee.series,
      sub: "Today's skill: " + p.skill.name,
      tick: tickButton("jubilee", "Watched one", "Watched one"),
    }));
    if (p.place) add(tile({
      tone: "place", view: "learn", kicker: "A place", title: p.place.name, sub: p.place.dish.split(":")[0],
      thumb: "https://flagcdn.com/w160/" + p.place.code.toLowerCase() + ".png", cls: "tile--flag",
    }));
    if (p.quote) add(tile({ tone: "idea", view: "learn", kicker: "An idea", title: '"' + p.quote.text + '"', sub: p.quote.who, cls: "tile--quote" }));
    if (p.ideology) add(tile({ tone: "idea", view: "learn", kicker: "An idea", title: p.ideology.name, sub: p.ideology.oneLine }));
    if (p.mind) add(tile({
      tone: "mind", cls: "tile--wide", view: "wellbeing", kicker: "Mind", title: p.mind,
      sub: getNote("mind") ? "You wrote something today" : "Tap to write it down, if you like",
    }));
    if (p.meal) add(tile({
      tone: "move", view: "wellbeing", kicker: "Move", title: "A walk, any length", sub: "Meal idea: " + p.meal.name,
      tick: tickButton("walk", "Walked", "Walked"),
    }));
    add(tile({
      tone: "skill", icon: "debate", view: "debate", kicker: "Reflect", title: "The strongest point from the other side?",
      tick: tickButton("debate", "Reflected", "Reflected"),
    }));
    if (p.money) add(tile({
      tone: "money", view: "work", kicker: "Money · " + p.money.track, title: p.money.item.step,
      tick: tickButton("money", "Done", "Done"),
    }));
    if (p.work) add(tile({ tone: "work", view: "work", kicker: "Work · GRC", title: p.work.task, tick: tickButton("work", "Done", "Done") }));

    root.append(grid);
  }

  /* ---------- Saved ---------- */

  const SAVED_GROUPS = [
    ["art", "Art"],
    ["contemporary", "Contemporary artists"],
    ["place", "Places"],
    ["idea", "Ideas"],
    ["skill", "Debate skills"],
    ["watch", "Films and documentaries"],
  ];

  function renderSaved(root) {
    const notes = allNotes();
    if (!state.saved.length && !notes.length) {
      root.append(el('<p class="empty">Nothing saved yet. Tap the heart on anything you would like to keep, or write a note on the Mind or Debate cards.</p>'));
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
    overview: (root, p) => renderOverview(root, p),
    learn: (root, p) => {
      if (p.art) root.append(artCard(p.art));
      if (p.contemporary) root.append(contemporaryCard(p.contemporary));
      if (p.place) root.append(placeCard(p.place));
      if (p.quote) root.append(quoteCard(p.quote));
      if (p.ideology) root.append(ideologyCard(p.ideology));
    },
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
    work: (root, p) => {
      if (p.money) root.append(moneyCard(p.money));
      if (p.work) root.append(workCard(p.work));
    },
    saved: (root) => renderSaved(root),
  };

  async function render(name) {
    const root = document.getElementById("view");
    const p = name === "saved" ? null : await loadPicks();
    root.innerHTML = "";
    root.className = "view view--" + name;
    VIEWS[name](root, p);
    if (!root.children.length) {
      root.append(el('<p class="empty">Today\'s page could not load. It will be here when you are back online.</p>'));
    }
  }

  /* ---------- Tabs ---------- */

  // The open tab lives in the address (#learn, #watch...), so the back
  // button works and the app reopens where you left it.
  function currentView() {
    const name = location.hash.replace("#", "");
    return VIEWS[name] ? name : "overview";
  }

  function showView() {
    const name = currentView();
    document.querySelectorAll(".tabs__btn").forEach((b) => {
      const on = b.getAttribute("href") === "#" + name;
      b.classList.toggle("is-active", on);
      if (on) {
        b.setAttribute("aria-current", "page");
        b.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else {
        b.removeAttribute("aria-current");
      }
    });
    render(name);
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
