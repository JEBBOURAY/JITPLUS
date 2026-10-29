const q = new URLSearchParams(location.search);
const LANG = q.get('lang') || 'fr', OS = q.get('os') || 'ios', SHOT = +(q.get('shot') || 1), FG = q.has('fg');
const L = T[LANG], RTL = LANG === 'ar';
const SAFE = OS === 'ios' ? { t: 54, b: 34 } : { t: 36, b: 22 };
const TABH = 10 + 50 + Math.max(SAFE.b, 14);
document.documentElement.lang = LANG;
document.body.classList.add(LANG, OS);

const ic = (n, s = 20, c = 'currentColor', w = 2, cls = '') =>
  `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

// 8-point star from two squares (Rub el Hizb / khatam).
const KIN = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
function khatam(cx, cy, r, rot = 0) {
  let d = '';
  for (let k = 0; k < 16; k++) {
    const a = ((rot + k * 22.5 - 90) * Math.PI) / 180, rr = k % 2 ? r * KIN : r;
    d += (k ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2);
  }
  return d + 'Z';
}
const square = (cx, cy, r, rot) => { let d = ''; for (let k = 0; k < 4; k++) { const a = ((rot + k * 90 - 90) * Math.PI) / 180; d += (k ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2); } return d + 'Z'; };

/* ---------- device chrome ---------- */
function statusBar(light = false) {
  const c = light ? '#fff' : '#0F172A';
  const icons = `<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="${c}"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="${c}"/><rect x="10" y="3" width="3" height="9" rx="1" fill="${c}"/><rect x="15" y="0" width="3" height="12" rx="1" fill="${c}"/></svg>
  <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.2c2.5 0 4.8 1 6.5 2.6l1.2-1.2C14.2 1.6 11.5.4 8.5.4S2.8 1.6.8 3.6L2 4.8c1.7-1.6 4-2.6 6.5-2.6zm0 3.6c1.5 0 2.9.6 3.9 1.5l1.2-1.2C12.3 4.9 10.5 4.1 8.5 4.1s-3.8.8-5.1 2l1.2 1.2c1-.9 2.4-1.5 3.9-1.5zm0 3.6c-.6 0-1.1.2-1.5.6l1.5 1.6 1.5-1.6c-.4-.4-.9-.6-1.5-.6z" fill="${c}"/></svg>
  <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="${c}" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="${c}"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="${c}" opacity=".4"/></svg>`;
  if (OS === 'ios') return `<div class="sb ios" style="color:${c}"><span class="sbt">9:41</span><span class="sbi">${icons}</span></div><div class="island"></div>`;
  return `<div class="sb and" style="color:${c}"><span class="sbt">12:30</span><span class="sbi">${icons}</span></div><div class="punch"></div>`;
}
const homeInd = (light = false) => `<div class="homeind ${OS}" style="background:${light ? '#fff' : '#0F172A'}"></div>`;

function tabBar(active) {
  const icons = ['credit-card', 'badge-percent', 'qr-code', 'compass', 'bell'];
  const items = icons.map((n, i) => {
    const on = i === active;
    if (i === 2) return `<div class="tab"><div class="qrbtn ${on ? 'on' : ''}">${ic(n, 24, on ? '#fff' : '#7C3AED', 1.5)}</div><span class="tl ${on ? 'on' : ''}">${L.tabs[i]}</span></div>`;
    return `<div class="tab">${on ? '<div class="tind"></div>' : ''}<div class="tic ${on ? 'on' : ''}">${ic(n, 21, on ? '#7C3AED' : '#64748B', 1.5)}${i === 4 ? '<span class="nbadge">3</span>' : ''}</div><span class="tl ${on ? 'on' : ''}">${L.tabs[i]}</span></div>`;
  }).join('');
  return `<div class="tabbar" style="padding-bottom:${Math.max(SAFE.b, 14)}px">${items}</div>`;
}

const mlogo = (icon, color, size, radius) =>
  `<div class="mlogo" style="width:${size}px;height:${size}px;border-radius:${radius}px">${ic(icon, size * 0.52, color, 2)}</div>`;

/* ---------- wheel ---------- */
function wheelSVG(size, labels, smallPointer) {
  const cx = size / 2, cy = size / 2, outerR = size / 2 - 1, rim = 0.04 * size, r = outerR - rim;
  const cols = ['#7C3AED', '#F59E0B', '#EF4444', '#10B981'];
  let segs = '', divs = '', txt = '';
  for (let i = 0; i < 8; i++) {
    const a0 = ((-90 + i * 45) * Math.PI) / 180, a1 = ((-90 + (i + 1) * 45) * Math.PI) / 180;
    segs += `<path d="M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 0 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z" fill="${cols[i % 4]}"/>`;
    divs += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(a0)}" y2="${cy + r * Math.sin(a0)}" stroke="rgba(255,255,255,.35)" stroke-width="${0.006 * size}"/>`;
    if (labels) {
      const am = -90 + (i + 0.5) * 45, rad = (am * Math.PI) / 180;
      const x = cx + 0.6 * r * Math.cos(rad), y = cy + 0.6 * r * Math.sin(rad);
      const norm = ((am % 360) + 360) % 360, rot = norm > 90 && norm < 270 ? am + 180 : am;
      txt += `<text transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot})" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(13, Math.max(7, 0.042 * size))}" font-weight="700" fill="#fff" style="paint-order:stroke" stroke="rgba(0,0,0,.18)" stroke-width="2">${labels[i]}</text>`;
    }
  }
  const ptr = smallPointer ? `<path d="M${cx} ${0.5 * rim + 0.1 * size} L${cx - 0.07 * size} ${0.3 * rim} L${cx + 0.07 * size} ${0.3 * rim} Z" fill="#F59E0B" stroke="#D97706" stroke-width="${0.008 * size}"/>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>
    <radialGradient id="hubO${size}" cx="50%" cy="40%" r="55%"><stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#D97706"/></radialGradient>
    <radialGradient id="hubI${size}" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E2E8F0"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="#D97706"/><circle cx="${cx}" cy="${cy}" r="${outerR - 0.008 * size}" fill="#F59E0B"/><circle cx="${cx}" cy="${cy}" r="${r + 0.005 * size}" fill="#D97706"/>
    ${segs}${divs}${txt}
    <circle cx="${cx}" cy="${cy}" r="${0.14 * size}" fill="url(#hubO${size})"/><circle cx="${cx}" cy="${cy}" r="${0.09 * size}" fill="url(#hubI${size})"/>${ptr}</svg>`;
}

