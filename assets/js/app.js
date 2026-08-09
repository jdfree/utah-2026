/* Utah Canyon Country — October 2026
   Static site. All content lives in data/itinerary.json. */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* Weekday is derived from the date, not read from the file, so it stays
   correct if the dates in itinerary.json ever shift. Noon avoids any
   timezone rollover. */
const dow = (iso, long = false) =>
  (long ? DOW_LONG : DOW_SHORT)[new Date(`${iso}T12:00:00`).getDay()];

const fmtDate = (iso) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

/* "Mon, Oct 12" — used anywhere a date appears outside a day card header */
const fmtDay = (iso) => `${dow(iso)}, ${fmtDate(iso)}`;

let DATA, map;

fetch('data/itinerary.json')
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    DATA = data;
    renderHero();
    renderItinerary();
    renderBookings();
    renderPacking();
    initMap();
    initTabs();
    syncBookingStatus();
  })
  .catch((err) => {
    $('main').innerHTML =
      `<p class="callout flag">Could not load <code>data/itinerary.json</code> (${esc(err.message)}).
       If you are opening this file straight from disk, run a local server instead:
       <code>python3 -m http.server</code></p>`;
  });

/* ---------- hero ---------- */

function renderHero() {
  const t = DATA.trip;
  $('#trip-title').textContent = t.title;
  $('#trip-subtitle').textContent = t.subtitle;

  const parkCount = new Set(
    DATA.days.flatMap((d) => d.stops.filter((s) => s.type === 'park').map((s) => s.name))
  ).size;

  const stats = [
    [`${DATA.days.length}`, 'Days'],
    [`${t.nights}`, 'Nights'],
    [`${parkCount}`, 'Parks'],
    [fmtDate(t.start), `Depart · ${dow(t.start, true)}`],
    [fmtDate(t.end), `Return · ${dow(t.end, true)}`],
    [t.shape, 'Route'],
  ];
  $('#trip-stats').innerHTML = stats
    .map(([v, k]) => `<div><dt>${esc(v)}</dt><dd>${esc(k)}</dd></div>`)
    .join('');
}

/* ---------- tabs ---------- */

function initTabs() {
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (btn) showView(btn.dataset.view);
  });
}

function showView(name) {
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) =>
    (v.hidden = v.id !== `view-${name}`));
  if (name === 'map' && map) map.invalidateSize();
}

/* ---------- day by day ---------- */

const stars = (n) => (n ? `<b>${'★'.repeat(n)}</b>${'☆'.repeat(5 - n)}` : '');

function renderItinerary() {
  $('#view-itinerary').innerHTML =
    `<p class="muted">Click any day to expand it. Attraction names with a ${OUTLINK} open the
     official page for that place — the park service, the state park, or whoever runs it — which
     is where hours, closures and fees are current.</p>` + DATA.days.map(dayCard).join('');
}

function dayCard(d) {
  const flags = [
    ...(d.drive?.flag ? [d.drive.flag] : []),
    ...d.items.filter((i) => i.flag).map((i) => `${i.title}: ${i.flag}`),
  ];

  return `
<details class="day" id="day-${d.day}" ${d.day === 1 ? 'open' : ''}>
  <summary>
    <span class="daynum">Day<b>${d.day}</b></span>
    <span>
      <p class="date">${esc(dow(d.date, true))} · ${esc(fmtDate(d.date))}, 2026</p>
      <h3>${esc(d.title)}</h3>
      <span class="tags">${d.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>
    </span>
    <span class="drive">${esc(d.drive?.stated ?? '')}</span>
  </summary>

  <div class="daybody">
    ${d.items.map(itemRow).join('')}

    ${flags.length ? callout('flag', 'Verify before you commit', flags) : ''}
    ${d.momNotes?.length ? momCallout(d.momNotes) : ''}
    ${d.tips?.length ? callout('tips', 'Tips', d.tips) : ''}
    ${stayBlock(d)}

    ${routeBlock(d)}
  </div>
</details>`;
}

/* A day is a timeline of three kinds of row. Drives and meals are the connective
   tissue — they carry the time that used to be invisible between attractions, so
   they render compact and muted. Anything without a `kind` is a real stop. */
