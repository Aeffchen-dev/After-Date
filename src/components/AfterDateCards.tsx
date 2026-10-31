import React, { useState, useEffect, useCallback } from "react";
import ActionRow from "@/components/ActionRow";
import RevealText from "@/components/RevealText";
import BgVector from "@/components/BgVector";
import { ActiveSlideContext } from "@/components/ActiveSlideContext";
import { Heart } from "lucide-react";

import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { saveToStorage, loadFromStorage, clearExpiredStorage, STORAGE_KEYS } from "@/lib/storage";

import "swiper/css";

const INK = "#201C1D";
const GREY_FIELD = "#E4E6E8";
const PINK = "#F39FFF";

// One conversation card: the English title rides in the pill above the card, the
// German question is the card's big question.
interface TalkCard {
  title: string;
  question: string;
  /** Pill swatch and the colour each word flashes in */
  pill: string;
  /** Dot inside the pill swatch */
  pillDot: string;
  /** Optional quiet line under the question */
  hint?: string;
}

const TALK_CARDS: TalkCard[] = [
  { title: "Tell me", question: "Was möchtest du mir von deinem Date erzählen?", pill: "#FF4D00", pillDot: INK },
  { title: "I'm listening", question: "Was hat das gerade in mir ausgelöst?", pill: "#B026FF", pillDot: "#5343A8" },
  { title: "The hard part", question: "Was fällt uns gerade schwer zu sagen oder zu hören?", pill: "#00A9FF", pillDot: "#C6D0E0" },
  { title: "Underneath", question: "Welche Wünsche, Ängste oder Bedürfnisse stecken dahinter?", pill: "#0B7A35", pillDot: "#B6FF4D" },
  { title: "You & me", question: "Was brauchen wir voneinander, um uns sicher und frei zu fühlen?", pill: "#5C1524", pillDot: "#FF6BEF" },
  {
    title: "Still us",
    question: "Was möchten wir einander jetzt mitgeben?",
    pill: "#FFD400",
    pillDot: "#6C2D01",
    hint: "Das Gespräch endet. Eure Verbindung bleibt.",
  },
];

const HOLD_QUESTION = "Can we just hold each other for a moment?";
const HOLD_HINT = "Manchmal braucht es keine weitere Frage, sondern erst einmal Nähe.";

// Slide order: title, intro, then the six conversation cards.
const SLIDE_TITLE = "title";
const SLIDE_INTRO = "intro";
const SLIDES: string[] = [SLIDE_TITLE, SLIDE_INTRO, ...TALK_CARDS.map((_, i) => `talk-${i}`)];

const pad2 = (n: number) => String(n).padStart(2, "0");

const AfterDateCards: React.FC = () => {
  const [currentCard, setCurrentCard] = useState(() => {
    const saved = loadFromStorage<number>(STORAGE_KEYS.CURRENT_CARD);
    return saved !== null && saved < SLIDES.length ? saved : 0;
  });
  const [swiperRef, setSwiperRef] = useState<SwiperType | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 767
  );

  useEffect(() => {
    clearExpiredStorage();
  }, []);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_CARD, currentCard);
  }, [currentCard]);

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
    if (slideId === SLIDE_INTRO) return { label: "Intro", pill: PINK, pillDot: "#FF4D00" };
    const i = Number(slideId.split("-")[1]);
    const card = TALK_CARDS[i];
    return { label: `${pad2(i + 1)} · ${card.title}`, pill: card.pill, pillDot: card.pillDot };
  };

  const renderCard = (slideId: string, index: number) => {
    if (slideId === SLIDE_TITLE) {
      return (
        <div className="relative flex flex-col items-center w-full h-full text-center" style={{ paddingTop: "30%" }}>
          <h1
            className="retro-title logo-slide-anim logo-glitch"
            data-text="After the Date"
            style={{ fontSize: "84px", lineHeight: 0.86, fontWeight: 500, color: "#3A3A3A" }}
          >
            After the Date
          </h1>
          <p className="retro-body-copy mt-8 text-center">Let's make honesty feel safe.</p>
          <div className="absolute z-40 flex items-center" style={{ left: 0, bottom: 0 }}>
            <ActionRow
              icon="IconArrowRight"
              label="Weiter swipen"
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
        <div className="flex flex-col justify-start items-start w-full h-full">
          <div className="flex flex-col items-start gap-6 w-full intro-block">
            <h2 className="retro-heading intro-lede w-full">
              <RevealText
                text="Ein geführtes Gespräch für zwei Menschen, die einander Freiheit geben und trotzdem manchmal mit Eifersucht, Unsicherheit oder Verlustangst kämpfen."
                color={PINK}
                slideIndex={index}
                stagger={45}
              />
            </h2>
            <div className="flex flex-col gap-4 w-full retro-body-copy intro-copy">
              <p>Sechs Karten, jede davon öffnet ein Gespräch. Nehmt euch Zeit, bleibt neugierig und hört einander zu. Es gibt kein Richtig oder Falsch.</p>
              <p>Und wenn es gerade keine weitere Frage braucht, sondern erst einmal Nähe: Die Karte „{HOLD_QUESTION}“ könnt ihr jederzeit ziehen.</p>
            </div>
          </div>
        </div>
      );
    }

    const card = TALK_CARDS[Number(slideId.split("-")[1])];
    return (
      <div className="flex flex-col items-start w-full h-full">
        <h2 className="question-font retro-heading w-full" lang="de">
          <RevealText text={card.question} color={card.pill} slideIndex={index} />
        </h2>
        {card.hint && <p className="retro-body-copy mt-auto">{card.hint}</p>}
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