/* ---------- screen 1: cards ---------- */
function walletCard(c, pos) {
  const g1 = mix(c.color, '#ffffff', 0.12), g3 = mix(c.color, '#000000', 0.38);
  const first = Math.ceil(c.goal / 2);
  const stamp = (on) => `<div class="stamp ${on ? 'on' : ''}"><i style="background:${on ? mix(c.color, '#000000', 0.2) : 'rgba(255,255,255,.34)'}"></i></div>`;
  let row1 = '', row2 = '';
  for (let i = 0; i < c.goal; i++) (i < first ? (row1 += stamp(i < c.n)) : (row2 += stamp(i < c.n)));
  const right = c.done
    ? `<div class="readypill">${ic('gift', 13, '#fff', 2.4)}<span>${L.rewardReady}</span></div>`
    : `<div class="cnt"><b>${c.n}</b><span>/${c.goal}</span></div>`;
  return `<div class="wc ${pos}" style="--sh:${mix(c.color, '#000000', 0.4)}"><div class="wcin ${c.done ? 'done' : ''}" style="background:linear-gradient(135deg,${g1},${c.color},${g3})">
    <i class="orbA"></i><i class="orbB"></i>
    <div class="wch">${mlogo(c.icon, c.color, 47, 14)}<div class="wct"><div class="wcn">${c.name}</div><div class="wcc">${c.cat}</div></div>${right}</div>
    <div class="stamps"><div>${row1}</div><div>${row2}</div></div>
    <div class="wcf"><span>${c.done ? '' : L.stampsLeft(c.goal - c.n)}</span><span>${L.ago}</span></div>
    ${pos !== 'center' ? '<i class="dim"></i>' : ''}</div></div>`;
}
function tile(kind) {
  const w = kind === 'wheel';
  const grad = w ? 'linear-gradient(135deg,#EC4899,#8B5CF6,#6D28D9)' : 'linear-gradient(135deg,#FBBF24,#F97316,#C2410C)';
  const last = w ? '#6D28D9' : '#C2410C';
  const art = w ? wheelSVG(46, null, true)
    : `<div class="miniscratch"><span>🎁</span><i></i></div>`;
  return `<div class="tile" style="background:${grad}"><i class="torb"></i>
    <div class="ttop"><div class="tart">${art}</div><div class="tcount" style="color:${last}">${w ? 2 : 1}</div></div>
    <div><div class="ttitle">${w ? L.wheel : L.scratch}</div><div class="tsub">${w ? L.avail2 : L.avail1}</div></div>
    <div class="tcta" style="color:${last}">${w ? L.spin : L.scratchCta}</div></div>`;
}
function scrCards() {
  const cards = [
    { name: 'Pâtisserie Amandine', cat: L.catPastry, color: '#DB2777', icon: 'cake', n: 5, goal: 8 },
    { name: 'Café Mazagan', cat: L.catCafe, color: '#0F766E', icon: 'coffee', n: 7, goal: 10 },
    { name: 'Burger Factory', cat: L.catFast, color: '#EA580C', icon: 'sandwich', n: 10, goal: 10, done: true },
  ];
  const [l, c, r] = RTL ? [cards[2], cards[1], cards[0]] : cards;
  return `${statusBar()}
  <div class="hdr" style="padding-top:${SAFE.t + 10}px"><div class="avatar">YB</div>
    <div class="ttl"><div class="greet">${L.greeting}</div><div class="h28">${L.myCards}</div></div>
    <div class="cbtn">${ic('search', 19, '#0F172A', 2)}</div></div>
  <div class="content">
    <div class="sec" style="margin-top:4px">${L.perks}</div>
    <div class="tiles">${tile('wheel')}${tile('scratch')}</div>
    <div class="toolbar"><div class="sec">${L.allCards}</div><div class="tbtn">${ic('layout-list', 16, '#0F172A')}</div></div>
    <div class="carousel">${walletCard(l, 'left')}${walletCard(r, 'right')}${walletCard(c, 'center')}</div>
    <div class="pager"><div class="dots"><i></i><i class="on"></i><i></i><i></i><i></i></div>
      <div class="hint">${ic('chevrons-left-right', 13, '#64748B')}<span>${L.swipe}</span></div></div>
  </div>${tabBar(0)}${homeInd()}`;
}