function itemRow(i) {
  if (i.kind === 'drive') return driveRow(i);
  if (i.kind === 'meal') return mealRow(i);

  const rating = i.gp || i.toddler
    ? `<span class="stars">${i.gp ? `${stars(i.gp)} GP` : ''}${
        i.toddler ? `<br>${stars(i.toddler)} kid` : ''}</span>`
    : '';
  return `
<div class="item${i.optional ? ' optional' : ''}">
  ${rating}
  <p class="when">${esc(i.time)}${dwellTag(i)}${
    i.optional ? '<span class="opttag">Optional — decide as a group</span>' : ''}</p>
  <h4>${guideLink(i)}${i.mom ? `<span class="momtag">Mom: ${esc(i.mom)}</span>` : ''}</h4>
  <p>${esc(i.detail)}</p>
</div>`;
}

/* How long to actually spend here. Without this the times below look like a
   schedule you could keep by driving between them at infinite speed. */
function dwellTag(i) {
  return i.dwell && i.dwell !== '—'
    ? `<span class="dwell" title="How long to spend here">${esc(i.dwell)} here</span>` : '';
}

function driveRow(i) {
  const legs = [i.dist, i.dur].filter((s) => s && s !== '—').map(esc).join(' · ');
  return `
<div class="item leg${i.optional ? ' optional' : ''}">
  <p class="when">${esc(i.time)}</p>
  <h4>${CAR}${guideLink(i)}<span class="legmeta">${legs}</span></h4>
  <p>${esc(i.detail)}</p>
  ${i.flag ? `<p class="legflag">${esc(i.flag)}</p>` : ''}
</div>`;
}

function mealRow(i) {
  return `
<div class="item meal">
  <p class="when">${esc(i.time)}${dwellTag(i)}</p>
  <h4>${FORK}${guideLink(i)}</h4>
  <p>${esc(i.detail)}</p>
</div>`;
}

const CAR = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" '
  + 'd="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h.5a1.5 1.5 0 0 1 1.5 1.5V17a1 1 0 '
  + '0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4.5A1.5 1.5 0 0 1 4.5 11H5zm2.1 '
  + '0h9.8l-1.1-3.4a.5.5 0 0 0-.5-.35H8.7a.5.5 0 0 0-.5.35L7.1 11zM7 13.5a1 1 0 1 0 0 2 1 1 0 0 0 '
  + '0-2zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>';

const FORK = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" '
  + 'd="M7 2v7a2 2 0 0 0 1.5 1.94V22h1.5V10.94A2 2 0 0 0 11.5 9V2H10v6H9.75V2h-1.5v6H8V2H7zm8.5 '
  + '0C14 2 13 4.5 13 8c0 2.2.6 3.5 1.75 3.9V22h1.5V2h-.75z"/></svg>';

/* Attraction names link to whoever actually runs the place — the NPS, Utah State
   Parks, the BLM, or the operator's own site — so the link is the authority on
   hours, closures and fees rather than somebody's photo of it. */
const OUTLINK = '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" '
  + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
  + 'd="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

function guideLink(i) {
  if (!i.guide) return esc(i.title);
  const host = i.guide.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  return `<a class="guide" href="${esc(i.guide)}" target="_blank" rel="noopener"
    title="${esc(i.title)} — opens ${esc(host)}">${esc(i.title)}${OUTLINK}</a>`;
}

function callout(kind, heading, lines) {
  return `<div class="callout ${kind}"><h5>${esc(heading)}</h5><ul>${
    lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
}

function momCallout(notes) {
  return `<div class="callout mom"><h5>Mom's notes</h5><ul class="momlist">${
    notes.map((n) => `<li>
      <span class="mid">${esc(n.id)}</span>
      <span class="mark">${esc(n.mark)}</span> ${esc(n.text)}</li>`).join('')
  }</ul></div>`;
}

function stayBlock(d) {
  const l = d.lodging;
  if (!l || l.status === 'n/a') {
    return l?.chosen ? `<div class="stay"><h5>Tonight</h5>${esc(l.chosen)}</div>` : '';
  }
  if (l.sameAsDay) {
    return `<div class="stay"><h5>Where to stay</h5>${esc(l.city)} — same as Day ${l.sameAsDay}${
      l.chosen ? ` (${esc(l.chosen)})` : ''}</div>`;
  }
  return `
