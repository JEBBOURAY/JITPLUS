const q = new URLSearchParams(location.search);
const LANG = q.get('lang') || 'fr', OS = q.get('os') || 'ios', SHOT = +(q.get('shot') || 1), FG = q.has('fg');
const L = T[LANG], RTL = LANG === 'ar';
const SAFE = OS === 'ios' ? { t: 54, b: 34 } : { t: 36, b: 22 };
document.documentElement.lang = LANG;
document.body.classList.add(LANG, OS);
const V = '#7C3AED', MUTED = '#64748B', GOLD = '#D4A64A';

const ic = (n, s = 20, c = 'currentColor', w = 2, cls = '') =>
  `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="color:${c}">${ICONS[n] || ''}</svg>`;
const jit = (n, s = 20, c = V, w = 1.75) => ic('jit-' + n, s, c, w);

const KIN = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
function khatam(cx, cy, r, rot = 0) {
  let d = '';
  for (let k = 0; k < 16; k++) { const a = ((rot + k * 22.5 - 90) * Math.PI) / 180, rr = k % 2 ? r * KIN : r; d += (k ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2); }
  return d + 'Z';
}
const square = (cx, cy, r, rot) => { let d = ''; for (let k = 0; k < 4; k++) { const a = ((rot + k * 90 - 90) * Math.PI) / 180; d += (k ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2); } return d + 'Z'; };

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
  const icons = ['home', 'clients', 'scan', 'messages', 'team'];
  const items = icons.map((n, i) => {
    const on = i === active;
    if (i === 2) return `<div class="tab"><div class="tic"></div><div class="scanbtn">${jit('scan', 26, '#fff')}</div><span class="tl">${L.tabs[i]}</span></div>`;
    return `<div class="tab">${on ? '<div class="tind"></div>' : ''}<div class="tic ${on ? 'on' : ''}">${jit(n, 22, on ? V : MUTED)}</div><span class="tl ${on ? 'on' : ''}">${L.tabs[i]}</span></div>`;
  }).join('');
  return `<div class="tabbar" style="bottom:${SAFE.b + 18}px">${items}</div>`;
}
const backHdr = (title, size = 18) => `<div class="bhdr" style="padding-top:${SAFE.t + 12}px">${ic('arrow-left', 22, '#0F172A', 2, 'dirflip')}<span style="font-size:${size}px">${title}</span></div>`;

/* PromoIcons on a 64 grid */
function lantern(C) {
  return `<g stroke="${C}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none">
  <circle cx="32" cy="5.5" r="2"/><path d="M32 7.5 V11 M24 17 L32 11 L40 17"/>
  <path d="M24 17 L20 31 L24 47 H40 L44 31 L40 17 Z" fill="${C}" fill-opacity=".16"/>
  <path d="M27.5 43 V31 C27.5 26.5 30 24 32 22 C34 24 36.5 26.5 36.5 31 V43 Z" stroke-width="1.3"/>
  <path d="${khatam(32, 35, 3.6)}" fill="${C}" stroke="none"/>
  <path d="M25 47 L28 52 H36 L39 47 M32 52 V56"/>
  <path d="M13 31 H9 M51 31 H55 M15.5 20 L12.5 17 M48.5 20 L51.5 17 M15.5 42 L12.5 45 M48.5 42 L51.5 45" opacity=".7"/></g>`;
}
function gate(C) {
  return `<g stroke="${C}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none">
  <path d="M6 58 H58 M12 58 V12 H52 V58"/><path d="M21 58 V40.66 A14 14 0 1 1 43 40.66 V58"/>
  <path d="M24.5 58 V37.83 A9.5 9.5 0 1 1 39.5 37.83 V58 Z" fill="${C}" fill-opacity=".16"/>
  <path d="M32 22.5 V58" stroke-width="1.3"/><circle cx="29.5" cy="42" r="1.1" fill="${C}"/><circle cx="34.5" cy="42" r="1.1" fill="${C}"/>
  <path d="${khatam(18, 18, 3.2)}" stroke-width="1.3"/><path d="${khatam(46, 18, 3.2)}" stroke-width="1.3"/></g>`;
}
function promoBanner(i, w, tone, deep, art, zel, txt) {
  const id = 'pb' + i, ix = RTL ? 66 : w - 66;
  let z = '';
  if (zel) for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) { const x = 18 + c * 40 + (r % 2) * 20, y = 30 + 12 + r * 32; z += `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" transform="rotate(45 ${x} ${y})" fill="none" stroke="rgba(255,255,255,.08)"/>`; }
  return `<div class="pbw" style="width:${w}px"><svg width="${w}" height="154" viewBox="0 0 ${w} 154" style="overflow:visible">
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tone}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <clipPath id="${id}c"><rect x="0" y="30" width="${w}" height="124" rx="20"/></clipPath></defs>
    <rect x="0" y="30" width="${w}" height="124" rx="20" fill="url(#${id}g)" style="filter:drop-shadow(0 8px 10px ${tone}48)"/>
    <g clip-path="url(#${id}c)">${z}</g>
    <g transform="translate(${ix - 56},0) scale(1.75)">${art(tone)}</g>
    <g clip-path="url(#${id}c)"><g transform="translate(${ix - 56},0) scale(1.75)">${art('#fff')}</g></g></svg>
    <div class="pbt" style="width:${w * 0.62}px"><div class="pbl">${txt[0]}</div><div class="pbh">${txt[1]}</div><span class="pbc" style="color:${tone}">${txt[2]}</span></div></div>`;
}