/* ---------- screen 2: QR ---------- */
function qrSVG(size) {
  const n = QR.length, quiet = 10, cell = (size - quiet * 2) / n;
  let rects = '';
  QR.forEach((row, y) => { for (let x = 0; x < n; x++) if (row[x] === '1') rects += `<rect x="${(quiet + x * cell).toFixed(2)}" y="${(quiet + y * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}"/>`; });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#4C1D95">${rects}</g></svg>`;
}
function scrQR() {
  const steps = ['qr-code', 'scan-line', 'stamp'].map((n, i) => `<div class="step"><div class="sicon">${ic(n, 18, '#7C3AED', 2)}<span class="snum">${i + 1}</span></div><div class="slabel">${L.steps[i]}</div></div>`).join('');
  return `${statusBar()}
  <div class="hdr" style="padding-top:${SAFE.t + 10}px"><div class="ttl"><div class="h28">${L.qrTitle}</div><div class="hsub">${L.qrSub}</div></div></div>
  <div class="content" style="padding-top:10px">
    <div class="qrcard"><i class="qo1"></i><i class="qo2"></i>
      <div class="qtop"><div class="qlogo"><img src="img/logo.png"></div><div><div class="qlabel">${L.loyaltyCard}</div><div class="qname">Yasmine Benali</div></div></div>
      <div class="qpanel">${qrSVG(250)}</div>
      <div class="qstatus">${ic('shield-check', 14, 'rgba(255,255,255,.85)', 2)}<span>${L.secure}</span></div>
      <div class="qbar"><i></i></div>
    </div>
    <div class="bright">${ic('sun', 13, '#D97706', 2)}<span>${L.bright}</span></div>
    <div class="howcard"><div class="howt">${L.how}</div><div class="steps">${steps}</div></div>
  </div>${tabBar(2)}${homeInd()}`;
}

