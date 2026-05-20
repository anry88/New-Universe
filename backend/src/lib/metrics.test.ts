import { describe, expect, it } from 'vitest';
import { formatActivityTimestamp, formatMetricSamples } from './metrics.js';

describe('metrics formatting', () => {
  it('renders Prometheus text exposition with escaped labels', () => {
    const output = formatMetricSamples([
      {
        name: 'nu_test_metric_total',
        help: 'Test counter',
        type: 'counter',
        value: 2,
        labels: { route: '/auth/"telegram"', method: 'POST' },
      },
    ]);

    expect(output).toContain('# HELP nu_test_metric_total Test counter');
    expect(output).toContain('# TYPE nu_test_metric_total counter');
    expect(output).toContain('nu_test_metric_total{method="POST",route="/auth/\\"telegram\\""} 2');
  });

  it('emits histogram metadata under the base family name', () => {
    const output = formatMetricSamples([
      {
        name: 'nu_http_request_duration_seconds_bucket',
        help: 'HTTP duration',
        type: 'histogram',
        value: 1,
        labels: { le: '+Inf' },
      },
      {
        name: 'nu_http_request_duration_seconds_count',
        help: 'HTTP duration',
        type: 'histogram',
        value: 1,
      },
    ]);

    expect(output).toContain('# TYPE nu_http_request_duration_seconds histogram');
    expect(output).toContain('nu_http_request_duration_seconds_bucket{le="+Inf"} 1');
    expect(output).toContain('nu_http_request_duration_seconds_count 1');
  });

  it('renders signed product deltas and progression milestone counts', () => {
    const output = formatMetricSamples([
      {
        name: 'nu_product_players_active_delta',
        help: 'Active player delta',
        type: 'gauge',
        value: -4,
        labels: { window: 'day' },
      },
      {
        name: 'nu_product_progression_players',
        help: 'Progression milestone',
        type: 'gauge',
        value: 12,
        labels: { milestone: 'tutorial_completed' },
      },
    ]);

    expect(output).toContain('nu_product_players_active_delta{window="day"} -4');
    expect(output).toContain('nu_product_progression_players{milestone="tutorial_completed"} 12');
  });

  it('formats activity timestamps as SQL-safe strings', () => {
    expect(formatActivityTimestamp(new Date('2026-05-20T10:00:00.000Z'))).toBe(
      '2026-05-20T10:00:00.000Z',
    );
  });
});