<div class="stay">
  <h5>Where to stay — ${esc(l.city)} · night${l.nights.length > 1 ? 's' : ''} ${l.nights.join(' &amp; ')}</h5>
  <ul>${l.options.map((o) => `
    <li>
      ${lodgingLink(o, o.name === l.chosen)}${
        o.mom ? `<span class="momtag">Mom: ${esc(o.mom)}</span>` : ''} — ${esc(o.note)}
    </li>`).join('')}
  </ul>
</div>`;
}

/* Every option carries a verified `url` to the property's own booking page.
   The plain-text branch is a fallback for one added without a link. */
function lodgingLink(o, isPick) {
  const cls = isPick ? 'pick' : '';
  return o.url
    ? `<a class="${cls}" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a>`
    : `<span class="${cls}">${esc(o.name)}</span>`;
}

/* The day's driving route, spelled out. `stops` is ordered and starts wherever
   you wake up, so the chain doubles as the answer to "where am I going today?"
   Coordinates rather than names — they land in the right car park every time. */
function routeBlock(d) {
  const chain = d.stops
    .map((s) => `<span class="${s.viaOptional ? 'viaopt' : ''}">${esc(s.name)}</span>`)
    .join(' <span class="arrow">&rarr;</span> ');
  return `
<div class="route">
  <h5>Today's route</h5>
  <p class="chain">${chain}</p>
  ${d.routeNote ? `<p class="routenote">${esc(d.routeNote)}</p>` : ''}
  <a class="maplink" target="_blank" rel="noopener" href="${gmapsRoute(d.stops)}">
    Open in Google Maps &rarr;</a>
</div>`;
}

/* Directions follow the plan you actually committed to. Optional side trips show
   in the chain above but stay out of the URL — routing through a stop the group
   hasn't agreed to would report the wrong distance for the day. */
function gmapsRoute(stops) {
  const pts = stops.filter((s) => !s.viaOptional).map((s) => `${s.lat},${s.lng}`);
  return 'https://www.google.com/maps/dir/' + pts.join('/');
}

/* ---------- bookings ---------- */

/* Booking links print the host only. The deep IHG reservation URL is 70-odd
   characters with no spaces in it; printed in full it wrapped over four lines
   and set the height of the whole row. Full URL stays in href and title. */
const bookingHost = (url) =>
  url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

function renderBookings() {
  const order = { needed: 0, optional: 1, booked: 2 };
  const urgency = {
    now: 'Book now', soon: 'Book soon', 'by-july': 'By July 2026',
    'before-trip': 'Before departure', later: 'Later',
  };

  const rows = [...DATA.bookings]
    .sort((a, b) => order[a.status] - order[b.status])
    .map((b) => `
<tr>
  <td><span class="pill ${b.status}">${esc(b.status)}</span></td>
  <td>${esc(b.what)}${b.url ? `<br><a class="bookhost" href="${esc(b.url)}" target="_blank"
      rel="noopener" title="${esc(b.url)}">${esc(bookingHost(b.url))}</a>` : ''}</td>
  <td>${esc(b.category)}</td>
  <td>${b.urgency === 'now' || b.urgency === 'soon'
      ? `<span class="pill ${b.urgency}">${esc(urgency[b.urgency])}</span>`
      : esc(urgency[b.urgency] ?? '')}</td>
  <td>${esc(b.who) || '<span class="muted">—</span>'}</td>
  <td>${esc(b.confirmation) || '<span class="muted">—</span>'}</td>
  <td class="muted">${esc(b.notes)}</td>
</tr>`).join('');

  const counts = DATA.bookings.reduce((a, b) => ((a[b.status] = (a[b.status] || 0) + 1), a), {});

  $('#bookings-cta').innerHTML = `