/* ---------- screen 3: discover ---------- */
function mapSVG() {
  let s = `<svg width="393" height="852" viewBox="0 0 393 852"><rect width="393" height="852" fill="#F3F2EE"/>`;
  s += `<g fill="#ECEAE4">`;
  for (let i = 0; i < 40; i++) { const x = (i * 97) % 393, y = 120 + ((i * 173) % 700); s += `<rect x="${x}" y="${y}" width="${22 + (i % 3) * 8}" height="${16 + (i % 4) * 6}" rx="2" transform="rotate(-24 ${x} ${y})"/>`; }
  s += `</g><g transform="rotate(-24 196 426)">`;
  for (let x = -380; x <= 800; x += 38) s += `<line x1="${x}" y1="-400" x2="${x}" y2="1300" stroke="#fff" stroke-width="${x % 152 === 0 ? 9 : 4.5}"/>`;
  for (let y = -368; y <= 1300; y += 46) s += `<line x1="-400" y1="${y}" x2="800" y2="${y}" stroke="#fff" stroke-width="${y % 184 === 0 ? 9 : 4.5}"/>`;
  s += `</g>`;
  s += `<path d="M-20 560 C 110 500 250 450 420 360" fill="none" stroke="#fff" stroke-width="11"/>`;
  s += `<path d="M262 -10 C 285 200 335 430 300 870" fill="none" stroke="#DDD6FE" stroke-width="17"/><path d="M262 -10 C 285 200 335 430 300 870" fill="none" stroke="#EDE9FE" stroke-width="12"/>`;
  s += `<circle cx="196" cy="478" r="17" fill="#F3F2EE" stroke="#fff" stroke-width="9"/>`;
  const coast = 'M0 300 C 50 270 95 230 125 170 C 150 120 190 70 240 0';
  s += `<path d="${coast}" fill="none" stroke="#fff" stroke-width="9"/>`;
  s += `<path d="${coast} L0 0 Z" fill="#DDD6FE"/>`;
  s += `<text x="42" y="120" fill="#A78BFA" font-size="12" font-style="italic" transform="rotate(-48 42 120)" letter-spacing=".5">${L.map.ocean}</text>`;
  const lab = (x, y, t, sz = 11, col = '#57534E') => `<text x="${x}" y="${y}" fill="${col}" font-size="${sz}" font-weight="600" letter-spacing="1.2" text-anchor="middle" stroke="#FAFAF8" stroke-width="3" style="paint-order:stroke">${t}</text>`;
  s += lab(110, 300, L.map.anfa) + lab(300, 300, L.map.gauthier) + lab(250, 590, L.map.maarif) + lab(95, 610, L.map.racine);
  s += `<text fill="#A8A29E" font-size="9.5" font-weight="500" stroke="#FAFAF8" stroke-width="3" style="paint-order:stroke" transform="translate(70 520) rotate(-22)">${L.map.bd}</text>`;
  s += `<text fill="#A8A29E" font-size="9.5" font-weight="500" stroke="#FAFAF8" stroke-width="3" style="paint-order:stroke" transform="translate(92 214) rotate(-58)">${L.map.corniche}</text>`;
  return s + `</svg>`;
}
function scrDiscover() {
  const pins = [[80, 345, 1], [150, 262], [208, 370, 1], [268, 432], [128, 452], [338, 262, 1], [308, 548], [180, 560, 1], [70, 540], [236, 226], [42, 410], [352, 600]];
  const clusters = [[338, 442, '12'], [150, 640, '8'], [268, 662, '5']];
  const pinH = pins.map(([x, y, d]) => `<div class="pin" style="left:${x - 15}px;top:${y - 15}px"><img src="img/logo.png">${d ? '<i></i>' : ''}</div>`).join('');
  const clH = clusters.map(([x, y, n]) => `<div class="cluster" style="left:${x - 17}px;top:${y - 17}px">${n}</div>`).join('');
  const chipIcons = ['sparkles', 'coffee', 'utensils', 'croissant', 'heart', 'droplets'];
  const chips = L.chips.map((c, i) => `<div class="mchip ${i === 1 ? 'on' : ''}">${ic(chipIcons[i], 13, i === 1 ? '#fff' : '#64748B', 2)}<span>${c}</span></div>`).join('');
  return `<div class="map">${mapSVG()}${pinH}${clH}<div class="me" style="left:222px;top:494px"></div>
    <div class="pin sel" style="left:189px;top:351px"><img src="img/logo.png"><i></i></div></div>
  ${statusBar()}
  <div class="dtop" style="top:${SAFE.t + 8}px"><div class="circ">${ic('search', 20, '#0F172A', 2)}</div>
    <div class="cpill">${ic('map-pin', 13, '#7C3AED', 2)}<span>${L.count}</span></div>
    <div class="circ on">${ic('sliders-horizontal', 20, '#fff', 2)}</div></div>
  <div class="mchips" style="top:${SAFE.t + 66}px">${chips}</div>
  <div class="locate" style="bottom:${TABH + 152}px">${ic('locate-fixed', 20, '#7C3AED', 2)}</div>
  <div class="callout" style="bottom:${TABH + 12}px"><i class="cbar"></i>
    <div class="cav">${mlogo('coffee', '#0F766E', 38, 10)}</div>
    <div class="cinfo"><div class="cname">Café Mazagan</div><span class="ccat">${L.catCafe}</span>
      <div class="caddr">${ic('map-pin', 11, '#64748B', 2)}<span>${L.callout.addr}</span></div>
      <div class="crow"><span class="cdist">${ic('navigation', 10, '#7C3AED', 2)}${L.callout.dist}</span><span class="cdeal">${ic('badge-percent', 12, '#EF4444', 2)}${L.callout.deal}</span></div></div>
    <div class="cact"><div class="cnav">${ic('navigation', 16, '#fff', 2)}</div>${ic('chevron-right', 18, '#64748B', 2, 'dirflip')}</div></div>
  ${tabBar(3)}${homeInd()}`;
}

