export interface QueryAnalysis {
    isCodebaseQuery: boolean;
    confidence: number;
    type: 'structure' | 'function' | 'class' | 'file' | 'dependency' | 'usage' | 'general';
    intent?: QueryIntent;
    targetEntities?: string[];
}

export interface QueryIntent {
    type: 'structure' | 'function' | 'class' | 'file' | 'dependency' | 'usage' | 'general';
    target?: string;
    action?: 'list' | 'explain' | 'show' | 'analyze';
}

export class CodebaseQueryRouter {
    detectCodebaseQuery(query: string): QueryAnalysis {
        const normalized = query.toLowerCase();
        const mentionsCodeFile = /\b\w+\.(ts|js|py|java|go|rs|cpp|c|cs|jsx|tsx)\b/i.test(query);
        
        // Codebase-specific keywords
        const codebaseKeywords = [
            'my codebase', 'my code', 'in my', 'this codebase',
            'this file', 'this function', 'this class',
            'are in', 'defined in', 'located in', 'in my code',
            'my project', 'this project', 'my repo', 'this repo'
        ];
        
        // File-related patterns
        const filePatterns = [
            /show me (.+\.(ts|js|py|java|go|rs|cpp|c|cs))/i,
            /what is in (.+\.(ts|js|py|java|go|rs|cpp|c|cs))/i,
            /analyze (.+\.(ts|js|py|java|go|rs|cpp|c|cs))/i,
            /explain (.+\.(ts|js|py|java|go|rs|cpp|c|cs))/i
        ];
        
        // Function/class patterns
        const entityPatterns = [
            /function (.+)/i,
            /class (.+)/i,
            /how does (.+) work/i,
            /what does (.+) do/i,
            /where is (.+) (defined|located)/i,
            /show me (.+) (function|class|interface)/i
        ];
        
        // Structure patterns
        const structurePatterns = [
            /structure of/i,
            /organization of/i,
            /how is (.+) organized/i,
            /what is the structure/i
        ];
        
        // Dependency patterns
        const dependencyPatterns = [
            /dependencies? (of|in|for)/i,
            /what (imports|uses) (.+)/i,
            /where is (.+) used/i,
            /what uses (.+)/i
        ];
        
        // Calculate confidence score
        let confidence = 0;
        if (mentionsCodeFile) confidence += 0.4;
        if (codebaseKeywords.some(k => normalized.includes(k))) confidence += 0.4;
        if (filePatterns.some(p => p.test(query))) confidence += 0.3;
        if (entityPatterns.some(p => p.test(query))) confidence += 0.3;
        if (structurePatterns.some(p => p.test(query))) confidence += 0.2;
        if (dependencyPatterns.some(p => p.test(query))) confidence += 0.2;
        
        const detected = confidence > 0.5;
        const queryType = this.determineQueryType(query);
        const intent = this.extractQueryIntent(query);
        const targetEntities = this.extractTargetEntities(query);
        
        return {
            isCodebaseQuery: detected,
            confidence,
            type: queryType,
            intent,
            targetEntities
        };
    }
    
    extractQueryIntent(query: string): QueryIntent {
        const normalized = query.toLowerCase();
        
        let type: QueryIntent['type'] = 'general';
        let action: QueryIntent['action'] = 'explain';
        let target: string | undefined;
        
        // Determine action
        if (/show me|display|list/i.test(query)) {
            action = 'show';
        } else if (/what (are|is)|list/i.test(query)) {
            action = 'list';
        } else if (/explain|how does|what does/i.test(query)) {
            action = 'explain';
        } else if (/analyze|analysis/i.test(query)) {
            action = 'analyze';
        }
        
        // Determine type
        if (/function/i.test(normalized)) {
            type = 'function';
        } else if (/class/i.test(normalized)) {
            type = 'class';
        } else if (/file|\.(ts|js|py|java|go|rs|cpp|c|cs)/i.test(query)) {
            type = 'file';
        } else if (/structure|organization/i.test(normalized)) {
            type = 'structure';
        } else if (/dependenc|import|use/i.test(normalized)) {
            type = 'dependency';
        } else if (/where.*used|what uses/i.test(normalized)) {
            type = 'usage';
        }
        
        // Extract target
        const fileMatch = query.match(/(\w+\.(ts|js|py|java|go|rs|cpp|c|cs))/i);
        if (fileMatch) {
            target = fileMatch[1];
        } else {
            const entityMatch = query.match(/(?:function|class|interface)\s+(\w+)/i);
            if (entityMatch) {
                target = entityMatch[1];
            }
        }
        
        return { type, action, target };
    }
    
    extractTargetEntities(query: string): string[] {
        const entities: string[] = [];
        
        // Extract file paths
        const fileMatches = query.matchAll(/(\w+\.(ts|js|py|java|go|rs|cpp|c|cs))/gi);
        for (const match of fileMatches) {
            entities.push(match[1]);
        }
        
        // Extract function/class names
        const functionMatches = query.matchAll(/(?:function|func)\s+(\w+)/gi);
        for (const match of functionMatches) {
            entities.push(match[1]);
        }
        
        const classMatches = query.matchAll(/class\s+(\w+)/gi);
        for (const match of classMatches) {
            entities.push(match[1]);
        }
        
        const interfaceMatches = query.matchAll(/interface\s+(\w+)/gi);
        for (const match of interfaceMatches) {
            entities.push(match[1]);
        }
        
        // Extract quoted strings (likely entity names)
        const quotedMatches = query.matchAll(/"([^"]+)"/g);
        for (const match of quotedMatches) {
            entities.push(match[1]);
        }
        
        return [...new Set(entities)]; // Remove duplicates
    }
    
    determineQueryType(query: string): 'structure' | 'function' | 'class' | 'file' | 'dependency' | 'usage' | 'general' {
        const normalized = query.toLowerCase();
        
        if (/structure|organization|how.*organized/i.test(normalized)) {
            return 'structure';
        }
        
        if (/function|func/i.test(normalized) && !/class|interface/i.test(normalized)) {
            return 'function';
        }
        
        if (/class/i.test(normalized)) {
            return 'class';
        }
        
        if (/file|\.(ts|js|py|java|go|rs|cpp|c|cs)/i.test(query)) {
            return 'file';
        }
        
        if (/dependenc|import/i.test(normalized)) {
            return 'dependency';
        }
        
        if (/where.*used|what uses|usage/i.test(normalized)) {
            return 'usage';
        }
        
        return 'general';
    }
}

