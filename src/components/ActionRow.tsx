import React from "react";
import StackIcon from "./StackIcon";

export interface ActionRowProps {
  /** Icon name from the Stacks-Icons set */
  icon?: React.ComponentProps<typeof StackIcon>["name"];
  /** Custom icon node (overrides `icon`) */
  iconNode?: React.ReactNode;
  /** Label shown in the grey field */
  label: React.ReactNode;

  /** Background colour of the icon tile */
  accent: string;
  /** Icon colour, defaults to white */
  iconColor?: string;
  /** Icon stroke in real, on-screen pixels; defaults to the icon's own weight */
  iconStrokeWidth?: number;
  /** Label text colour, defaults to #201C1D */
  labelColor?: string;
  /** Background of the label field, defaults to the accent (slide pill) colour */
  fieldBg?: string;
  /** Border drawn on the icon tile only, e.g. a grey ring around a grey tile */
  tileBorder?: string;
  /** Outlined style: no fills, black borders */
  outlined?: boolean;
  /** Click handler (ignored when `href` is set and no handler is needed) */
  onClick?: (e: React.MouseEvent) => void;
  /** Render as a link instead of a button */
  href?: string;
  /** Link target, only used together with `href` */
  target?: React.HTMLAttributeAnchorTarget;
  className?: string;
  style?: React.CSSProperties;
}

/** Relative luminance based contrast pick: dark text on light bg, white on dark. */
const contrastOn = (bg?: string): string => {
  if (!bg) return "#201C1D";
  const hex = bg.replace("#", "").trim();
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (full.length !== 6) return "#201C1D";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // contrast vs white vs vs off-black
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastDark = (L + 0.05) / 0.0176;
  return contrastWhite > contrastDark ? "#FFFFFF" : "#201C1D";
};

const BASE_CLASS =
  "swiper-no-swiping screen-only relative z-40 w-auto max-w-full self-start inline-flex items-center gap-0 h-8 retro-body-copy no-underline rounded-none border-none p-0 transition-opacity hover:opacity-90";

/**
 * Shared CTA row: coloured icon tile on the left + label field in the slide's pill colour.
 * Single source of truth for every call-to-action row in the app.
 */



const ActionRow: React.FC<ActionRowProps> = ({
  icon,
  iconNode,
  label,
  accent,
  iconColor,
  iconStrokeWidth,
  labelColor,
  fieldBg,
  tileBorder,
  outlined = false,
  onClick,
  href,
  target,
  className = "",
  style,
}) => {
  const resolvedIconColor = outlined ? (iconColor ?? "#201C1D") : (iconColor ?? contrastOn(accent));
  const resolvedLabelColor = outlined
    ? (labelColor ?? "#201C1D")
    : (labelColor ?? contrastOn(fieldBg ?? "#E4E6E8"));
  const border = outlined ? "1px solid #201C1D" : undefined;
  // Info rows (ℹ) get their own hook so phones and tablets can shrink the sentence.
  const isInfo = icon === "IconInfo";
  const classes = `${BASE_CLASS}${isInfo ? " retro-info-row" : ""} ${className}`;
  /* The ℹ mark draws with a light pen of its own — 1.5px is enough (user:
     "info icon stroke width 1,5px enough") — so the helper sentence stays a
     footnote beside the heavy answer circle on the scales. */
  const resolvedStrokePx = iconStrokeWidth ?? (isInfo ? 1.5 : undefined);
  /* The helper sentence's mark reads one step smaller than the sentence it
     introduces, so it points at the words instead of competing with them (user:
     "info i icon smaller", then smaller still: "info i icon smaller and aligned
     with 1 line of text"); every other CTA keeps the full 16px glyph. */
  const resolvedIconSize = isInfo ? 12 : 16;
  /* The helper sentence has no filled plate of its own — the glyph stands flush
     at the row's content edge (user: "info i icon remove padding") — but it does
     stand in the icon tile's own 32px column, so the sentence starts at exactly
     the x the button's label starts at (user: "info I text move to same x
     position as Notizen öffnen text"). The glyph rides the sentence's first line
     rather than the middle of a wrapped note (user: "aligned with 1 line of
     text"); index.css gives it that small top offset. Every other CTA still
     draws its coloured 32px tile. */
  const tileClass = isInfo
    ? "shrink-0 w-8 flex items-start justify-center leading-none"
    : "shrink-0 w-8 h-8 flex items-center justify-center";
  const fieldClass = isInfo
    ? "flex items-center px-3 text-left whitespace-nowrap overflow-hidden text-ellipsis"
    : "h-8 flex items-center px-3 text-left whitespace-nowrap overflow-hidden text-ellipsis";
  const content = (
    <>
      <span
        className={tileClass}
        style={{
          background: outlined ? "transparent" : accent,
          color: resolvedIconColor,
          border: tileBorder ?? border,
        }}
      >
        {iconNode ?? (icon ? <StackIcon name={icon} size={resolvedIconSize} color={resolvedIconColor} strokePx={resolvedStrokePx} className={isInfo ? "retro-info-mark" : undefined} /> : null)}
      </span>
      <span
        className={fieldClass}
        style={{
          background: outlined ? "transparent" : (fieldBg ?? "#E4E6E8"),
          color: resolvedLabelColor,
          border,
          borderLeft: outlined ? "none" : undefined,
        }}
      >


        {label}
      </span>
    </>
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        onClick={handleClick}
        className={classes}
        style={style}
      >
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={classes} style={style}>
      {content}
    </button>
  );
};

export default ActionRow;