/* ---------- screen 4: merchant ---------- */
function scrMerchant() {
  const acc = '#0F766E';
  const acts = ['navigation', 'phone', 'message-circle', 'globe'].map((n, i) => `<div class="qa">${ic(n, 16, '#0F172A', 2)}<span>${L.m.actions[i]}</span></div>`).join('');
  const tabs = L.m.tabs.map((t, i) => `<div class="mt ${i === 0 ? 'on' : ''}">${t}</div>`).join('');
  let dots = ''; for (let i = 0; i < 10; i++) dots += i < 7 ? `<span class="dot on" style="background:${acc};border-color:${acc}">${ic('check', 12, '#fff', 3)}</span>` : `<span class="dot"></span>`;
  const rw = L.m.list.map(([t, d, c], i) => `<div class="rw"><div class="rthumb">${ic(['coffee', 'cake', 'croissant'][i], 20, '#334155', 1.8)}</div><div class="rtext"><div class="rt">${t}</div><div class="rd">${d}</div></div><div class="rc">${c}</div></div>`).join('');
  return `<div class="cover" style="height:${170 + SAFE.t - 20}px"><img src="img/cover.jpg"><i></i></div>
  ${statusBar(true)}
  <div class="fbtns" style="top:${SAFE.t + 4}px"><div class="fb">${ic('arrow-left', 20, '#0F172A', 2, 'dirflip')}</div><div style="flex:1"></div><div class="fb">${ic('share', 18, '#0F172A', 2)}</div><div class="fb">${ic('ellipsis', 18, '#0F172A', 2)}</div></div>
  <div class="mscroll">
    <div class="ident" style="margin-top:${170 + SAFE.t - 20}px"><div class="mlogoframe">${mlogo('coffee', acc, 84, 18)}</div>
      <div class="mname">Café Mazagan</div><div class="msub">${L.m.sub}</div><div class="mtag">${L.m.tagline}</div>
      <div class="mstat"><b>${L.m.open}</b>${L.m.facts}</div></div>
    <div class="qas">${acts}</div>
    <div class="mtabs">${tabs}</div>
    <div class="fsec"><div class="fsh"><span>${L.m.program}</span><a>${L.m.seeAll}</a></div>
      <div class="sp"><div class="spc"><b>7</b><span> / 10</span></div><span class="spg">${L.m.toGo}</span></div>
      <div class="dots10">${dots}</div><div class="nextr">${L.m.next}</div>
      <div class="wrow">${ic('ticket', 18, '#334155', 2)}<span>${L.m.wheelRow}</span>${ic('chevron-right', 16, '#64748B', 2, 'dirflip')}</div></div>
    <div class="fsec" style="border:0"><div class="fsh"><span>${L.m.rewards}</span></div>${rw}</div>
  </div>
  <div class="mbottom" style="padding-bottom:${Math.max(SAFE.b, 10)}px"><div class="mcta">${ic('qr-code', 18, '#fff', 2)}<span>${L.m.cta}</span></div></div>${homeInd()}`;
}

