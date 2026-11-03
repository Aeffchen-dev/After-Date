import React, { useState, useEffect, useCallback, useRef } from "react";
import ActionRow from "@/components/ActionRow";
import RevealText from "@/components/RevealText";
import SmileyScale from "@/components/SmileyScale";
import ChipGroup from "@/components/ChipGroup";
import { ActiveSlideContext } from "@/components/ActiveSlideContext";
import { Heart, Lightbulb } from "lucide-react";

import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { saveToStorage, loadFromStorage, clearExpiredStorage, STORAGE_KEYS } from "@/lib/storage";
import { fetchRules, saveRules } from "@/lib/rules";
import { fetchGuidance, guidanceEnabled, type Guidance, type GuidanceAnswer, type GuidanceRequest } from "@/lib/guidance";

import "swiper/css";

const INK = "#201C1D";
const GREY_FIELD = "#E4E6E8";
// The one pink: the Nähe round's colour, used for every pink in the deck.
const PINK = "#FFA3F5";

/** A round of the game; its colours mark every card in it. */
interface Phase {
  title: string;
  /** Pill swatch and the colour each word flashes in */
  pill: string;
  /** Dot inside the pill swatch */
  pillDot: string;
  /** Fill of a picked smiley or chip; light enough for ink on it */
  face: string;
  /** Page background: the round's colour at shade 950 */
  page: string;
  /** Name tags on cards for both, when the pill's dot colour doesn't suit them */
  tag?: string;
}

const PHASES: Phase[] = [
  { title: "Ankommen", pill: "#FF4D00", pillDot: INK, face: "#FFB28F", page: "#431407" },
  { title: "Erzählen", pill: "#B026FF", pillDot: "#5343A8", face: "#DDB0FF", page: "#3B0764" },
  { title: "Fühlen", pill: "#00A9FF", pillDot: "#C6D0E0", face: "#9FDCFF", page: "#082F49" },
  { title: "Sicherheit", pill: "#FFD400", pillDot: "#6C2D01", face: "#FFD400", tag: "#FFD400", page: "#422006" },
  { title: "Absprachen", pill: "#0B7A35", pillDot: "#B6FF4D", face: "#B6FF4D", page: "#052E16" },
  { title: "Nähe", pill: PINK, pillDot: INK, face: "#FFC2F7", tag: PINK, page: "#4A044E" },
];

/** Who answers a card: the person who had the date, the other one, or both. */
/** "together" is one shared answer for both people, e.g. what they pick to do next. */
type Who = "date" | "listener" | "both" | "together";

interface GameCard {
  id: string;
  phase: number;
  who: Who;
  question: string;
  scale?: boolean;
  /** One word per face, worst to best, matching the question */
  scaleLabels?: string[];
  /** Chips tied to topics the listener may not want to hear (see `prompts`); hidden then */
  chipTopics?: Record<string, string[]>;
  /** Shown only when this returns true for the listener's earlier answers; skipped otherwise */
  showIf?: (listener: (cardId: string) => PersonAnswer | undefined) => boolean;
  /** Shows the couple's rules as editable notes */
  rules?: boolean;
  chips?: string[];
  /** Placeholder of the text field; no field without it */
  text?: string;
  /** Several text fields instead of one, each with its own prompt as placeholder. A prompt with
   *  `topics` shows only when the listener asked to hear one of them on the `showWishesFrom` card. */
  prompts?: Prompt[];
  /** Shows what the listener picked on that card, so the teller knows what to cover */
  showWishesFrom?: string;
}

interface Prompt {
  q: string;
  topics?: string[];
}

const NOTHING_YET = "Lieber erst mal nichts";
// What the listener can ask to hear; the date card's prompts follow these picks.
const TOPIC_FEELINGS = "Wie es dir ging";
const TOPIC_WHAT = "Was ihr gemacht habt";
const TOPIC_WHO = "Wer die Person ist";
const TOPIC_AGAIN = "Ob ihr euch wiedersehen wollt";
const TOPIC_BODY = "Körperliches";
const TOPICS = [TOPIC_FEELINGS, TOPIC_WHAT, TOPIC_WHO, TOPIC_AGAIN, TOPIC_BODY];
// Thoughts after hearing about the date that open the "Was steckt hinter dem Gefühl?" card.
const UNSETTLED_THOUGHTS = [
  "Ich fühle mich unsicher",
  "Ich vergleiche mich",
  "Ich hätte so etwas auch gerne",
  "Ich habe Angst vor Veränderung",
];
const CALM_WORRIES = "Eigentlich verunsichert mich nichts";
const NO_FEAR = "Keine konkrete Befürchtung";
// Check-in feelings that ask the teller to go gently.
const TENDER_FEELINGS = ["Unsicher", "Eifersüchtig", "Ängstlich", "Überfordert", "Unwohl"];

