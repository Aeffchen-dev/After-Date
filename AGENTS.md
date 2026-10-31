# Project rules
- The deck lives in `src/components/AfterDateCards.tsx`; the game's rounds are `PHASES`, its cards `GAME_CARDS` (who answers, which inputs) and the hold card the `HOLD_*` constants at its top.
- The hold card ("Can we just hold each other for a moment?") must stay reachable from every card, not only as a slide in the deck.
- The site is served from `/After-Date/` on GitHub Pages: keep `base` in `vite.config.ts`, the router `basename` and `pathSegmentsToKeep` in `public/404.html` in step.
- Guidance runs only through the Worker in `worker/`; the API key never goes into the site. The page sends one card's answers once everyone whose turn it is has answered (passing counts); "Hilf mir, es zu sagen" asks only on tap.
- Keep the request shape in `src/lib/guidance.ts` and `parseRequest` in `worker/src/index.ts` in step.
- Big text (title, questions) is set in Kokoro, the display face of the sibling Retro Cards app; keep it on the shared `#root .question-font` rule.
