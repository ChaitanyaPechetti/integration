import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExternalMemory, DocumentRecord } from '../externalMemory';
import { OutputChannel } from '../../utils/outputChannel';

export interface FunctionInfo {
    name: string;
    signature: string;
    parameters: ParameterInfo[];
    returnType: string;
    documentation: string;
    line: number;
    column: number;
}

export interface ParameterInfo {
    name: string;
    type: string;
    optional: boolean;
}

export interface ClassInfo {
    name: string;
    methods: MethodInfo[];
    properties: PropertyInfo[];
    extends?: string;
    implements?: string[];
    documentation: string;
    line: number;
}

export interface MethodInfo {
    name: string;
    signature: string;
    parameters: ParameterInfo[];
    returnType: string;
    documentation: string;
    line: number;
}

export interface PropertyInfo {
    name: string;
    type: string;
    optional: boolean;
    documentation: string;
    line: number;
}

export interface InterfaceInfo {
    name: string;
    properties: PropertyInfo[];
    methods: MethodInfo[];
    extends?: string[];
    documentation: string;
    line: number;
}

export interface TypeInfo {
    name: string;
    definition: string;
    documentation: string;
    line: number;
}

export interface ImportInfo {
    imports: string[];
    from: string;
    line: number;
}

export interface ExportInfo {
    exports: string[];
    line: number;
}

export interface DocumentationInfo {
    content: string;
    type: 'file' | 'function' | 'class' | 'interface';
    line: number;
}

export interface CodeStructure {
    functions: FunctionInfo[];
    classes: ClassInfo[];
    interfaces: InterfaceInfo[];
    types: TypeInfo[];
    imports: ImportInfo[];
    exports: ExportInfo[];
    documentation: DocumentationInfo[];
}

export interface CodeChunk {
    content: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'interface' | 'block';
}

export interface IndexingResult {
    indexedFiles: number;
    indexedDocuments: number;
    timestamp: number;
    errors: string[];
}

export class ComprehensiveCodebaseIndexer {
    private externalMemory: ExternalMemory;
    private outputChannel: OutputChannel;
    private maxFileSize: number;
    private maxFiles: number;
    private indexedFileIds: Set<string> = new Set();

    constructor(externalMemory: ExternalMemory, outputChannel: OutputChannel) {
        this.externalMemory = externalMemory;
        this.outputChannel = outputChannel;
        const config = vscode.workspace.getConfiguration('ragAgent');
        this.maxFileSize = config.get<number>('codebaseIndexMaxSizeBytes', 2000000);
        this.maxFiles = config.get<number>('codebaseIndexMaxFiles', 1000);
    }

    async indexEntireCodebase(workspaceUri: vscode.Uri): Promise<IndexingResult> {
        const result: IndexingResult = {
            indexedFiles: 0,
            indexedDocuments: 0,
            timestamp: Date.now(),
            errors: []
        };

        try {
            this.outputChannel.logInfo('[Codebase Indexer] Starting comprehensive codebase indexing...');
            
            // Get configuration
            const config = vscode.workspace.getConfiguration('ragAgent');
            const languages = config.get<string[]>('codebaseIndexLanguages', [
                'typescript', 'javascript', 'python', 'java', 'go', 'rust', 'cpp', 'c', 'csharp'
            ]);
            const indexDepth = config.get<string>('codebaseIndexDepth', 'deep');

            // Find all code files.
            // Accept either language names (typescript, javascript, etc.) or file extensions (ts, js, py, ...).
            const extensions = this.normalizeLanguagesToExtensions(languages);
            const filePattern = `**/*.{${extensions.join(',')}}`;
            const excludePattern = '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/build/**,**/coverage/**,**/.venv/**,**/__pycache__/**,**/*.min.js,**/*.bundle.js}';
            
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceUri, filePattern),
                excludePattern
            );

            const limitedFiles = files.slice(0, this.maxFiles);
            this.outputChannel.logInfo(`[Codebase Indexer] Found ${limitedFiles.length} files to index`);

            // Index each file
            for (const uri of limitedFiles) {
                try {
                    const docs = await this.indexFile(uri);
                    if (docs.length > 0) {
                        result.indexedFiles++;
                        result.indexedDocuments += docs.length;
                    }
                } catch (error: any) {
                    const errorMsg = `Failed to index ${uri.fsPath}: ${error.message}`;
                    result.errors.push(errorMsg);
                    this.outputChannel.logError(`[Codebase Indexer] ${errorMsg}`);
                }
            }