// One question per card; every scale or chip row is followed by a text field.
// Scales are answered by the listener only, so a card never shows two of them.
const GAME_CARDS: GameCard[] = [
  // 1. Ankommen: wie es dir geht und wie viel du hören magst
  {
    id: "checkin-safe",
    phase: 0,
    who: "listener",
    question: "Wie sicher fühlst du dich gerade?",
    scale: true,
    scaleLabels: ["Unsicher", "Eher unsicher", "Gemischt", "Eher sicher", "Sicher & verbunden"],
    chips: ["Neugierig", "Gespannt", "Entspannt", "Unsicher", "Eifersüchtig", "Ängstlich", "Aufgeregt", "Überfordert", "Unwohl"],
    text: "Was noch da ist …",
  },
  {
    id: "howmuch",
    phase: 0,
    who: "listener",
    question: "Wie viel möchtest du hören?",
    chips: [...TOPICS, NOTHING_YET],
    text: "Oder in deinen Worten …",
  },
  // 2. Erzählen: vom Date
  {
    id: "date-how",
    phase: 1,
    who: "date",
    question: "Erzähl von deinem Date",
    showWishesFrom: "howmuch",
    // One field per prompt, to guide the telling; each shows only if the listener wants to hear it.
    prompts: [
      { q: "Mit wem hast du dich getroffen und wie kam es dazu?", topics: [TOPIC_WHO] },
      { q: "Wie habt ihr eure Zeit verbracht und wie hast du das Date erlebt?", topics: [TOPIC_WHAT, TOPIC_FEELINGS] },
      { q: "Gab es körperliche oder emotionale Nähe, über die wir sprechen sollten?", topics: [TOPIC_BODY] },
      { q: "Gibt es etwas Wichtiges, das du mir noch erzählen möchtest?" },
    ],
  },
  // 3. Fühlen: was es auslöst und was dahinter steckt
  {
    id: "date-liked",
    phase: 1,
    who: "date",
    question: "Was hat dir an der Begegnung gefallen oder gutgetan?",
    showWishesFrom: "howmuch",
    chips: [
      "Die Aufmerksamkeit",
      "Die sexuelle Anziehung",
      "Die Gespräche",
      "Das Neue und Aufregende",
      "Mich frei und begehrt zu fühlen",
      "Etwas anderes",
    ],
    chipTopics: { "Die sexuelle Anziehung": [TOPIC_BODY] },
    text: "Eigene Gedanken …",
  },
  {
    // Asked only if the listener wants to hear about it (or hasn't picked anything yet).
    id: "date-again",
    phase: 1,
    who: "date",
    question: "Wünschst du dir, diese Person wiederzusehen?",
    chips: ["Ja, gerne", "Vielleicht", "Nein", "Ich weiß es noch nicht"],
    text: "Eigene Gedanken …",
    showIf: (listener) => {
      const wishes = listener("howmuch")?.chips ?? [];
      return wishes.length === 0 || wishes.includes(TOPIC_AGAIN);
    },
  },
  {
    id: "feel-trigger",
    phase: 2,
    who: "listener",
    question: "Was geht dir durch den Kopf, nachdem du davon gehört hast?",
    scale: true,
    scaleLabels: ["Schwer", "Eher schwer", "Gemischt", "Eher leicht", "Leicht"],
    chips: [
      "Ich freue mich für dich",
      "Ich bin neugierig",
      "Ich fühle mich unsicher",
      "Ich vergleiche mich",
      "Ich hätte so etwas auch gerne",
      "Ich habe Angst vor Veränderung",
      "Ich muss es erst verarbeiten",
    ],
    text: "Eigene Gedanken …",
  },
  {
    id: "feel-fears",
    phase: 2,
    who: "listener",
    question: "Was macht dich neugierig, was verunsichert dich?",
    chips: [
      "Was du dabei gefühlt hast",
      "Wie attraktiv du die Person findest",
      "Ob du sie wiedersehen möchtest",
      "Ob Gefühle entstehen könnten",
      "Ob sich zwischen uns etwas verändert",
      "Eigentlich verunsichert mich nichts",
    ],
    text: "Eigene Gedanken …",
  },
  {
    id: "feel-imagine",
    phase: 2,
    who: "listener",
    question: "Gibt es etwas, das du dir ausmalst oder befürchtest?",
    chips: [
      "Nicht mehr besonders zu sein",
      "Dass du dich verliebst",
      "Dass du mich vergleichst",
      "Dass ich weniger Aufmerksamkeit bekomme",
      "Dass Absprachen nicht halten",
      NO_FEAR,
    ],
    text: "Eigene Gedanken …",
  },
  {
    // Goes deeper only when something unsettled the listener on the cards before.
    id: "feel-deeper",
    phase: 2,
    who: "listener",
    question: "Was steckt hinter dem Gefühl?",
    chips: ["Verlustangst", "Neid", "Nicht genug sein", "Vergleich", "Ersetzt werden", "Kontrollverlust"],
    text: "Ich habe Angst, dass …",
    showIf: (listener) => {
      const thoughts = listener("feel-trigger");
      const worries = listener("feel-fears");
      const unsettled =
        !!thoughts &&
        ((thoughts.mood !== null && thoughts.mood <= 2) || thoughts.chips.some((c) => UNSETTLED_THOUGHTS.includes(c)));
      const worried = !!worries && worries.chips.some((c) => c !== CALM_WORRIES);
      const fears = listener("feel-imagine");
      const afraid = !!fears && fears.chips.some((c) => c !== NO_FEAR);
      return unsettled || worried || afraid;
    },
  },
  {
    id: "feel-help",
    phase: 2,
    who: "listener",
    question: "Was würde dir helfen, mit diesen Gefühlen umzugehen?",
    chips: ["Mehr Klarheit", "Liebevolle Worte", "Körperliche Nähe", "Zeit für mich", "Gemeinsam darüber reden", "Weniger Details"],
    text: "Eigene Gedanken …",
  },
  {
    id: "feel-joy",
    phase: 2,
    who: "listener",
    question: "Kannst du dich für mich freuen?",
    scale: true,
    scaleLabels: ["Gerade nicht", "Kaum", "Ein bisschen", "Ziemlich", "Von Herzen"],
    text: "Was gerade im Weg steht …",
  },
  {
    id: "us-changed",
    phase: 2,
    who: "listener",
    question: "Hat sich etwas zwischen uns verändert?",
    scale: true,
    scaleLabels: ["Sehr verändert", "Spürbar", "Ein bisschen", "Kaum", "Alles wie vorher"],
    text: "Was genau …",
  },
  // 4. Sicherheit: was trägt
  {
    id: "feel-calm",
    phase: 3,
    who: "listener",
    question: "Was gibt dir Sicherheit?",
    chips: ["Eine Umarmung", "Hören, was ich dir bedeute", "Zeit nur für uns", "Ein Ritual nach Dates", "Mehr wissen", "Erst mal Ruhe"],
    text: "Oder in deinen Worten …",
  },
  {
    id: "us-loved",
    phase: 3,
    who: "listener",
    question: "Hast du dich trotzdem geliebt gefühlt?",
    scale: true,
    scaleLabels: ["Gar nicht", "Kaum", "Teils", "Ziemlich", "Ganz und gar"],
    text: "Was dir gefehlt hat oder gutgetan hat …",
  },
  {
    // One shared look back at how the two of them handled it.
    id: "us-worked",
    phase: 3,
    who: "together",
    question: "Was hat in unserem Umgang damit gut funktioniert?",
    chips: [
      "Unsere Ehrlichkeit",
      "Unser gegenseitiges Vertrauen",
      "Dass wir Gefühle zugelassen haben",
      "Dass niemand sich rechtfertigen musste",
      "Dass wir aufeinander eingegangen sind",
      "Das fällt mir gerade schwer zu sagen",
    ],
    text: "Eigene Gedanken …",
  },
  {
    id: "us-special",
    phase: 3,
    who: "both",
    question: "Was macht uns besonders?",
    text: "Was nur wir haben …",
  },
  // 5. Absprachen: was ihr euch wünscht und was gilt
  {
    id: "us-next",
    phase: 4,
    who: "listener",
    question: "Was würdest du dir beim nächsten Date anders wünschen?",
    chips: [
      "Früher informiert werden",
      "Mehr oder weniger Details",
      "Einen Check-in danach",
      "Mehr gemeinsame Zeit davor oder danach",
      "Klarere Grenzen",
      "Nichts, es war gut so",
    ],
    text: "Eigene Gedanken …",
  },
  {
    // One shared answer; the couple's rules open from this card.
    id: "us-agreements",
    phase: 4,
    who: "together",
    question: "Gab es etwas, das unsere Vereinbarungen berührt oder verändert?",
    chips: [
      "Nein, alles war im Rahmen",
      "Eine Grenze war unklar",
      "Eine Absprache wurde nicht eingehalten",
      "Ich wünsche mir eine neue Absprache",
      "Das sollten wir gemeinsam klären",
    ],
    text: "Eigene Gedanken …",
    rules: true,
  },
  // 6. Nähe: zurück zueinander
  {
    id: "rc-appreciate",
    phase: 5,
    who: "both",
    question: "Was schätzt du gerade an uns?",
    text: "An uns schätze ich …",
  },
  {
    id: "rc-unsaid",
    phase: 5,
    who: "both",
    question: "Was ist bisher zu kurz gekommen?",
    text: "Ich wollte dir noch sagen …",
  },
  {
    id: "rc-close",
    phase: 5,
    who: "together",
    question: "Wie kommen wir uns jetzt nah?",
    chips: ["Umarmen", "Kuscheln", "Zusammen einschlafen", "Reden", "Lachen"],
    text: "Was wir als Erstes machen …",
  },
];