/* ---------- screen 5: deals ---------- */
function scrDeals() {
  const D = L.d;
  const items = [
    { img: 'pastry', price: 45, orig: 60, badge: D.pct(25), merchant: 'Pâtisserie Amandine', dist: D.m(600), time: D.days(3), popular: 1 },
    { img: 'coffee', price: 32, badge: D.bogo, merchant: 'Café Mazagan', dist: D.m(350), time: D.hours(8), urgent: 1 },
    { img: 'pizza', price: 59, orig: 85, badge: D.pct(30), merchant: 'Pizzeria Napoli', dist: D.km(1.2), time: D.days(5) },
    { img: 'beauty', price: 150, orig: 250, badge: D.pct(40), merchant: 'Hammam Zellige', dist: D.km(2.1), time: D.days(6), popular: 1 },
    { img: 'burger', price: 69, orig: 95, badge: D.pct(27), merchant: 'Burger Factory', dist: D.km(1.8), time: D.days(2) },
  ];
  const titleIdx = [0, 2, 1, 3, 4];
  const rows = items.map((d, i) => `<div class="drow"><div class="dthumb" style="background-image:url(img/${d.img}.jpg)"></div><div class="dbody">
    <div class="dtitle">${D.titles[titleIdx[i]]}</div>
    <div class="dprice"><span class="pr">${D.price(d.price)}</span>${d.orig ? `<span class="orig">${D.price(d.orig)}</span>` : ''}<span class="badge">${d.badge}</span></div>
    <div class="dmeta">${ic('store', 13, '#64748B', 2)}<span class="mn">${d.merchant}</span>${ic('map-pin', 12, '#7C3AED', 2)}<span class="ds">${d.dist}</span></div>
    <div class="dtime ${d.urgent ? 'urg' : ''}">${ic('hourglass', 13, d.urgent ? '#F59E0B' : '#64748B', 2)}<span>${d.time}</span>${d.popular ? `<span class="pop">${ic('flame', 11, '#F59E0B', 2.4)}${D.popular}</span>` : ''}</div>
  </div></div>`).join('');
  return `${statusBar()}
  <div class="hdr col" style="padding-top:${SAFE.t + 10}px"><div class="drow1"><div class="h28" style="flex:1">${D.title}</div>
    <div class="city">${ic('map-pin', 14, '#7C3AED', 2)}<span>${D.city}</span>${ic('chevron-down', 14, '#64748B', 2)}</div></div>
    <div class="chips1">${D.tabs.map((t, i) => `<span class="ch ${i === 0 ? 'on' : ''}">${t}</span>`).join('')}</div>
    <div class="chips2">${D.cats.map((t, i) => `<span class="ch2 ${i === 0 ? 'on' : ''}">${t}</span>`).join('')}</div></div>
  <div class="dlist">${rows}</div>${tabBar(1)}${homeInd()}`;
}

/* ---------- screen 6: wheel ---------- */
function scrWheel() {
  const W = L.w, size = 292;
  let bulbs = '';
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, R = size / 2 + 9; bulbs += `<i style="left:${size / 2 + 17 + R * Math.cos(a) - 3.5}px;top:${size / 2 + 17 + R * Math.sin(a) - 3.5}px;opacity:${i % 2 ? 0.35 : 1}"></i>`; }
  const prizes = W.prizeList.map((p) => `<span class="prz">${ic('gift', 14, '#FBBF24', 2)}${p}</span>`).join('');
  return `<div class="wbg"></div>${statusBar(true)}
  <div class="whdr" style="padding-top:${SAFE.t + 6}px"><div class="wx">✕</div><div style="flex:1"></div><div class="wtick">🎟️ ${W.tickets}</div></div>
  <div class="wtitle">${W.title}</div><div class="wsub">${W.sub}</div>
  <div class="stage"><div class="wglow"></div><div class="wframe">${bulbs}<div class="wwheel">${wheelSVG(size, W.segs, false)}<i class="gloss"></i></div></div>
    <svg class="wptr" width="34" height="42" viewBox="0 0 34 42"><defs><linearGradient id="ptr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDE68A"/><stop offset=".5" stop-color="#FBBF24"/><stop offset="1" stop-color="#D97706"/></linearGradient></defs><path d="M17 41 L3.5 16 A14 14 0 1 1 30.5 16 Z" fill="url(#ptr)" stroke="#92400E" stroke-width="1.2"/><circle cx="17" cy="14" r="5" fill="#fff" opacity=".9"/></svg></div>
  <div class="wspin">${W.spin}</div><div class="wrate">${W.rate}</div>
  <div class="wprizes"><div class="wpt">${W.prizes}</div><div class="wpl">${prizes}</div></div>
  <div class="wnotice">${W.notice}</div>${homeInd(true)}`;
}

