import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsSlideActive } from "./ActiveSlideContext";

interface RevealTextProps {
  text: string;
  /** Color each word flashes in before settling to black */
  color?: string;
  /** Delay between words in ms */
  stagger?: number;
  /** Wait before the first word appears — synced to the slide transition */
  startDelay?: number;
  /** Index of the slide this text lives on — activity is read from context */
  slideIndex?: number;
}

/** Word-by-word reveal: each word pops in colored, then settles to black. */
const RevealTextBase: React.FC<RevealTextProps> = ({ text, color, stagger = 65, startDelay = 380, slideIndex }) => {
  // Single source of truth: the active slide index from context.
  const active = useIsSlideActive(slideIndex);
  const [runId, setRunId] = useState(0);
  // Slide-entry reveals wait for the transition; in-place text changes start immediately.
  const [delayMs, setDelayMs] = useState(startDelay);
  const wasActive = useRef(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (active && !wasActive.current) {
      wasActive.current = true;
      setDelayMs(startDelay);
      setRunId((n) => n + 1);
    } else if (!active) {
      wasActive.current = false;
    }
  }, [active, startDelay]);

  useEffect(() => {
    if (active && wasActive.current) setDelayMs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Restart the animation on the actual DOM nodes so it replays reliably,
  // even if React reuses the same elements.
  useLayoutEffect(() => {
    if (!active || !containerRef.current) return;
    const words = containerRef.current.querySelectorAll<HTMLElement>(".question-word");
    words.forEach((w) => {
      w.style.animation = "none";
      // force reflow
      void w.offsetWidth;
      w.style.animation = "";
    });
  }, [runId, active, text]);

  if (!active) {
    return <span style={{ color: "#201C1D" }}>{text}</span>;
  }

  return (
    <span ref={containerRef}>
      {text.split(" ").map((word, i) => (
        <span
          key={`${runId}-${word}-${i}`}
          className="question-word"
          style={{
            animationDelay: `${delayMs + i * stagger}ms, ${delayMs + i * stagger + 90}ms`,
            ["--reveal-color" as string]: color || "#201C1D",
          } as React.CSSProperties}
        >
          {word}&nbsp;
        </span>
      ))}
    </span>
  );
};

/** Memoized: re-renders only when its own props change, not on every parent render. */
const RevealText = React.memo(RevealTextBase);

export default RevealText;
