# Store

Static storefront for Codebase X-ray and the Agent-Ready Repo Kit, served by GitHub Pages from `docs/`.

- `node build.js` renders `src/` and `static/` into `docs/` using `store.config.json`.
- `node stripe-setup.js` (with `STRIPE_SECRET_KEY` set) creates or reuses the Stripe products, prices and Payment Links, writes the links into `store.config.json` and rebuilds. Safe to re-run.
- Change a price: edit `amount` (cents) in `store.config.json`, re-run `stripe-setup.js`, commit and push.
- Digital downloads live in unguessable `dl/<product>-<token>/` folders that Stripe redirects to after payment. To rotate a link, rename the folder and re-run `stripe-setup.js`.