/* 1. Home */
function scrHome() {
  const bars = [9, 14, 11, 18, 22, 15, 26, 19, 24, 31, 47, 0, 0, 0, 0];
  const max = 47;
  const barH = bars.map((v, i) => `<i style="height:${3 + (v / max) * 33}px;background:${i === 10 ? GOLD : i > 10 ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.26)'}"></i>`).join('');
  const qa = ['store', 'stamp', 'games', 'deals'].map((n, i) => `<div class="qa"><div class="qac">${jit(n, 20, '#fff')}</div><span>${L.qa[i]}</span></div>`).join('');
  const rows = [['Yasmine Benali', '16:35', '+1', 'arrow-up-right'], ['Karim El Idrissi', '16:12', '+2', 'arrow-up-right'], ['Salma Alaoui', '15:48', null, 'jit-gift']].map(([n, t, a, icn], i) =>
    `<div class="trow"${i ? '' : ' style="border:0"'}><div class="ttile">${icn.startsWith('jit-') ? jit(icn.slice(4), 18) : ic(icn, 18, V, 2)}</div><div class="tt"><div class="tn">${n}</div><div class="ts">${L.today}, ${t}</div></div>${a ? `<div class="ta"><b>${a}</b>${jit('stamp', 13, '#0F172A')}</div>` : `<div class="ta muted">${L.redeemed}</div>`}</div>`).join('');
  return `<div class="hero" style="padding-top:${SAFE.t + 62}px"><i class="hglow"></i>
    <div class="htop" style="top:${SAFE.t}px"><div class="ppill"><div class="pav">CM</div><span><em>${L.hello}</em> <b>Café Mazagan</b></span>${ic('chevron-right', 16, 'rgba(255,255,255,.65)', 2, 'dirflip')}</div>
      <div class="bellb">${jit('bell', 18, '#fff')}<i></i></div></div>
    <div class="kpi"><div class="kl">${L.kpiLabel}</div><div class="kv">47</div><div class="kd">${ic('trending-up', 12, '#fff', 2)}<span>${L.delta}</span></div></div>
    <div class="mo"><div class="mot"><span class="mol">${L.month}</span><span class="mor"><b>${L.monthTotal}</b> <em>${L.scans}</em>${ic('chevron-right', 15, 'rgba(255,255,255,.65)', 2, 'dirflip')}</span></div><div class="bars">${barH}</div></div>
    <div class="qas">${qa}</div></div>
  ${statusBar(true)}
  <div class="hc"><div class="carou">${promoBanner(0, 345, '#C2410C', '#7C2D12', lantern, true, L.promo[0])}${promoBanner(1, 345, '#7C3AED', '#4C1D95', gate, false, L.promo[1])}</div>
    <div class="pdots"><i style="width:18px;background:#C2410C"></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="secT">${L.recent}</div><div class="rcard">${rows}</div></div>
  ${tabBar(0)}${homeInd()}`;
}

