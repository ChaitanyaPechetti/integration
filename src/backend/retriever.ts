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
}

