import { describe, expect, it } from 'vitest';

import { runCatalogAudit } from './audit.js';

describe('catalog seed audit (P2-POL-002)', () => {
  it('passes without drift across resources, buildings, ships, research, and market price keys', () => {
    const result = runCatalogAudit();
    expect(result.errors, result.errors.join('\n')).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