/* 2. Scan */
function scrScan() {
  const sq = 393 * 0.68, top = Math.max((852 - sq) / 2 - 40, 100), left = (393 - sq) / 2;
  const c = (pos) => `<i class="cor ${pos}"></i>`;
  return `<div class="cam"><img src="img/camera.jpg" class="camimg"><img src="img/clientqr_${LANG}.jpg" class="phs"><i class="notch"></i></div>
  <div class="mask" style="top:0;left:0;right:0;height:${top}px"></div><div class="mask" style="top:${top + sq}px;left:0;right:0;bottom:0"></div>
  <div class="mask" style="top:${top}px;left:0;width:${left}px;height:${sq}px"></div><div class="mask" style="top:${top}px;right:0;width:${left}px;height:${sq}px"></div>
  <div class="frame" style="top:${top}px;left:${left}px;width:${sq}px;height:${sq}px">${c('tl')}${c('tr')}${c('bl')}${c('br')}<i class="sline"></i>
    <div class="found">${ic('check', 20, '#fff', 3)}<span>${L.scan.found}</span></div></div>
  ${statusBar(true)}
  <div class="sbar" style="top:${SAFE.t + 12}px">${ic('search', 18, 'rgba(255,255,255,.6)', 2)}<span class="cc">+212 ${ic('chevron-down', 12, '#C4B5FD', 2)}</span><span class="ph">${L.scan.phone}</span></div>
  <div class="sctl" style="padding-bottom:${Math.max(SAFE.b, 26) + 6}px"><div><div class="scb">${ic('flashlight', 22, '#fff', 2)}</div><span>${L.scan.flash}</span></div><div><div class="scb">${ic('x', 22, '#fff', 2)}</div><span>${L.scan.close}</span></div></div>
  ${homeInd(true)}`;
}

/* 3. Add stamps */
function scrStamps() {
  const S = L.st;
  let st = '';
  for (let i = 0; i < 10; i++) st += i < 7 ? `<span class="sc on">${ic('check', 15, V, 3)}</span>` : i === 7 ? `<span class="sc pend">${ic('plus', 15, '#111827', 3)}</span>` : i === 9 ? `<span class="sc">${jit('gift', 14, 'rgba(255,255,255,.85)')}</span>` : `<span class="sc"></span>`;
  const rw = S.rewards.map(([n, c, b, k]) => `<div class="rrow"><div class="rth">${jit('gift', 20)}</div><div class="rtx"><div class="rn">${n}</div><div class="rc">${jit('stamp', 12, '#334155')}<span>${c}</span></div></div><span class="rb ${k}">${b}</span><span class="radio"></span></div>`).join('');
  return `${statusBar()}${backHdr(S.title)}
  <div class="scroll">
    <div class="ccard"><div class="ctop"><div class="cav">YB</div><div class="cnm"><div class="ccap">${S.card}</div><div class="cname">Yasmine Benali</div></div><div class="cbal"><b>7</b><span>${S.unit}</span></div></div>
      <div class="cst">${st}</div><div class="cft"><span>${S.progress}</span><span class="cpend">${S.pending}</span></div></div>
    <div class="ecard"><div class="vt"><div class="vic">${jit('stamp', 22, '#fff')}</div><div class="vtx"><div class="vtt">${S.visitTitle}</div><div class="vts">${S.visitOn}</div></div><span class="sw"><i></i></span></div></div>
    <div class="ecard"><div class="rh"><div class="rhi">${jit('gift', 18)}</div><span class="rht">${S.rewardsTitle}</span><span class="opt">${S.optional}</span></div>${rw}</div>
  </div>
  <div class="abar" style="padding-bottom:${Math.max(SAFE.b, 12) + 4}px"><div class="sum"><span>${S.balance}</span><span class="balp"><em>7</em>${ic('arrow-right', 13, MUTED, 2, 'dirflip')}<b>8</b></span></div>
    <div class="cta">${ic('circle-check', 20, '#fff', 2)}<span>${S.cta}</span></div></div>${homeInd()}`;
}

