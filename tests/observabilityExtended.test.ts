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

describe('Observability Extended', () => {
    let obs: Observability;
    let output: TestOutput;

    beforeEach(() => {
        output = new TestOutput();
        obs = new Observability(output);
    });

    it('should record metrics with tags', () => {
        obs.recordMetric('test_metric', 42, { tag1: 'value1', tag2: 'value2' });
        const metrics = obs.getMetrics({ name: 'test_metric' });
        expect(metrics.length).toBe(1);
        expect(metrics[0].value).toBe(42);
        expect(metrics[0].tags).toEqual({ tag1: 'value1', tag2: 'value2' });
    });

    it('should limit metrics to maxMetrics', () => {
        const obs2 = obs as any;
        obs2.maxMetrics = 5;
        
        for (let i = 0; i < 10; i++) {
            obs.recordMetric(`metric_${i}`, i);
        }
        
        const metrics = obs.getMetrics();
        expect(metrics.length).toBe(5);
        expect(metrics[0].name).toBe('metric_5'); // Oldest removed
    });

    it('should limit traces to maxTraces', () => {
        const obs2 = obs as any;
        obs2.maxTraces = 3;
        
        const traceIds: string[] = [];
        for (let i = 0; i < 5; i++) {
            traceIds.push(obs.startTrace(`operation_${i}`));
        }
        
        const traces = obs.getTraces();
        expect(traces.length).toBe(3);
    });

    it('should handle endTrace for non-existent trace', () => {
        obs.endTrace('non-existent-trace', 'error');
        // Should not throw
    });

    it('should update trace metadata on endTrace', () => {
        const traceId = obs.startTrace('test', { initial: 'data' });
        obs.endTrace(traceId, 'success', { additional: 'data' });
        
        const traces = obs.getTraces({ operation: 'test' });
        expect(traces[0].metadata).toEqual({ initial: 'data', additional: 'data' });
    });

    it('should record web call success', () => {
        obs.recordWebCallSuccess();
        const metrics = obs.getMetrics({ name: 'web_call', tags: { status: 'success' } });
        expect(metrics.length).toBe(1);
    });

    it('should record web call failure', () => {
        obs.recordWebCallFailure('Network error');
        const metrics = obs.getMetrics({ name: 'web_call', tags: { status: 'failure' } });
        expect(metrics.length).toBe(1);
        expect(metrics[0].tags?.error).toBe('Network error');
    });

    it('should record fallback', () => {
        obs.recordFallback('template');
        const metrics = obs.getMetrics({ name: 'fallback' });
        expect(metrics.length).toBe(1);
        expect(metrics[0].tags?.fallback_type).toBe('template');
    });

    it('should record latency', () => {
        obs.recordLatency('operation1', 150);
        const metrics = obs.getMetrics({ name: 'latency' });
        expect(metrics.length).toBe(1);
        expect(metrics[0].value).toBe(150);
        expect(metrics[0].tags?.operation).toBe('operation1');
    });

    it('should record error', () => {
        obs.recordError('operation1', 'Something went wrong');
        const metrics = obs.getMetrics({ name: 'error' });
        expect(metrics.length).toBe(1);
        expect(metrics[0].tags?.operation).toBe('operation1');
    });

    it('should filter metrics by name', () => {
        obs.recordMetric('metric1', 1);
        obs.recordMetric('metric2', 2);
        obs.recordMetric('metric1', 3);
        
        const filtered = obs.getMetrics({ name: 'metric1' });
        expect(filtered.length).toBe(2);
        expect(filtered.every(m => m.name === 'metric1')).toBe(true);
    });

    it('should filter metrics by tags', () => {
        obs.recordMetric('test', 1, { type: 'A' });
        obs.recordMetric('test', 2, { type: 'B' });
        obs.recordMetric('test', 3, { type: 'A' });
        
        const filtered = obs.getMetrics({ tags: { type: 'A' } });
        expect(filtered.length).toBe(2);
        expect(filtered.every(m => m.tags?.type === 'A')).toBe(true);
    });

    it('should filter metrics without tags', () => {
        obs.recordMetric('test1', 1);
        obs.recordMetric('test2', 2, { tag: 'value' });
        obs.recordMetric('test3', 3);
        
        const filtered = obs.getMetrics({ tags: { tag: 'value' } });
        expect(filtered.length).toBe(1);
        expect(filtered[0].name).toBe('test2');
    });

    it('should handle empty metrics in summary', () => {
        const summary = obs.getSummary();
        expect(summary.totalMetrics).toBe(0);
        expect(summary.averageLatency).toBe(0);
        expect(summary.cacheHitRate).toBe(0);
    });

    it('should calculate average latency correctly', () => {
        obs.recordLatency('op1', 100);
        obs.recordLatency('op2', 200);
        obs.recordLatency('op3', 300);
        
        const summary = obs.getSummary();
        expect(summary.averageLatency).toBe(200);
    });

    it('should calculate cache hit rate correctly', () => {
        obs.recordCacheHit('response');
        obs.recordCacheHit('response');
        obs.recordCacheMiss('response');
        
        const summary = obs.getSummary();
        expect(summary.cacheHitRate).toBe(66.7); // 2 hits / 3 total = 66.67%
    });

    it('should filter traces by operation', () => {
        obs.startTrace('op1');
        obs.startTrace('op2');
        obs.startTrace('op1');
        
        const filtered = obs.getTraces({ operation: 'op1' });
        expect(filtered.length).toBe(2);
        expect(filtered.every(t => t.operation === 'op1')).toBe(true);
    });

    it('should filter traces by status', () => {
        const trace1 = obs.startTrace('op1');
        const trace2 = obs.startTrace('op2');
        obs.endTrace(trace1, 'success');
        obs.endTrace(trace2, 'error');
        
        const filtered = obs.getTraces({ status: 'error' });
        expect(filtered.length).toBe(1);
        expect(filtered[0].status).toBe('error');
    });

    it('should calculate summary correctly', () => {
        obs.recordMetric('error', 1, { operation: 'op1' });
        obs.recordMetric('error', 1, { operation: 'op2' });
        obs.recordLatency('op1', 100);
        obs.recordLatency('op2', 200);
        obs.recordCacheHit('response');
        obs.recordCacheMiss('response');
        
        const summary = obs.getSummary();
        // recordCacheHit and recordCacheMiss each record a metric, so total is 6
        expect(summary.totalMetrics).toBe(6);
        expect(summary.errorCount).toBe(2);
        expect(summary.averageLatency).toBe(150);
        expect(summary.cacheHitRate).toBe(50);
    });

    it('should clear all metrics and traces', () => {
        obs.recordMetric('test', 1);
        obs.startTrace('test');
        
        obs.clear();
        
        expect(obs.getMetrics().length).toBe(0);
        expect(obs.getTraces().length).toBe(0);
    });
});

