/** Pulls the first JSON object/array out of a text blob (handles ```json fences). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) {
    throw new Error(`No JSON found in text: ${text}`);
  }
  return JSON.parse(candidate.slice(start));
}
