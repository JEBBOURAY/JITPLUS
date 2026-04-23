const fs = require('fs');
function amend(lang, text) {
  const p = 'apps/jitplus/i18n/locales/' + lang + '.ts';
  let f = fs.readFileSync(p, 'utf8');
  f = f.replace(/scanHistory:\s:\r\nm{\[\s\S]*?\},,?\r?\n/g, ''); // Hacky
  f = f.replace(/\];?\s,*$/, (k) => ''); // remove enders
  // easier: replace just using eval
}