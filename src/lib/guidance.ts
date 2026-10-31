// Client for the After Date guidance Worker (see /worker). The Worker holds the
// Anthropic API key; this page only ever sends one card's answers to it.

/** Deployed Worker URL. Set VITE_GUIDANCE_URL at build time to point elsewhere. */
export const GUIDANCE_URL: string =
  import.meta.env.VITE_GUIDANCE_URL || "https://after-date-guidance.janagramlich.workers.dev";

export interface GuidanceAnswer {
  name: string;
  /** "date" for the person who had the date, "listener" for the other */
  role: "date" | "listener";
  /** 1 (sehr schwer) … 5 (richtig gut), when the card has a scale */
  mood?: number;
  /** Picked answer chips, when the card has them */
  chips?: string[];
  text?: string;
  /** The person chose to pass on this card */
  passed?: boolean;
}

export interface GuidanceRequest {
  /** "reflect" mirrors a card's answers; "phrase" helps the date person put it into words */
  mode: "reflect" | "phrase";
  cardTitle: string;
  question: string;
  answers: GuidanceAnswer[];
  /** What the other person said they need, e.g. how much they want to know */
  context?: string;
}

export interface Guidance {
  guidance: string;
  followUpQuestion: string;
  suggestHold: boolean;
}

export const guidanceEnabled = () => GUIDANCE_URL !== "";

export const fetchGuidance = async (req: GuidanceRequest, signal?: AbortSignal): Promise<Guidance> => {
  const res = await fetch(GUIDANCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw new Error(`Guidance request failed: ${res.status}`);
  return (await res.json()) as Guidance;
};
