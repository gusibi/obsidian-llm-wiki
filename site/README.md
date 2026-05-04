# LLM Wiki — Landing Page

Landing page for [LLM Wiki](https://github.com/gusibi/obsidian-llm-wiki), built with [Astro](https://astro.build).

## Quick Start

```bash
cd landing
npm install
npm run dev       # http://localhost:4321
```

## Add a New Language

1. Copy `src/i18n/en.json` → `src/i18n/ja.json`, translate all values
2. Register it in `src/i18n/utils.ts`:
   ```ts
   import ja from './ja.json';
   const dicts: Record<string, typeof en> = { en, zh, ja };
   ```
3. In each `src/pages/[locale]/*.astro`, add the new locale to `getStaticPaths()`
4. `npm run build`

## Deploy to Cloudflare Pages

### Option 1: Via Git (Recommended)

1. Push the repo to GitHub
2. In Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
3. Configure:
   - **Build command:** `cd landing && npm install && npm run build`
   - **Build output directory:** `landing/dist`
   - **Node.js version:** 18+ (or latest LTS)
4. Deploy

### Option 2: Direct Upload (wrangler)

```bash
cd landing
npm install
npm run build
npx wrangler pages deploy dist --project-name=llm-wiki
```

### Option 3: Manual Upload

```bash
cd landing
npm install
npm run build
# Then drag the dist/ folder into Cloudflare Pages dashboard
```

## Domain Setup

After deployment, in Cloudflare Pages → Custom domains:
- Add `llmwiki.eztoolab.com`
- Cloudflare automatically provisions SSL

## Project Structure

```
landing/
├── src/
│   ├── i18n/{en,zh}.json   # Translation files
│   ├── components/          # Reusable Astro components
│   ├── layouts/Base.astro   # HTML shell
│   └── pages/               # Route pages
│       ├── [locale]/        # Localized pages (en, zh)
│       └── *.astro          # Root redirect pages
├── public/                  # Static assets → copied to dist/
├── dist/                    # Build output → deploy this
└── astro.config.mjs
```
