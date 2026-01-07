import { DocumentRecord, ChatMessage } from './externalMemory';

export class ContextBuilder {
    /**
     * Enhanced relevance scoring function
     * Scores documents based on exact matches, partial matches, and phrase presence
     */
    private scoreRelevance(doc: DocumentRecord, query: string): number {
        const queryLower = query.toLowerCase();
        const contentLower = (doc.content || '').toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        
        if (queryWords.length === 0) return 0;
        
        // Count exact word matches (higher weight)
        const exactMatches = queryWords.filter(w => {
            const regex = new RegExp(`\\b${w}\\b`, 'i');
            return regex.test(contentLower);
        }).length;
        
        // Count partial matches (lower weight)
        const partialMatches = queryWords.filter(w => contentLower.includes(w)).length - exactMatches;
        
        // Calculate relevance score (0-1)
        const exactScore = exactMatches / queryWords.length;
        const partialScore = partialMatches / queryWords.length * 0.5;
        const baseScore = exactScore + partialScore;
        
        // Boost score if query phrase appears
        const phraseBoost = queryLower.length > 5 && contentLower.includes(queryLower) ? 0.3 : 0;
        
        // Penalize error/troubleshooting content for definition questions
        const isWhatIsQuestion = /^what\s+is\s+/i.test(query);
        const isErrorDoc = /error|exception|fix|troubleshoot|debug|issue|problem|bug|syntaxerror|typeerror/i.test(contentLower) &&
                          !/definition|what is|introduction|overview|basics|fundamentals|guide/i.test(contentLower);
        const errorPenalty = (isWhatIsQuestion && isErrorDoc) ? -0.4 : 0;
        
        return Math.min(1, Math.max(0, baseScore + phraseBoost + errorPenalty));
    }

    /**
     * Validate context quality to ensure it contains relevant information
     */
    validateContextQuality(context: string, query: string): boolean {
        const contextLower = context.toLowerCase();
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        
        if (queryWords.length === 0) return false;
        
        // Check if at least 50% of query words appear in context
        const matches = queryWords.filter(w => {
            const regex = new RegExp(`\\b${w}\\b`, 'i');
            return regex.test(contextLower);
        }).length;
        
        const matchRatio = matches / queryWords.length;
        return matchRatio >= 0.5; // At least 50% of query words must be in context
    }

    buildContext(userInput: string, internalDocs: DocumentRecord[], webDocs: DocumentRecord[], chatHistory: ChatMessage[]): string {
        const relevanceGuide = [
            'CRITICAL: Use ONLY information that directly and explicitly answers the user question.',
            'STRICT ACCURACY: Every fact must be traceable to the context. No assumptions. No inferences.',
            'IGNORE: Unrelated snippets (installers, downloaders, keybindings, generic shortcuts, error-only content for definition questions).',
            'DIRECT ANSWERS: Answer the EXACT question asked. Do NOT infer what the user might want.',
            'If the question asks "what is X", provide what X IS, not errors, fixes, or troubleshooting.',
            'If no relevant information is found, respond exactly: "No relevant information found."',
            'QUALITY STANDARD: 10/10 Gold Standard - Zero tolerance for hallucination, assumptions, or false positives.'
        ].join('\n');
        let context = `Guidelines:\n${relevanceGuide}\n\n`;

        if (chatHistory.length > 0) {
            context += 'Previous Conversation:\n';
            chatHistory.forEach(msg => {
                context += `${msg.role}: ${msg.content}\n`;
            });
            context += '\n';
        }

        // Detect question type
        const isWhatIsQuestion = /^what\s+is\s+/i.test(userInput);
        const isDefinitionQuestion = /^(what|who|where|when|why|how)\s+/i.test(userInput);
        
        // Filter and score web docs
        const scoredWebDocs = webDocs.map(doc => ({
            doc,
            score: this.scoreRelevance(doc, userInput)
        })).filter(item => item.score > 0.2); // Only include docs with >20% relevance
        
        // Sort by score (highest first) and remove duplicates
        scoredWebDocs.sort((a, b) => b.score - a.score);
        const uniqueWebDocs: DocumentRecord[] = [];
        const seenWebContent = new Set<string>();
        for (const item of scoredWebDocs) {
            const contentHash = item.doc.content.substring(0, 100).toLowerCase();
            if (!seenWebContent.has(contentHash)) {
                seenWebContent.add(contentHash);
                uniqueWebDocs.push(item.doc);
            }
        }

        if (uniqueWebDocs.length > 0) {
            context += 'Web Snippets (reference only; do not list these in the answer):\n';
            uniqueWebDocs.forEach((doc, idx) => {
                context += `[Web ${idx + 1}]\n${doc.content}\n\n`;
            });
        } else if (webDocs.length > 0) {
            // There were web docs, but none deemed relevant
            context += 'Web Snippets (reference only; do not list these in the answer):\nNo relevant web snippets found.\n\n';
        }

        // Filter and score internal docs with enhanced filtering for definition questions
        let filteredInternalDocs = internalDocs;
        
        if (isWhatIsQuestion || isDefinitionQuestion) {
            // For definition questions, filter out primarily error/troubleshooting docs
            filteredInternalDocs = internalDocs.filter(doc => {
                const content = doc.content.toLowerCase();
                const isErrorDoc = /error|exception|fix|troubleshoot|debug|issue|problem|bug/i.test(content) &&
                                 !/definition|what is|introduction|overview|basics|fundamentals|guide|language|programming/i.test(content);
                return !isErrorDoc;
            });
        }
        
        // Score and filter internal docs
        const scoredInternalDocs = filteredInternalDocs.map(doc => ({
            doc,
            score: this.scoreRelevance(doc, userInput)
        })).filter(item => item.score > 0.15); // Slightly lower threshold for internal docs
        
        // Sort by score and remove duplicates
        scoredInternalDocs.sort((a, b) => b.score - a.score);
        const uniqueInternalDocs: DocumentRecord[] = [];
        const seenInternalContent = new Set<string>();
        for (const item of scoredInternalDocs) {
            const contentHash = item.doc.content.substring(0, 100).toLowerCase();
            if (!seenInternalContent.has(contentHash)) {
                seenInternalContent.add(contentHash);
                uniqueInternalDocs.push(item.doc);
            }
        }

        if (uniqueInternalDocs.length > 0) {
            context += 'Internal Knowledge:\n';
            uniqueInternalDocs.forEach((doc, idx) => {
                context += `[Internal ${idx + 1}]\n${doc.content}\n\n`;
            });
        }

        context += `User Question: ${userInput}`;
        return context;
    }
}

