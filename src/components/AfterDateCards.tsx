import React, { useState, useEffect, useCallback, useRef } from "react";
import ActionRow from "@/components/ActionRow";
import RevealText from "@/components/RevealText";
import BgVector from "@/components/BgVector";
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
  /** A "Gesprächsimpuls": a way of saying it, shown in a box */
  tip?: string;
  scale?: boolean;
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

// One question per card. Cards for both people carry one kind of input, so two answers still fit.
const GAME_CARDS: GameCard[] = [
  // 1. Check-in – Wie geht es uns gerade?
  {
    id: "checkin-feel",
    phase: 0,
    who: "both",
    question: "Wie fühlst du dich gerade, wenn du an das Date denkst?",
    hint: "Wählt, was gerade besonders präsent ist.",
    chips: ["Freude", "Neugier", "Aufregung", "Unsicherheit", "Eifersucht"],
  },
  {
    id: "checkin-need",
    phase: 0,
    who: "both",
    question: "Was brauchst du gerade von mir, damit wir offen darüber sprechen können?",
    chips: ["Nähe", "Ehrlichkeit", "Geduld", "Pausen", "Wenig Details"],
  },
  {
    id: "checkin-safe",
    phase: 0,
    who: "both",
    question: "Wie sicher und verbunden fühlst du dich gerade?",
    scale: true,
  },
  // 2. Das Date – Was möchtest du erzählen?
  {
    id: "howmuch",
    phase: 1,
    who: "listener",
    question: "Wie viel möchtest du hören?",
    hint: "Du entscheidest mit, wie viele Details erzählt werden. Ehrlichkeit heißt nicht, jedes intime Detail erzählen zu müssen.",
    chips: ["Wie es dir ging", "Was ihr gemacht habt", "Wer die Person ist", "Ob ihr euch wiedersehen wollt", "Körperliches", NOTHING_YET],
  },
  {
    id: "date-how",
    phase: 1,
    who: "date",
    question: "Wie war dein Date für dich?",
    hint: "Du erzählst, dein Gegenüber darf neugierig nachfragen.",
    showWishesFrom: "howmuch",
    scale: true,
  },
  {
    id: "date-liked",
    phase: 1,
    who: "date",
    question: "Was hat dir besonders gefallen?",
    text: "Stichworte reichen …",
  },
  {
    id: "date-moved",
    phase: 1,
    who: "date",
    question: "Gab es etwas, das dich überrascht oder bewegt hat?",
    text: "Stichworte reichen …",
  },
  {
    id: "date-closeness",
    phase: 1,
    who: "date",
    question: "Wie hast du die Nähe oder Anziehung erlebt?",
    showWishesFrom: "howmuch",
    text: "Nur so viel, wie gewünscht …",
  },
  {
    id: "date-share",
    phase: 1,
    who: "date",
    question: "Gibt es etwas, das du gerne mit mir teilen möchtest?",
    hint: "Wenn dir die Worte fehlen, schreib Stichworte auf und lass dir beim Formulieren helfen.",
    text: "Was möchtest du sagen? Stichworte reichen.",
    phrase: true,
  },
  // 3. Gefühle – Was löst das in uns aus?
  {
    id: "feel-trigger",
    phase: 2,
    who: "listener",
    question: "Was hat es in dir ausgelöst, mir zuzuhören?",
    hint: "Jetzt bekommst du Raum. Alles darf da sein.",
    scale: true,
    chips: FEELINGS,
  },
  {
    id: "feel-hard",
    phase: 2,
    who: "listener",
    question: "Gab es einen Moment, der sich schwierig angefühlt hat?",
    tip: "Statt „Du musst doch nicht eifersüchtig sein“ lieber: „Ich möchte verstehen, was sich für dich gerade schwierig anfühlt.“",
    text: "Der Moment, als …",
  },
  {
    id: "feel-fears",
    phase: 2,
    who: "listener",
    question: "Welche Gedanken oder Ängste stecken hinter diesem Gefühl?",
    text: "Ich habe Angst, dass …",
  },
  {
    id: "feel-calm",
    phase: 2,
    who: "listener",
    question: "Was beruhigt dich oder gibt dir Sicherheit?",
    chips: ["Eine Umarmung", "Hören, was ich dir bedeute", "Zeit nur für uns", "Ein Ritual nach Dates", "Mehr wissen", "Erst mal Ruhe"],
  },
  {
    id: "feel-joy",
    phase: 2,
    who: "listener",
    question: "Kannst du dich auch für mich freuen?",
    hint: "Und wenn nicht: Was steht dem gerade im Weg?",
    chips: ["Ja, von Herzen", "Ein bisschen", "Gerade noch nicht"],
    text: "Was gerade im Weg steht …",
  },
  // 4. Wir beide – Was bedeutet das für unsere Beziehung?
  {
    id: "us-changed",
    phase: 3,
    who: "both",
    question: "Hat das Date etwas an deinem Gefühl für unsere Beziehung verändert?",
    chips: ["Nein, alles wie vorher", "Ein bisschen", "Ja, spürbar", "Weiß ich noch nicht"],
  },
  {
    id: "us-loved",
    phase: 3,
    who: "listener",
    question: "Hast du dich trotz des Dates geliebt und als wichtige Bezugsperson gefühlt?",
    scale: true,
  },
  {
    id: "us-special",
    phase: 3,
    who: "both",
    question: "Was gibt dir das Gefühl, dass unsere Verbindung besonders und sicher ist?",
    text: "Was nur wir haben …",
  },
  {
    id: "us-wish",
    phase: 3,
    who: "both",
    question: "Gibt es etwas, das du dir künftig anders wünschen würdest?",
    hint: "Sprecht über Bedürfnisse, ohne aus Angst neue Regeln zu erzwingen.",
    text: "Ich wünsche mir …",
  },
  {
    id: "us-right",
    phase: 3,
    who: "both",
    question: "Fühlt sich unsere offene Beziehung für uns beide weiterhin richtig an?",
    chips: ["Ja", "Ja, mit Änderungen", "Unsicher"],
  },
  // 5. Reconnect – Zurück zu uns
  {
    id: "rc-appreciate",
    phase: 4,
    who: "both",
    question: "Was schätzt du gerade besonders an uns?",
    text: "An uns schätze ich …",
  },
  {
    id: "rc-unsaid",
    phase: 4,
    who: "both",
    question: "Was möchtest du mir sagen, das bisher zu kurz gekommen ist?",
    text: "Ich wollte dir noch sagen …",
  },
  {
    id: "rc-close",
    phase: 4,
    who: "both",
    question: "Was können wir jetzt tun, damit wir uns wieder ganz nah fühlen?",
    chips: ["Umarmen", "Kuscheln", "Zusammen einschlafen", "Reden", "Lachen"],
    showMatches: true,
  },
];

