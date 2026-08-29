import { getText } from "./s3";

// Not tied to any single run — one shared file accumulated across executions.
// Updated manually (via a Claude Code conversation) when the user gives
// feedback on a comic; see README for the operating procedure.
export const COMEDY_LEARNINGS_KEY = "_meta/comedy-learnings.md";

export async function getComedyLearnings(): Promise<string> {
  const text = await getText(COMEDY_LEARNINGS_KEY);
  return text?.trim() || "";
}
