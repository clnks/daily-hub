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
    return { days: {}, weeks: {}, saved: [] };
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

  /* ---------- Cards ---------- */

  function artCard(art) {
    const card = el(
      '<article class="card art">' +
        '<div class="art__frame"><img alt="" loading="eager" decoding="async"></div>' +
        '<p class="card__kicker">Learn · Art</p>' +
        '<h2 class="card__title">' + esc(art.title) + "</h2>" +
        '<p class="card__meta">' + esc(art.artist) + " · " + esc(art.date) + "</p>" +
        '<div class="card__body"><p>' + esc(art.why) + "</p></div>" +
        '<div class="card__foot"><a class="card__link" href="https://www.artic.edu/artworks/' + art.id +
          '" target="_blank" rel="noopener">See it at the Art Institute of Chicago</a></div>' +
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

  function placeCard(place) {
    const card = el(
      '<article class="card place">' +
        '<p class="card__kicker">Learn · A place</p>' +
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
      '<article class="card idea">' +
        '<p class="card__kicker">Learn · An idea</p>' +
        '<blockquote class="quote">' + esc(q.text) + "</blockquote>" +
        '<p class="quote__who">' + esc(q.who) + "</p>" +
        '<div class="card__body"><p class="card__small">' + esc(q.context) + "</p></div>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "idea", id: q.id, title: "“" + q.text + "”", sub: q.who }));
    return card;
  }

  function ideologyCard(i) {
    const card = el(
      '<article class="card idea">' +
        '<p class="card__kicker">Learn · An idea</p>' +
        '<h2 class="card__title">' + esc(i.name) + "</h2>" +
        '<p class="card__meta">' + esc(i.oneLine) + "</p>" +
        '<dl class="ideology card__body">' +
          "<dt>What it believes</dt><dd>" + esc(i.believes) + "</dd>" +
          "<dt>Where it came from</dt><dd>" + esc(i.origins) + "</dd>" +
          "<dt>Its strongest critics say</dt><dd>" + esc(i.critics) + "</dd>" +
          "<dt>Names to know</dt><dd>" + esc(i.thinkers) + "</dd>" +
        "</dl>" +
      "</article>"
    );
    card.prepend(heartButton({ type: "idea", id: i.id, title: i.name, sub: i.oneLine }));
    return card;
  }

  function watchCard(w) {
    const card = el(
      '<article class="card watch">' +
        '<p class="card__kicker">This week’s watch</p>' +
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
        '<div class="card__foot"><div class="watch__actions"></div></div>' +
      "</article>"
    );
    const justWatch = el(
      '<a class="btn-outline" target="_blank" rel="noopener" href="https://www.justwatch.com/uk/search?q=' +
      encodeURIComponent(w.title) + '">Where to watch</a>'
    );
    card.querySelector(".watch__actions").append(justWatch);
    card.querySelector(".card__foot").append(tickButton("watch:" + w.id, "Watched", "Watched", { weekly: true }));
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
    const foot = card.querySelector(".card__foot");
    if (tick) foot.append(tick);
    return card;
  }

  function moveCard(meal) {
    const card = el(
      '<article class="card card--quiet">' +
        '<p class="card__kicker">Move</p>' +
        '<div class="move__row"><h2 class="card__title">A walk, any length</h2></div>' +
        '<div class="move__meal">' +
          '<span class="facts__label">A simple meal idea</span>' +
          '<p class="card__body" style="margin-top:2px">' + esc(meal.name) + "</p>" +
          '<p class="card__small" style="margin:4px 0 0">' + esc(meal.how) + "</p>" +
        "</div>" +
      "</article>"
    );
    card.querySelector(".move__row").append(tickButton("walk", "Walked", "Walked"));
    return card;
  }

  /* ---------- Render: Today ---------- */

  async function renderToday() {
    const [art, places, ideas, watch, move, money, work, mind] = await Promise.all(
      ["art", "places", "ideas", "watch", "move", "money", "work", "mind"].map((n) => getJSON("data/" + n + ".json"))
    );

    const root = document.getElementById("cards");
    root.innerHTML = "";

    const add = (node) => node && root.append(node);
    const label = (text) => root.append(el('<p class="section-label">' + esc(text) + "</p>"));

    // Learn
    label("Learn");
    const artPick = art && pick(art.filter((a) => a.image), "art", dayNumber);
    if (artPick) add(artCard(artPick));

    const placePick = places && pick(places, "places", dayNumber);
    if (placePick) add(placeCard(placePick));

    if (ideas) {
      // Alternate: quote one day, ideology the next.
      const half = Math.floor(dayNumber / 2);
      if (dayNumber % 2 === 0) add(quoteCard(pick(ideas.quotes, "quotes", half)));
      else add(ideologyCard(pick(ideas.ideologies, "ideologies", half)));
    }

    // Weekly
    const watchPick = watch && pick(watch, "watch", weekNumber);
    if (watchPick) add(watchCard(watchPick));

    // Daily life
    label("Today");
    add(quietCard(
      "Debate reflection",
      "What was the strongest point from the side you disagreed with?",
      "For after a debate. Just think it through, nothing to write.",
      tickButton("debate", "Thought about it", "Thought about it")
    ));

    const meal = move && pick(move, "move", dayNumber);
    if (meal) add(moveCard(meal));

    const moneyPick = money && pickMoney(money);
    if (moneyPick) {
      add(quietCard("Money · " + moneyPick.track, moneyPick.item.step, esc(moneyPick.item.note || ""),
        tickButton("money", "Done", "Done")));
    }

    const workPick = work && pick(work, "work", dayNumber);
    if (workPick) {
      add(quietCard("Work · GRC", workPick.task, esc(workPick.note || ""), tickButton("work", "Done", "Done")));
    }

    const mindPick = mind && pick(mind, "mind", dayNumber);
    if (mindPick) {
      const card = quietCard("Mind", mindPick, "", tickButton("mind", "Sat with it", "Sat with it"));
      card.querySelector(".card__foot").prepend(el(
        '<a class="card__link" target="_blank" rel="noopener" ' +
        'href="https://www.nhs.uk/nhs-services/mental-health-services/find-nhs-talking-therapies-for-anxiety-and-depression/">' +
        "NHS Talking Therapies: refer yourself</a>"
      ));
      add(card);
    }

    if (!root.children.length) {
      root.append(el('<p class="empty">Today’s page could not load. It will be here when you are back online.</p>'));
    }
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

  /* ---------- Render: Saved ---------- */

  const SAVED_GROUPS = [
    ["art", "Art"],
    ["place", "Places"],
    ["idea", "Ideas"],
    ["watch", "Films and documentaries"],
  ];

  function renderSaved() {
    const root = document.getElementById("saved-list");
    root.innerHTML = "";
    if (!state.saved.length) {
      root.append(el('<p class="empty">Nothing saved yet. Tap the heart on anything you would like to keep.</p>'));
      return;
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

  function updateSavedCount() {
    const n = state.saved.length;
    document.getElementById("saved-count").textContent = n ? "(" + n + ")" : "";
  }

  /* ---------- Views ---------- */

  function showView(name) {
    document.querySelectorAll(".tabs__btn").forEach((b) => {
      const on = b.dataset.view === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on);
    });
    document.getElementById("view-today").hidden = name !== "today";
    document.getElementById("view-saved").hidden = name !== "saved";
    if (name === "saved") renderSaved();
    else renderToday();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".tabs__btn").forEach((b) =>
    b.addEventListener("click", () => showView(b.dataset.view))
  );

  /* ---------- Start ---------- */

  document.getElementById("today-date").textContent = now.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
  updateSavedCount();
  renderToday();

  // If the app is left open past midnight, refresh when it is looked at again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && localDateKey(new Date()) !== todayKey) location.reload();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
