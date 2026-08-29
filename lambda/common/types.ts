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

/** One taste-variant's score within a best-of-N ReviewComic comparison. */
export interface ComicCandidateScore {
  taste: string;
  funnyScore: number;
  comment: string;
}

/** Text-only judgment of whether the joke itself (plot/dialogue/punchline) lands, before any image exists. Reviews all N taste-variant candidates from PlanComic and picks the funniest. */
export interface ComicReviewResult {
  pass: boolean;
  funnyScore: number;
  selectedIndex: number;
  candidateScores: ComicCandidateScore[];
  feedback: string;
  revisionInstructions: string;
}

/** One PlanComic→ReviewComic cycle, kept so the full rewrite history can be replayed from S3. */
export interface ComicHistoryEntry {
  comicIteration: number;
  comicKey: string;
  candidatesKey: string;
  comicReviewKey: string;
  funnyScore: number;
  candidateScores: ComicCandidateScore[];
  pass: boolean;
  feedback: string;
  revisionInstructions: string;
}

/** Vision judgment of the rendered image — layout, legibility, and visual execution only. Joke quality is decided upstream in ReviewComic. */
export interface ReviewResult {
  pass: boolean;
  score: number;
  feedback: string;
  revisionInstructions: string;
}

/** One GenerateImage→ReviewImage cycle, kept so the full revision history can be replayed from S3. */
export interface HistoryEntry {
  iteration: number;
  promptKey: string;
  imageKey: string;
  reviewKey: string;
  score: number;
  pass: boolean;
  feedback: string;
  revisionInstructions: string;
}
