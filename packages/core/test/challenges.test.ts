import { describe, expect, it } from 'vitest';

import {
  checkMathAnswer,
  checkScan,
  describeChain,
  generateMathProblem,
  seededRng,
  stepsProgress,
  validateChain,
  type ChallengeStep,
  type Difficulty,
} from '../src';

describe('math', () => {
  const evaluate = (expr: string) => Function(`return (${expr.replace(/×/g, '*').replace(/−/g, '-')})`)() as number;

  it.each<Difficulty>(['easy', 'medium', 'hard'])('%s answers match their expressions', (difficulty) => {
    const rng = seededRng(42);
    for (let i = 0; i < 200; i++) {
      const p = generateMathProblem(difficulty, rng);
      expect(evaluate(p.expression)).toBe(p.answer);
    }
  });

  it('is reproducible with a seed', () => {
    expect(generateMathProblem('hard', seededRng(7))).toEqual(generateMathProblem('hard', seededRng(7)));
  });

  it('checks answers leniently on formatting only', () => {
    const p = { difficulty: 'hard' as const, expression: '1 − 5', answer: -4 };
    expect(checkMathAnswer(p, ' -4 ')).toBe(true);
    expect(checkMathAnswer(p, '−4')).toBe(true);
    expect(checkMathAnswer(p, '4')).toBe(false);
    expect(checkMathAnswer(p, '-4.0')).toBe(false);
    expect(checkMathAnswer(p, '')).toBe(false);
  });
});

describe('scanning', () => {
  const qr: ChallengeStep = { type: 'qr', code: 'wakey:bathroom:9f2c', label: 'Bathroom' };
  const barcode: ChallengeStep = { type: 'barcode', code: '0123456789012', label: 'Toothpaste' };

  it('accepts the registered code', () => {
    expect(checkScan(qr, { kind: 'qr', data: 'wakey:bathroom:9f2c' })).toBe(true);
    expect(checkScan(barcode, { kind: 'barcode', data: ' 0123456789012\n' })).toBe(true);
  });

  it('rejects a different code or the wrong kind', () => {
    expect(checkScan(qr, { kind: 'qr', data: 'something else' })).toBe(false);
    expect(checkScan(barcode, { kind: 'qr', data: '0123456789012' })).toBe(false);
    expect(checkScan({ type: 'steps', count: 50 }, { kind: 'qr', data: 'x' })).toBe(false);
  });

  it('never passes an unregistered (empty) code', () => {
    expect(checkScan({ type: 'qr', code: '', label: '' }, { kind: 'qr', data: '' })).toBe(false);
  });
});

describe('steps', () => {
  it('clamps progress to 0–1', () => {
    expect(stepsProgress(50, 25)).toBe(0.5);
    expect(stepsProgress(50, 80)).toBe(1);
    expect(stepsProgress(50, -3)).toBe(0);
  });
});

describe('chains', () => {
  it('validates each step', () => {
    expect(validateChain([])).toEqual(['add at least one challenge']);
    expect(
      validateChain([
        { type: 'math', difficulty: 'easy', problems: 0 },
        { type: 'qr', code: ' ', label: '' },
        { type: 'steps', count: 5 },
      ]),
    ).toEqual([
      'challenge 1: problems must be 1–10',
      'challenge 2: scan a code to register it',
      'challenge 3: steps must be 10–500',
    ]);
    const six = Array.from({ length: 6 }, () => ({ type: 'steps', count: 20 }) as const);
    expect(validateChain(six)).toEqual(['at most 5 challenges']);
  });

  it('describes a chain', () => {
    expect(
      describeChain([
        { type: 'qr', code: 'x', label: 'Bathroom mirror' },
        { type: 'steps', count: 50 },
        { type: 'math', difficulty: 'hard', problems: 1 },
      ]),
    ).toBe('Scan QR code: Bathroom mirror → Walk 50 steps → 1 hard math problem');
  });
});
