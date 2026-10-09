// Sekali guna (F1): sisip guard pemilik pada setiap fungsi global operasi.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const ALLOW = new Set(['doGet', 'doPost', 'include', 'api', 'publicApi', 'publicSidebar', 't', 'getDictionary']);
let n = 0;
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.gs'))) {
  const p = path.join(SRC, f);
  let src = fs.readFileSync(p, 'utf8');
  src = src.replace(/^function\s+([A-Za-z0-9$]*[A-Za-z0-9$])\s*\(([^)]*)\)\s*\{([ \t]*)(\r?\n)?/gm, (m, name, args, sp, nl) => {
    if (ALLOW.has(name)) return m;
    const after = src.slice(src.indexOf(m) + m.length, src.indexOf(m) + m.length + 120);
    if (/^\s*requireOwner/.test(after)) return m;
    n++;
    const guard = `requireOwnerOrTrigger_('${name}', arguments[0]);`;
    return nl ? `function ${name}(${args}) {${sp}${nl}  ${guard}${nl}` : `function ${name}(${args}) { ${guard}${sp}`;
  });
  fs.writeFileSync(p, src);
}
console.log('guard disisip:', n);