const SCREENS = [scrCards, scrQR, scrDiscover, scrMerchant, scrDeals, scrWheel];
function screen(i) { return `<div class="scr" dir="${RTL ? 'rtl' : 'ltr'}">${SCREENS[i]()}</div>`; }

/* ---------- canvas ---------- */
function zelligeDefs(id, T, op) {
  const r = T / 2, rc = T * 0.2;
  const tile = [[r, r, r], [0, 0, rc], [T, 0, rc], [0, T, rc], [T, T, rc]].map(([x, y, rr]) => `<path d="${khatam(x, y, rr)}"/>`).join('')
    + `<path d="${square(r, r, r * 0.62, 0)}"/><path d="${square(r, r, r * 0.62, 45)}"/>`;
  return `<pattern id="${id}" width="${T}" height="${T}" patternUnits="userSpaceOnUse"><g fill="none" stroke="#FBBF24" stroke-opacity="${op}" stroke-width="1">${tile}</g></pattern>`;
}
const goldStar = (x, y, r, op = 1) => `<svg class="gstar" style="left:${x - r}px;top:${y - r}px;opacity:${op}" width="${r * 2}" height="${r * 2}"><defs><linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FDE68A"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs><path d="${khatam(r, r, r)}" fill="url(#gs)"/></svg>`;
const ornament = () => `<svg width="120" height="18" viewBox="0 0 120 18"><defs><linearGradient id="og" x1="0" x2="1"><stop offset="0" stop-color="#FBBF24" stop-opacity="0"/><stop offset="1" stop-color="#FBBF24"/></linearGradient><linearGradient id="og2" x1="1" x2="0"><stop offset="0" stop-color="#FBBF24" stop-opacity="0"/><stop offset="1" stop-color="#FBBF24"/></linearGradient></defs><rect x="0" y="8.25" width="46" height="1.5" fill="url(#og)"/><rect x="74" y="8.25" width="46" height="1.5" fill="url(#og2)"/><path d="${khatam(60, 9, 9)}" fill="#FBBF24"/><path d="${khatam(60, 9, 4)}" fill="#4C1D95"/></svg>`;

function phone(i, s, x, y, extra = '') {
  const bez = OS === 'ios' ? 12 * (s / 0.8) : 8 * (s / 0.6), rad = OS === 'ios' ? 55 * s : 34 * s;
  return `<div class="phone ${OS}" style="left:${x}px;top:${y}px;padding:${bez}px;border-radius:${rad + bez}px;${extra}">
    <div class="screenwrap" dir="ltr" style="width:${393 * s}px;height:${852 * s}px;border-radius:${rad}px"><div dir="ltr" style="width:393px;height:852px;transform:scale(${s});transform-origin:0 0">${screen(i)}</div></div></div>`;
}

