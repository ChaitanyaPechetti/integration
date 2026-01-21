import { ExternalMemory, DocumentRecord } from '../externalMemory';
import { OutputChannel } from '../../utils/outputChannel';

export interface GuaranteedRetrievalResult {
    documents: DocumentRecord[];
    source: 'primary' | 'fallback1' | 'fallback2' | 'fallback3' | 'overview';
}

export class GuaranteedCodebaseRetriever {
    private outputChannel: OutputChannel;

    constructor(outputChannel: OutputChannel) {
        this.outputChannel = outputChannel;
    }

    async retrieveWithGuarantee(
        query: string,
        topK: number,
        externalMemory: ExternalMemory
    ): Promise<GuaranteedRetrievalResult> {
        // Level 1: Primary retrieval
        let docs = await this.retrievePrimary(query, topK, externalMemory);
        if (docs.length > 0) {
            this.outputChannel.logInfo(`[Guaranteed Retriever] Primary retrieval found ${docs.length} documents`);
            return { documents: docs, source: 'primary' };
        }

        // Level 2: Fallback 1 - Related documents
        docs = await this.retrieveFallback1(query, topK, externalMemory);
        if (docs.length > 0) {
            this.outputChannel.logInfo(`[Guaranteed Retriever] Fallback 1 found ${docs.length} documents`);
            return { documents: docs, source: 'fallback1' };
        }

        // Level 3: Fallback 2 - File summaries
        docs = await this.retrieveFallback2(query, externalMemory);
        if (docs.length > 0) {
            this.outputChannel.logInfo(`[Guaranteed Retriever] Fallback 2 found ${docs.length} documents`);
            return { documents: docs, source: 'fallback2' };
        }

        // Level 4: Fallback 3 - Codebase structure overview
        docs = await this.retrieveFallback3(externalMemory);
        if (docs.length > 0) {
            this.outputChannel.logInfo(`[Guaranteed Retriever] Fallback 3 found ${docs.length} documents`);
            return { documents: docs, source: 'fallback3' };
        }

        // Level 5: Ultimate fallback - Build overview
        const overviewDoc = this.buildCodebaseOverview(externalMemory);
        this.outputChannel.logInfo('[Guaranteed Retriever] Using codebase overview as ultimate fallback');
        return { documents: [overviewDoc], source: 'overview' };
    }

    private async retrievePrimary(query: string, topK: number, externalMemory: ExternalMemory): Promise<DocumentRecord[]> {
        try {
            // Get all codebase documents
            const allDocs = this.getAllCodebaseDocuments(externalMemory);
            
            if (allDocs.length === 0) {
                return [];
            }

            // Score documents by relevance
            const scoredDocs = allDocs.map(doc => ({
                doc,
                score: this.scoreRelevance(doc, query)
            }))
            .filter(item => item.score > 0.2) // Minimum relevance threshold
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(item => item.doc);

            return scoredDocs;
        } catch (error: any) {
            this.outputChannel.logError(`[Guaranteed Retriever] Primary retrieval failed: ${error.message}`);
            return [];
        }
    }

    private async retrieveFallback1(query: string, topK: number, externalMemory: ExternalMemory): Promise<DocumentRecord[]> {
        try {
            const allDocs = this.getAllCodebaseDocuments(externalMemory);
            
            if (allDocs.length === 0) {
                return [];
            }

            // Broader search with keyword expansion
            const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const expandedKeywords = this.expandKeywords(queryWords);

            const scoredDocs = allDocs.map(doc => ({
                doc,
                score: this.scoreBroaderRelevance(doc, query, expandedKeywords)
            }))
            .filter(item => item.score > 0.1) // Lower threshold for fallback
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(item => item.doc);

            return scoredDocs;
        } catch (error: any) {
            this.outputChannel.logError(`[Guaranteed Retriever] Fallback 1 failed: ${error.message}`);
            return [];
        }
    }

    private async retrieveFallback2(query: string, externalMemory: ExternalMemory): Promise<DocumentRecord[]> {
        try {
            const allDocs = this.getAllCodebaseDocuments(externalMemory);
            
            // Return file-level summaries
            const fileSummaries = allDocs.filter(doc => doc.metadata?.type === 'file');
            
            if (fileSummaries.length === 0) {
                return [];
            }

            // Score file summaries by query relevance
            const scored = fileSummaries.map(doc => ({
                doc,
                score: this.scoreRelevance(doc, query)
            }))
            .filter(item => item.score > 0.05)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(item => item.doc);

            return scored;
        } catch (error: any) {
            this.outputChannel.logError(`[Guaranteed Retriever] Fallback 2 failed: ${error.message}`);
            return [];
        }
    }

