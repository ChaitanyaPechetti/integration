import { CacheManager } from '../utils/cacheManager';
import { OutputChannel } from '../utils/outputChannel';
import { ExternalMemory, DocumentRecord } from './externalMemory';

export interface RetrievalResult {
    internal: DocumentRecord[];
    web: DocumentRecord[];
}

export class Retriever {
    private externalMemory: ExternalMemory;
    private cacheManager: CacheManager;
    private output: OutputChannel;

    constructor(externalMemory: ExternalMemory, cacheManager: CacheManager, output: OutputChannel) {
        this.externalMemory = externalMemory;
        this.cacheManager = cacheManager;
        this.output = output;
    }

    async retrieveInternal(query: string, topK: number): Promise<DocumentRecord[]> {
        try {
            const cached = this.cacheManager.getRetrievalCache(query);
            if (cached) {
                this.output.logInfo('Retriever cache hit (internal)');
                return cached;
            }
            const docs = await this.externalMemory.getDocuments(query, topK);
            this.cacheManager.setRetrievalCache(query, docs);
            return docs;
        } catch (error: any) {
            this.output.logError(`[Retriever] Internal retrieval failed: ${error.message || error}`);
            // Return empty array on error to allow pipeline to continue
            return [];
        }
    }

    async retrieveCodebase(
        query: string,
        topK: number,
        queryType: string,
        externalMemory: ExternalMemory
    ): Promise<DocumentRecord[]> {
        try {
            const cached = this.cacheManager.getRetrievalCache(`codebase:${query}`);
            if (cached) {
                this.output.logInfo('Codebase retriever cache hit');
                return cached;
            }

            // Get all codebase documents
            const allDocs = externalMemory.getCodebaseDocuments();

            // Apply query-specific filtering and scoring
            const scoredDocs = allDocs.map(doc => ({
                doc,
                score: this.scoreCodebaseRelevance(doc, query, queryType)
            }))
            .filter(item => item.score > 0.1) // Lower threshold for codebase
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(item => item.doc);

            this.cacheManager.setRetrievalCache(`codebase:${query}`, scoredDocs);
            return scoredDocs;
        } catch (error: any) {
            this.output.logError(`[Retriever] Codebase retrieval failed: ${error.message || error}`);
            return [];
        }
    }

    private scoreCodebaseRelevance(
        doc: DocumentRecord,
        query: string,
        queryType: string
    ): number {
        const queryLower = query.toLowerCase();
        const contentLower = doc.content.toLowerCase();
        const metadata = doc.metadata || {};

        let score = 0;

        // Exact matches in metadata (highest priority)
        if (metadata.functionName && queryLower.includes(metadata.functionName.toLowerCase())) {
            score += 1.0;
        }
        if (metadata.className && queryLower.includes(metadata.className.toLowerCase())) {
            score += 1.0;
        }
        if (metadata.interfaceName && queryLower.includes(metadata.interfaceName.toLowerCase())) {
            score += 1.0;
        }
        if (metadata.filePath && queryLower.includes(metadata.filePath.toLowerCase())) {
            score += 0.8;
        }
        if (metadata.relativePath && queryLower.includes(metadata.relativePath.toLowerCase())) {
            score += 0.8;
        }

        // Content matches
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        if (queryWords.length > 0) {
            const matches = queryWords.filter(w => {
                const regex = new RegExp(`\\b${w}\\b`, 'i');
                return regex.test(contentLower);
            }).length;
            score += (matches / queryWords.length) * 0.6;
        }

        // Type-specific scoring
        if (queryType === 'function' && metadata.type === 'function') {
            score += 0.3;
        }
        if (queryType === 'class' && metadata.type === 'class') {
            score += 0.3;
        }
        if (queryType === 'file' && metadata.type === 'file') {
            score += 0.3;
        }

        return Math.min(1.0, score);
    }
}

