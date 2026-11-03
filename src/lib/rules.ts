// The couple's rules, shared across devices through the Worker (see /worker, GET/PUT /rules).
import { GUIDANCE_URL } from "@/lib/guidance";

const RULES_URL = GUIDANCE_URL ? `${GUIDANCE_URL.replace(/\/$/, "")}/rules` : "";

/** The shared rules, or null when none are saved yet or the Worker can't be reached. */
export const fetchRules = async (signal?: AbortSignal): Promise<string[] | null> => {
  if (!RULES_URL) return null;
  const res = await fetch(RULES_URL, { signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { rules?: unknown };
  return Array.isArray(body.rules) ? body.rules.filter((r): r is string => typeof r === "string") : null;
};

export const saveRules = async (rules: string[]): Promise<boolean> => {
  if (!RULES_URL) return false;
  const res = await fetch(RULES_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });
  return res.ok;
};