    private async retrieveFallback3(externalMemory: ExternalMemory): Promise<DocumentRecord[]> {
        try {
            // Check if overview document exists
            const overviewDoc = await externalMemory.getDocument('codebase-overview');
            if (overviewDoc) {
                return [overviewDoc];
            }

            // Build and return overview
            const overview = this.buildCodebaseOverview(externalMemory);
            await externalMemory.storeDocument(overview);
            return [overview];
        } catch (error: any) {
            this.outputChannel.logError(`[Guaranteed Retriever] Fallback 3 failed: ${error.message}`);
            return [];
        }
    }

    private getAllCodebaseDocuments(externalMemory: ExternalMemory): DocumentRecord[] {
        try {
            return externalMemory.getCodebaseDocuments();
        } catch (error: any) {
            this.outputChannel.logError(`[Guaranteed Retriever] Failed to get codebase documents: ${error.message}`);
            return [];
        }
    }

    private scoreRelevance(doc: DocumentRecord, query: string): number {
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

        // Phrase matching
        if (queryLower.length > 5 && contentLower.includes(queryLower)) {
            score += 0.3;
        }

        return Math.min(1.0, score);
    }

    private scoreBroaderRelevance(doc: DocumentRecord, query: string, expandedKeywords: string[]): number {
        const contentLower = doc.content.toLowerCase();
        const metadata = doc.metadata || {};
        
        let score = 0;

        // Check expanded keywords
        const keywordMatches = expandedKeywords.filter(kw => 
            contentLower.includes(kw.toLowerCase()) ||
            (metadata.functionName && metadata.functionName.toLowerCase().includes(kw.toLowerCase())) ||
            (metadata.className && metadata.className.toLowerCase().includes(kw.toLowerCase()))
        ).length;

        score += (keywordMatches / Math.max(expandedKeywords.length, 1)) * 0.5;

        // Partial word matches
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        queryWords.forEach(word => {
            if (contentLower.includes(word)) {
                score += 0.1;
            }
        });

        return Math.min(1.0, score);
    }

    private expandKeywords(keywords: string[]): string[] {
        const expanded: string[] = [...keywords];
        
        // Add common variations
        keywords.forEach(keyword => {
            // Add plural/singular variations
            if (keyword.endsWith('s')) {
                expanded.push(keyword.slice(0, -1));
            } else {
                expanded.push(keyword + 's');
            }
            
            // Add common suffixes
            if (keyword.endsWith('ion')) {
                expanded.push(keyword.replace('ion', 'e'));
            }
        });

        return [...new Set(expanded)]; // Remove duplicates
    }

    buildCodebaseOverview(externalMemory: ExternalMemory): DocumentRecord {
        try {
            const codebaseDocs = externalMemory.getCodebaseDocuments();
            const fileCount = new Set(codebaseDocs.map(d => d.metadata?.filePath || d.metadata?.relativePath)).size;
            const functionCount = codebaseDocs.filter(d => d.metadata?.type === 'function').length;
            const classCount = codebaseDocs.filter(d => d.metadata?.type === 'class').length;
            const interfaceCount = codebaseDocs.filter(d => d.metadata?.type === 'interface').length;

            const overviewContent = `**Codebase Overview**

Your codebase has been indexed with the following structure:
- ${fileCount} files indexed
- ${functionCount} functions
- ${classCount} classes
- ${interfaceCount} interfaces

To get specific information about your codebase, try asking:
- "What functions are in [filename]?"
- "What classes are in [filename]?"
- "Show me [filename]"
- "How does [function/class] work?"
- "Where is [function/class] defined?"
- "What dependencies does [file] have?"

The codebase is ready for comprehensive queries.`;

            return {
                id: 'codebase-overview',
                content: overviewContent,
                metadata: {
                    source: 'codebase',
                    type: 'overview',
                    filePath: 'workspace',
                    relativePath: 'workspace',
                    language: 'mixed',
                    fileCount,
                    functionCount,
                    classCount,
                    interfaceCount
                },
                timestamp: Date.now()
            };
        } catch (error: any) {
            this.outputChannel.logError(`[Guaranteed Retriever] Failed to build overview: ${error.message}`);
            // Return basic overview as fallback
            return {
                id: 'codebase-overview',
                content: '**Codebase Overview**\n\nYour codebase has been indexed. Ask questions about your code to get detailed information.',
                metadata: {
                    source: 'codebase',
                    type: 'overview',
                    filePath: 'workspace',
                    relativePath: 'workspace',
                    language: 'mixed'
                },
                timestamp: Date.now()
            };
        }
    }
}

