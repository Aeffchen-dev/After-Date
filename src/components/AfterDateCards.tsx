import React, { useState, useEffect, useCallback, useRef } from "react";
import ActionRow from "@/components/ActionRow";
import RevealText from "@/components/RevealText";
import SmileyScale from "@/components/SmileyScale";
import ChipGroup from "@/components/ChipGroup";
import { ActiveSlideContext } from "@/components/ActiveSlideContext";
import { Heart } from "lucide-react";

import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { saveToStorage, loadFromStorage, clearExpiredStorage, STORAGE_KEYS } from "@/lib/storage";
import { fetchGuidance, guidanceEnabled, type Guidance, type GuidanceAnswer, type GuidanceRequest } from "@/lib/guidance";

import "swiper/css";

const INK = "#201C1D";
const GREY_FIELD = "#E4E6E8";
const PINK = "#F39FFF";

/** A round of the game; its colours mark every card in it. */
interface Phase {
  title: string;
  /** Pill swatch and the colour each word flashes in */
  pill: string;
  /** Dot inside the pill swatch */
  pillDot: string;
  /** Fill of a picked smiley or chip; light enough for ink on it */
  face: string;
}

const PHASES: Phase[] = [
  { title: "Check-in", pill: "#FF4D00", pillDot: INK, face: "#FFB28F" },
  { title: "Das Date", pill: "#B026FF", pillDot: "#5343A8", face: "#DDB0FF" },
  { title: "Gefühle", pill: "#00A9FF", pillDot: "#C6D0E0", face: "#9FDCFF" },
  { title: "Wir beide", pill: "#0B7A35", pillDot: "#B6FF4D", face: "#B6FF4D" },
  { title: "Reconnect", pill: "#FFD400", pillDot: "#6C2D01", face: "#FFD400" },
];

/** Who answers a card: the person who had the date, the other one, or both. */
type Who = "date" | "listener" | "both";

interface GameCard {
  id: string;
  phase: number;
  who: Who;
  question: string;
  /** Quiet line under the question: how to play this card */
  hint?: string;
  /** Guidance for the other person on how to ask, shown in a box in the round's colour */
  tip?: { title: string; lines: string[] };
  scale?: boolean;
  /** Words at the two ends of the scale, matching the question */
  scaleEnds?: [string, string];
  /** Shows the couple's rules as editable notes */
  rules?: boolean;
  chips?: string[];
  /** Placeholder of the text field; no field without it */
  text?: string;
  /** Offers "Hilf mir, es zu sagen": the AI turns notes into words to say out loud */
  phrase?: boolean;
  /** Shows what the listener picked on that card, so the teller knows what to cover */
  showWishesFrom?: string;
  /** Shows the chips both people picked */
  showMatches?: boolean;
}

const NOTHING_YET = "Lieber erst mal nichts";
const FEELINGS = ["Freude", "Neugier", "Aufregung", "Unsicherheit", "Eifersucht", "Angst", "Gelassenheit"];

