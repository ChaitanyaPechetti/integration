"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const observability_1 = require("../src/utils/observability");
const outputChannel_1 = require("../src/utils/outputChannel");
class TestOutput extends outputChannel_1.OutputChannel {
    constructor() {
        // @ts-ignore
        super({});
    }
    logInfo(_msg) { }
    logWarning(_msg) { }
    logError(_msg) { }
    logDebug(_msg) { }
}
describe('Observability', () => {
    it('records metrics and summaries', () => {
        const obs = new observability_1.Observability(new TestOutput());
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
//# sourceMappingURL=observability.test.js.map