import { Observability } from '../src/utils/observability';
import { OutputChannel } from '../src/utils/outputChannel';

class TestOutput extends OutputChannel {
  constructor() {
    // @ts-ignore
    super({} as any);
  }
  logInfo(_msg: string) {}
  logWarning(_msg: string) {}
  logError(_msg: string) {}
  logDebug(_msg: string) {}
}

describe('Observability', () => {
  it('records metrics and summaries', () => {
    const obs = new Observability(new TestOutput());
    obs.recordMetric('a', 1);
    obs.recordLatency('b', 50);
    obs.recordCacheHit('response');
    obs.recordCacheMiss('web');
    obs.recordGuardrailReject('output', 'x');
    const trace = obs.startTrace('t1');
    obs.endTrace(trace, 'success');

    const summary = obs.getSummary();
    expect(summary.totalMetrics).toBeGreaterThan(0);
    expect(summary.cacheHitRate).toBeGreaterThanOrEqual(0);
  });
});

