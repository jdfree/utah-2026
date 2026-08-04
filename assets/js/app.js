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
    renderLodging();
    renderBookings();
    renderNotes();
    initMap();
    initTabs();
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
  $('#view-itinerary').innerHTML = DATA.days.map(dayCard).join('');
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

    <a class="maplink" target="_blank" rel="noopener"
       href="${gmapsRoute(d.stops)}">Open this day's route in Google Maps &rarr;</a>
  </div>
</details>`;
}

function itemRow(i) {
  const rating = i.gp || i.toddler
    ? `<span class="stars">${i.gp ? `${stars(i.gp)} GP` : ''}${
        i.toddler ? `<br>${stars(i.toddler)} kid` : ''}</span>`
    : '';
  return `
<div class="item">
  ${rating}
  <p class="when">${esc(i.time)}</p>
  <h4>${esc(i.title)}${i.mom ? `<span class="momtag">Mom: ${esc(i.mom)}</span>` : ''}</h4>
  <p>${esc(i.detail)}</p>
</div>`;
}

function callout(kind, heading, lines) {
  return `<div class="callout ${kind}"><h5>${esc(heading)}</h5><ul>${
    lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
}

function momCallout(notes) {
  return `<div class="callout mom"><h5>Mom's notes</h5><ul>${
    notes.map((n) => `<li><span class="mark">${esc(n.mark)}</span> ${esc(n.text)}</li>`).join('')
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

/* Options carry a verified `url` to the property's own booking page. The one
   without a link (Entrada Guesthouse) could not be found to exist — see Q11. */
function lodgingLink(o, isPick) {
  const cls = isPick ? 'pick' : '';
  return o.url
    ? `<a class="${cls}" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a>`
    : `<span class="${cls} unverified" title="No booking site found for this property">${
        esc(o.name)}</span>`;
}

function gmapsRoute(stops) {
  const pts = stops.map((s) => `${s.lat},${s.lng}`);
  return 'https://www.google.com/maps/dir/' + pts.join('/');
}

/* ---------- lodging ---------- */

function renderLodging() {
  const rows = DATA.days
    .filter((d) => d.lodging && !d.lodging.sameAsDay && d.lodging.status !== 'n/a')
    .map((d) => {
      const l = d.lodging;
      const dates = l.nights
        .map((n) => fmtDay(DATA.days[n - 1].date))
        .join(' – ');
      return `
<tr>
  <td><a href="#day-${d.day}" data-goto="${d.day}">Day ${d.day}</a></td>
  <td><b>${esc(l.city)}</b><br><span class="muted">${esc(dates)} · ${l.nights.length} night${
        l.nights.length > 1 ? 's' : ''}</span></td>
  <td>${l.chosen ? `<b>${esc(l.chosen)}</b>` : '<span class="muted">not decided</span>'}</td>
  <td>${l.options.map((o) =>
        `${lodgingLink(o, false)}${o.mom ? ` <span class="momtag">${esc(o.mom)}</span>` : ''}`
      ).join('<br>')}</td>
  <td><span class="pill ${l.status}">${esc(l.status)}</span></td>
</tr>`;
    })
    .join('');

  $('#view-lodging').innerHTML = `
<h2>Overnights</h2>
<p class="muted">Eleven nights. Mom ranked Springdale (1st / 2nd) and checked two of the three Torrey options; her question marks are on the Strater and Inn on the Cliff.</p>
<div class="tablewrap"><table>
  <thead><tr><th>Day</th><th>Where</th><th>Chosen</th><th>Options</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

/* ---------- bookings ---------- */

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
  <td>${esc(b.what)}${b.url ? `<br><a href="${esc(b.url)}" target="_blank" rel="noopener">${
      esc(b.url.replace(/^https?:\/\//, ''))}</a>` : ''}</td>
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
  <p class="muted">Anyone with this link can edit, and Google does not require them to sign in first, so
    treat it as public: no card numbers, no passwords. Edits are logged in the sheet's version history
    (File &rsaquo; Version history) and anything can be undone.</p>
</div>`;

  $('#bookings-body').innerHTML = `
<h2>Snapshot</h2>
<p><b>${counts.booked || 0} booked</b> · ${counts.needed || 0} still to book · ${
    counts.optional || 0} optional</p>
<p class="muted">This table comes from <code>data/itinerary.json</code> and only changes when the repo does.
  The sheet above is the one that updates live.</p>
<div class="tablewrap"><table>
  <thead><tr><th>Status</th><th>What</th><th>Type</th><th>When</th><th>Who</th><th>Conf #</th><th>Notes</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

/* ---------- notes & questions ---------- */

function renderNotes() {
  const momAll = DATA.days.flatMap((d) =>
    (d.momNotes || []).map((n) => ({ ...n, day: d.day, date: d.date, title: d.title })));

  $('#view-notes').innerHTML = `
<h2>Open questions</h2>
<p class="muted">Things in the printed plan that need a decision or a fact-check before booking.
Numbers are fixed — <code>Q4</code> stays <code>Q4</code> even as others get resolved.</p>
${DATA.openQuestions.map((q) => `
<div class="qa ${q.status === 'resolved' ? 'resolved' : ''}" id="${esc(q.id)}">
  <h4><span class="qid">${esc(q.id)}</span> ${esc(q.topic)}${
    q.status === 'resolved' ? '<span class="pill booked">resolved</span>' : ''}</h4>
  <p>${esc(q.detail)}</p>
</div>`).join('')}

<h2>Everything Mom wrote</h2>
${momAll.map((n) => `
<div class="qa">
  <h4><a href="#day-${n.day}" data-goto="${n.day}">Day ${n.day} · ${esc(fmtDay(n.date))}</a> — ${esc(n.title)}</h4>
  <p><span class="mark">${esc(n.mark)}</span> ${esc(n.text)}</p>
</div>`).join('')}

<h2>Who's coming</h2>
<ul>${DATA.party.map((p) =>
    `<li><b>${esc(p.name)}</b>${p.role ? ` — ${esc(p.role)}` : ''}</li>`).join('')}</ul>

<h2>Packing</h2>
<ul>${DATA.packing.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
}

/* jump from a lodging/notes link straight to the open day card */
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
  map = L.map('map', { scrollWheelZoom: false });

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

  map.fitBounds(bounds, { padding: [35, 35] });
}
