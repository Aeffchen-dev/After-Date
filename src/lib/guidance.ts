// Client for the After the Date guidance Worker (see /worker). The Worker holds the
// Anthropic API key; this page only ever sends one card's answers to it.

/** Deployed Worker URL. Set VITE_GUIDANCE_URL at build time, or fill in the default. */
export const GUIDANCE_URL: string =
  import.meta.env.VITE_GUIDANCE_URL || "https://after-date-guidance.janagramlich.workers.dev";

export interface GuidanceAnswer {
  name: string;
  /** "date" for the person who had the date, "listener" for the other */
  role: "date" | "listener";
  /** 1 (sehr schwer) … 5 (richtig gut) */
  mood: number;
  text: string;
}

export interface GuidanceRequest {
  cardTitle: string;
  question: string;
  answers: GuidanceAnswer[];
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
