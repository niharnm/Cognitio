# Cognitio News Verifier

Cognitio is an evidence-first claim verifier. It is not a truth oracle: it searches public sources, ranks evidence quality, and returns one of five labels: `Supported`, `Disputed`, `Unverified`, `Misleading context`, or `Not checkable`.

## What is included

- `apps/web`: Next.js web app and `/api/verify` route.
- `apps/extension`: Chrome Manifest V3 extension for selected-text and page-title verification.
- `packages/verifier`: shared TypeScript verifier logic, Bright Data provider, source ranking, and verdict selection.

The extension never receives Bright Data credentials. It sends user-triggered claim text to the web API, and only the server calls Bright Data.

## Bright Data setup

Create a `.env.local` file in `apps/web` or export these variables before running the web app:

```bash
BRIGHT_DATA_API_KEY=...
BRIGHT_DATA_SERP_ZONE=serp_api1
BRIGHT_DATA_UNLOCKER_ZONE=web_unlocker1
BRIGHT_DATA_TIMEOUT_MS=12000
```

The implementation uses Bright Data's REST request endpoint:

- SERP API: `POST https://api.brightdata.com/request` with a Google search URL and `format: "json"`.
- Web Unlocker: `POST https://api.brightdata.com/request` with a source page URL and `format: "markdown"`.

Official docs:

- https://docs.brightdata.com/api-reference/rest-api/serp/serp-api
- https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website

If these variables are missing, `/api/verify` returns a clear `provider_not_configured` error instead of returning a fake report.

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
npm run lint
npm run dev
```

The web app runs at `http://localhost:3000` by default.

## Image attachments

The web form accepts up to 3 images per check:

- PNG, JPEG, WebP, or GIF.
- 5 MB maximum per image.
- Images are sent to the API as request context and validated server-side.
- Raw image data is stripped before the verifier result is returned.

OCR/vision is not enabled in this MVP. Users still need to type or paste the claim text. This avoids pretending the app read a screenshot when no approved OCR/vision provider exists.

## Load the Chrome extension

1. Run `npm run build --workspace @cognitio/extension`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Click "Load unpacked".
5. Select `apps/extension/dist`.
6. Keep the popup API base set to `http://localhost:3000` for local development.

The extension only captures page context after a user action:

- `Verify selection` reads the active page selection after the click.
- `Verify page` reads the active page title/headline after the click.
- Context-menu verification stores the selected text for the next popup open.

There is no background scanning and no account or cloud history in this MVP.

## Test the Chrome extension locally

1. Run the web API:
   ```bash
   npm run dev
   ```
2. Build the extension:
   ```bash
   npm run build --workspace @cognitio/extension
   ```
3. Open `chrome://extensions`, enable Developer Mode, choose "Load unpacked", and select `apps/extension/dist`.
4. Open any normal public webpage.
5. Highlight a sentence, open the Cognitio extension, and click "Verify selection".
6. Expected local result without Bright Data env vars: the popup shows the same server configuration error as the website.
7. Add Bright Data env vars, restart `npm run dev`, then repeat the selection test to exercise real source collection.
8. Also test the right-click path: highlight text, right-click, choose "Verify selected claim", then confirm the popup opens with that text queued.

If the popup says it cannot read the page, reload the target page after loading the extension. Chrome only grants `activeTab` access after a user action on pages where extension scripts can run.

## Privacy and product boundaries

- No analytics, telemetry, accounts, or cloud-saved report history.
- No automatic scanning of pages or feeds.
- No scraping private logged-in content beyond text the user explicitly selects or asks to verify.
- No Bright Data API key in client-side code or extension code.
- No LLM-generated verdicts in the MVP. The optional AI summary audit is represented in the result shape but left disabled until a separate provider is approved and implemented.