// One question per card; every scale or chip row is followed by a text field.
// Scales are answered by the listener only, so a card never shows two of them.
const GAME_CARDS: GameCard[] = [
  // 1. Check-in
  {
    id: "checkin-safe",
    phase: 0,
    who: "listener",
    question: "Wie sicher fühlst du dich gerade?",
    scale: true,
    scaleEnds: ["Unsicher", "Sicher & verbunden"],
    chips: ["Freude", "Neugier", "Aufregung", "Unsicherheit", "Eifersucht"],
    text: "Was noch da ist …",
  },
  // 2. Das Date
  {
    id: "howmuch",
    phase: 1,
    who: "listener",
    question: "Wie viel möchtest du hören?",
    hint: "Ehrlich sein heißt nicht, jedes Detail zu erzählen.",
    chips: ["Wie es dir ging", "Was ihr gemacht habt", "Wer die Person ist", "Ob ihr euch wiedersehen wollt", "Körperliches", NOTHING_YET],
    text: "Oder in deinen Worten …",
  },
  {
    id: "date-how",
    phase: 1,
    who: "date",
    question: "Wie war dein Date?",
    showWishesFrom: "howmuch",
    text: "Was du erzählst, in Stichworten …",
    phrase: true,
  },
  // 3. Gefühle
  {
    id: "feel-trigger",
    phase: 2,
    who: "listener",
    question: "Was löst das in dir aus?",
    scale: true,
    scaleEnds: ["Schwer", "Leicht"],
    chips: ["Freude", "Neugier", "Unsicherheit", "Eifersucht", "Angst"],
    text: "Wenn du magst, ein paar Worte …",
    tip: {
      title: "Frag nach",
      lines: [
        "Gab es einen Moment, der sich schwierig angefühlt hat?",
        "Statt „Du musst doch nicht eifersüchtig sein“ lieber: „Ich möchte verstehen, was sich für dich schwierig anfühlt.“",
      ],
    },
  },
  {
    id: "feel-fears",
    phase: 2,
    who: "listener",
    question: "Was steckt hinter dem Gefühl?",
    chips: ["Verlustangst", "Nicht genug sein", "Vergleich", "Ersetzt werden", "Kontrollverlust"],
    text: "Ich habe Angst, dass …",
  },
  {
    id: "feel-calm",
    phase: 2,
    who: "listener",
    question: "Was gibt dir Sicherheit?",
    chips: ["Eine Umarmung", "Hören, was ich dir bedeute", "Zeit nur für uns", "Ein Ritual nach Dates", "Mehr wissen", "Erst mal Ruhe"],
    text: "Oder in deinen Worten …",
  },
  {
    id: "feel-joy",
    phase: 2,
    who: "listener",
    question: "Kannst du dich für mich freuen?",
    chips: ["Ja, von Herzen", "Ein bisschen", "Gerade noch nicht"],
    text: "Was gerade im Weg steht …",
  },
  // 4. Wir beide
  {
    id: "us-changed",
    phase: 3,
    who: "listener",
    question: "Hat sich etwas zwischen uns verändert?",
    chips: ["Nein, alles wie vorher", "Ein bisschen", "Ja, spürbar", "Weiß ich noch nicht"],
    text: "Was genau …",
  },
  {
    id: "us-loved",
    phase: 3,
    who: "listener",
    question: "Hast du dich trotzdem geliebt gefühlt?",
    scale: true,
    scaleEnds: ["Gar nicht", "Ganz und gar"],
    text: "Was dir gefehlt hat oder gutgetan hat …",
  },
  {
    id: "us-wish",
    phase: 3,
    who: "both",
    question: "Was wünschst du dir künftig anders?",
    text: "Ich wünsche mir …",
  },
  {
    id: "us-rules",
    phase: 3,
    who: "both",
    question: "Müssen wir unsere Regeln anpassen?",
    hint: "Tippt eine Regel an, um sie zu ändern. × streicht sie.",
    rules: true,
  },
  {
    id: "us-special",
    phase: 3,
    who: "both",
    question: "Was macht uns besonders?",
    text: "Was nur wir haben …",
  },
  // 5. Reconnect
  {
    id: "rc-appreciate",
    phase: 4,
    who: "both",
    question: "Was schätzt du gerade an uns?",
    text: "An uns schätze ich …",
  },
  {
    id: "rc-unsaid",
    phase: 4,
    who: "both",
    question: "Was ist bisher zu kurz gekommen?",
    text: "Ich wollte dir noch sagen …",
  },
  {
    id: "rc-close",
    phase: 4,
    who: "both",
    question: "Wie kommen wir uns jetzt nah?",
    chips: ["Umarmen", "Kuscheln", "Zusammen einschlafen", "Reden", "Lachen"],
    showMatches: true,
  },
];

/** The couple's agreements, editable on the "us-rules" card. */
const DEFAULT_RULES: string[] = [
  "Bei ausgemachten Dates sagen wir es uns davor.",
  "Bei spontanen Dingen währenddessen nur auf Nachfrage oder wenn man sonst lügen müsste, sonst am nächsten Tag.",
  "Am nächsten Tag verbringen wir Zeit, um wieder zu connecten und ggf. darüber zu sprechen (Ask, don’t tell: Einzelheiten nur, wenn danach gefragt wird). Wer das Date hatte, gibt sich beim anderen besonders Mühe.",
  "Beim Sex mit anderen wird mit Kondom verhütet.",
  "Wer eine Person nochmal daten möchte, holt das OK des Partners ein.",
  "Mit Dates sprechen wir nicht über Beziehungsprobleme oder persönliche Probleme, die wir nicht mit dem Partner besprechen (damit man nichts outsourct).",
  "Wenn Eifersucht oder Unwohlsein auftaucht, sagen wir es uns, sprechen darüber, geben uns Sicherheit und sagen ggf. dem Date ab.",
  "Man kann beim Date auch mit mehr als einer Person Sex haben.",
  "Wir daten allein wie auch zusammen.",
  "Vor dem Partner wird nicht mit anderen geflirtet, nur wenn wir das gemeinsam machen.",
  "Wenn wir auf ein Date treffen, halten wir es kurz und stellen den Partner klar in den Vordergrund.",
  "Wenn wir jemanden attraktiv finden, sagen wir es uns und handhaben das locker und mit Witz.",
  "Ex-Partner:innen sind tabu (mit Ausnahme von Nadine).",
  "Man fährt mit Dates nicht in den Urlaub.",
  "Wenn einer von uns Gefühle entwickelt, reden wir von Anfang an offen und ehrlich darüber und finden gemeinsam eine Lösung.",
  "Wenn einer Monogamie möchte, machen wir das.",
  "Mit Dates wird danach nicht (regelmäßig) gechattet oder getroffen.",
  "Der Partner kann bei Dates ein Veto einlegen.",
  "Wir daten niemanden, der einem oder uns beiden nahesteht und den man danach oft sehen würde (Freunde, Arbeitskollegen).",
  "Bett neu beziehen nach einem Date, bevor der Partner kommt: Es sollen keine Spuren vom Date sichtbar sein.",
  "STI-Test 4–6 Wochen nach Sex mit anderen (mindestens 4 Wochen warten, sonst ist der Test nicht aussagekräftig).",
  "Man kann bei Dates übernachten und gemeinsam frühstücken, danach geht man nach Hause.",
  "Wir reden einmal im Monat auf einer Date Night darüber, ob und wie wir daten wollen, sonst nur, wenn es nicht anders geht („Ich möchte gern ein Thema zur offenen Beziehung besprechen, wann hast du dafür Raum?“).",
  "10 Dates pro Jahr fühlen sich zu viel an.",
  "Wir sagen dem Date, dass wir in einer offenen Beziehung sind, außer es ist klar ein One-Night-Stand.",
];
// Kept without the 8-hour expiry: the rules outlive one conversation.
const RULES_KEY = "after-date-rules";