/** The couple's agreements, editable on the "us-rules" card. */
const DEFAULT_RULES: string[] = [
  "Geplante Dates sagen wir uns vorher.",
  "Spontanes erzählen wir am nächsten Tag. Vorher nur, wenn der andere fragt oder wir sonst lügen müssten.",
  "Am Tag danach nehmen wir uns Zeit füreinander. Details gibt es nur auf Nachfrage. Wer das Date hatte, kümmert sich besonders.",
  "Sex mit anderen nur mit Kondom.",
  "Eine Person nochmal daten? Nur mit OK des anderen.",
  "Probleme in der Beziehung oder persönliche Sorgen besprechen wir miteinander, nicht mit Dates.",
  "Eifersucht oder Unwohlsein sprechen wir sofort an. Wenn nötig, sagen wir das Date ab.",
  "Sex mit mehr als einer Person beim Date ist okay.",
  "Wir daten allein und zusammen.",
  "Kein Flirten mit anderen, wenn der andere dabei ist, außer wir machen es zusammen.",
  "Treffen wir zufällig ein Date, halten wir es kurz. Wir stehen im Vordergrund.",
  "Wir sagen uns, wen wir attraktiv finden, locker und mit Humor.",
  "Ex-Partner:innen sind tabu (außer Nadine).",
  "Kein Urlaub mit Dates.",
  "Entstehen Gefühle, sprechen wir sofort offen darüber und finden zusammen eine Lösung.",
  "Wünscht sich einer von uns Monogamie, machen wir das.",
  "Kein regelmäßiges Schreiben oder Treffen mit Dates.",
  "Jede:r von uns hat ein Veto.",
  "Keine Dates mit Menschen aus unserem Umfeld, etwa Freunde oder Kolleg:innen.",
  "Nach einem Date das Bett frisch beziehen, bevor der andere kommt.",
  "STI-Test 4 bis 6 Wochen nach Sex mit anderen, nicht früher.",
  "Übernachten und Frühstück sind okay, danach geht es nach Hause.",
  "Einmal im Monat reden wir bei einer Date Night übers Daten. Sonst fragen wir: „Wann hast du Raum dafür?“",
  "Mehr als 10 Dates im Jahr sind zu viel.",
  "Dates erfahren, dass wir offen leben, außer bei einem klaren One-Night-Stand.",
];
// Kept without the 8-hour expiry: the rules outlive one conversation. The Worker holds the
// shared copy both phones see; this device copy is the fallback while it can't be reached.
const RULES_KEY = "after-date-rules";
// Set while this device has edits the Worker hasn't confirmed, so they survive a reload offline.
const RULES_DIRTY_KEY = "after-date-rules-unsent";
// Edits are sent to the Worker once typing pauses; it shares its rate limit with guidance.
const RULES_SAVE_DEBOUNCE_MS = 2000;