<div class="cta">
  <h3>Claiming a job or marking something booked</h3>
  <p>The table below is a snapshot. The live version everyone can edit is a Google Sheet:</p>
  <p><a class="btn" href="${esc(DATA.trip.bookingsSheet)}" target="_blank" rel="noopener">
    Open the shared Bookings Tracker &rarr;</a></p>
  <ol>
    <li>Put your name in <b>Who's booking</b> when you take something on, so two people don't book the same room twice.</li>
    <li>When it's done, fill in <b>Confirmation #</b> and <b>Cost</b>, and change <b>Status</b> from <code>NEEDED</code> to <code>BOOKED</code>.</li>
    <li>Use the <b>Notes</b> column for anything the rest of us need to know — cancellation deadline, room type, who's in which bed.</li>
  </ol>
  <p class="muted">Only the <b>Status</b> column reaches this page — that is what the green “Live” line below
    reflects. Names, confirmation numbers, costs and notes stay in the sheet on purpose, so put them there and
    read them there.</p>
  <p class="muted">Anyone with this link can edit, and Google does not require them to sign in first, so
    treat it as public: no card numbers, no passwords. Edits are logged in the sheet's version history
    (File &rsaquo; Version history) and anything can be undone.</p>
</div>`;

  $('#bookings-body').innerHTML = `
<h2>Where everything stands</h2>
<p><b>${counts.booked || 0} booked</b> · ${counts.needed || 0} still to book · ${
    counts.optional || 0} optional</p>
<p class="muted" id="bookings-live">Checking the shared sheet…</p>
<div class="tablewrap"><table>
  <thead><tr><th>Status</th><th>What</th><th>Type</th><th>When</th><th>Who</th><th>Conf #</th><th>Notes</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

/* ---------- live booking status ---------- */

/* The Bookings tab of the shared sheet is private. A second tab ("Public
   status") exposes only id + status and is published to the web as CSV, so
   this page can read it without anyone signing in. Names, confirmation
   numbers and costs never leave the private tab.

   Statuses in itinerary.json are the fallback: if the sheet is unreachable
   (not yet published, offline, CORS), the committed snapshot still renders. */

/* Quote-aware: a Notes-style column can legitimately contain commas, and a
   naive split would shift every field after it without ever erroring. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

async function syncBookingStatus() {
  const url = DATA.trip.bookingsStatusCsv;
  const note = $('#bookings-live');
  if (!url || !note) return;

  const VALID = new Set(['booked', 'needed', 'optional']);

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const rows = parseCsv(await res.text());
    const header = rows.shift().map((h) => h.toLowerCase());
    const iId = header.indexOf('id');
    const iStatus = header.indexOf('status');
    if (iId < 0 || iStatus < 0) throw new Error('sheet is missing an id or status column');

    const live = new Map();
    const rejected = new Set();
    for (const r of rows) {
      const id = r[iId];
      const status = (r[iStatus] || '').toLowerCase();
      if (id && VALID.has(status)) live.set(id, status);
      else if (r[iStatus]) rejected.add(r[iStatus]);
    }
    /* If the Public status tab ever stops pointing at the Status and ID columns
       — reordering the Bookings tab by cut-and-paste rather than by dragging a
       whole column will do it — the values arriving here stop being statuses.
       Say exactly what turned up, so the cause is obvious from the page. */
    if (!live.size) {
      throw new Error(rejected.size
        ? `the status column held ${[...rejected].slice(0, 3).map((v) => `"${v}"`).join(', ')} `
          + 'instead of BOOKED / NEEDED / OPTIONAL. Check that the Public status tab\'s '
          + 'FILTER formulas still reference the Status and ID columns of the Bookings tab'
        : 'the sheet returned no usable rows');
    }

    let changed = 0;
    const unmatched = [];
    for (const b of DATA.bookings) {
      const s = live.get(b.id);
      if (!s) { unmatched.push(b.id); continue; }
      if (s !== b.status) { b.status = s; changed++; }
    }

    renderBookings();
    const noteEl = $('#bookings-live');
    noteEl.innerHTML = `
      <span class="live ok">● Live</span> from the shared sheet${
        changed ? ` — ${changed === 1 ? '1 row differs' : `${changed} rows differ`} from the committed snapshot` : ''}.`;

    /* A partial sync is the dangerous case: the page looks live and is quietly
       showing stale statuses for whatever the sheet stopped publishing. Say so
       in a box, not in small print. */
    const problems = [];
    if (unmatched.length) {
      problems.push(`<li><b>${unmatched.length} booking${unmatched.length === 1 ? '' : 's'} on this page `
        + `${unmatched.length === 1 ? 'has' : 'have'} no row in the published sheet</b>, so `
        + `${unmatched.length === 1 ? 'its status is' : 'their statuses are'} the committed snapshot, not live: `
        + `<code>${unmatched.map(esc).join('</code>, <code>')}</code>. The usual cause is the Public status tab: `
        + `inserting rows at the top of the Bookings tab shifts its FILTER range down, so the top rows stop `
        + `publishing. Set both formulas back to whole-column ranges.</li>`);
    }
    if (rejected.size) {
      problems.push(`<li>${rejected.size} row${rejected.size === 1 ? '' : 's'} had an unrecognised status and `
        + `${rejected.size === 1 ? 'was' : 'were'} ignored: ${[...rejected].slice(0, 5).map(esc).join(', ')}.</li>`);
    }
    if (problems.length) {
      noteEl.insertAdjacentHTML('afterend',
        `<div class="callout flag"><h5>The shared sheet is only partly reaching this page</h5>`
        + `<ul>${problems.join('')}</ul></div>`);
    }
  } catch (err) {
    note.innerHTML = `
      <span class="live off">● Snapshot</span> — could not read the shared sheet
      (${esc(err.message)}), so these are the statuses last committed to the repo.
      If the sheet has just been published, give it a minute.`;
  }
}