const HOLD_QUESTION = "Can we just hold each other for a moment?";

// Slide order: title, names, then the game cards.
const SLIDE_TITLE = "title";
const SLIDE_INTRO = "intro";
const SLIDES: string[] = [SLIDE_TITLE, SLIDE_INTRO, ...GAME_CARDS.map((c) => c.id)];
const CARD_BY_ID = Object.fromEntries(GAME_CARDS.map((c) => [c.id, c])) as Record<string, GameCard>;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The two people playing; `dateIdx` marks who had the date. */
interface People {
  names: [string, string];
  dateIdx: 0 | 1;
}

interface PersonAnswer {
  mood: number | null;
  chips: string[];
  text: string;
  passed: boolean;
}

/** One card's answers, one slot per person (index 0/1 as in `People.names`). */
type CardAnswers = [PersonAnswer, PersonAnswer];

type GuidanceState =
  | { status: "loading"; key: string }
  | { status: "done"; key: string; data: Guidance }
  | { status: "error"; key: string };

const EMPTY_PERSON: PersonAnswer = { mood: null, chips: [], text: "", passed: false };
const EMPTY_ANSWERS: CardAnswers = [EMPTY_PERSON, EMPTY_PERSON];
// Guidance asks once a card is answered, after typing pauses.
const GUIDANCE_DEBOUNCE_MS = 1800;

const fieldCls =
  "swiper-no-swiping retro-input retro-input-dark-text w-full rounded-none border-0 px-3 focus:outline-none focus:ring-2 focus:ring-black/20";

/** A person has answered a card when they passed, or filled what the card asks for. */
const isAnswered = (card: GameCard, a: PersonAnswer) => {
  // The rules card sends nothing to the AI.
  if (card.rules) return false;
  if (a.text.trim()) return true;
  // A scale card is answered once a face is picked; chips next to it stay optional.
  if (card.scale) return a.mood !== null;
  return !!card.chips && a.chips.length > 0;
};

/** Two figures holding each other: the hold card's picture. */
const HugIllustration: React.FC = () => (
  <svg viewBox="0 0 220 230" width="200" height="210" aria-hidden="true">
    <path d="M110 30 C 100 14, 80 22, 92 38 L 110 54 L 128 38 C 140 22, 120 14, 110 30 Z" fill="#FF4D00" />
    <g transform="rotate(8 82 160)">
      <circle cx="82" cy="88" r="26" fill={INK} />
      <rect x="50" y="122" width="64" height="104" rx="32" fill={INK} />
    </g>
    <g transform="rotate(-8 138 160)">
      <circle cx="138" cy="94" r="26" fill="#4E6BEE" />
      <rect x="106" y="128" width="64" height="98" rx="32" fill="#4E6BEE" />
    </g>
    <path d="M150 150 C 130 176, 88 176, 64 156" fill="none" stroke="#4E6BEE" strokeWidth="18" strokeLinecap="round" />
    <path d="M72 144 C 94 164, 128 162, 150 140" fill="none" stroke={INK} strokeWidth="18" strokeLinecap="round" />
  </svg>
);

