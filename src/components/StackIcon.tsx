import React, { useMemo } from "react";
import * as StacksIcons from "@stackoverflow/stacks-icons/icons";
import {
  ArrowRight,
  Check,
  X,
  Plus,
  Download,
  Info,
  RefreshCw,
  Trash2,
  Pencil,
  Eye,
  Smile,
  Mountain,
  TrendingUp,
  TrendingDown,
  Star,
  Camera,
  type LucideIcon,
} from "lucide-react";

type IconName = keyof typeof StacksIcons | string;

/** Stacks icon name -> true stroke icon (lucide). */
const STROKE_ICONS: Record<string, LucideIcon> = {
  IconArrowRight: ArrowRight,
  IconCheckmark: Check,
  IconClear: X,
  IconClearSm: X,
  IconPlus: Plus,
  IconDownload: Download,
  IconInfo: Info,
  IconRefresh: RefreshCw,
  IconTrash: Trash2,
  IconPencil: Pencil,
  IconEyes: Eye,
  IconFaceJoy: Smile,
  IconPeak: Mountain,
  IconTrendingUp: TrendingUp,
  IconTrendingDown: TrendingDown,
  IconStar: Star,
  IconCamera: Camera,
};

interface StackIconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
  /** The stroke asked for in real, on-screen pixels — overrides strokeWidth. */
  strokePx?: number;
}

/**
 * Renders a stroke icon (1.5px) for the given icon name.
 * Falls back to the Stacks-Icons set, stroked, when no stroke icon is mapped.
 */
const StackIcon: React.FC<StackIconProps> = ({
  name,
  size = 18,
  color,
  className,
  strokeWidth = 1.5,
  strokePx,
}) => {
  const Stroke = STROKE_ICONS[name as string];
  /* A pixel ask is not the same number in both branches: the stroke icons scale
     their own stroke by 24/size, so the value they need is the pixels times
     size/24, while the fallback SVG's stroke-width is already in device pixels. */
  const strokeForIcons = strokePx == null ? strokeWidth : (strokePx * size) / 24;
  const strokeForSvg = strokePx ?? strokeWidth;

  const fallbackSvg = useMemo(() => {
    if (Stroke) return "";
    const raw = (StacksIcons as Record<string, string>)[name as string];
    if (!raw) return "";
    return raw
      .replace(/fill="(?!none)[^"]*"/g, 'fill="none"')
      .replace(/width="\d+"/, `width="${size}"`)
      .replace(/height="\d+"/, `height="${size}"`)
      .replace(
        /<svg /,
        `<svg fill="none" stroke="currentColor" stroke-width="${strokeForSvg}" stroke-linejoin="round" stroke-linecap="round" `
      );
  }, [Stroke, name, size, strokeForSvg]);

  if (Stroke) {
    return (
      <span className={className} style={{ color, display: "inline-flex", lineHeight: 0 }} aria-hidden="true">
        <Stroke size={size} strokeWidth={strokeForIcons} color="currentColor" absoluteStrokeWidth />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ color, display: "inline-flex", lineHeight: 0 }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: fallbackSvg }}
    />
  );
};

export default StackIcon;