/* 4. Clients */
function scrClients() {
  const C = L.cl;
  const people = [['Yasmine Benali', 7], ['Karim El Idrissi', 10], ['Salma Alaoui', 4], ['Youssef Amrani', 9], ['Imane Tazi', 2], ['Omar Berrada', 6], ['Nadia Chraibi', 10], ['Mehdi Bennani', 3]];
  const rows = people.map(([n, s], i) => {
    const ini = n.split(' ').map((p) => p[0]).slice(0, 2).join('');
    const right = s >= 10 ? `<span class="gready">${jit('gift', 13, '#B8862F')}${C.ready}</span>` : `<span class="cnt"><b>${s}</b><em>/10</em>${jit('stamp', 13, '#0F172A')}</span>`;
    return `<div class="crow"><div class="cavq">${ini}</div><div class="cmid"><div class="cn">${n}</div><div class="cm">${C.last(C.ago[i])}</div><div class="pbar"><i style="width:${Math.min(1, s / 10) * 100}%${s >= 10 ? ';background:' + GOLD : ''}"></i></div></div>${right}</div>`;
  }).join('');
  const chipIc = [jit('clients', 14, '#fff'), jit('gift', 14, '#334155'), ic('heart', 14, '#334155', 2), ic('clock', 14, '#334155', 2)];
  return `${statusBar()}<div class="th" style="padding-top:${SAFE.t + 12}px">${C.title}</div>
  <div class="srch">${ic('search', 16, '#1F2937', 2)}<span>${C.search}</span></div>
  <div class="fchips">${C.chips.map((c, i) => `<span class="fc ${i === 0 ? 'on' : ''}">${chipIc[i]}${c}</span>`).join('')}</div>
  <div class="csum">${C.summary}</div><div class="clist">${rows}</div>${tabBar(1)}${homeInd()}`;
}

