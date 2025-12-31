"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cacheManager_1 = require("../src/utils/cacheManager");
// Minimal mock context
const ctx = {};
describe('CacheManager', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
    });
    afterEach(() => {
        jest.useRealTimers();
    });
    it('stores and retrieves response cache with hit/miss stats', () => {
        const cm = new cacheManager_1.CacheManager(ctx);
        expect(cm.get('hello')).toBeUndefined();
        const statsMiss = cm.getStats();
        expect(statsMiss.layers.response.misses).toBe(1);
        cm.set('hello', 'world');
        expect(cm.get('hello')).toBe('world');
        const statsHit = cm.getStats();
        expect(statsHit.layers.response.hits).toBe(1);
    });
    it('evicts expired entries based on ttl', () => {
        const cm = new cacheManager_1.CacheManager(ctx);
        cm.set('hello', 'world');
        jest.advanceTimersByTime(301000); // > default ttl 300s
        expect(cm.get('hello')).toBeUndefined();
        const stats = cm.getStats();
        expect(stats.layers.response.misses).toBeGreaterThan(0);
    });
    it('tracks web and retrieval caches separately', () => {
        const cm = new cacheManager_1.CacheManager(ctx);
        cm.setWebCache('q', [{ id: '1' }]);
        cm.setRetrievalCache('q', ['doc1']);
        expect(cm.getWebCache('q')?.length).toBe(1);
        expect(cm.getRetrievalCache('q')?.length).toBe(1);
        const stats = cm.getStats();
        expect(stats.layers.web.hits).toBe(1);
        expect(stats.layers.retrieval.hits).toBe(1);
    });
});
//# sourceMappingURL=cacheManager.test.js.map