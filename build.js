// Renders src/ + static/ into docs/ (served by GitHub Pages) using store.config.json.
// Usage: node build.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'store.config.json'), 'utf8'));
const out = path.join(root, 'docs');
const contact = cfg.contactEmail;

const vars = {
  CONTACT_EMAIL: contact,
  XRAY_PAY_URL: cfg.products.xray.link,
  GUIDE_PAY_URL: cfg.products.guide.link,
  KIT_PAY_URL: cfg.products.kit.link,
  TEAM_PAY_URL: cfg.products.team.link,
  HOOKS_PAY_URL: cfg.products.hooks.link,
};

function render(text, extra = {}) {
  const all = { ...vars, ...extra };
  // With no contact address yet, point buyers at their Stripe receipt instead of a dead mailto link.
  if (!cfg.contactEmail) {
    text = text.replace(/<a [^>]*href="mailto:%%CONTACT_EMAIL%%"[^>]*>%%CONTACT_EMAIL%%<\/a>/g, 'reply to your Stripe receipt email');
    all.CONTACT_EMAIL = 'us by replying to your Stripe receipt';
  }
  // Hide the Repo Safety Hooks section until its checkout is switched on.
  if (!cfg.products.hooks || !cfg.products.hooks.link) text = text.replace(/\n  <section id="hooks">[\s\S]*?<\/section>/, '');
  return text.replace(/%%([A-Z_]+)%%/g, (m, k) => (k in all ? all[k] : m));
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const rel of ['index.html', 'kit/index.html', 'xray/index.html', 'xray/thanks.html']) {
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, render(fs.readFileSync(path.join(root, 'src', rel), 'utf8')));
}

fs.copyFileSync(path.join(root, 'static/base.css'), path.join(out, 'base.css'));
fs.copyFileSync(path.join(root, 'static/logo.svg'), path.join(out, 'logo.svg'));
copyDir(path.join(root, 'static/xray-samples'), path.join(out, 'xray/samples'));

// Kit downloads are hosted privately (Google Drive) and linked from the Stripe confirmation page, never in this public repo.
fs.writeFileSync(path.join(out, '.nojekyll'), '');

if (!cfg.contactEmail) console.warn('[build] contactEmail is empty; pages tell buyers to reply to their Stripe receipt');
console.log('[build] wrote docs/');
