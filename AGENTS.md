# Project rules
- The deck lives in `src/components/AfterDateCards.tsx`; card texts are the `TALK_CARDS` list and the `HOLD_*` constants at its top.
- The hold card ("Can we just hold each other for a moment?") must stay reachable from every card, not only as a slide in the deck.
- The site is served from `/After-Date/` on GitHub Pages: keep `base` in `vite.config.ts`, the router `basename` and `pathSegmentsToKeep` in `public/404.html` in step.
- Guidance runs only through the Worker in `worker/`; the API key never goes into the site. The page sends one card's answers, only once both people have picked a face and written something.
- Keep the request shape in `src/lib/guidance.ts` and `parseRequest` in `worker/src/index.ts` in step.
