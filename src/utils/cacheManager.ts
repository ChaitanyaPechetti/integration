import * as vscode from 'vscode';

interface CacheEntry {
    value: string;
    timestamp: number;
}

interface GenericCacheEntry<T> {
    value: T;
    timestamp: number;
}

export class CacheManager {
    private cache: Map<string, CacheEntry> = new Map();
    private retrievalCache: Map<string, GenericCacheEntry<any>> = new Map();
    private webCache: Map<string, GenericCacheEntry<any>> = new Map();
    private embeddingCache: Map<string, GenericCacheEntry<any>> = new Map();
    private hits: number = 0;
    private misses: number = 0;
    // Per-layer statistics
    private responseHits: number = 0;
    private responseMisses: number = 0;
    private retrievalHits: number = 0;
    private retrievalMisses: number = 0;
    private webHits: number = 0;
    private webMisses: number = 0;
    private embeddingHits: number = 0;
    private embeddingMisses: number = 0;
    private maxSize: number;
    private ttl: number; // Time to live in seconds

    constructor(context: vscode.ExtensionContext) {
        // Load configuration
        const config = vscode.workspace.getConfiguration('ragAgent');
        this.maxSize = config.get<number>('cacheSize', 500);
        this.ttl = config.get<number>('cacheTTL', 300);

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ragAgent.cacheSize')) {
                this.maxSize = config.get<number>('cacheSize', 500);
            }
            if (e.affectsConfiguration('ragAgent.cacheTTL')) {
                this.ttl = config.get<number>('cacheTTL', 300);
            }
        });
    }

    private normalizeQuery(query: string): string {
        return query.toLowerCase().trim();
    }

    private generateKey(query: string): string {
        // Simple hash function (MD5 would be better but requires crypto)
        const normalized = this.normalizeQuery(query);
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }

    private isExpired(entry: CacheEntry): boolean {
        const age = (Date.now() - entry.timestamp) / 1000; // Convert to seconds
        return age > this.ttl;
    }

    private isExpiredGeneric(entry: GenericCacheEntry<any>): boolean {
        const age = (Date.now() - entry.timestamp) / 1000;
        return age > this.ttl;
    }

    private cleanExpired(): void {
        const expiredKeys: string[] = [];
        this.cache.forEach((entry, key) => {
            if (this.isExpired(entry)) {
                expiredKeys.push(key);
            }
        });
        expiredKeys.forEach(key => this.cache.delete(key));

        const expireGeneric = (store: Map<string, GenericCacheEntry<any>>) => {
            const expired: string[] = [];
            store.forEach((entry, key) => {
                if (this.isExpiredGeneric(entry)) {
                    expired.push(key);
                }
            });
            expired.forEach(key => store.delete(key));
        };

        expireGeneric(this.retrievalCache);
        expireGeneric(this.webCache);
        expireGeneric(this.embeddingCache);
    }

    private evictOldest(): void {
        if (this.cache.size < this.maxSize) {
            return;
        }

        // Find oldest entry
        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        this.cache.forEach((entry, key) => {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        });

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    private evictIfNeeded(store: Map<string, GenericCacheEntry<any>>): void {
        if (store.size < this.maxSize) {
            return;
        }
        let oldestKey: string | undefined;
        let oldestTime = Infinity;
        store.forEach((entry, key) => {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        });
        if (oldestKey) {
            store.delete(oldestKey);
        }
    }

    public get(query: string): string | undefined {
        this.cleanExpired();
        
        const key = this.generateKey(query);
        const entry = this.cache.get(key);

        if (entry && !this.isExpired(entry)) {
            this.hits++;
            this.responseHits++;
            return entry.value;
        }

        this.misses++;
        this.responseMisses++;
        return undefined;
    }

    public set(query: string, value: string): void {
        this.cleanExpired();
        this.evictOldest();

        const key = this.generateKey(query);
        this.cache.set(key, {
            value: value,
            timestamp: Date.now()
        });
    }

    public clear(): void {
        this.cache.clear();
        this.retrievalCache.clear();
        this.webCache.clear();
        this.embeddingCache.clear();
        this.hits = 0;
        this.misses = 0;
        this.responseHits = 0;
        this.responseMisses = 0;
        this.retrievalHits = 0;
        this.retrievalMisses = 0;
        this.webHits = 0;
        this.webMisses = 0;
        this.embeddingHits = 0;
        this.embeddingMisses = 0;
    }

    public getRetrievalCache<T = any>(query: string): T[] | undefined {
        this.cleanExpired();
        const key = this.generateKey(query);
        const entry = this.retrievalCache.get(key);
        if (entry && !this.isExpiredGeneric(entry)) {
            this.retrievalHits++;
            return entry.value;
        }
        this.retrievalMisses++;
        return undefined;
    }

    public setRetrievalCache<T = any>(query: string, value: T[]): void {
        this.cleanExpired();
        this.evictIfNeeded(this.retrievalCache);
        const key = this.generateKey(query);
        this.retrievalCache.set(key, { value, timestamp: Date.now() });
    }

    public getWebCache<T = any>(query: string): T[] | undefined {
        this.cleanExpired();
        const key = this.generateKey(query);
        const entry = this.webCache.get(key);
        if (entry && !this.isExpiredGeneric(entry)) {
            this.webHits++;
            return entry.value;
        }
        this.webMisses++;
        return undefined;
    }

    public setWebCache<T = any>(query: string, value: T[]): void {
        this.cleanExpired();
        this.evictIfNeeded(this.webCache);
        const key = this.generateKey(query);
        this.webCache.set(key, { value, timestamp: Date.now() });
    }

    public getEmbeddingCache<T = any>(text: string): T | undefined {
        this.cleanExpired();
        const key = this.generateKey(text);
        const entry = this.embeddingCache.get(key);
        if (entry && !this.isExpiredGeneric(entry)) {
            this.embeddingHits++;
            return entry.value;
        }
        this.embeddingMisses++;
        return undefined;
    }

    public setEmbeddingCache<T = any>(text: string, value: T): void {
        this.cleanExpired();
        this.evictIfNeeded(this.embeddingCache);
        const key = this.generateKey(text);
        this.embeddingCache.set(key, { value, timestamp: Date.now() });
    }

    public getStats() {
        this.cleanExpired();
        
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

        // Per-layer statistics
        const responseTotal = this.responseHits + this.responseMisses;
        const responseHitRate = responseTotal > 0 ? (this.responseHits / responseTotal) * 100 : 0;

        const retrievalTotal = this.retrievalHits + this.retrievalMisses;
        const retrievalHitRate = retrievalTotal > 0 ? (this.retrievalHits / retrievalTotal) * 100 : 0;

        const webTotal = this.webHits + this.webMisses;
        const webHitRate = webTotal > 0 ? (this.webHits / webTotal) * 100 : 0;

        const embeddingTotal = this.embeddingHits + this.embeddingMisses;
        const embeddingHitRate = embeddingTotal > 0 ? (this.embeddingHits / embeddingTotal) * 100 : 0;

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: Math.round(hitRate * 10) / 10, // Round to 1 decimal
            ttl: this.ttl,
            // Per-layer statistics
            layers: {
                response: {
                    size: this.cache.size,
                    hits: this.responseHits,
                    misses: this.responseMisses,
                    hitRate: Math.round(responseHitRate * 10) / 10
                },
                retrieval: {
                    size: this.retrievalCache.size,
                    hits: this.retrievalHits,
                    misses: this.retrievalMisses,
                    hitRate: Math.round(retrievalHitRate * 10) / 10
                },
                web: {
                    size: this.webCache.size,
                    hits: this.webHits,
                    misses: this.webMisses,
                    hitRate: Math.round(webHitRate * 10) / 10
                },
                embedding: {
                    size: this.embeddingCache.size,
                    hits: this.embeddingHits,
                    misses: this.embeddingMisses,
                    hitRate: Math.round(embeddingHitRate * 10) / 10
                }
            }
        };
    }
}