/** Drei Regeln für euer Gespräch: each is agreed with a tap before the cards start. */
const RULES: { title: string; body: string }[] = [
  { title: "Verstehen statt verteidigen.", body: "Gefühle müssen nicht logisch sein, um ernst genommen zu werden." },
  { title: "Neugier statt Vergleich.", body: "Es geht nicht darum, wer besser, attraktiver oder aufregender ist." },
  { title: "Verbindung statt Kontrolle.", body: "Sprecht über Bedürfnisse und Grenzen, ohne aus Angst neue Regeln zu erzwingen." },
];

const HOLD_QUESTION = "Can we just hold each other for a moment?";
const HOLD_HINT = "Manchmal braucht es keine weitere Frage, sondern erst einmal Nähe.";

// Slide order: title, goal and names, the three rules, the game cards, the closing card.
const SLIDE_TITLE = "title";
const SLIDE_INTRO = "intro";
const SLIDE_RULES = "rules";
const SLIDE_END = "end";
const SLIDES: string[] = [SLIDE_TITLE, SLIDE_INTRO, SLIDE_RULES, ...GAME_CARDS.map((c) => c.id), SLIDE_END];
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
  if (a.passed || a.text.trim()) return true;
  // A text-only card waits for words; otherwise every face and chip row needs a pick.
  if (!card.scale && !card.chips) return false;
  return (!card.scale || a.mood !== null) && (!card.chips || a.chips.length > 0);
};

