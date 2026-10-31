# After the Date

Let's make honesty feel safe.

A guided conversation for two people who give each other freedom and still sometimes wrestle with jealousy, insecurity or fear of loss. Six conversation cards, plus one card you can draw at any time: *"Can we just hold each other for a moment?"*

Live: https://aeffchen-dev.github.io/After-Date/

## How it works

On every card both people pick a smiley (1 = sehr schwer … 5 = richtig gut) and write a few words. Once both have answered a card, the app sends that card's answers to a small Cloudflare Worker (`worker/`), which asks Claude for a short, warm impulse: a reflection, one follow-up question, and a nudge towards the hold card when it gets heavy. Answers stay in the browser for 8 hours; the Worker stores nothing.

## Edit the cards

The card texts live at the top of `src/components/AfterDateCards.tsx` (`TALK_CARDS`, `HOLD_QUESTION`, `HOLD_HINT`). The AI's instructions are `SYSTEM_PROMPT` in `worker/src/index.ts`.

## Set up the AI guidance (once)

The Anthropic API key lives only in the Worker, never in the website.

```sh
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL (`https://after-date-guidance.<you>.workers.dev`). Put it in `GUIDANCE_URL` in `src/lib/guidance.ts` (or build with `VITE_GUIDANCE_URL=…`) and push. Until then the site works without guidance.

The Worker only answers requests from the origins in `ALLOWED_ORIGINS` (`worker/wrangler.toml`) and at most 20 per minute per visitor.

## Run locally

```sh
npm install
npm run dev
```

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/static.yml` (Settings → Pages → Source: GitHub Actions).

Built with Vite, React, TypeScript, Tailwind CSS and Swiper.
