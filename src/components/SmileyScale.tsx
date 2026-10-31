import React from "react";

/** Mood labels, worst to best; the scale stores 1–5. */
export const MOOD_LABELS = ["Sehr schwer", "Eher schwer", "Gemischt", "Eher gut", "Richtig gut"];

const INK = "#201C1D";

// Mouth curve per mood: negative bends down (sad), positive bends up (happy).
const CURVE = [-5, -2.5, 0, 2.5, 5];

const Face: React.FC<{ level: number; selected: boolean; accent: string }> = ({ level, selected, accent }) => {
  const c = CURVE[level - 1];
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill={selected ? accent : "none"} stroke={INK} strokeWidth={selected ? 2 : 1.6} />
      <circle cx="11.5" cy="13" r="1.4" fill={INK} />
      <circle cx="20.5" cy="13" r="1.4" fill={INK} />
      <path d={`M10.5 ${21 - c / 2} Q16 ${21 + c} 21.5 ${21 - c / 2}`} fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
};

interface SmileyScaleProps {
  /** 1–5, or null while nothing is picked */
  value: number | null;
  onChange: (value: number) => void;
  /** Fill of the picked face */
  accent: string;
  /** Accessible name of the radio group, e.g. "Wie fühlt sich das für Jana an?" */
  label: string;
}

/** Five tappable faces, one choice; works as a radio group for keyboards and screen readers. */
const SmileyScale: React.FC<SmileyScaleProps> = ({ value, onChange, accent, label }) => {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // Keep arrow keys on the scale instead of paging the deck.
    e.preventDefault();
    e.stopPropagation();
    const next = Math.min(5, Math.max(1, (value ?? 3) + (e.key === "ArrowRight" ? 1 : -1)));
    onChange(next);
  };

  return (
    <div className="swiper-no-swiping w-full" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      <div className="flex w-full justify-between gap-1">
        {MOOD_LABELS.map((moodLabel, i) => {
          const level = i + 1;
          const selected = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={moodLabel}
              tabIndex={selected || (value === null && level === 3) ? 0 : -1}
              onClick={() => onChange(level)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-1 transition-transform hover:scale-110"
            >
              <Face level={level} selected={selected} accent={accent} />
            </button>
          );
        })}
      </div>
      <div className="retro-body-copy-sm mt-1 flex justify-between text-[12px] leading-4 opacity-70" aria-hidden="true">
        <span>{MOOD_LABELS[0]}</span>
        <span>{MOOD_LABELS[4]}</span>
      </div>
    </div>
  );
};

export default SmileyScale;
