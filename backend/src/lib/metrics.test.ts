import { describe, expect, it } from 'vitest';
import { formatMetricSamples } from './metrics.js';

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
});
