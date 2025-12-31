import { OutputChannel } from './outputChannel';

export interface Metric {
    name: string;
    value: number;
    timestamp: number;
    tags?: Record<string, string>;
}

export interface Trace {
    traceId: string;
    operation: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'success' | 'error' | 'timeout';
    metadata?: Record<string, any>;
}

export interface ObservabilityEvent {
    type: 'metric' | 'trace' | 'log';
    data: Metric | Trace | any;
    timestamp: number;
}

export class Observability {
    private output: OutputChannel;
    private metrics: Metric[] = [];
    private traces: Trace[] = [];
    private maxMetrics: number = 1000;
    private maxTraces: number = 500;

    constructor(output: OutputChannel) {
        this.output = output;
    }

    recordMetric(name: string, value: number, tags?: Record<string, string>): void {
        const metric: Metric = {
            name,
            value,
            timestamp: Date.now(),
            tags
        };
        
        this.metrics.push(metric);
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.shift(); // Remove oldest
        }

        // Log metric
        const tagsStr = tags ? ` [${Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(', ')}]` : '';
        this.output.logInfo(`[METRIC] ${name}=${value}${tagsStr}`);
    }

    startTrace(operation: string, metadata?: Record<string, any>): string {
        const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const trace: Trace = {
            traceId,
            operation,
            startTime: Date.now(),
            status: 'success',
            metadata
        };

        this.traces.push(trace);
        if (this.traces.length > this.maxTraces) {
            this.traces.shift(); // Remove oldest
        }

        this.output.logInfo(`[TRACE START] ${operation} [${traceId}]`);
        return traceId;
    }

    endTrace(traceId: string, status: 'success' | 'error' | 'timeout', metadata?: Record<string, any>): void {
        const trace = this.traces.find(t => t.traceId === traceId);
        if (!trace) {
            this.output.logWarning(`[TRACE] Trace ${traceId} not found`);
            return;
        }

        trace.endTime = Date.now();
        trace.duration = trace.endTime - trace.startTime;
        trace.status = status;
        if (metadata) {
            trace.metadata = { ...trace.metadata, ...metadata };
        }

        this.output.logInfo(`[TRACE END] ${trace.operation} [${traceId}] ${status} (${trace.duration}ms)`);
    }

    recordCacheHit(cacheType: 'response' | 'retrieval' | 'web' | 'embedding'): void {
        this.recordMetric('cache_hit', 1, { cache_type: cacheType });
    }

    recordCacheMiss(cacheType: 'response' | 'retrieval' | 'web' | 'embedding'): void {
        this.recordMetric('cache_miss', 1, { cache_type: cacheType });
    }

    recordGuardrailReject(guardrailType: 'input' | 'output', reason: string): void {
        this.recordMetric('guardrail_reject', 1, { 
            guardrail_type: guardrailType,
            reason: reason.substring(0, 50) // Truncate long reasons
        });
    }

    recordWebCallSuccess(): void {
        this.recordMetric('web_call', 1, { status: 'success' });
    }

    recordWebCallFailure(error: string): void {
        this.recordMetric('web_call', 1, { status: 'failure', error: error.substring(0, 50) });
    }

    recordFallback(fallbackType: string): void {
        this.recordMetric('fallback', 1, { fallback_type: fallbackType });
    }

    recordLatency(operation: string, latencyMs: number): void {
        this.recordMetric('latency', latencyMs, { operation });
    }

    recordError(operation: string, error: string): void {
        this.recordMetric('error', 1, { operation, error: error.substring(0, 100) });
    }

    getMetrics(filter?: { name?: string; tags?: Record<string, string> }): Metric[] {
        let filtered = [...this.metrics];
        
        if (filter?.name) {
            filtered = filtered.filter(m => m.name === filter.name);
        }
        
        if (filter?.tags) {
            filtered = filtered.filter(m => {
                if (!m.tags) return false;
                return Object.entries(filter.tags!).every(([k, v]) => m.tags![k] === v);
            });
        }
        
        return filtered;
    }

    getTraces(filter?: { operation?: string; status?: string }): Trace[] {
        let filtered = [...this.traces];
        
        if (filter?.operation) {
            filtered = filtered.filter(t => t.operation === filter.operation);
        }
        
        if (filter?.status) {
            filtered = filtered.filter(t => t.status === filter.status);
        }
        
        return filtered;
    }

    getSummary(): {
        totalMetrics: number;
        totalTraces: number;
        errorCount: number;
        averageLatency: number;
        cacheHitRate: number;
    } {
        const errorMetrics = this.metrics.filter(m => m.name === 'error');
        const latencyMetrics = this.metrics.filter(m => m.name === 'latency');
        const cacheHits = this.metrics.filter(m => m.name === 'cache_hit').length;
        const cacheMisses = this.metrics.filter(m => m.name === 'cache_miss').length;
        const totalCacheOps = cacheHits + cacheMisses;
        
        const avgLatency = latencyMetrics.length > 0
            ? latencyMetrics.reduce((sum, m) => sum + m.value, 0) / latencyMetrics.length
            : 0;
        
        const cacheHitRate = totalCacheOps > 0
            ? (cacheHits / totalCacheOps) * 100
            : 0;

        return {
            totalMetrics: this.metrics.length,
            totalTraces: this.traces.length,
            errorCount: errorMetrics.length,
            averageLatency: Math.round(avgLatency * 10) / 10,
            cacheHitRate: Math.round(cacheHitRate * 10) / 10
        };
    }

    clear(): void {
        this.metrics = [];
        this.traces = [];
        this.output.logInfo('[OBSERVABILITY] Metrics and traces cleared');
    }
}