const HOLD_QUESTION = "Können wir uns einen Moment einfach halten?";

// Slide order: title, names, then the game cards.
const SLIDE_TITLE = "title";
const SLIDE_INTRO = "intro";
const ALL_SLIDES: string[] = [SLIDE_TITLE, SLIDE_INTRO, ...GAME_CARDS.map((c) => c.id)];
const CARD_BY_ID = Object.fromEntries(GAME_CARDS.map((c) => [c.id, c])) as Record<string, GameCard>;


/** Ink or white, whichever reads better on a #RRGGBB fill. */
const inkOn = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.0176 ? "#FFFFFF" : INK;
};

/** The two people playing; `dateIdx` marks who had the date. */
interface People {
  names: [string, string];
  dateIdx: 0 | 1;
}

interface PersonAnswer {
  mood: number | null;
  chips: string[];
  text: string;
  /** Answers to a card's `prompts`, one per field */
  texts?: string[];
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

// Fields take part in swiping (the deck pages over them; a tap still focuses them) and show no
// focus or press outline.
// Answer fields fill the card's free height. Safari won't stretch a textarea as a flex item,
// so a box takes the room (two lines at least) and the field fills the box.
const fillBoxCls = "relative w-full flex-1 min-h-[56px]";
const fillFieldCls = "absolute inset-0 h-full py-2 resize-none";

const fieldCls =
  "retro-input retro-input-dark-text w-full rounded-none border-0 px-3 outline-none ring-0 focus:outline-none focus:ring-0 active:outline-none [-webkit-tap-highlight-color:transparent]";

/** A person has answered a card when they passed, or filled what the card asks for. */
/** Everything a person wrote on a card; on a card with prompts each answer follows its prompt. */
const answerText = (card: GameCard, a: PersonAnswer) =>
  card.prompts
    ? card.prompts
        .map((p, k) => (a.texts?.[k]?.trim() ? `${p.q} ${a.texts[k].trim()}` : ""))
        .filter(Boolean)
        .join("\n")
    : a.text.trim();

const isAnswered = (card: GameCard, a: PersonAnswer) => {
  if (answerText(card, a)) return true;
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
    return saved !== null && saved < ALL_SLIDES.length ? saved : 0;
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

  const [rulesOpen, setRulesOpen] = useState(false);
  // The AI impulse sits behind a CTA per card, opened on tap.
  const [adviceOpen, setAdviceOpen] = useState<Record<string, boolean>>({});
  // Each local edit bumps `edits`; `sent` is the last edit the Worker confirmed. While they
  // differ, this device's rules are newer than the shared copy and are never overwritten by it.
  const rulesEdits = useRef(0);
  const rulesSent = useRef(0);
  // Saves run one after another, so an older one can never land after a newer one.
  const rulesQueue = useRef<Promise<void>>(Promise.resolve());

  const loadSharedRules = useCallback(() => {
    const startedAt = rulesEdits.current;
    if (startedAt !== rulesSent.current) return;
    fetchRules()
      .then((shared) => {
        // Only take the shared copy when nothing was edited here since asking.
        if (shared && rulesEdits.current === startedAt && rulesSent.current === startedAt) setRules(shared);
      })
      .catch(() => {
        // Offline or not set up: the device copy stays.
      });
  }, []);

  const sendRules = useCallback((list: string[]) => {
    const version = rulesEdits.current;
    rulesQueue.current = rulesQueue.current.then(() =>
      saveRules(list)
        .then((ok) => {
          if (!ok) return;
          rulesSent.current = Math.max(rulesSent.current, version);
          if (rulesSent.current === rulesEdits.current) {
            try {
              localStorage.removeItem(RULES_DIRTY_KEY);
            } catch {
              // Nothing to clear in private mode.
            }
          }
        })
        .catch(() => {
          // Kept on the device and marked unsent; the next edit or visit tries again.
        })
    );
  }, []);

  useEffect(() => {
    // Edits left unsent on an earlier visit go out first instead of being replaced.
    let unsent = false;
    try {
      unsent = localStorage.getItem(RULES_DIRTY_KEY) === "1";
    } catch {
      unsent = false;
    }
    if (unsent) {
      rulesEdits.current = 1;
      sendRules(rules);
    } else {
      loadSharedRules();
    }
    // Runs once on mount with the rules loaded from the device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    } catch {
      // Private mode: the rules still work for this visit.
    }
    if (rulesEdits.current === rulesSent.current) return;
    const t = setTimeout(() => sendRules(rules), RULES_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rules, sendRules]);

  const editRules = (change: (prev: string[]) => string[]) => {
    rulesEdits.current += 1;
    try {
      localStorage.setItem(RULES_DIRTY_KEY, "1");
    } catch {
      // Private mode: unsent edits only last this visit.
    }
    setRules(change);
  };

  const nameOf = useCallback(
    (i: 0 | 1) => people.names[i].trim() || (i === 0 ? "Person 1" : "Person 2"),
    [people.names]
  );
  const roleOf = (i: 0 | 1): GuidanceAnswer["role"] => (people.dateIdx === i ? "date" : "listener");
  const listenerIdx = (people.dateIdx === 0 ? 1 : 0) as 0 | 1;
  const playersOf = (card: GameCard): (0 | 1)[] =>
    card.who === "both" ? [0, 1] : card.who === "together" ? [0] : card.who === "date" ? [people.dateIdx] : [listenerIdx];

  /** The topics the listener picked, or null while they haven't picked any. */
  const wishedTopics = (cardId: string): string[] | null => {
    const w = answers[cardId]?.[listenerIdx];
    return w && w.chips.length ? w.chips : null;
  };

  /** What the listener asked to hear and to leave out, as a sentence for the AI. */
  const wishesText = (cardId: string) => {
    const picked = wishedTopics(cardId);
    if (!picked) return "";
    if (picked.includes(NOTHING_YET)) {
      return `${nameOf(listenerIdx)} möchte gerade lieber nichts Genaues wissen. Sag, dass du da bist, und lass Raum für Fragen.`;
    }
    const skip = TOPICS.filter((t) => !picked.includes(t));
    return `${nameOf(listenerIdx)} möchte wissen: ${picked.join(", ")}.${skip.length ? ` Lieber nicht: ${skip.join(", ")}.` : ""}`;
  };

  /** How the listener checked in, when it asks the teller to go gently. */
  const tenderFeelings = () => {
    const c = answers["checkin-safe"]?.[listenerIdx];
    if (!c) return [];
    const picked = c.chips.filter((f) => TENDER_FEELINGS.includes(f));
    if (!picked.length && c.mood !== null && c.mood <= 2) return ["Unsicher"];
    return picked;
  };

  /** Content tied to topics shows unless the listener picked topics and none of these. */
  const topicsWanted = (card: GameCard, topics?: string[]) => {
    if (!topics || !card.showWishesFrom) return true;
    const picked = wishedTopics(card.showWishesFrom);
    return !picked || topics.some((t) => picked.includes(t));
  };
  const promptVisible = (card: GameCard, prompt: Prompt) => topicsWanted(card, prompt.topics);

  const answerPayload = (card: GameCard, i: 0 | 1, a: PersonAnswer): GuidanceAnswer => ({
    name: card.who === "together" ? `${nameOf(0)} und ${nameOf(1)}` : nameOf(i),
    role: roleOf(i),
    ...(card.scale && a.mood !== null ? { mood: a.mood } : {}),
    ...(card.chips ? { chips: a.chips } : {}),
    ...(card.text || card.prompts ? { text: answerText(card, a) } : {}),
    passed: a.passed,
  });

  // Mirror every card once all its players have answered, and again when answers change.
  useEffect(() => {
    if (!guidanceEnabled()) return;
    GAME_CARDS.forEach((card) => {
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
    return { label: phase.title, pill: phase.pill, pillDot: phase.pillDot };
  };

  // Cards with `showIf` join the deck only once the listener's answers call for them.
  const listenerAnswer = (cardId: string) => answers[cardId]?.[listenerIdx];
  const SLIDES = ALL_SLIDES.filter((id) => !CARD_BY_ID[id]?.showIf || CARD_BY_ID[id].showIf!(listenerAnswer));
  const activeGameCard = CARD_BY_ID[SLIDES[currentCard]];
  const pageColour = activeGameCard ? PHASES[activeGameCard.phase].page : INK;

  /** A CTA that opens its advice inline on the card, like the rules notes. */
  const renderAdvice = (key: string, label: string, icon: React.ReactNode, accent: string, body: React.ReactNode) => {
    const open = !!adviceOpen[key];
    return (
      <div className="w-full flex flex-col gap-3">
        <ActionRow
          iconNode={icon}
          label={open ? "Schließen" : label}
          accent={accent}
          fieldBg={GREY_FIELD}
          onClick={() => setAdviceOpen((prev) => ({ ...prev, [key]: !open }))}
        />
        {open && (
          <div className="w-full flex flex-col gap-2 p-4" style={{ background: accent, color: INK }} aria-live="polite">
            {body}
          </div>
        )}
      </div>
    );
  };

  const renderGuidance = (card: GameCard) => {
    const g = guidance[card.id];
    // The CTA appears once there is an impulse; while it is written or when none came, nothing shows.
    // The hold card is not offered here: "Halt mich kurz" under every card is always there.
    if (g?.status !== "done") return null;
    return (
      <div className="w-full flex flex-col gap-3">
        {renderAdvice(
            `ai-${card.id}`,
            "Impuls für euch",
            <Lightbulb size={16} strokeWidth={1.5} color={INK} />,
            "#F6F1E8",
            <>
              <p className="retro-body-copy">{g.data.guidance}</p>
              {g.data.followUpQuestion && <p className="retro-body-copy">{g.data.followUpQuestion}</p>}
            </>
        )}
      </div>
    );
  };

  /** Whose field it is on cards for both: the setup slide's label tag, in the colour of the round pill's dot. */
  const nameTag = (card: GameCard, i: 0 | 1, htmlFor?: string) => {
    const bg = PHASES[card.phase].tag ?? PHASES[card.phase].pillDot;
    const Tag = htmlFor ? "label" : "span";
    return (
      <Tag
        htmlFor={htmlFor}
        className="retro-body-copy self-start inline-flex h-8 items-center px-3"
        style={{ background: bg, color: inkOn(bg) }}
      >
        {nameOf(i)}
      </Tag>
    );
  };

  const renderPlayer = (card: GameCard, i: 0 | 1) => {
    const a = answers[card.id]?.[i] ?? EMPTY_PERSON;
    const phase = PHASES[card.phase];
    const showName = card.who === "both";
    return (
      <div key={i} className="w-full flex flex-1 flex-col gap-2">
        {showName && !card.text && nameTag(card, i)}
        {
          <>
            {card.scale && (
              <SmileyScale
                value={a.mood}
                onChange={(v) => updateAnswer(card.id, i, { mood: v })}
                labels={card.scaleLabels}
                label={`Wie fühlt sich das für ${nameOf(i)} an?`}
              />
            )}
            {card.chips && (
              <ChipGroup
                options={card.chips.filter((c) => topicsWanted(card, card.chipTopics?.[c]))}
                value={a.chips}
                onChange={(v) => updateAnswer(card.id, i, { chips: v })}
                accent={phase.face}
                label={`Antworten von ${nameOf(i)}`}
              />
            )}
            {card.text && (
              // The field's prompt is its placeholder. Only on cards for both does a tag on top name the
              // person; scales and chips above a field already say what it is for.
              <div className="w-full flex flex-1 flex-col items-start gap-0">
                {showName && nameTag(card, i, `answer-${card.id}-${i}`)}
                <div className={fillBoxCls}>
                  <textarea
                    id={`answer-${card.id}-${i}`}
                    value={a.text}
                    onChange={(e) => updateAnswer(card.id, i, { text: e.target.value })}
                    placeholder={card.text}
                    aria-label={showName ? undefined : card.text.replace(/\s*…$/, "")}
                    className={`${fieldCls} ${fillFieldCls}`}
                    style={{ background: GREY_FIELD }}
                  />
                </div>
              </div>
            )}
            {card.prompts && (
              <div className="w-full flex flex-1 flex-col gap-2">
                {card.prompts.map(
                  (prompt, k) =>
                    promptVisible(card, prompt) && (
                      <div key={prompt.q} className={fillBoxCls}>
                        <textarea
                          value={a.texts?.[k] ?? ""}
                          onChange={(e) => {
                            const texts = card.prompts!.map((_, n) => a.texts?.[n] ?? "");
                            texts[k] = e.target.value;
                            updateAnswer(card.id, i, { texts });
                          }}
                          placeholder={prompt.q}
                          aria-label={prompt.q}
                          className={`${fieldCls} ${fillFieldCls}`}
                          style={{ background: GREY_FIELD }}
                        />
                      </div>
                    )
                )}
              </div>
            )}
          </>
        }
      </div>
    );
  };

  // Closed: one CTA. Open: the notes take the card (the question steps aside) and the close CTA follows them.
  const renderRules = (accent: string) => {
    const toggle = (label: string) => (
      <ActionRow
        icon={rulesOpen ? "IconClear" : "IconPencil"}
        label={label}
        accent={accent}
        iconColor="#FFFFFF"
        fieldBg={GREY_FIELD}
        onClick={() => {
          if (!rulesOpen) loadSharedRules();
          setRulesOpen((o) => !o);
        }}
      />
    );
    return (
      // Closed, the CTA sits in the card's bottom left corner.
      <div className={`w-full flex flex-col gap-3 ${rulesOpen ? "" : "mt-auto"}`}>
        {rulesOpen ? (
          <>
            {renderRuleNotes()}
            {toggle("Regeln schließen")}
          </>
        ) : (
          toggle("Unsere Regeln ansehen")
        )}
      </div>
    );
  };

  const renderRuleNotes = () => (
    <div className="w-full flex flex-col gap-2">
      {rules.map((rule, i) => (
        <div key={i} className="relative w-full" style={{ background: GREY_FIELD }}>
          <textarea
            value={rule}
            onChange={(e) => editRules((prev) => prev.map((r, j) => (j === i ? e.target.value : r)))}
            aria-label={`Regel ${i + 1}`}
            rows={Math.max(2, Math.ceil(rule.length / 26))}
            className={`${fieldCls} retro-body-copy-sm bg-transparent py-2 pr-9`}
          />
          <button
            type="button"
            aria-label={`Regel ${i + 1} streichen`}
            onClick={() => editRules((prev) => prev.filter((_, j) => j !== i))}
            className="swiper-no-swiping absolute right-1 top-1 h-7 w-7 border-0 bg-transparent p-0 retro-body-copy"
            style={{ color: INK }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => editRules((prev) => [...prev, ""])}
        className="swiper-no-swiping retro-body-copy-sm self-start h-9 rounded-full border-0 px-3"
        style={{ background: "#FFFFFF", color: INK, boxShadow: "inset 0 0 0 1.5px #C9CBCE" }}
      >
        + Neue Regel
      </button>
    </div>
  );

  /** On the date card: what to tell and what to leave out, from the listener's check-in picks.
   *  Nothing shows until the listener has picked something or checked in tenderly. */
  const renderTellGuide = (wishesFrom: string) => {
    const picked = wishedTopics(wishesFrom);
    const tender = tenderFeelings();
    if (!picked && !tender.length) return null;
    const name = nameOf(listenerIdx);
    const nothing = !!picked?.includes(NOTHING_YET);
    const tell = picked ? TOPICS.filter((t) => picked.includes(t)) : [];
    const skip = picked && !nothing ? TOPICS.filter((t) => !picked.includes(t)) : [];
    const row = (label: string, items: string) => (
      <p className="retro-body-copy">
        <span className="retro-body-copy-sm opacity-70">{label} </span>
        {items}
      </p>
    );
    return (
      <div className="w-full flex flex-col gap-1 p-3" style={{ background: "#F6F1E8" }}>
        {nothing && <p className="retro-body-copy">{name} möchte gerade nichts Genaues wissen. Sag, dass du da bist.</p>}
        {tell.length > 0 && row("Erzähl:", tell.join(", "))}
        {skip.length > 0 && row("Lass weg:", skip.join(", "))}
        {tender.length > 0 && (
          <p className="retro-body-copy-sm opacity-70">
            {name} fühlt sich {tender.map((f) => f.toLowerCase()).join(", ")}. Erzähl behutsam.
          </p>
        )}
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
              accent={PINK}
              fieldBg={GREY_FIELD}
              onClick={() => swiperRef?.slideNext()}
            />
          </div>
        </div>
      );
    }

    if (slideId === SLIDE_INTRO) {
      return (
        <div className="flex flex-1 flex-col justify-start items-start w-full gap-6">
          <h2 id="who-heading" className="question-font retro-heading card-question w-full" lang="de">
            <RevealText text="Wer macht mit?" color={INK} slideIndex={index} />
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
                    iconNode={<Heart size={16} strokeWidth={1.5} color={hadDate ? "#FF4D00" : INK} fill={hadDate ? "#FF4D00" : "none"} />}
                    label={hadDate ? "Hatte das Date" : "Hatte das Date?"}
                    accent={PINK}
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
            accent={PINK}
            fieldBg={GREY_FIELD}
            className="mt-auto"
            onClick={() => swiperRef?.slideNext()}
          />

        </div>
      );
    }

    const card = CARD_BY_ID[slideId];
    const players = playersOf(card);
    return (
      <div className="flex flex-1 flex-col items-start w-full gap-4">
        {!(card.rules && rulesOpen) && (
          <h2 className="question-font retro-heading card-question w-full" lang="de">
            <RevealText text={card.question} color={INK} slideIndex={index} />
          </h2>
        )}
        {card.showWishesFrom && renderTellGuide(card.showWishesFrom)}
        {!(card.rules && rulesOpen) && players.map((i) => renderPlayer(card, i))}
        {card.rules && renderRules(PHASES[card.phase].pill)}
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
                        className="retro-card-container relative flex-1 w-full max-w-[500px] max-h-[88%] min-h-0 mx-auto flex flex-col justify-start items-start gap-4 rounded-none p-[28px] overflow-y-auto"
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
            className="fixed inset-0 z-50 flex flex-col items-center px-6 pt-[88px] pb-[96px] animate-[fadeInUp_0.4s_ease-out_both]"
            style={{ backgroundColor: PINK, color: INK }}
          >
            {/* The hold card sits where the deck's card sits; card and page are one pink. */}
            <div className="w-full max-w-[500px] flex-1 max-h-[660px] flex flex-col items-center justify-center gap-8 p-[28px]" style={{ backgroundColor: PINK }}>
              <HugIllustration />
              <h2 className="question-font retro-heading w-full text-center" lang="de">
                <RevealText text={HOLD_QUESTION} color={INK} startDelay={120} />
              </h2>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-center px-6 pb-6">
              <ActionRow
                icon="IconArrowRight"
                label="Weiter"
                accent={INK}
                iconColor="#FFFFFF"
                fieldBg="#FFFFFF"
                onClick={() => setHoldOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    </ActiveSlideContext.Provider>
  );
};

export default AfterDateCards;