function shot() {
  const W = OS === 'ios' ? 440 : 360, H = OS === 'ios' ? 956 : 640;
  const s = OS === 'ios' ? 0.8 : 0.565;
  const bez = OS === 'ios' ? 12 : 8 * (s / 0.6);
  const pw = 393 * s + bez * 2, ph = 852 * s + bez * 2;
  const top = OS === 'ios' ? 228 : 150;
  const px = (W - pw) / 2;
  const [h1, h2, sub] = L.heads[SHOT - 1];
  const cy = top + ph * 0.42;
  const R = pw * 0.86;
  const toast = SHOT === 2 ? `<div class="toast" style="top:${top + ph * 0.5}px;${RTL ? 'left' : 'right'}:${OS === 'ios' ? 14 : 8}px"><div class="tck">${ic('check', 18, '#fff', 3)}</div><div><b>${L.toast[0]}</b><span>${L.toast[1]}</span></div></div>` : '';
  const ready = SHOT === 4 ? `<div class="toast gold" style="top:${top + ph * 0.19}px;${RTL ? 'left' : 'right'}:${OS === 'ios' ? 12 : 6}px"><div class="tck g">${ic('gift', 17, '#fff', 2.4)}</div><div><b>${L.rewardReady}</b><span>${L.m.list[0][0]}</span></div></div>` : '';
  return `<div id="canvas" class="${OS}" style="width:${W}px;height:${H}px" dir="${RTL ? 'rtl' : 'ltr'}">
    <svg class="bgpat" width="${W}" height="${H}"><defs>${zelligeDefs('zp', OS === 'ios' ? 64 : 52, 0.12)}
      <radialGradient id="fade" cx="50%" cy="${(cy / H) * 100}%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#fff" stop-opacity="1"/></radialGradient>
      <mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask></defs>
      <rect width="${W}" height="${H}" fill="url(#zp)" mask="url(#m)"/>
      <g fill="none" stroke="#FBBF24" stroke-width="1.4"><path d="${square(W / 2, cy, R, 0)}" stroke-opacity=".32"/><path d="${square(W / 2, cy, R, 45)}" stroke-opacity=".32"/>
      <path d="${khatam(W / 2, cy, R * 0.8)}" stroke-opacity=".16"/></g></svg>
    <div class="glow" style="top:${cy - pw * 0.8}px;left:${W / 2 - pw * 0.8}px;width:${pw * 1.6}px;height:${pw * 1.6}px"></div>
    ${goldStar(W * 0.1, top + 40, OS === 'ios' ? 9 : 7, 0.9)}${goldStar(W * 0.92, top + ph * 0.18, OS === 'ios' ? 12 : 9, 0.95)}${goldStar(W * 0.07, top + ph * 0.72, OS === 'ios' ? 7 : 5, 0.7)}${goldStar(W * 0.88, 40, OS === 'ios' ? 6 : 5, 0.6)}
    <div class="head" style="top:${OS === 'ios' ? 58 : 26}px"><div class="orn">${ornament()}</div>
      <h1>${h1}<br><span class="gold">${h2}</span></h1><p>${sub}</p></div>
    ${phone(SHOT - 1, s, px, top)}${toast}${ready}</div>`;
}

function featureGraphic() {
  const W = 1024, H = 500;
  const s = 0.5;
  const left = RTL ? 70 : 600;
  return `<div id="canvas" class="fg" style="width:${W}px;height:${H}px" dir="${RTL ? 'rtl' : 'ltr'}">
    <svg class="bgpat" width="${W}" height="${H}"><defs>${zelligeDefs('zp', 70, 0.12)}</defs><rect width="${W}" height="${H}" fill="url(#zp)"/>
      <g fill="none" stroke="#FBBF24" stroke-width="1.6"><path d="${square(left + 190, 250, 300, 0)}" stroke-opacity=".3"/><path d="${square(left + 190, 250, 300, 45)}" stroke-opacity=".3"/></g></svg>
    <div class="glow" style="top:-80px;left:${left - 120}px;width:620px;height:620px"></div>
    ${goldStar(RTL ? 960 : 64, 70, 10, 0.9)}${goldStar(RTL ? 560 : 470, 430, 8, 0.7)}
    <div class="fgtext" style="${RTL ? 'right' : 'left'}:64px">
      <div class="fgbrand"><div class="fglogo"><img src="img/logo.png"></div><span>JitPlus</span></div>
      <div class="fgl1">${L.fg.l1}</div><div class="fgl2 gold">${L.fg.l2}</div><div class="fgsub">${ornament()}<span>${L.fg.sub}</span></div></div>
    ${phone(1, s, left + (RTL ? 175 : 0), 70, 'transform:rotate(' + (RTL ? -7 : 7) + 'deg);transform-origin:50% 0;z-index:1')}
    ${phone(0, s, left + (RTL ? 0 : 175), 40, 'transform:rotate(' + (RTL ? 4 : -4) + 'deg);transform-origin:50% 0;z-index:2')}
  </div>`;
}

const ms = document.createElement('style');
ms.textContent = `.stamp i{-webkit-mask-image:url(${LOGO_MASK});mask-image:url(${LOGO_MASK})}`;
document.head.appendChild(ms);
document.getElementById('root').innerHTML = FG ? featureGraphic() : shot();
document.fonts.ready.then(() => { document.body.dataset.ready = '1'; });