            this.outputChannel.logInfo(
                `[Codebase Indexer] Indexing complete: ${result.indexedFiles} files, ${result.indexedDocuments} documents`
            );

            return result;
        } catch (error: any) {
            result.errors.push(`Indexing failed: ${error.message}`);
            this.outputChannel.logError(`[Codebase Indexer] ${error.message}`);
            return result;
        }
    }

    /**
     * Normalize language names to file extensions for the glob.
     * Supports both language names (typescript) and extensions (ts/tsx).
     */
    private normalizeLanguagesToExtensions(languages: string[]): string[] {
        const languageToExtensions: Record<string, string[]> = {
            typescript: ['ts', 'tsx'],
            javascript: ['js', 'jsx'],
            python: ['py'],
            java: ['java'],
            go: ['go'],
            rust: ['rs'],
            cpp: ['cpp', 'h', 'hpp', 'cc', 'cxx'],
            c: ['c', 'h'],
            csharp: ['cs'],
            json: ['json']
        };

        const extensions = new Set<string>();

        languages.forEach(lang => {
            const key = lang.toLowerCase().replace(/^\./, '');
            if (languageToExtensions[key]) {
                languageToExtensions[key].forEach(ext => extensions.add(ext));
            } else {
                // Treat unknown entries as extensions directly
                extensions.add(key);
            }
        });

        return Array.from(extensions);
    }

    async indexFile(uri: vscode.Uri): Promise<DocumentRecord[]> {
        const documents: DocumentRecord[] = [];
        
        try {
            // Check file size
            const stat = await fs.promises.stat(uri.fsPath);
            if (stat.size > this.maxFileSize) {
                this.outputChannel.logInfo(`[Codebase Indexer] Skipping large file: ${uri.fsPath} (${stat.size} bytes)`);
                return documents;
            }

            // Read file content
            const content = await fs.promises.readFile(uri.fsPath, 'utf8');
            const relativePath = vscode.workspace.asRelativePath(uri);
            const language = this.detectLanguage(uri.fsPath);

            // Extract code structure
            const structure = this.extractCodeStructure(content, language, uri.fsPath);

            // Get indexing depth
            const config = vscode.workspace.getConfiguration('ragAgent');
            const indexDepth = config.get<string>('codebaseIndexDepth', 'deep');

            // Create file summary document
            const fileSummary = this.buildFileSummary(uri, structure, relativePath, language);
            documents.push(fileSummary);
            await this.externalMemory.storeDocument(fileSummary);

            // Index based on depth
            if (indexDepth === 'medium' || indexDepth === 'deep') {
                // Index functions
                for (const func of structure.functions) {
                    const funcDoc = this.buildFunctionDocument(func, relativePath, language);
                    documents.push(funcDoc);
                    await this.externalMemory.storeDocument(funcDoc);
                }

                // Index classes
                for (const cls of structure.classes) {
                    const classDoc = this.buildClassDocument(cls, relativePath, language);
                    documents.push(classDoc);
                    await this.externalMemory.storeDocument(classDoc);
                }

                // Index interfaces
                for (const iface of structure.interfaces) {
                    const interfaceDoc = this.buildInterfaceDocument(iface, relativePath, language);
                    documents.push(interfaceDoc);
                    await this.externalMemory.storeDocument(interfaceDoc);
                }
            }

            if (indexDepth === 'deep') {
                // Chunk large files
                const chunks = this.chunkFileIntelligently(content, 50000, structure);
                for (const chunk of chunks) {
                    const chunkDoc = this.buildChunkDocument(chunk, relativePath, language);
                    documents.push(chunkDoc);
                    await this.externalMemory.storeDocument(chunkDoc);
                }
            }

            // Track indexed file
            this.indexedFileIds.add(uri.fsPath);

            return documents;
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Indexer] Error indexing ${uri.fsPath}: ${error.message}`);
            return documents;
        }
    }

    async removeFileIndex(uri: vscode.Uri): Promise<void> {
        try {
            // Remove all documents for this file
            const relativePath = vscode.workspace.asRelativePath(uri);
            const fileIdPrefix = `codebase:${relativePath}:`;
            
            // Note: ExternalMemory doesn't expose documents map, so we'll need to track this differently
            // For now, we'll just remove from our tracking
            this.indexedFileIds.delete(uri.fsPath);
            
            this.outputChannel.logInfo(`[Codebase Indexer] Removed index tracking for ${uri.fsPath}`);
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Indexer] Error removing index for ${uri.fsPath}: ${error.message}`);
        }
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.json': 'json',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp'
        };
        return languageMap[ext] || 'unknown';
    }

    extractCodeStructure(content: string, language: string, filePath: string): CodeStructure {
        const structure: CodeStructure = {
            functions: [],
            classes: [],
            interfaces: [],
            types: [],
            imports: [],
            exports: [],
            documentation: []
        };

        if (language === 'typescript' || language === 'javascript') {
            return this.extractTypeScriptStructure(content, filePath);
        } else if (language === 'python') {
            return this.extractPythonStructure(content, filePath);
        } else if (language === 'java') {
            return this.extractJavaStructure(content, filePath);
        }

        return structure;
    }

    private extractTypeScriptStructure(content: string, filePath: string): CodeStructure {
        const structure: CodeStructure = {
            functions: [],
            classes: [],
            interfaces: [],
            types: [],
            imports: [],
            exports: [],
            documentation: []
        };

        const lines = content.split('\n');

        // Extract imports
        lines.forEach((line, index) => {
            const importMatch = line.match(/^import\s+(?:(\w+)|(?:\{([^}]+)\})|(?:\*\s+as\s+(\w+)))\s+from\s+['"]([^'"]+)['"]/);
            if (importMatch) {
                const imports: string[] = [];
                if (importMatch[1]) imports.push(importMatch[1]);
                if (importMatch[2]) imports.push(...importMatch[2].split(',').map(i => i.trim()));
                if (importMatch[3]) imports.push(importMatch[3]);
                
                structure.imports.push({
                    imports,
                    from: importMatch[4],
                    line: index + 1
                });
            }
        });

        // Extract exports
        lines.forEach((line, index) => {
            const exportMatch = line.match(/^export\s+(?:default\s+)?(?:function|class|interface|type|const|let|var)\s+(\w+)/);
            if (exportMatch) {
                structure.exports.push({
                    exports: [exportMatch[1]],
                    line: index + 1
                });
            }
        });

        // Extract functions
        const functionRegex = /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*[:=]\s*(?:async\s+)?\(([^)]*)\)\s*(?:[:=]\s*)?(?:=>|:)?\s*(?:async\s+)?\(?([^)]*)\)?\s*(?:=>|:)?\s*(?:Promise<[^>]+>|void|string|number|boolean)?)/g;
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            const funcName = match[1] || match[2];
            const params = match[3] || match[4] || '';
            const lineNum = content.substring(0, match.index).split('\n').length;
            
            // Extract JSDoc
            const jsDoc = this.extractJSDoc(content, lineNum - 1);
            
            structure.functions.push({
                name: funcName,
                signature: `${funcName}(${params})`,
                parameters: this.parseParameters(params),
                returnType: 'unknown',
                documentation: jsDoc,
                line: lineNum,
                column: match.index - content.lastIndexOf('\n', match.index)
            });
        }

        // Extract classes
        const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g;
        while ((match = classRegex.exec(content)) !== null) {
            const className = match[1];
            const extendsClass = match[2];
            const implementsList = match[3] ? match[3].split(',').map(i => i.trim()) : undefined;
            const lineNum = content.substring(0, match.index).split('\n').length;
            
            const jsDoc = this.extractJSDoc(content, lineNum - 1);
            
            // Extract class body
            const classBody = this.extractClassBody(content, match.index);
            
            structure.classes.push({
                name: className,
                methods: this.extractClassMethods(classBody),
                properties: this.extractClassProperties(classBody),
                extends: extendsClass,
                implements: implementsList,
                documentation: jsDoc,
                line: lineNum
            });
        }

        // Extract interfaces
        const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?\s*\{/g;
        while ((match = interfaceRegex.exec(content)) !== null) {
            const interfaceName = match[1];
            const extendsList = match[2] ? match[2].split(',').map(i => i.trim()) : undefined;
            const lineNum = content.substring(0, match.index).split('\n').length;
            
            const jsDoc = this.extractJSDoc(content, lineNum - 1);
            const interfaceBody = this.extractClassBody(content, match.index);
            
            structure.interfaces.push({
                name: interfaceName,
                properties: this.extractClassProperties(interfaceBody),
                methods: this.extractClassMethods(interfaceBody),
                extends: extendsList,
                documentation: jsDoc,
                line: lineNum
            });
        }

        return structure;
    }

    private extractPythonStructure(content: string, filePath: string): CodeStructure {
        const structure: CodeStructure = {
            functions: [],
            classes: [],
            interfaces: [],
            types: [],
            imports: [],
            exports: [],
            documentation: []
        };

        const lines = content.split('\n');

        // Extract imports
        lines.forEach((line, index) => {
            const importMatch = line.match(/^import\s+(\w+)|^from\s+([\w.]+)\s+import\s+(.+)/);
            if (importMatch) {
                if (importMatch[1]) {
                    structure.imports.push({
                        imports: [importMatch[1]],
                        from: '',
                        line: index + 1
                    });
                } else if (importMatch[2] && importMatch[3]) {
                    const imports = importMatch[3].split(',').map(i => i.trim());
                    structure.imports.push({
                        imports,
                        from: importMatch[2],
                        line: index + 1
                    });
                }
            }
        });

        // Extract functions
        const functionRegex = /^def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/g;
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            const funcName = match[1];
            const params = match[2] || '';
            const returnType = match[3] || 'unknown';
            const lineNum = content.substring(0, match.index).split('\n').length;
            
            const docstring = this.extractPythonDocstring(content, lineNum);
            
            structure.functions.push({
                name: funcName,
                signature: `${funcName}(${params})`,
                parameters: this.parsePythonParameters(params),
                returnType: returnType.trim(),
                documentation: docstring,
                line: lineNum,
                column: match.index - content.lastIndexOf('\n', match.index)
            });
        }

        // Extract classes
        const classRegex = /^class\s+(\w+)(?:\(([^)]+)\))?:/g;
        while ((match = classRegex.exec(content)) !== null) {
            const className = match[1];
            const extendsList = match[2] ? match[2].split(',').map(i => i.trim()) : undefined;
            const lineNum = content.substring(0, match.index).split('\n').length;
            
            const docstring = this.extractPythonDocstring(content, lineNum);
            
            structure.classes.push({
                name: className,
                methods: [],
                properties: [],
                extends: extendsList?.[0],
                documentation: docstring,
                line: lineNum
            });
        }

        return structure;
    }

    private extractJavaStructure(content: string, filePath: string): CodeStructure {
        const structure: CodeStructure = {
            functions: [],
            classes: [],
            interfaces: [],
            types: [],
            imports: [],
            exports: [],
            documentation: []
        };

        const lines = content.split('\n');

        // Extract imports
        lines.forEach((line, index) => {
            const importMatch = line.match(/^import\s+(?:static\s+)?([\w.]+);/);
            if (importMatch) {
                structure.imports.push({
                    imports: [importMatch[1].split('.').pop() || ''],
                    from: importMatch[1],
                    line: index + 1
                });
            }
        });

        // Extract classes
        const classRegex = /(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g;
        let match;
        while ((match = classRegex.exec(content)) !== null) {
            const className = match[1];
            const extendsClass = match[2];
            const implementsList = match[3] ? match[3].split(',').map(i => i.trim()) : undefined;
            const lineNum = content.substring(0, match.index).split('\n').length;
            
            structure.classes.push({
                name: className,
                methods: [],
                properties: [],
                extends: extendsClass,
                implements: implementsList,
                documentation: '',
                line: lineNum
            });
        }

        return structure;
    }

    private extractJSDoc(content: string, lineNumber: number): string {
        const lines = content.split('\n');
        const docLines: string[] = [];
        
        for (let i = lineNumber - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('*') || line.startsWith('/**') || line.startsWith('*/')) {
                if (line.startsWith('/**')) break;
                docLines.unshift(line.replace(/^\s*\*\s?/, ''));
            } else if (line.length > 0 && !line.startsWith('*')) {
                break;
            }
        }
        
        return docLines.join('\n');
    }

    private extractPythonDocstring(content: string, lineNumber: number): string {
        const lines = content.split('\n');
        if (lineNumber >= lines.length) return '';
        
        const docLines: string[] = [];
        let inDocstring = false;
        
        for (let i = lineNumber; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('"""') || line.startsWith("'''")) {
                if (inDocstring) {
                    docLines.push(line.replace(/"""|'''/g, ''));
                    break;
                }
                inDocstring = true;
                docLines.push(line.replace(/"""|'''/g, ''));
            } else if (inDocstring) {
                docLines.push(line);
            } else if (line.length > 0 && !line.startsWith('#')) {
                break;
            }
        }
        
        return docLines.join('\n');
    }

    private parseParameters(paramsStr: string): ParameterInfo[] {
        if (!paramsStr.trim()) return [];
        
        return paramsStr.split(',').map(param => {
            const trimmed = param.trim();
            const optional = trimmed.includes('?');
            const [name, type] = trimmed.replace('?', '').split(':').map(s => s.trim());
            
            return {
                name: name || 'unknown',
                type: type || 'any',
                optional
            };
        });
    }

    private parsePythonParameters(paramsStr: string): ParameterInfo[] {
        if (!paramsStr.trim()) return [];
        
        return paramsStr.split(',').map(param => {
            const trimmed = param.trim();
            const hasDefault = trimmed.includes('=');
            const [name, type] = trimmed.split(':').map(s => s.trim());
            
            return {
                name: name?.split('=')[0].trim() || 'unknown',
                type: type || 'any',
                optional: hasDefault
            };
        });
    }

    private extractClassBody(content: string, startIndex: number): string {
        let braceCount = 0;
        let inBody = false;
        let bodyStart = startIndex;
        
        for (let i = startIndex; i < content.length; i++) {
            if (content[i] === '{') {
                if (!inBody) {
                    inBody = true;
                    bodyStart = i + 1;
                }
                braceCount++;
            } else if (content[i] === '}') {
                braceCount--;
                if (braceCount === 0 && inBody) {
                    return content.substring(bodyStart, i);
                }
            }
        }
        
        return '';
    }

    private extractClassMethods(classBody: string): MethodInfo[] {
        const methods: MethodInfo[] = [];
        const methodRegex = /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/g;
        let match;
        
        while ((match = methodRegex.exec(classBody)) !== null) {
            methods.push({
                name: match[1],
                signature: `${match[1]}(${match[2]})`,
                parameters: this.parseParameters(match[2] || ''),
                returnType: match[3]?.trim() || 'void',
                documentation: '',
                line: 0
            });
        }
        
        return methods;
    }

    private extractClassProperties(classBody: string): PropertyInfo[] {
        const properties: PropertyInfo[] = [];
        const propertyRegex = /(?:public|private|protected)?\s*(?:readonly\s+)?(\w+)(?:\?)?\s*:\s*([^;=]+)/g;
        let match;
        
        while ((match = propertyRegex.exec(classBody)) !== null) {
            properties.push({
                name: match[1],
                type: match[2].trim(),
                optional: match[0].includes('?'),
                documentation: '',
                line: 0
            });
        }
        
        return properties;
    }

    chunkFileIntelligently(content: string, maxChunkSize: number, structure: CodeStructure): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const lines = content.split('\n');
        
        if (content.length <= maxChunkSize) {
            return [{
                content,
                startLine: 1,
                endLine: lines.length,
                type: 'block'
            }];
        }

        // Chunk by functions/classes
        let currentChunk: string[] = [];
        let currentStartLine = 1;
        let currentType: 'function' | 'class' | 'interface' | 'block' = 'block';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            currentChunk.push(line);
            
            const chunkSize = currentChunk.join('\n').length;
            
            if (chunkSize >= maxChunkSize) {
                chunks.push({
                    content: currentChunk.join('\n'),
                    startLine: currentStartLine,
                    endLine: i + 1,
                    type: currentType
                });
                
                currentChunk = [];
                currentStartLine = i + 2;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push({
                content: currentChunk.join('\n'),
                startLine: currentStartLine,
                endLine: lines.length,
                type: currentType
            });
        }

        return chunks;
    }

    buildFileSummary(uri: vscode.Uri, structure: CodeStructure, relativePath: string, language: string): DocumentRecord {
        const summaryParts: string[] = [];
        
        summaryParts.push(`File: ${relativePath}`);
        summaryParts.push(`Language: ${language}`);
        summaryParts.push(`Functions: ${structure.functions.length}`);
        summaryParts.push(`Classes: ${structure.classes.length}`);
        summaryParts.push(`Interfaces: ${structure.interfaces.length}`);
        
        if (structure.functions.length > 0) {
            summaryParts.push('\nFunctions:');
            structure.functions.slice(0, 10).forEach(func => {
                summaryParts.push(`- ${func.name}(${func.parameters.map(p => p.name).join(', ')})`);
            });
        }
        
        if (structure.classes.length > 0) {
            summaryParts.push('\nClasses:');
            structure.classes.forEach(cls => {
                summaryParts.push(`- ${cls.name}${cls.extends ? ` extends ${cls.extends}` : ''}`);
            });
        }

        return {
            id: `codebase:${relativePath}:file`,
            content: summaryParts.join('\n'),
            metadata: {
                source: 'codebase',
                filePath: uri.fsPath,
                relativePath,
                language,
                type: 'file'
            },
            timestamp: Date.now()
        };
    }

    buildFunctionDocument(func: FunctionInfo, relativePath: string, language: string): DocumentRecord {
        const contentParts: string[] = [];
        
        if (func.documentation) {
            contentParts.push(func.documentation);
            contentParts.push('');
        }
        
        contentParts.push(`Function: ${func.name}`);
        contentParts.push(`Signature: ${func.signature}`);
        contentParts.push(`Return Type: ${func.returnType}`);
        
        if (func.parameters.length > 0) {
            contentParts.push('Parameters:');
            func.parameters.forEach(param => {
                contentParts.push(`- ${param.name}: ${param.type}${param.optional ? ' (optional)' : ''}`);
            });
        }

        return {
            id: `codebase:${relativePath}:function:${func.name}:${func.line}`,
            content: contentParts.join('\n'),
            metadata: {
                source: 'codebase',
                relativePath,
                language,
                type: 'function',
                functionName: func.name,
                signature: func.signature,
                parameters: func.parameters.map(p => p.name),
                returnType: func.returnType,
                documentation: func.documentation,
                line: func.line,
                column: func.column
            },
            timestamp: Date.now()
        };
    }

    buildClassDocument(cls: ClassInfo, relativePath: string, language: string): DocumentRecord {
        const contentParts: string[] = [];
        
        if (cls.documentation) {
            contentParts.push(cls.documentation);
            contentParts.push('');
        }
        
        contentParts.push(`Class: ${cls.name}`);
        if (cls.extends) {
            contentParts.push(`Extends: ${cls.extends}`);
        }
        if (cls.implements && cls.implements.length > 0) {
            contentParts.push(`Implements: ${cls.implements.join(', ')}`);
        }
        
        if (cls.methods.length > 0) {
            contentParts.push('\nMethods:');
            cls.methods.forEach(method => {
                contentParts.push(`- ${method.signature}`);
            });
        }
        
        if (cls.properties.length > 0) {
            contentParts.push('\nProperties:');
            cls.properties.forEach(prop => {
                contentParts.push(`- ${prop.name}: ${prop.type}`);
            });
        }

        return {
            id: `codebase:${relativePath}:class:${cls.name}:${cls.line}`,
            content: contentParts.join('\n'),
            metadata: {
                source: 'codebase',
                relativePath,
                language,
                type: 'class',
                className: cls.name,
                extends: cls.extends,
                implements: cls.implements,
                documentation: cls.documentation,
                line: cls.line
            },
            timestamp: Date.now()
        };
    }

    buildInterfaceDocument(iface: InterfaceInfo, relativePath: string, language: string): DocumentRecord {
        const contentParts: string[] = [];
        
        if (iface.documentation) {
            contentParts.push(iface.documentation);
            contentParts.push('');
        }
        
        contentParts.push(`Interface: ${iface.name}`);
        if (iface.extends && iface.extends.length > 0) {
            contentParts.push(`Extends: ${iface.extends.join(', ')}`);
        }
        
        if (iface.properties.length > 0) {
            contentParts.push('\nProperties:');
            iface.properties.forEach(prop => {
                contentParts.push(`- ${prop.name}: ${prop.type}`);
            });
        }
        
        if (iface.methods.length > 0) {
            contentParts.push('\nMethods:');
            iface.methods.forEach(method => {
                contentParts.push(`- ${method.signature}`);
            });
        }

        return {
            id: `codebase:${relativePath}:interface:${iface.name}:${iface.line}`,
            content: contentParts.join('\n'),
            metadata: {
                source: 'codebase',
                relativePath,
                language,
                type: 'interface',
                interfaceName: iface.name,
                extends: iface.extends,
                documentation: iface.documentation,
                line: iface.line
            },
            timestamp: Date.now()
        };
    }

    buildChunkDocument(chunk: CodeChunk, relativePath: string, language: string): DocumentRecord {
        return {
            id: `codebase:${relativePath}:chunk:${chunk.startLine}:${chunk.endLine}`,
            content: chunk.content,
            metadata: {
                source: 'codebase',
                relativePath,
                language,
                type: 'chunk',
                startLine: chunk.startLine,
                endLine: chunk.endLine
            },
            timestamp: Date.now()
        };
    }
}

