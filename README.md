# After Date

Let's make honesty feel safe.

A question game for open relationships: it helps the person who had a date tell about it, and the other one stay with it, even when jealousy or insecurity come up. Fifteen cards in six rounds (Ankommen, Erzählen, Fühlen, Sicherheit, Absprachen, Nähe), plus one card you can draw at any time: *„Können wir uns einen Moment einfach halten?“*

Live: https://aeffchen-dev.github.io/After-Date/

## How it works

Six rounds (Ankommen, Erzählen, Fühlen, Sicherheit, Absprachen, Nähe), one question per card. Cards ask for a smiley (1–5, with end words per card), answer chips and/or a few words. The listener picks how much they want to know, and the teller sees it. Once a card is answered, the app sends that card's answers to a small Cloudflare Worker (`worker/`), which asks Claude for a short, warm impulse: a reflection, one follow-up question, and a nudge towards the hold card when it gets heavy. On "Wie war dein Date?", "Hilf mir, es zu sagen" turns the teller's notes into words to say out loud. Answers stay in the browser for 8 hours; the Worker stores only the couple's rules (see below).

## Edit the cards

The card texts live at the top of `src/components/AfterDateCards.tsx` (`PHASES`, `GAME_CARDS`, `DEFAULT_RULES`, `HOLD_QUESTION`). The AI's instructions are `REFLECT_PROMPT` and `PHRASE_PROMPT` in `worker/src/index.ts`.

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

### Shared rules (optional)

The rules on "Müssen wir unsere Regeln anpassen?" are shared between your phones through the Worker. Create a KV namespace once, then uncomment the `[[kv_namespaces]]` block in `worker/wrangler.toml` with the printed id and deploy again:

```sh
cd worker
npx wrangler kv namespace create RULES
npx wrangler deploy
```

Until then each phone keeps its own copy. Anyone who can open the site can read and change the shared rules.

The Worker only answers requests from the origins in `ALLOWED_ORIGINS` (`worker/wrangler.toml`) and at most 20 per minute per visitor.

## Run locally

```sh
npm install
npm run dev
```

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/static.yml` (Settings → Pages → Source: GitHub Actions).

Built with Vite, React, TypeScript, Tailwind CSS and Swiper.