/* ---------- packing ---------- */

function renderPacking() {
  const total = DATA.packing.reduce((n, g) => n + g.items.length, 0);

  $('#view-packing').innerHTML = `
<h2>Packing</h2>
<p class="muted">${total} things, grouped. Built around what this particular trip does to you:
a 50°F swing between Bryce mornings and St. George afternoons, two small children, long stretches
with no signal and no shops, and one night standing still in sub-freezing air at Bryce Point.</p>
${DATA.packing.map((g) => `
<div class="qa">
  <h4>${esc(g.group)}</h4>
  <ul class="packlist">${g.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
</div>`).join('')}`;
}

/* jump from a map popup straight to the open day card */
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-goto]');
  if (!link) return;
  e.preventDefault();
  showView('itinerary');
  const card = document.getElementById(`day-${link.dataset.goto}`);
  card.open = true;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- map ---------- */

function initMap() {
  /* An explicit starting view matters: without one Leaflet has no _zoom when
     fitBounds measures, and getBoundsZoom can resolve to maxZoom instead of
     the fitted zoom — the map lands at street level with every pin offscreen. */
  map = L.map('map', {
    scrollWheelZoom: false,
    center: [38.8, -109.2],
    zoom: 6,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const line = [];
  const bounds = [];

  DATA.days.forEach((d) => {
    d.stops.forEach((s) => {
      const pt = [s.lat, s.lng];
      line.push(pt);
      bounds.push(pt);

      const label = s.type === 'waypoint' ? '' : String(d.day);
      L.marker(pt, {
        icon: L.divIcon({
          className: '',
          html: `<span class="pin ${s.type}">${label}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        title: s.name,
      })
        .addTo(map)
        .bindPopup(`
          <b>${esc(s.name)}</b>
          <span class="day-ref">Day ${d.day} · ${esc(fmtDay(d.date))}</span>
          <a href="#day-${d.day}" data-goto="${d.day}">See the day &rarr;</a>`);
    });
  });

  L.polyline(line, {
    color: '#a3502b',
    weight: 2.5,
    opacity: .65,
    dashArray: '7 7',
  }).addTo(map);

  function fit() {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [35, 35] });
  }

  fit();
  /* If the map is measured while its container has no width — a backgrounded
     tab, a collapsed pane, fonts still loading — fitBounds resolves to maxZoom
     and every pin lands offscreen. Re-fit once the page has settled. */
  window.addEventListener('load', fit, { once: true });
}
