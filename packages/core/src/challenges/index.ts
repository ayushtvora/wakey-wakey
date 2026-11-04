import type { ChallengeChain, ChallengeStep, Difficulty, MathProblem, Rng, ScanResult } from './types';

export * from './types';

export const MAX_CHAIN_LENGTH = 5;
export const MATH_PROBLEMS_RANGE = { min: 1, max: 10 } as const;
export const STEPS_RANGE = { min: 10, max: 500 } as const;

/** Integer in [min, max] inclusive. */
function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ---------- Math ----------

export function generateMathProblem(difficulty: Difficulty, rng: Rng = Math.random): MathProblem {
  switch (difficulty) {
    case 'easy': {
      const a = randInt(rng, 10, 49);
      const b = randInt(rng, 10, 49);
      return { difficulty, expression: `${a} + ${b}`, answer: a + b };
    }
    case 'medium': {
      const a = randInt(rng, 12, 39);
      const b = randInt(rng, 3, 9);
      const c = randInt(rng, 10, 99);
      return { difficulty, expression: `${a} × ${b} + ${c}`, answer: a * b + c };
    }
    case 'hard': {
      const a = randInt(rng, 12, 49);
      const b = randInt(rng, 6, 19);
      const c = randInt(rng, 11, 29);
      const d = randInt(rng, 3, 9);
      return { difficulty, expression: `${a} × ${b} − ${c} × ${d}`, answer: a * b - c * d };
    }
  }
}

/** Accepts surrounding whitespace and a typographic minus sign. */
export function checkMathAnswer(problem: MathProblem, answer: string): boolean {
  const trimmed = answer.trim().replace(/^−/, '-');
  return /^-?\d+$/.test(trimmed) && Number(trimmed) === problem.answer;
}

// ---------- Scanning ----------

function normalizeCode(data: string): string {
  return data.trim();
}

/**
 * True when the scan matches the registered code for a QR or barcode step. The scan type must
 * match too: a QR step can't be passed with a barcode that happens to encode the same text.
 */
export function checkScan(step: ChallengeStep, scan: ScanResult): boolean {
  if (step.type !== 'qr' && step.type !== 'barcode') return false;
  if (scan.kind !== step.type) return false;
  return normalizeCode(scan.data) === normalizeCode(step.code) && step.code.trim() !== '';
}

// ---------- Steps ----------

/** Fraction 0–1 of a steps challenge completed. */
export function stepsProgress(target: number, walked: number): number {
  if (target <= 0) return 1;
  return Math.min(1, Math.max(0, walked / target));
}

// ---------- Chains ----------

/** Returns a list of problems with a chain (empty when valid). */
export function validateChain(chain: ChallengeChain): string[] {
  const errors: string[] = [];
  if (chain.length === 0) errors.push('add at least one challenge');
  if (chain.length > MAX_CHAIN_LENGTH) errors.push(`at most ${MAX_CHAIN_LENGTH} challenges`);
  chain.forEach((step, i) => {
    const where = `challenge ${i + 1}`;
    switch (step.type) {
      case 'math':
        if (
          !Number.isInteger(step.problems) ||
          step.problems < MATH_PROBLEMS_RANGE.min ||
          step.problems > MATH_PROBLEMS_RANGE.max
        ) {
          errors.push(`${where}: problems must be ${MATH_PROBLEMS_RANGE.min}–${MATH_PROBLEMS_RANGE.max}`);
        }
        break;
      case 'qr':
      case 'barcode':
        if (step.code.trim() === '') errors.push(`${where}: scan a code to register it`);
        break;
      case 'steps':
        if (!Number.isInteger(step.count) || step.count < STEPS_RANGE.min || step.count > STEPS_RANGE.max) {
          errors.push(`${where}: steps must be ${STEPS_RANGE.min}–${STEPS_RANGE.max}`);
        }
        break;
    }
  });
  return errors;
}

/** Short description, e.g. "3 hard math problems", "Scan QR: Bathroom mirror", "Walk 50 steps". */
export function describeStep(step: ChallengeStep): string {
  switch (step.type) {
    case 'math':
      return `${step.problems} ${step.difficulty} math problem${step.problems === 1 ? '' : 's'}`;
    case 'qr':
      return `Scan QR code${step.label ? `: ${step.label}` : ''}`;
    case 'barcode':
      return `Scan barcode${step.label ? `: ${step.label}` : ''}`;
    case 'steps':
      return `Walk ${step.count} steps`;
  }
}

export function describeChain(chain: ChallengeChain): string {
  return chain.map(describeStep).join(' → ');
}

/** Seeded PRNG (mulberry32) for reproducible problems and tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
