export interface TrendResult {
  theme: string;
  reason: string;
  sourceUrls: string[];
}

export interface ComicPanel {
  panel: number;
  description: string;
  dialogue: string;
}

export interface ComicPlan {
  title: string;
  panels: ComicPanel[];
}

export interface ReviewResult {
  pass: boolean;
  score: number;
  /** 0-100, judged independently of layout/legibility — does it actually land as a joke? */
  funnyScore: number;
  feedback: string;
  revisionInstructions: string;
}

/** One generate→review cycle, kept so the full revision history can be replayed from S3. */
export interface HistoryEntry {
  iteration: number;
  promptKey: string;
  imageKey: string;
  reviewKey: string;
  score: number;
  funnyScore: number;
  pass: boolean;
  feedback: string;
  revisionInstructions: string;
}