/* 5. Stats */
function scrStats() {
  const D = L.db;
  const tIc = ['clients', 'scan', 'stamp', 'gift'];
  const tiles = D.tiles.map(([l, v, n], i) => `<div class="stile"><div class="stl">${jit(tIc[i], 15, MUTED)}<span>${l}</span></div><div class="stv">${v}</div><div class="stn">${n}</div></div>`).join('');
  const pts = [28, 41, 36, 52, 47, 50, 58], W = 353 - 36, H = 180, top = 40, inset = 14;
  const xs = pts.map((_, i) => inset + (i * (W - 2 * inset)) / (pts.length - 1)), ys = pts.map((v) => top + (1 - v / 64) * (H - top - 24));
  let d = `M${xs[0]} ${ys[0]}`;
  for (let i = 1; i < pts.length; i++) { const mx = (xs[i - 1] + xs[i]) / 2; d += ` C${mx} ${ys[i - 1]} ${mx} ${ys[i]} ${xs[i]} ${ys[i]}`; }
  const base = H - 24, area = d + ` L${xs[6]} ${base} L${xs[0]} ${base} Z`;
  const days = ['22/10', '23/10', '24/10', '25/10', '26/10', '27/10', '28/10'];
  const lab = days.map((t, i) => `<text x="${xs[i]}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${MUTED}">${t}</text>`).join('');
  const chart = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" direction="ltr"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${V}" stop-opacity=".18"/><stop offset="1" stop-color="${V}" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="#E2E8F0" stroke-dasharray="3 5"/><line x1="0" x2="${W}" y1="${(top + base) / 2}" y2="${(top + base) / 2}" stroke="#E2E8F0" stroke-dasharray="3 5"/><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#E2E8F0"/>
    <text x="0" y="${top - 6}" font-size="11" fill="${MUTED}">64</text>
    <path d="${area}" fill="url(#ag)"/><path d="${d}" fill="none" stroke="${V}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="${xs[6]}" x2="${xs[6]}" y1="${top - 4}" y2="${base}" stroke="${V}" stroke-opacity=".35"/><circle cx="${xs[6]}" cy="${ys[6]}" r="5" fill="#fff" stroke="${V}" stroke-width="2.5"/>
    <g transform="translate(${xs[6] - 70} ${ys[6] - 44})"><rect width="62" height="34" rx="8" fill="#0F172A"/><text x="10" y="15" font-size="13" font-weight="700" fill="#fff">58</text><text x="10" y="28" font-size="10" fill="#fff" opacity=".75">28/10</text></g>${lab}</svg>`;
  return `${statusBar()}<div class="bhdr" style="padding:${SAFE.t + 8}px 20px 0">${ic('arrow-left', 22, '#0F172A', 2, 'dirflip')}<span style="font-size:26px;letter-spacing:-.5px">${D.title}</span></div>
  <div class="dscroll"><div class="dsec">${D.program}</div>
    <div class="ov"><div class="ovg">${tiles}</div><div class="ovf">${ic('eye', 15, MUTED, 2)}<span>${D.views}</span></div></div>
    <div class="dsec">${D.evo}</div>
    <div class="seg">${D.periods.map((p, i) => `<span class="${i === 0 ? 'on' : ''}">${p}</span>`).join('')}</div>
    <div class="evc"><div class="mpills">${D.metrics.map((m, i) => `<span class="${i === 0 ? 'on' : ''}">${m}</span>`).join('')}</div>
      <div class="tot"><b>${D.total}</b><span>${D.deltaP}</span></div><div class="cap">${D.caption}</div>${chart}</div>
  </div>${homeInd()}`;
}

/* 6. Messages */
function scrMessages() {
  const M = L.msg;
  const tplIc = ['percent', 'sparkles', 'calendar', 'heart'];
  return `${statusBar()}<div class="mh" style="padding-top:${SAFE.t + 12}px"><div style="flex:1"><div class="th0">${M.title}</div><div class="mhs">${M.sub}</div></div><span class="histp">${ic('clock', 16, MUTED, 2)}${M.history}</span></div>
  <div class="mscroll"><div class="stepT"><i>1</i>${M.step1}</div>
    <div class="chs"><div class="chc on"><div class="cht"><span class="chi">${jit('bell', 20)}</span><span class="chk">${ic('check', 13, '#fff', 3)}</span></div><div class="chn">${M.ch[0][0]}</div><div class="chd">${M.ch[0][1]}</div></div>
      <div class="chc"><div class="cht"><span class="chi">${ic('mail', 20, '#334155', 1.75)}</span><span class="chr"></span></div><div class="chn">${M.ch[1][0]}</div><div class="chd">${M.ch[1][1]}</div></div></div>
    <div class="stepT"><i>2</i>${M.step2}</div>
    <div class="comp"><div class="flab"><span>${M.templates}</span></div><div class="tpls">${M.tpl.map((t, i) => `<span class="${i === 0 ? 'on' : ''}">${ic(tplIc[i], 14, i === 0 ? V : '#334155', 2)}${t}</span>`).join('')}</div>
      <div class="flab"><span>${M.tLabel}</span><em>${[...M.tVal].length}/100</em></div><div class="inp foc">${M.tVal}</div>
      <div class="flab"><span>${M.bLabel}</span><em>${[...M.bVal].length}/500</em></div><div class="inp tall">${M.bVal}</div>
      <div class="aud">${jit('clients', 18, V)}<div><b>${M.audience}</b><span>${M.audienceVal}</span></div></div></div>
    <div class="sendb">${ic('send', 18, '#fff', 2)}<span>${M.send}</span></div>
  </div>${tabBar(3)}${homeInd()}`;
}

const SCREENS = [scrHome, scrScan, scrStamps, scrClients, scrStats, scrMessages];
const screen = (i) => `<div class="scr" dir="${RTL ? 'rtl' : 'ltr'}">${SCREENS[i]()}</div>`;

/* canvas */
function zelligeDefs(id, T, op) {
  const r = T / 2, rc = T * 0.2;
  const tile = [[r, r, r], [0, 0, rc], [T, 0, rc], [0, T, rc], [T, T, rc]].map(([x, y, rr]) => `<path d="${khatam(x, y, rr)}"/>`).join('') + `<path d="${square(r, r, r * 0.62, 0)}"/><path d="${square(r, r, r * 0.62, 45)}"/>`;
  return `<pattern id="${id}" width="${T}" height="${T}" patternUnits="userSpaceOnUse"><g fill="none" stroke="#E8C77A" stroke-opacity="${op}" stroke-width="1">${tile}</g></pattern>`;
}
const goldStar = (x, y, r, op = 1) => `<svg class="gstar" style="left:${x - r}px;top:${y - r}px;opacity:${op}" width="${r * 2}" height="${r * 2}"><defs><linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D58C"/><stop offset="1" stop-color="#D4A64A"/></linearGradient></defs><path d="${khatam(r, r, r)}" fill="url(#gs)"/></svg>`;
const ornament = () => `<svg width="120" height="18" viewBox="0 0 120 18"><defs><linearGradient id="og" x1="0" x2="1"><stop offset="0" stop-color="#E2B95E" stop-opacity="0"/><stop offset="1" stop-color="#E2B95E"/></linearGradient><linearGradient id="og2" x1="1" x2="0"><stop offset="0" stop-color="#E2B95E" stop-opacity="0"/><stop offset="1" stop-color="#E2B95E"/></linearGradient></defs><rect x="0" y="8.25" width="46" height="1.5" fill="url(#og)"/><rect x="74" y="8.25" width="46" height="1.5" fill="url(#og2)"/><path d="${khatam(60, 9, 9)}" fill="#E2B95E"/><path d="${khatam(60, 9, 4)}" fill="#3B1677"/></svg>`;
function phone(i, s, x, y, extra = '') {
  const bez = OS === 'ios' ? 12 * (s / 0.8) : 8 * (s / 0.6), rad = OS === 'ios' ? 55 * s : 34 * s;
  return `<div class="phone ${OS}" style="left:${x}px;top:${y}px;padding:${bez}px;border-radius:${rad + bez}px;${extra}">
    <div class="screenwrap" dir="ltr" style="width:${393 * s}px;height:${852 * s}px;border-radius:${rad}px"><div dir="ltr" style="width:393px;height:852px;transform:scale(${s});transform-origin:0 0">${screen(i)}</div></div></div>`;
}
const toastHTML = (cls, icon, a, b, style) => `<div class="toast ${cls}" style="${style}"><div class="tck ${cls}">${icon}</div><div><b>${a}</b><span>${b}</span></div></div>`;

function shot() {
  const W = OS === 'ios' ? 440 : 360, H = OS === 'ios' ? 956 : 640;
  const s = OS === 'ios' ? 0.8 : 0.565, bez = OS === 'ios' ? 12 : 8 * (s / 0.6);
  const pw = 393 * s + bez * 2, ph = 852 * s + bez * 2, top = OS === 'ios' ? 228 : 150, px = (W - pw) / 2;
  const [h1, h2, sub] = L.heads[SHOT - 1];
  const cy = top + ph * 0.42, R = pw * 0.86, side = OS === 'ios' ? 12 : 6;
  let extra = '';
  if (SHOT === 3) extra = toastHTML('ok', ic('check', 18, '#fff', 3), L.toast3[0], L.toast3[1], `top:${top + ph * 0.7}px;${RTL ? 'left' : 'right'}:${side}px`);
  if (SHOT === 6) extra = `<div class="push" style="top:${top + ph * 0.6}px;left:${OS === 'ios' ? 22 : 14}px;right:${OS === 'ios' ? 22 : 14}px" dir="${RTL ? 'rtl' : 'ltr'}"><div class="pushapp"><img src="img/clientlogo.png"></div><div class="pushb"><div class="pushh"><b>JitPlus</b><span>${L.msg.now}</span></div><div class="pusht">${L.msg.pushTitle}</div><div class="pushm">${L.msg.pushBody}</div></div></div>`;
  return `<div id="canvas" class="${OS}" style="width:${W}px;height:${H}px" dir="${RTL ? 'rtl' : 'ltr'}">
    <svg class="bgpat" width="${W}" height="${H}"><defs>${zelligeDefs('zp', OS === 'ios' ? 64 : 52, 0.13)}
      <radialGradient id="fade" cx="50%" cy="${(cy / H) * 100}%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#fff" stop-opacity="1"/></radialGradient>
      <mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask></defs>
      <rect width="${W}" height="${H}" fill="url(#zp)" mask="url(#m)"/>
      <g fill="none" stroke="#E2B95E" stroke-width="1.4"><path d="${square(W / 2, cy, R, 0)}" stroke-opacity=".32"/><path d="${square(W / 2, cy, R, 45)}" stroke-opacity=".32"/><path d="${khatam(W / 2, cy, R * 0.8)}" stroke-opacity=".16"/></g></svg>
    <div class="glow" style="top:${cy - pw * 0.8}px;left:${W / 2 - pw * 0.8}px;width:${pw * 1.6}px;height:${pw * 1.6}px"></div>
    ${goldStar(W * 0.1, top + 40, OS === 'ios' ? 9 : 7, 0.9)}${goldStar(W * 0.92, top + ph * 0.18, OS === 'ios' ? 12 : 9, 0.95)}${goldStar(W * 0.07, top + ph * 0.72, OS === 'ios' ? 7 : 5, 0.7)}${goldStar(W * 0.88, 40, OS === 'ios' ? 6 : 5, 0.6)}
    <div class="head" style="top:${OS === 'ios' ? 58 : 26}px"><div class="orn">${ornament()}</div><h1>${h1}<br><span class="gold">${h2}</span></h1><p>${sub}</p></div>
    ${phone(SHOT - 1, s, px, top)}${extra}</div>`;
}
function featureGraphic() {
  const W = 1024, H = 500, s = 0.5, left = RTL ? 70 : 600;
  return `<div id="canvas" class="fg" style="width:${W}px;height:${H}px" dir="${RTL ? 'rtl' : 'ltr'}">
    <svg class="bgpat" width="${W}" height="${H}"><defs>${zelligeDefs('zp', 70, 0.13)}</defs><rect width="${W}" height="${H}" fill="url(#zp)"/>
      <g fill="none" stroke="#E2B95E" stroke-width="1.6"><path d="${square(left + 190, 250, 300, 0)}" stroke-opacity=".3"/><path d="${square(left + 190, 250, 300, 45)}" stroke-opacity=".3"/></g></svg>
    <div class="glow" style="top:-80px;left:${left - 120}px;width:620px;height:620px"></div>
    ${goldStar(RTL ? 960 : 64, 70, 10, 0.9)}${goldStar(RTL ? 560 : 470, 430, 8, 0.7)}
    <div class="fgtext" style="${RTL ? 'right' : 'left'}:64px"><div class="fgbrand"><div class="fglogo"><img src="img/logo.png"></div><span>JitPlus <em class="gold">Pro</em></span></div>
      <div class="fgl1">${L.fg.l1}</div><div class="fgl2 gold">${L.fg.l2}</div><div class="fgsub">${ornament()}<span>${L.fg.sub}</span></div></div>
    ${phone(4, s, left + (RTL ? 175 : 0), 70, 'transform:rotate(' + (RTL ? -7 : 7) + 'deg);transform-origin:50% 0;z-index:1')}
    ${phone(0, s, left + (RTL ? 0 : 175), 40, 'transform:rotate(' + (RTL ? 4 : -4) + 'deg);transform-origin:50% 0;z-index:2')}</div>`;
}
document.getElementById('root').innerHTML = q.has('raw') ? screen(SHOT - 1) : FG ? featureGraphic() : shot();
