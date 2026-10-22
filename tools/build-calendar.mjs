// Builds calendar.ics: a daily learning slot and a Saturday film night,
// using the same course order and film picks as app.js.
// Run from the project folder:  node tools/build-calendar.mjs

import { readFileSync, writeFileSync } from "node:fs";

const DAY_MS = 86400000;
const SITE = "https://clnks.github.io/daily-hub/";
const DAYS_AHEAD = 365;
const LESSON_TIME = { start: "193000", end: "195000" };
const FILM_START = "190000";

const read = (name) => JSON.parse(readFileSync(new URL("../data/" + name + ".json", import.meta.url)));

/* Same picking logic as app.js, so the film matches the app. */

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

function pick(list, name, step) {
  const order = list.map((_, i) => i);
  const rand = seeded("daily-hub:" + name);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const cycle = Math.floor(step / list.length);
  return list[order[(step + cycle * 7) % list.length]];
}

/* Same course order as app.js buildCourse(). */

const art = read("art").filter((a) => a.image).sort((a, b) => a.order - b.order).map((a) => a.title + " (" + a.artist + ")");
const contemporary = read("contemporary").slice().sort((a, b) => a.year_sort - b.year_sort).map((c) => c.name);
const artLessons = art.concat(contemporary);
const geoLessons = read("places").map((p) => p.name);
const ideologies = read("ideas").ideologies;
const polLessons = [];
for (const u of read("politics").units) {
  if (u.from === "ideologies") ideologies.forEach((i) => polLessons.push(i.name));
  else u.lessons.forEach((l) => polLessons.push(l.title));
}
const films = read("watch");

const COURSE_START = Math.floor(Date.UTC(2026, 9, 23) / DAY_MS);

/* iCalendar helpers */

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
const escapeText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// Lines longer than 75 bytes must be folded onto continuation lines.
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = "";
  for (const ch of line) {
    if (Buffer.byteLength(chunk + ch) > (out.length ? 74 : 75)) {
      out.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  out.push(chunk);
  return out.join("\r\n ");
}

function addMinutes(hhmmss, minutes) {
  const total = Number(hhmmss.slice(0, 2)) * 60 + Number(hhmmss.slice(2, 4)) + minutes;
  return pad(Math.floor(total / 60) % 24) + pad(total % 60) + "00";
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const events = [];

const today = new Date();
const startDay = Math.max(COURSE_START, Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / DAY_MS));

for (let d = startDay; d < startDay + DAYS_AHEAD; d++) {
  const date = new Date(d * DAY_MS);
  const day = ymd(date);
  const n = d - COURSE_START;
  const a = artLessons[n % artLessons.length];
  const g = geoLessons[n % geoLessons.length];
  const p = polLessons[n % polLessons.length];

  events.push([
    "BEGIN:VEVENT",
    "UID:lesson-" + day + "@daily-hub",
    "DTSTAMP:" + stamp,
    "DTSTART;TZID=Europe/London:" + day + "T" + LESSON_TIME.start,
    "DTEND;TZID=Europe/London:" + day + "T" + LESSON_TIME.end,
    "SUMMARY:" + escapeText("Daily: " + g + " · " + p),
    "DESCRIPTION:" + escapeText("Day " + (n + 1) + " of your course\n\nArt: " + a + "\nGeography: " + g + "\nPolitics: " + p + "\n\n" + SITE + "#course"),
    "URL:" + SITE + "#course",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ]);

  // Saturday film night, using that week's film.
  if (date.getUTCDay() === 6) {
    const week = Math.floor((d + 3) / 7);
    const f = pick(films, "watch", week);
    const where = "https://www.justwatch.com/uk/search?q=" + encodeURIComponent(f.title);
    events.push([
      "BEGIN:VEVENT",
      "UID:film-" + day + "@daily-hub",
      "DTSTAMP:" + stamp,
      "DTSTART;TZID=Europe/London:" + day + "T" + FILM_START,
      "DTEND;TZID=Europe/London:" + day + "T" + addMinutes(FILM_START, Number(f.minutes) + 15),
      "SUMMARY:" + escapeText("Film: " + f.title + " (" + f.year + ")"),
      "DESCRIPTION:" + escapeText(f.director + " · " + f.minutes + " min\n\n" + f.why + "\n\nAfter: " + f.after + "\n\nWhere to watch: " + where),
      "URL:" + where,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ]);
  }
}

const lines = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Daily Hub//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:Daily Hub",
  "X-WR-TIMEZONE:Europe/London",
  "REFRESH-INTERVAL;VALUE=DURATION:P1D",
  "X-PUBLISHED-TTL:P1D",
  "BEGIN:VTIMEZONE",
  "TZID:Europe/London",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "TZNAME:BST",
  "DTSTART:19700329T010000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "TZNAME:GMT",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
  ...events.flat(),
  "END:VCALENDAR",
];

writeFileSync(new URL("../calendar.ics", import.meta.url), lines.map(fold).join("\r\n") + "\r\n");
console.log("calendar.ics written:", events.length, "events from", ymd(new Date(startDay * DAY_MS)));
