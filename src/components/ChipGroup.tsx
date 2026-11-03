import React from "react";

const INK = "#201C1D";

interface ChipGroupProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Fill of a picked chip */
  accent: string;
  /** Accessible name of the group */
  label: string;
  /** Emoji shown before an option; decorative, the option's text stays its value */
  icons?: Record<string, string>;
}

/** Tappable answer chips; any number can be picked. */
const ChipGroup: React.FC<ChipGroupProps> = ({ options, value, onChange, accent, label, icons }) => (
  <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label={label}>
    {options.map((option) => {
      const picked = value.includes(option);
      return (
        <button
          key={option}
          type="button"
          aria-pressed={picked}
          onClick={() => onChange(picked ? value.filter((v) => v !== option) : [...value, option])}
          className="retro-body-copy-sm min-h-9 rounded-[18px] border-0 px-3 py-1.5 text-left transition-colors"
          style={{ background: picked ? accent : "#FFFFFF", color: INK, boxShadow: `inset 0 0 0 1.5px ${picked ? accent : "#C9CBCE"}` }}
        >
          {icons?.[option] && (
            <span aria-hidden="true" className="mr-1.5">
              {icons[option]}
            </span>
          )}
          {option}
        </button>
      );
    })}
  </div>
);

export default ChipGroup;
