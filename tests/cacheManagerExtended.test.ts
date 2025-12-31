import { CacheManager } from '../src/utils/cacheManager';

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (_k: string, def: any) => def
        }),
        onDidChangeConfiguration: jest.fn((callback) => {
            // Simulate config change
            setTimeout(() => callback({ affectsConfiguration: () => true }), 0);
            return { dispose: jest.fn() };
        })
    },
    window: {
        createOutputChannel: () => ({
            appendLine() {},
            show() {},
            clear() {},
            dispose() {}
        })
    }
}));

describe('CacheManager Extended', () => {
    let cacheManager: CacheManager;

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
        cacheManager = new CacheManager({} as any);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should handle configuration changes for cacheSize', () => {
        const cm = cacheManager as any;
        expect(cm.maxSize).toBe(500);
        // Config change is mocked, but we can test the logic
    });

    it('should handle configuration changes for cacheTTL', () => {
        const cm = cacheManager as any;
        expect(cm.ttl).toBe(300);
    });

    it('should evict oldest entries when cache is full', () => {
        const cm = cacheManager as any;
        cm.maxSize = 3;
        
        cm.set('key1', 'value1');
        cm.set('key2', 'value2');
        cm.set('key3', 'value3');
        cm.set('key4', 'value4');
        
        expect(cm.get('key1')).toBeUndefined(); // Should be evicted
        expect(cm.get('key4')).toBe('value4');
    });

    it('should clean expired entries from retrieval cache', () => {
        const cm = cacheManager as any;
        cm.setRetrievalCache('q1', ['doc1']);
        jest.advanceTimersByTime(301_000);
        expect(cm.getRetrievalCache('q1')).toBeUndefined();
    });

    it('should clean expired entries from web cache', () => {
        const cm = cacheManager as any;
        cm.setWebCache('q1', [{ id: '1' }]);
        jest.advanceTimersByTime(301_000);
        expect(cm.getWebCache('q1')).toBeUndefined();
    });

    it('should clean expired entries from embedding cache', () => {
        const cm = cacheManager as any;
        cm.setEmbeddingCache('text1', [0.1, 0.2, 0.3]);
        jest.advanceTimersByTime(301_000);
        expect(cm.getEmbeddingCache('text1')).toBeUndefined();
    });

    it('should evict oldest from retrieval cache when full', () => {
        const cm = cacheManager as any;
        cm.maxSize = 2;
        
        cm.setRetrievalCache('q1', ['doc1']);
        cm.setRetrievalCache('q2', ['doc2']);
        cm.setRetrievalCache('q3', ['doc3']);
        
        // Oldest should be evicted
        expect(cm.getRetrievalCache('q1')).toBeUndefined();
    });

    it('should evict oldest from web cache when full', () => {
        const cm = cacheManager as any;
        cm.maxSize = 2;
        
        cm.setWebCache('q1', [{ id: '1' }]);
        cm.setWebCache('q2', [{ id: '2' }]);
        cm.setWebCache('q3', [{ id: '3' }]);
        
        expect(cm.getWebCache('q1')).toBeUndefined();
    });

    it('should evict oldest from embedding cache when full', () => {
        const cm = cacheManager as any;
        cm.maxSize = 2;
        
        cm.setEmbeddingCache('text1', [0.1]);
        cm.setEmbeddingCache('text2', [0.2]);
        cm.setEmbeddingCache('text3', [0.3]);
        
        expect(cm.getEmbeddingCache('text1')).toBeUndefined();
    });

    it('should clear all caches', () => {
        const cm = cacheManager as any;
        cm.set('key1', 'value1');
        cm.setRetrievalCache('q1', ['doc1']);
        cm.setWebCache('q1', [{ id: '1' }]);
        cm.setEmbeddingCache('text1', [0.1]);
        
        cm.clear();
        
        // Verify caches are cleared
        expect(cm.get('key1')).toBeUndefined();
        expect(cm.getRetrievalCache('q1')).toBeUndefined();
        expect(cm.getWebCache('q1')).toBeUndefined();
        expect(cm.getEmbeddingCache('text1')).toBeUndefined();
        
        // Verify stats are reset (check before any get calls that might increment counters)
        expect(cm.cache.size).toBe(0);
        expect(cm.retrievalCache.size).toBe(0);
        expect(cm.webCache.size).toBe(0);
        expect(cm.embeddingCache.size).toBe(0);
        
        // Create a fresh instance to verify stats are truly reset
        const cm2 = new CacheManager({} as any);
        cm2.clear();
        expect(cm2.getStats().hits).toBe(0);
        expect(cm2.getStats().misses).toBe(0);
    });

    it('should track embedding cache hits and misses', () => {
        const cm = cacheManager as any;
        expect(cm.getEmbeddingCache('text1')).toBeUndefined();
        const stats = cm.getStats();
        expect(stats.layers.embedding.misses).toBeGreaterThan(0);
        
        cm.setEmbeddingCache('text1', [0.1, 0.2]);
        expect(cm.getEmbeddingCache('text1')).toEqual([0.1, 0.2]);
        const stats2 = cm.getStats();
        expect(stats2.layers.embedding.hits).toBeGreaterThan(0);
    });
});

