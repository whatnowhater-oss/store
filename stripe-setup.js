// Creates (or reuses) the Stripe products, prices and Payment Links in store.config.json,
// writes the links back into the config, then rebuilds docs/.
// Safe to re-run: everything is matched by metadata.store_id.
//
// Usage (PowerShell):  $env:STRIPE_SECRET_KEY = (Get-Content $HOME\.stripe-key); node stripe-setup.js
// The key never needs to be pasted anywhere else. A restricted key with write access to
// Products, Prices and Payment Links is enough.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('[stripe-setup] Set STRIPE_SECRET_KEY first.');
  process.exit(1);
}
const root = __dirname;
const cfgPath = path.join(root, 'store.config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

async function api(method, endpoint, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = `https://api.stripe.com/v1/${endpoint}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${endpoint}: ${json.error && json.error.message}`);
  return json;
}

async function findByStoreId(endpoint, id) {
  let starting_after;
  for (;;) {
    const page = await api('GET', endpoint, { limit: '100', ...(starting_after ? { starting_after } : {}) });
    const hit = page.data.find((o) => o.metadata && o.metadata.store_id === id && o.active !== false);
    if (hit) return hit;
    if (!page.has_more) return null;
    starting_after = page.data[page.data.length - 1].id;
  }
}

(async () => {
  execFileSync(process.execPath, [path.join(root, 'build.js')], { stdio: 'inherit' });

  for (const [id, p] of Object.entries(cfg.products)) {
    let product = await findByStoreId('products', id);
    if (!product) product = await api('POST', 'products', { name: p.name, description: p.description, 'metadata[store_id]': id });

    let price = await findByStoreId('prices', id);
    if (price && price.unit_amount !== p.amount) {
      await api('POST', `prices/${price.id}`, { active: 'false' });
      price = null;
    }
    if (!price) {
      price = await api('POST', 'prices', { product: product.id, unit_amount: String(p.amount), currency: 'usd', 'metadata[store_id]': id });
    }

    // Kit zips live in private storage; buyers get the link on Stripe's confirmation page only.
    const redirect = p.downloadUrl ? null : `${cfg.baseUrl}/${p.after}`;
    let link = await findByStoreId('payment_links', id);
    const linkPrice = link && (await api('GET', `payment_links/${link.id}/line_items`)).data[0].price.id;
    if (link && linkPrice !== price.id) {
      await api('POST', `payment_links/${link.id}`, { active: 'false' });
      link = null;
    }
    const params = redirect
      ? { 'after_completion[type]': 'redirect', 'after_completion[redirect][url]': redirect }
      : {
          'after_completion[type]': 'hosted_confirmation',
          'after_completion[hosted_confirmation][custom_message]':
            `Thanks for buying! Download your files here: ${p.downloadUrl}
Bookmark this link: updates go to the same file. Start with START_HERE.md inside the zip.
Questions or a refund within 14 days: reply to your Stripe receipt email.`,
        };
    Object.assign(params, {
      'metadata[store_id]': id,
      // The order desk (graphify ops/) routes orders by this; see ops/WIRING.md.
      'metadata[product]': id === 'xray' ? 'xray' : 'kit',
    });
    if (p.repoField) {
      Object.assign(params, {
        'custom_fields[0][key]': 'repo',
        'custom_fields[0][label][type]': 'custom',
        'custom_fields[0][label][custom]': 'Public GitHub URL, or write PRIVATE',
        'custom_fields[0][type]': 'text',
      });
    }
    if (link) link = await api('POST', `payment_links/${link.id}`, params);
    else link = await api('POST', 'payment_links', { 'line_items[0][price]': price.id, 'line_items[0][quantity]': '1', ...params });

    p.link = link.url;
    console.log(`[stripe-setup] ${id}: ${link.url} -> ${redirect || 'confirmation page'}`);
  }

  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  execFileSync(process.execPath, [path.join(root, 'build.js')], { stdio: 'inherit' });
})().catch((e) => {
  console.error(`[stripe-setup] ${e.message}`);
  process.exit(1);
});
