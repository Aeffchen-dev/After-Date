# After the Date

Let's make honesty feel safe.

A guided conversation for two people who give each other freedom and still sometimes wrestle with jealousy, insecurity or fear of loss. Six conversation cards, plus one card you can draw at any time: *"Can we just hold each other for a moment?"*

Live: https://aeffchen-dev.github.io/After-Date/

## Edit the cards

The card texts live at the top of `src/components/AfterDateCards.tsx` (`TALK_CARDS`, `HOLD_QUESTION`, `HOLD_HINT`).

## Run locally

```sh
npm install
npm run dev
```

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/static.yml` (Settings → Pages → Source: GitHub Actions).

Built with Vite, React, TypeScript, Tailwind CSS and Swiper.
