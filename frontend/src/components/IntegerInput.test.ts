import { describe, expect, it } from 'vitest';
import {
  committedIntegerInputValue,
  integerInputDraftOnFocus,
  integerValueFromDraft,
  normalizeIntegerInputDraft,
} from './IntegerInput';

describe('IntegerInput helpers', () => {
  it('clears a focused zero without changing non-zero drafts', () => {
    expect(integerInputDraftOnFocus(0)).toBe('');
    expect(integerInputDraftOnFocus(42)).toBe('42');
    expect(integerInputDraftOnFocus(0, { clearZeroOnFocus: false })).toBe('0');
  });

  it('keeps a blank draft blank while emitting an empty numeric value', () => {
    expect(normalizeIntegerInputDraft('')).toBe('');
    expect(integerValueFromDraft('', { emptyValue: 0 })).toBe(0);
  });

  it('removes leading zeroes and non-digit characters from non-negative drafts', () => {
    expect(normalizeIntegerInputDraft('0100')).toBe('100');
    expect(normalizeIntegerInputDraft('12x3')).toBe('123');
  });

  it('clamps parsed drafts to the allowed range', () => {
    expect(integerValueFromDraft('9999', { max: 5000 })).toBe(5000);
    expect(integerValueFromDraft('-5')).toBe(0);
    expect(integerValueFromDraft('-5', { allowNegative: true })).toBe(-5);
  });

  it('uses the blur fallback only when the draft is empty', () => {
    expect(committedIntegerInputValue('', { min: 0 })).toBe(0);
    expect(committedIntegerInputValue('', { min: 1 })).toBe(1);
    expect(committedIntegerInputValue('25', { min: 1 })).toBe(25);
  });
});
