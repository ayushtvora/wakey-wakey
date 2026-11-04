export type Difficulty = 'easy' | 'medium' | 'hard';

export type ChallengeType = 'math' | 'qr' | 'barcode' | 'steps';

/**
 * One configured step of an alarm's challenge chain. Plain JSON so it can be stored,
 * synced to the home server, or used by the Raspberry Pi clock.
 */
export type ChallengeStep = MathStep | QrStep | BarcodeStep | StepsStep;

export interface MathStep {
  type: 'math';
  difficulty: Difficulty;
  /** How many problems must be solved in a row. */
  problems: number;
}

export interface QrStep {
  type: 'qr';
  /** The registered QR payload that must be scanned. */
  code: string;
  /** Where the code lives, e.g. "Bathroom mirror". */
  label: string;
}

export interface BarcodeStep {
  type: 'barcode';
  /** The registered barcode value (EAN/UPC/Code128…) that must be scanned. */
  code: string;
  label: string;
}

export interface StepsStep {
  type: 'steps';
  /** Steps to walk, counted from when this step starts. */
  count: number;
}

/** Ordered list of steps; every step must pass to turn the alarm off. */
export type ChallengeChain = ChallengeStep[];

/** A generated math problem. */
export interface MathProblem {
  difficulty: Difficulty;
  /** Human-readable expression, e.g. "23 × 7 + 41" */
  expression: string;
  answer: number;
}

/** What a scanner reported. */
export interface ScanResult {
  kind: 'qr' | 'barcode';
  data: string;
}

/** Random number source returning [0, 1). Injectable so tests are deterministic. */
export type Rng = () => number;