const AfterDateCards: React.FC = () => {
  const [currentCard, setCurrentCard] = useState(() => {
    const saved = loadFromStorage<number>(STORAGE_KEYS.CURRENT_CARD);
    return saved !== null && saved < SLIDES.length ? saved : 0;
  });
  const [swiperRef, setSwiperRef] = useState<SwiperType | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [rulesAgreed, setRulesAgreed] = useState<boolean[]>(() => RULES.map(() => false));
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 767
  );
  const [people, setPeople] = useState<People>(
    () => loadFromStorage<People>(STORAGE_KEYS.PEOPLE) ?? { names: ["", ""], dateIdx: 0 }
  );
  const [answers, setAnswers] = useState<Record<string, CardAnswers>>(
    () => loadFromStorage<Record<string, CardAnswers>>(STORAGE_KEYS.ANSWERS) ?? {}
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
      // Notes on the "date-share" card are a draft for the teller, not yet said; it gets wording help instead.
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
    const feelings = answers["checkin-feel"]?.[listenerIdx];
    const needs = answers["checkin-need"]?.[listenerIdx];
    const context = [
      feelings && feelings.chips.length ? `${nameOf(listenerIdx)} fühlt gerade: ${feelings.chips.join(", ")}.` : "",
      needs && needs.chips.length ? `${nameOf(listenerIdx)} braucht heute: ${needs.chips.join(", ")}.` : "",
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
    if (slideId === SLIDE_RULES) return { label: "Drei Regeln", pill: PINK, pillDot: "#FF4D00" };
    if (slideId === SLIDE_END) return { label: "Zum Abschluss", pill: PINK, pillDot: "#FF4D00" };
    const card = CARD_BY_ID[slideId];
    const phase = PHASES[card.phase];
    return { label: `${pad2(GAME_CARDS.indexOf(card) + 1)} · ${phase.title}`, pill: phase.pill, pillDot: phase.pillDot };
  };

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
        {a.passed ? (
          <div className="flex w-full items-center justify-between gap-3 p-3" style={{ background: GREY_FIELD }}>
            <span className="retro-body-copy">Gepasst. Auch das ist okay.</span>
            <button
              type="button"
              onClick={() => updateAnswer(card.id, i, { passed: false })}
              className="swiper-no-swiping retro-body-copy-sm shrink-0 border-0 bg-transparent p-0 underline"
            >
              Doch antworten
            </button>
          </div>
        ) : (
          <>
            {card.scale && (
              <SmileyScale
                value={a.mood}
                onChange={(v) => updateAnswer(card.id, i, { mood: v })}
                accent={phase.face}
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
                rows={3}
                className={`${fieldCls} py-2`}
                style={{ background: GREY_FIELD }}
              />
            )}
            {card.who !== "both" && (
              <button
                type="button"
                onClick={() => updateAnswer(card.id, i, { passed: true })}
                className="swiper-no-swiping retro-body-copy-sm self-start border-0 bg-transparent p-0 underline opacity-70"
              >
                Passen
              </button>
            )}
          </>
        )}
      </div>
    );
  };

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
          <p className="retro-body-copy mt-8 text-center">Let's make honesty feel safe.</p>
          <p className="retro-body-copy-sm mt-3 text-center opacity-70">
            Ein Gesprächsleitfaden für offene Beziehungen.
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
          <h2 className="retro-heading intro-lede w-full">
            <RevealText
              text="Ein Date mit jemand anderem liegt hinter euch. Jetzt nehmt ihr euch bewusst Zeit, darüber zu sprechen: ehrlich, neugierig und ohne Druck."
              color={PINK}
              slideIndex={index}
              stagger={45}
            />
          </h2>

          <fieldset className="w-full flex flex-col gap-3 border-0 p-0 m-0">
            <legend className="retro-body-copy mb-3">Wer spielt?</legend>
            {([0, 1] as const).map((i) => (
              <div key={i} className="flex w-full items-stretch gap-0">
                <input
                  type="text"
                  value={people.names[i]}
                  onChange={(e) =>
                    setPeople((p) => {
                      const names = [...p.names] as People["names"];
                      names[i] = e.target.value;
                      return { ...p, names };
                    })
                  }
                  placeholder={i === 0 ? "Dein Name" : "Name deines Gegenübers"}
                  aria-label={i === 0 ? "Dein Name" : "Name deines Gegenübers"}
                  className={`${fieldCls} name-input-field h-10`}
                  style={{ background: GREY_FIELD }}
                />
                <button
                  type="button"
                  aria-pressed={people.dateIdx === i}
                  onClick={() => setPeople((p) => ({ ...p, dateIdx: i }))}
                  className="swiper-no-swiping retro-body-copy-sm shrink-0 h-10 px-3 border-0 rounded-none whitespace-nowrap"
                  style={{ background: people.dateIdx === i ? PINK : "#FFFFFF", color: INK, boxShadow: `inset 0 0 0 1px ${GREY_FIELD}` }}
                >
                  {people.dateIdx === i ? "hatte das Date" : "hört zu"}
                </button>
              </div>
            ))}
          </fieldset>

          <div className="flex flex-col gap-3 w-full retro-body-copy">
            <p className="retro-body-copy-sm opacity-70">Spielregeln</p>
            <p>Das Ziel: verstehen, wie es euch beiden damit geht. Eine Frage pro Karte, in fünf Runden. Jede Karte darf gepasst werden, und Nähe geht immer, über den Knopf unten.</p>
          </div>

          {guidanceEnabled() && (
            <p className="retro-body-copy-sm opacity-70">
              Sobald eine Karte beantwortet ist, schickt die App die Antworten auf dieser Karte an eine KI (Claude von Anthropic), die euch einen kurzen Impuls gibt. Auf diesem Gerät bleiben eure Antworten 8 Stunden gespeichert.
            </p>
          )}
        </div>
      );
    }

    if (slideId === SLIDE_RULES) {
      const allAgreed = rulesAgreed.every(Boolean);
      return (
        <div className="flex flex-col items-start w-full gap-5">
          <h2 className="question-font retro-heading w-full" lang="de">
            <RevealText text="Drei Regeln für euer Gespräch" color={PINK} slideIndex={index} />
          </h2>
          <p className="retro-body-copy-sm opacity-70 -mt-2">Lest jede Regel laut vor und tippt sie an, wenn ihr beide einverstanden seid.</p>
          <div className="w-full flex flex-col gap-2">
            {RULES.map((rule, i) => (
              <button
                key={rule.title}
                type="button"
                aria-pressed={rulesAgreed[i]}
                onClick={() => setRulesAgreed((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                className="swiper-no-swiping w-full flex flex-col items-start gap-1 p-3 text-left border-0 rounded-none transition-colors"
                style={{ background: rulesAgreed[i] ? PINK : GREY_FIELD, color: INK }}
              >
                <span className="retro-body-copy">{rulesAgreed[i] ? "✓ " : ""}{rule.title}</span>
                <span className="retro-body-copy-sm opacity-80">{rule.body}</span>
              </button>
            ))}
          </div>
          {allAgreed && (
            <ActionRow
              icon="IconArrowRight"
              label="Einverstanden, los geht's"
              accent="#FF6BEF"
              fieldBg={GREY_FIELD}
              onClick={() => swiperRef?.slideNext()}
            />
          )}
        </div>
      );
    }

    if (slideId === SLIDE_END) {
      return (
        <div className="flex flex-col items-start w-full gap-5">
          <h2 className="question-font retro-heading w-full" lang="de">
            <RevealText text="Zurück zu uns ❤️" color={PINK} slideIndex={index} />
          </h2>
          <p className="retro-body-copy">
            Eine Umarmung, Kuscheln, gemeinsam einschlafen oder einfach Zeit füreinander, ohne dass sofort alles geklärt sein muss.
          </p>
          <p className="retro-body-copy w-full p-3" style={{ background: "#F6F1E8" }}>
            Ein gutes Gespräch muss nicht damit enden, dass sich beide sofort gut fühlen. Manchmal reicht es, sich verstanden, ernst genommen und geliebt zu fühlen.
          </p>
          {holdButton("Jetzt halten")}
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
        {card.tip && (
          <div className="w-full flex flex-col gap-2 p-3" style={{ background: "#F6F1E8" }}>
            <span className="retro-body-copy-sm opacity-70">Gesprächsimpuls für {nameOf(people.dateIdx)}</span>
            <p className="retro-body-copy">{card.tip}</p>
          </div>
        )}
        {card.showWishesFrom && (
          <p className="retro-body-copy w-full p-3" style={{ background: "#F6F1E8" }}>
            {wishes || `${nameOf(listenerIdx)} hat noch nichts ausgewählt. Fragt kurz nach, was erzählt werden soll.`}
          </p>
        )}
        {players.map((i) => renderPlayer(card, i))}
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
        {/* Decorative page background graphic */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 z-0 overflow-hidden"
          style={{ backgroundColor: INK }}
        >
          <BgVector className="absolute inset-0 w-full h-full bg-graphic-animated" style={{ opacity: 1 }} />
        </div>

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
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backgroundColor: "rgba(32, 28, 29, 0.72)" }}
            onClick={() => setHoldOpen(false)}
          >
            <div
              className="relative w-full max-w-[500px] flex flex-col justify-between gap-8 p-[28px] shadow-2xl animate-[fadeInUp_0.4s_ease-out_both]"
              style={{ backgroundColor: PINK, minHeight: "min(560px, 80vh)", color: INK }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-6">
                <h2 className="question-font retro-heading w-full" lang="en">
                  <RevealText text={HOLD_QUESTION} color="#FF4D00" startDelay={120} />
                </h2>
                <p className="retro-body-copy">{HOLD_HINT}</p>
              </div>
              <ActionRow
                icon="IconArrowRight"
                label="Weiter reden"
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
