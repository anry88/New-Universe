import { describe, expect, it } from 'vitest';
import { calculateRegen } from './resources';

describe('calculateRegen', () => {
  it('correctly increments amount based on regen rate per hour', () => {
    // regenRate = 60/h -> 1/min -> 0.01666.../sec
    const currentAmount = 100;
    const regenRatePerHour = 60;
    const deltaSeconds = 1;
    const storageCap = 1000;

    const result = calculateRegen(currentAmount, regenRatePerHour, deltaSeconds, storageCap);
    
    // 100 + (60/3600) * 1 = 100 + 0.016666...
    expect(result).toBeCloseTo(100.0167, 4);
  });

  it('respects storage capacity', () => {
    const currentAmount = 999.99;
    const regenRatePerHour = 3600; // 1 per second
    const deltaSeconds = 10;
    const storageCap = 1000;

    const result = calculateRegen(currentAmount, regenRatePerHour, deltaSeconds, storageCap);
    expect(result).toBe(1000);
  });
});