const AfterDateCards: React.FC = () => {
  const [currentCard, setCurrentCard] = useState(() => {
    const saved = loadFromStorage<number>(STORAGE_KEYS.CURRENT_CARD);
    return saved !== null && saved < SLIDES.length ? saved : 0;
  });
  const [swiperRef, setSwiperRef] = useState<SwiperType | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [rules, setRules] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RULES_KEY) ?? "null");
      return Array.isArray(saved) ? saved.filter((r): r is string => typeof r === "string") : DEFAULT_RULES;
    } catch {
      return DEFAULT_RULES;
    }
  });
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 767
  );
  const [people, setPeople] = useState<People>(
    () => loadFromStorage<People>(STORAGE_KEYS.PEOPLE) ?? { names: ["", ""], dateIdx: 0 }
  );
  const [answers, setAnswers] = useState<Record<string, CardAnswers>>(
    () => {
      // Passing is gone from the UI; drop old passes so they cannot be sent or stick.
      const saved = loadFromStorage<Record<string, CardAnswers>>(STORAGE_KEYS.ANSWERS) ?? {};
      return Object.fromEntries(
        Object.entries(saved).map(([id, pair]) => [id, pair.map((a) => ({ ...a, passed: false })) as CardAnswers])
      );
    }
  );
  const [guidance, setGuidance] = useState<Record<string, GuidanceState>>({});
  // "Hilf mir, es zu sagen" results, keyed by card id; asked on tap only.
  const [phrasing, setPhrasing] = useState<Record<string, GuidanceState>>({});
  const guidanceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const guidanceAborts = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    clearExpiredStorage();
  }, []);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_CARD, currentCard);
  }, [currentCard]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PEOPLE, people);
  }, [people]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ANSWERS, answers);
  }, [answers]);

  useEffect(() => {
    try {
      localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    } catch {
      // Private mode: the rules still work for this visit.
    }
  }, [rules]);

  const nameOf = useCallback(
    (i: 0 | 1) => people.names[i].trim() || (i === 0 ? "Person 1" : "Person 2"),
    [people.names]
  );
  const roleOf = (i: 0 | 1): GuidanceAnswer["role"] => (people.dateIdx === i ? "date" : "listener");
  const listenerIdx = (people.dateIdx === 0 ? 1 : 0) as 0 | 1;
  const playersOf = (card: GameCard): (0 | 1)[] =>
    card.who === "both" ? [0, 1] : card.who === "date" ? [people.dateIdx] : [listenerIdx];

  /** What the listener asked to hear, as a sentence for the teller and the AI. */
  const wishesText = (cardId: string) => {
    const w = answers[cardId]?.[listenerIdx];
    if (!w || w.passed || w.chips.length === 0) return "";
    if (w.chips.includes(NOTHING_YET)) {
      return `${nameOf(listenerIdx)} möchte gerade lieber nichts Genaues wissen. Sag, dass du da bist, und lass Raum für Fragen.`;
    }
    return `${nameOf(listenerIdx)} möchte wissen: ${w.chips.join(", ")}.`;
  };

  const answerPayload = (card: GameCard, i: 0 | 1, a: PersonAnswer): GuidanceAnswer => ({
    name: nameOf(i),
    role: roleOf(i),
    ...(card.scale && a.mood !== null ? { mood: a.mood } : {}),
    ...(card.chips ? { chips: a.chips } : {}),
    ...(card.text ? { text: a.text.trim() } : {}),
    passed: a.passed,
  });

  // Mirror every card once all its players have answered, and again when answers change.
  useEffect(() => {
    if (!guidanceEnabled()) return;
    GAME_CARDS.forEach((card) => {
      // Notes on the "date-how" card are a draft for the teller, not yet said; it gets wording help instead.
      if (card.phrase) return;
      const a = answers[card.id];
      const players = playersOf(card);
      if (!a || !players.every((i) => isAnswered(card, a[i]))) return;
      // Nothing to mirror when everyone passed.
      if (players.every((i) => a[i].passed)) return;
      const payload: GuidanceRequest = {
        mode: "reflect",
        cardTitle: PHASES[card.phase].title,
        question: card.question,
        answers: players.map((i) => answerPayload(card, i, a[i])),
        ...(card.showWishesFrom && wishesText(card.showWishesFrom) ? { context: wishesText(card.showWishesFrom) } : {}),
      };
      const key = JSON.stringify(payload);
      if (guidance[card.id]?.key === key) return;
      clearTimeout(guidanceTimers.current[card.id]);
      guidanceTimers.current[card.id] = setTimeout(() => {
        guidanceAborts.current[card.id]?.abort();
        const ctrl = new AbortController();
        guidanceAborts.current[card.id] = ctrl;
        setGuidance((prev) => ({ ...prev, [card.id]: { status: "loading", key } }));
        fetchGuidance(payload, ctrl.signal)
          .then((data) => setGuidance((prev) => ({ ...prev, [card.id]: { status: "done", key, data } })))
          .catch((err) => {
            if (err?.name === "AbortError") return;
            setGuidance((prev) => ({ ...prev, [card.id]: { status: "error", key } }));
          });
      }, GUIDANCE_DEBOUNCE_MS);
    });
    // `guidance` is read only to skip unchanged answers; asking again on its own updates would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, people]);

  useEffect(() => {
    const timers = guidanceTimers.current;
    const aborts = guidanceAborts.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      Object.values(aborts).forEach((c) => c.abort());
    };
  }, []);

  const askPhrasing = (card: GameCard) => {
    const i = people.dateIdx;
    const notes = answers[card.id]?.[i]?.text.trim() ?? "";
    const feelings = answers["checkin-safe"]?.[listenerIdx];
    const context = [
      feelings && feelings.chips.length ? `${nameOf(listenerIdx)} fühlt gerade: ${feelings.chips.join(", ")}.` : "",
      wishesText("howmuch"),
    ].filter(Boolean).join(" ");
    const payload: GuidanceRequest = {
      mode: "phrase",
      cardTitle: PHASES[card.phase].title,
      question: card.question,
      answers: [{ name: nameOf(i), role: "date", text: notes }],
      ...(context ? { context } : {}),
    };
    const key = JSON.stringify(payload);
    setPhrasing((prev) => ({ ...prev, [card.id]: { status: "loading", key } }));
    fetchGuidance(payload)
      .then((data) => setPhrasing((prev) => ({ ...prev, [card.id]: { status: "done", key, data } })))
      .catch(() => setPhrasing((prev) => ({ ...prev, [card.id]: { status: "error", key } })));
  };

  const updateAnswer = (cardId: string, person: 0 | 1, change: Partial<PersonAnswer>) => {
    setAnswers((prev) => {
      const cur = prev[cardId] ?? EMPTY_ANSWERS;
      const next = [...cur] as CardAnswers;
      next[person] = { ...cur[person], ...change };
      return { ...prev, [cardId]: next };
    });
  };

  // Follow the visible viewport so mobile browser bars never cut a card.
  useEffect(() => {
    let rafId: number | null = null;
    const update = () => setViewportHeight(Math.max(window.visualViewport?.height ?? window.innerHeight, 560));
    const onResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // The hold card closes on Escape; while it is open the deck does not page.
  useEffect(() => {
    if (!holdOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHoldOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [holdOpen]);

  useEffect(() => {
    if (!swiperRef) return;
    if (holdOpen) swiperRef.keyboard?.disable();
    else swiperRef.keyboard?.enable();
  }, [holdOpen, swiperRef]);

  // Peek effect: neighbours sit at 70% scale, rotated 2deg inwards.
  const handleSwiperProgress = useCallback((swiper: SwiperType) => {
    swiper.slides.forEach((slideEl: HTMLElement) => {
      const p = Math.max(-1, Math.min(1, (slideEl as any).progress || 0));
      const t = Math.abs(p);
      slideEl.style.transformOrigin = "center center";
      slideEl.style.transform = `translateX(${15 * p}%) rotate(${2 * p}deg) scale(${1 - 0.3 * t})`;
      slideEl.style.zIndex = `${Math.round((1 - t) * 10)}`;
    });
  }, []);

  const handleSwiperTransition = useCallback((swiper: SwiperType, duration: number) => {
    swiper.slides.forEach((slideEl: HTMLElement) => {
      slideEl.style.transitionDuration = `${duration}ms`;
      slideEl.style.transitionTimingFunction = "cubic-bezier(0.2, 0, 0, 1)";
    });
  }, []);

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setCurrentCard(prev => (prev === swiper.activeIndex ? prev : swiper.activeIndex));
  }, []);

  const pillOf = (slideId: string): { label: string | null; pill: string; pillDot: string } => {
    if (slideId === SLIDE_TITLE) return { label: null, pill: PINK, pillDot: "#FF4D00" };
    if (slideId === SLIDE_INTRO) return { label: "So geht's", pill: PINK, pillDot: "#FF4D00" };
    const card = CARD_BY_ID[slideId];
    const phase = PHASES[card.phase];
    return { label: `${pad2(GAME_CARDS.indexOf(card) + 1)} · ${phase.title}`, pill: phase.pill, pillDot: phase.pillDot };
  };

  const activeGameCard = CARD_BY_ID[SLIDES[currentCard]];
  const pageColour = activeGameCard ? PHASES[activeGameCard.phase].pill : INK;

  const holdButton = (label: string) => (
    <ActionRow
      iconNode={<Heart size={16} strokeWidth={1.5} color={INK} />}
      label={label}
      accent={PINK}
      fieldBg="#FFFFFF"
      onClick={() => setHoldOpen(true)}
    />
  );

  const renderGuidance = (card: GameCard) => {
    const a = answers[card.id];
    const g = guidance[card.id];
    // "Sehr schwer" or "Eher schwer" always offers the hold card, whatever the AI says.
    const someoneLow = !!a && playersOf(card).some((i) => a[i].mood !== null && (a[i].mood as number) <= 2);
    if (!g && !someoneLow) return null;
    return (
      <div className="w-full flex flex-col gap-3 p-4" style={{ background: "#F6F1E8" }} aria-live="polite">
        <span className="retro-body-copy-sm opacity-70">Impuls für euch</span>
        {g?.status === "loading" && <p className="retro-body-copy">Einen Moment, ich lese mit …</p>}
        {g?.status === "error" && (
          <p className="retro-body-copy">Gerade kam kein Impuls zustande. Redet einfach weiter, ihr braucht ihn nicht.</p>
        )}
        {g?.status === "done" && (
          <>
            <p className="retro-body-copy">{g.data.guidance}</p>
            {g.data.followUpQuestion && <p className="retro-body-copy">{g.data.followUpQuestion}</p>}
          </>
        )}
        {(someoneLow || (g?.status === "done" && g.data.suggestHold)) && holdButton("Erst mal Nähe?")}
      </div>
    );
  };

  const renderPhrasing = (card: GameCard) => {
    const p = phrasing[card.id];
    const notes = answers[card.id]?.[people.dateIdx]?.text.trim() ?? "";
    return (
      <div className="w-full flex flex-col gap-3">
        <ActionRow
          icon="IconPencil"
          label={p?.status === "done" ? "Nochmal anders sagen" : "Hilf mir, es zu sagen"}
          accent={PHASES[card.phase].face}
          iconColor={INK}
          fieldBg={GREY_FIELD}
          onClick={() => askPhrasing(card)}
        />
        {p && (
          <div className="w-full flex flex-col gap-3 p-4" style={{ background: "#F6F1E8" }} aria-live="polite">
            <span className="retro-body-copy-sm opacity-70">
              {notes ? "So könntest du es sagen" : "Ein möglicher Anfang"}
            </span>
            {p.status === "loading" && <p className="retro-body-copy">Einen Moment …</p>}
            {p.status === "error" && <p className="retro-body-copy">Das hat gerade nicht geklappt. Deine eigenen Worte reichen.</p>}
            {p.status === "done" && (
              <>
                <p className="retro-body-copy">„{p.data.guidance}“</p>
                {p.data.followUpQuestion && (
                  <p className="retro-body-copy-sm">Danach kannst du fragen: {p.data.followUpQuestion}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderPlayer = (card: GameCard, i: 0 | 1) => {
    const a = answers[card.id]?.[i] ?? EMPTY_PERSON;
    const phase = PHASES[card.phase];
    const showName = card.who === "both";
    return (
      <div key={i} className="w-full flex flex-col gap-3">
        {showName && (
          <span className="retro-body-copy-sm">
            {nameOf(i)} <span className="opacity-60">· {roleOf(i) === "date" ? "hatte das Date" : "hört zu"}</span>
          </span>
        )}
        {
          <>
            {card.scale && (
              <SmileyScale
                value={a.mood}
                onChange={(v) => updateAnswer(card.id, i, { mood: v })}
                accent={phase.face}
                ends={card.scaleEnds}
                label={`Wie fühlt sich das für ${nameOf(i)} an?`}
              />
            )}
            {card.chips && (
              <ChipGroup
                options={card.chips}
                value={a.chips}
                onChange={(v) => updateAnswer(card.id, i, { chips: v })}
                accent={phase.face}
                label={`Antworten von ${nameOf(i)}`}
              />
            )}
            {card.text && (
              <textarea
                value={a.text}
                onChange={(e) => updateAnswer(card.id, i, { text: e.target.value })}
                placeholder={card.text}
                aria-label={`Antwort von ${nameOf(i)}`}
                rows={2}
                className={`${fieldCls} py-2`}
                style={{ background: GREY_FIELD }}
              />
            )}
          </>
        }
      </div>
    );
  };

  const renderRules = () => (
    <div className="w-full flex flex-col gap-2">
      {rules.map((rule, i) => (
        <div key={i} className="relative w-full" style={{ background: "#FFF3A8" }}>
          <textarea
            value={rule}
            onChange={(e) => setRules((prev) => prev.map((r, j) => (j === i ? e.target.value : r)))}
            aria-label={`Regel ${i + 1}`}
            rows={Math.max(2, Math.ceil(rule.length / 26))}
            className={`${fieldCls} retro-body-copy-sm bg-transparent py-2 pr-9`}
          />
          <button
            type="button"
            aria-label={`Regel ${i + 1} streichen`}
            onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}
            className="swiper-no-swiping absolute right-1 top-1 h-7 w-7 border-0 bg-transparent p-0 retro-body-copy"
            style={{ color: INK }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRules((prev) => [...prev, ""])}
        className="swiper-no-swiping retro-body-copy-sm self-start h-9 rounded-full border-0 px-3"
        style={{ background: "#FFFFFF", color: INK, boxShadow: "inset 0 0 0 1.5px #C9CBCE" }}
      >
        + Neue Regel
      </button>
    </div>
  );

  const renderMatches = (card: GameCard) => {
    const a = answers[card.id];
    if (!a || a[0].chips.length === 0 || a[1].chips.length === 0) return null;
    const both = a[0].chips.filter((c) => a[1].chips.includes(c));
    return (
      <div className="w-full p-4" style={{ background: PHASES[card.phase].face }}>
        <p className="retro-body-copy">
          {both.length
            ? `Ihr habt beide Lust auf: ${both.join(", ")}.`
            : "Diesmal wollt ihr Verschiedenes. Was davon geht zuerst?"}
        </p>
      </div>
    );
  };

  const renderCard = (slideId: string, index: number) => {
    if (slideId === SLIDE_TITLE) {
      return (
        <div className="relative flex flex-col items-center w-full h-full text-center" style={{ paddingTop: "24%" }}>
          <h1
            className="retro-title logo-slide-anim logo-glitch"
            data-text="After Date"
            style={{ fontSize: "84px", lineHeight: 0.86, fontWeight: 500, color: "#3A3A3A" }}
          >
            After Date
          </h1>
          <p className="retro-body-copy mt-8 text-center">
            Ein Date mit jemand anderem liegt hinter euch. Jetzt nehmt ihr euch bewusst Zeit, darüber zu sprechen: ehrlich, neugierig und ohne Druck.
          </p>
          <div className="absolute z-40 flex items-center" style={{ left: 0, bottom: 0 }}>
            <ActionRow
              icon="IconArrowRight"
              label="Los geht's"
              accent="#FF6BEF"
              fieldBg={GREY_FIELD}
              onClick={() => swiperRef?.slideNext()}
            />
          </div>
        </div>
      );
    }

    if (slideId === SLIDE_INTRO) {
      return (
        <div className="flex flex-col justify-start items-start w-full gap-6">
          <h2 id="who-heading" className="question-font retro-heading w-full" lang="de">
            <RevealText text="Wer macht mit?" color={PINK} slideIndex={index} />
          </h2>

          {/* Each person: label tag, field, then the "had the date" toggle; one person always has it. */}
          <fieldset aria-labelledby="who-heading" className="w-full flex flex-col gap-10 border-0 p-0 m-0">
            {([0, 1] as const).map((i) => {
              const label = i === 0 ? "Dein Name" : "Name deines Gegenübers";
              const hadDate = people.dateIdx === i;
              return (
                <div key={i} className="flex w-full flex-col items-start gap-0">
                  <label
                    htmlFor={`name-${i}`}
                    className="retro-body-copy inline-flex h-8 items-center px-3"
                    style={{ background: PINK, color: INK }}
                  >
                    {label}
                  </label>
                  <input
                    id={`name-${i}`}
                    type="text"
                    value={people.names[i]}
                    onChange={(e) =>
                      setPeople((p) => {
                        const names = [...p.names] as People["names"];
                        names[i] = e.target.value;
                        return { ...p, names };
                      })
                    }
                    placeholder="Deine Antwort"
                    className={`${fieldCls} name-input-field h-10`}
                    style={{ background: GREY_FIELD }}
                  />
                  <ActionRow
                    className="mt-2"
                    iconNode={<Heart size={16} strokeWidth={1.5} color={INK} fill={hadDate ? INK : "none"} />}
                    label={hadDate ? "Hatte das Date" : "Hatte das Date?"}
                    accent={hadDate ? PINK : "#FBE3FF"}
                    fieldBg={GREY_FIELD}
                    onClick={() => setPeople((p) => ({ ...p, dateIdx: i }))}
                  />
                </div>
              );
            })}
          </fieldset>

          <ActionRow
            icon="IconArrowRight"
            label="Los geht's"
            accent="#FF6BEF"
            fieldBg={GREY_FIELD}
            className="mt-6"
            onClick={() => swiperRef?.slideNext()}
          />

        </div>
      );
    }

    const card = CARD_BY_ID[slideId];
    const players = playersOf(card);
    const turn = card.who === "both" ? "Ihr beide" : `${nameOf(players[0])} ist dran`;
    const wishes = card.showWishesFrom ? wishesText(card.showWishesFrom) : "";
    return (
      <div className="flex flex-col items-start w-full gap-5">
        <span
          className="retro-body-copy-sm inline-flex h-7 items-center rounded-full px-3"
          style={{ background: PHASES[card.phase].face, color: INK }}
        >
          {turn}
        </span>
        <h2 className="question-font retro-heading w-full" lang="de">
          <RevealText text={card.question} color={PHASES[card.phase].pill} slideIndex={index} />
        </h2>
        {card.hint && <p className="retro-body-copy-sm opacity-70 -mt-2">{card.hint}</p>}
        {card.showWishesFrom && (
          <p className="retro-body-copy w-full p-3" style={{ background: "#F6F1E8" }}>
            {wishes || `${nameOf(listenerIdx)} hat noch nichts ausgewählt. Fragt kurz nach, was erzählt werden soll.`}
          </p>
        )}
        {!card.rules && players.map((i) => renderPlayer(card, i))}
        {card.rules && renderRules()}
        {card.tip && (
          <div className="w-full flex flex-col gap-2 p-4" style={{ background: PHASES[card.phase].face, color: INK }}>
            <span className="retro-body-copy-sm opacity-70">
              {card.tip.title}, {nameOf(people.dateIdx)}
            </span>
            {card.tip.lines.map((line) => (
              <p key={line} className="retro-body-copy">{line}</p>
            ))}
          </div>
        )}
        {card.phrase && renderPhrasing(card)}
        {card.showMatches && renderMatches(card)}
        {renderGuidance(card)}
      </div>
    );
  };

  return (
    <ActiveSlideContext.Provider value={currentCard}>
      <div
        className="bg-retro-black text-retro-white overflow-hidden select-none flex flex-col"
        style={{ height: `${viewportHeight}px`, position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {/* Flat page colour: the current round's colour, ink on the title and names slides */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{ backgroundColor: pageColour, transition: "background-color 500ms cubic-bezier(0.2, 0, 0, 1)" }}
        />

        <div className="relative z-10 w-full px-4 py-2" />

        <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
          <button
            aria-label="Vorherige Karte"
            onClick={(e) => { e.stopPropagation(); swiperRef?.slidePrev(); }}
            className="swiper-no-swiping absolute left-0 top-0 bottom-0 w-11 z-40 bg-transparent border-0 p-0 cursor-w-resize"
          />
          <button
            aria-label="Nächste Karte"
            onClick={(e) => { e.stopPropagation(); swiperRef?.slideNext(); }}
            className="swiper-no-swiping absolute right-0 top-0 bottom-0 w-11 z-40 bg-transparent border-0 p-0 cursor-e-resize"
          />
          <div className="w-full h-full min-h-0 overflow-hidden">
            <Swiper
              modules={[Keyboard]}
              keyboard={{ enabled: true, onlyInViewport: true, pageUpDown: false }}
              spaceBetween={8}
              slidesPerView={1}
              centeredSlides={true}
              watchSlidesProgress={true}
              onProgress={handleSwiperProgress}
              onSetTransition={handleSwiperTransition}
              speed={500}
              initialSlide={currentCard}
              onSwiper={setSwiperRef}
              onSlideChange={handleSlideChange}
              className="h-full min-h-0"
              style={{ height: "100%", width: "100%", minHeight: 0 }}
              resistanceRatio={0.35}
              threshold={3}
              touchRatio={1.4}
              grabCursor={true}
              longSwipesRatio={0.25}
              noSwipingClass="swiper-no-swiping"
            >
              {SLIDES.map((slideId, index) => {
                const { label, pill, pillDot } = pillOf(slideId);
                const colours = {
                  ["--retro-pill" as any]: pill,
                  ["--retro-pill-dot" as any]: pillDot,
                } as React.CSSProperties;
                return (
                  <SwiperSlide key={slideId} className="h-full min-h-0 overflow-hidden">
                    <div className="w-full h-full min-h-0 flex flex-col items-center justify-center overflow-hidden px-6">
                      {label && (
                        <div className="w-full max-w-[500px] mx-auto flex" style={{ marginBottom: "8px", ...colours }}>
                          <div className="retro-pill flex justify-center items-center gap-2 rounded-full border border-retro-white">
                            <span className="retro-label">{label}</span>
                          </div>
                        </div>
                      )}
                      <div
                        className="retro-card-container relative flex-1 w-full max-w-[500px] max-h-[88%] min-h-0 mx-auto flex flex-col justify-start items-start gap-4 rounded-none p-[28px] shadow-2xl overflow-y-auto"
                        style={{
                          backgroundColor: "#FFFFFF",
                          color: INK,
                          ["--retro-white-rgb" as any]: "32 28 29",
                          ["--retro-post-it" as any]: GREY_FIELD,
                          ["--retro-post-it-text" as any]: INK,
                          ...colours,
                        } as React.CSSProperties}
                      >
                        {renderCard(slideId, index)}
                      </div>
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          </div>
        </div>

        {/* The hold card can be drawn at any time, from any card. */}
        <div className="relative z-20 w-full max-w-[500px] mx-auto px-6 pb-6 pt-2 flex justify-center">
          <ActionRow
            iconNode={<Heart size={16} strokeWidth={1.5} color={INK} />}
            label="Halt mich kurz"
            accent={PINK}
            fieldBg={GREY_FIELD}
            onClick={() => setHoldOpen(true)}
          />
        </div>

        {holdOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={HOLD_QUESTION}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 px-6 animate-[fadeInUp_0.4s_ease-out_both]"
            style={{ backgroundColor: PINK, color: INK }}
          >
            <HugIllustration />
            <h2 className="question-font retro-heading w-full max-w-[500px] text-center" lang="en">
              <RevealText text={HOLD_QUESTION} color="#FF4D00" startDelay={120} />
            </h2>
            <ActionRow
              icon="IconArrowRight"
              label="Weiter"
              accent={INK}
              iconColor="#FFFFFF"
              fieldBg="#FFFFFF"
              onClick={() => setHoldOpen(false)}
            />
          </div>
        )}
      </div>
    </ActiveSlideContext.Provider>
  );
};

export default AfterDateCards;
