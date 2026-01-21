import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OutputChannel } from '../../utils/outputChannel';

export interface StructureAnalysis {
    fileTree: FileTreeNode[];
    entryPoints: string[];
    moduleStructure: ModuleInfo[];
}

export interface FileTreeNode {
    path: string;
    name: string;
    type: 'file' | 'directory';
    children?: FileTreeNode[];
}

export interface ModuleInfo {
    path: string;
    exports: string[];
    imports: string[];
}

export interface DependencyAnalysis {
    externalPackages: string[];
    internalDependencies: DependencyGraph;
    circularDependencies: string[][];
}

export interface DependencyGraph {
    [file: string]: string[];
}

export interface ArchitectureAnalysis {
    mainComponents: ComponentInfo[];
    layers: LayerInfo[];
    designPatterns: string[];
    architectureStyle: string;
}

export interface ComponentInfo {
    name: string;
    type: string;
    files: string[];
    dependencies: string[];
}

export interface LayerInfo {
    name: string;
    files: string[];
    responsibilities: string[];
}

export interface ComplexityAnalysis {
    fileComplexity: FileComplexity[];
    functionComplexity: FunctionComplexity[];
    maintainabilityScores: MaintainabilityScore[];
}

export interface FileComplexity {
    file: string;
    linesOfCode: number;
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
}

export interface FunctionComplexity {
    file: string;
    function: string;
    cyclomaticComplexity: number;
    linesOfCode: number;
}

export interface MaintainabilityScore {
    file: string;
    score: number;
    factors: string[];
}

export interface PatternAnalysis {
    commonPatterns: PatternInfo[];
    antiPatterns: AntiPatternInfo[];
    codeSmells: CodeSmellInfo[];
}

export interface PatternInfo {
    name: string;
    occurrences: number;
    files: string[];
}

export interface AntiPatternInfo {
    name: string;
    severity: 'low' | 'medium' | 'high';
    files: string[];
    description: string;
}

export interface CodeSmellInfo {
    type: string;
    file: string;
    line?: number;
    description: string;
}

export interface RelationshipAnalysis {
    importGraph: ImportGraph;
    callGraph: CallGraph;
    inheritanceHierarchy: InheritanceNode[];
}

export interface ImportGraph {
    [file: string]: string[];
}

export interface CallGraph {
    [function: string]: string[];
}

export interface InheritanceNode {
    name: string;
    extends?: string;
    implements?: string[];
    children: string[];
}

export interface CodebaseAnalysis {
    structure: StructureAnalysis;
    dependencies: DependencyAnalysis;
    architecture: ArchitectureAnalysis;
    complexity: ComplexityAnalysis;
    patterns: PatternAnalysis;
    relationships: RelationshipAnalysis;
    timestamp: number;
}

export class CodebaseAnalyzer {
    private outputChannel: OutputChannel;

    constructor(outputChannel: OutputChannel) {
        this.outputChannel = outputChannel;
    }

    async analyzeEntireCodebase(workspaceUri: vscode.Uri): Promise<CodebaseAnalysis> {
        this.outputChannel.logInfo('[Codebase Analyzer] Starting comprehensive codebase analysis...');

        try {
            const [structure, dependencies, architecture, complexity, patterns, relationships] = await Promise.all([
                this.analyzeStructure(workspaceUri),
                this.analyzeDependencies(workspaceUri),
                this.analyzeArchitecture(workspaceUri),
                this.analyzeComplexity(workspaceUri),
                this.analyzePatterns(workspaceUri),
                this.analyzeRelationships(workspaceUri)
            ]);

            this.outputChannel.logInfo('[Codebase Analyzer] Comprehensive analysis complete');

            return {
                structure,
                dependencies,
                architecture,
                complexity,
                patterns,
                relationships,
                timestamp: Date.now()
            };
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Analyzer] Analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeStructure(workspaceUri: vscode.Uri): Promise<StructureAnalysis> {
        const fileTree: FileTreeNode[] = [];
        const entryPoints: string[] = [];
        const moduleStructure: ModuleInfo[] = [];

        try {
            // Find entry points (main files, index files, etc.)
            const entryPointPatterns = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', '__main__.py', 'main.py'];
            for (const pattern of entryPointPatterns) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(workspaceUri, `**/${pattern}`),
                    '{**/node_modules/**,**/dist/**,**/out/**}'
                );
                entryPoints.push(...files.map(f => vscode.workspace.asRelativePath(f)));
            }

            // Build file tree (simplified - top level only)
            const rootFiles = await vscode.workspace.fs.readDirectory(workspaceUri);
            for (const [name, type] of rootFiles) {
                if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'out') {
                    continue;
                }
                
                if (type === vscode.FileType.Directory) {
                    fileTree.push({
                        path: name,
                        name,
                        type: 'directory',
                        children: []
                    });
                } else if (type === vscode.FileType.File) {
                    fileTree.push({
                        path: name,
                        name,
                        type: 'file'
                    });
                }
            }

            this.outputChannel.logInfo(`[Codebase Analyzer] Structure analysis: ${fileTree.length} top-level items, ${entryPoints.length} entry points`);

            return { fileTree, entryPoints, moduleStructure };
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Analyzer] Structure analysis failed: ${error.message}`);
            return { fileTree, entryPoints, moduleStructure };
        }
    }

    async analyzeDependencies(workspaceUri: vscode.Uri): Promise<DependencyAnalysis> {
        const externalPackages: string[] = [];
        const internalDependencies: DependencyGraph = {};
        const circularDependencies: string[][] = [];

        try {
            // Read package.json
            const packageJsonUri = vscode.Uri.joinPath(workspaceUri, 'package.json');
            try {
                const packageJsonContent = await fs.promises.readFile(packageJsonUri.fsPath, 'utf8');
                const packageJson = JSON.parse(packageJsonContent);
                externalPackages.push(...Object.keys(packageJson.dependencies || {}));
                externalPackages.push(...Object.keys(packageJson.devDependencies || {}));
            } catch {
                // package.json not found or invalid
            }

            // Read requirements.txt
            const requirementsUri = vscode.Uri.joinPath(workspaceUri, 'requirements.txt');
            try {
                const requirementsContent = await fs.promises.readFile(requirementsUri.fsPath, 'utf8');
                const requirements = requirementsContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                externalPackages.push(...requirements);
            } catch {
                // requirements.txt not found
            }

            this.outputChannel.logInfo(`[Codebase Analyzer] Dependency analysis: ${externalPackages.length} external packages`);

            return { externalPackages, internalDependencies, circularDependencies };
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Analyzer] Dependency analysis failed: ${error.message}`);
            return { externalPackages, internalDependencies, circularDependencies };
        }
    }

    async analyzeArchitecture(workspaceUri: vscode.Uri): Promise<ArchitectureAnalysis> {
        const mainComponents: ComponentInfo[] = [];
        const layers: LayerInfo[] = [];
        const designPatterns: string[] = [];
        let architectureStyle = 'unknown';

        try {
            // Identify common architecture patterns
            const srcUri = vscode.Uri.joinPath(workspaceUri, 'src');
            try {
                const srcStat = await vscode.workspace.fs.stat(srcUri);
                if (srcStat.type === vscode.FileType.Directory) {
                    const srcDirs = await vscode.workspace.fs.readDirectory(srcUri);
                    
                    // Check for common layer patterns
                    const layerNames = ['controllers', 'services', 'models', 'views', 'utils', 'middleware', 'routes'];
                    for (const [name, type] of srcDirs) {
                        if (type === vscode.FileType.Directory && layerNames.includes(name.toLowerCase())) {
                            layers.push({
                                name,
                                files: [],
                                responsibilities: []
                            });
                        }
                    }
                    
                    if (layers.length > 0) {
                        architectureStyle = 'layered';
                    }
                }
            } catch {
                // src directory not found
            }

            this.outputChannel.logInfo(`[Codebase Analyzer] Architecture analysis: ${layers.length} layers identified`);

            return { mainComponents, layers, designPatterns, architectureStyle };
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Analyzer] Architecture analysis failed: ${error.message}`);
            return { mainComponents, layers, designPatterns, architectureStyle };
        }
    }

    async analyzeComplexity(workspaceUri: vscode.Uri): Promise<ComplexityAnalysis> {
        const fileComplexity: FileComplexity[] = [];
        const functionComplexity: FunctionComplexity[] = [];
        const maintainabilityScores: MaintainabilityScore[] = [];

        try {
            // Analyze a sample of files for complexity
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceUri, '**/*.{ts,js}'),
                '{**/node_modules/**,**/dist/**,**/out/**}'
            );

            const sampleFiles = files.slice(0, 50); // Limit to 50 files for performance

            for (const uri of sampleFiles) {
                try {
                    const content = await fs.promises.readFile(uri.fsPath, 'utf8');
                    const lines = content.split('\n');
                    const linesOfCode = lines.filter(line => line.trim().length > 0 && !line.trim().startsWith('//')).length;
                    
                    // Simple cyclomatic complexity estimation
                    const cyclomaticComplexity = this.estimateCyclomaticComplexity(content);
                    
                    fileComplexity.push({
                        file: vscode.workspace.asRelativePath(uri),
                        linesOfCode,
                        cyclomaticComplexity,
                        cognitiveComplexity: cyclomaticComplexity * 1.2 // Rough estimate
                    });
                } catch {
                    // Skip files that can't be read
                }
            }

            this.outputChannel.logInfo(`[Codebase Analyzer] Complexity analysis: ${fileComplexity.length} files analyzed`);

            return { fileComplexity, functionComplexity, maintainabilityScores };
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Analyzer] Complexity analysis failed: ${error.message}`);
            return { fileComplexity, functionComplexity, maintainabilityScores };
        }
    }

    private estimateCyclomaticComplexity(content: string): number {
        let complexity = 1; // Base complexity
        
        // Count decision points
        const decisionPatterns = [
            /\bif\s*\(/g,
            /\belse\s+if\s*\(/g,
            /\bswitch\s*\(/g,
            /\bcase\s+/g,
            /\bwhile\s*\(/g,
            /\bfor\s*\(/g,
            /\bcatch\s*\(/g,
            /\?\s*[^:]+:/g, // Ternary operators
            /\|\||&&/g // Logical operators
        ];
        
        decisionPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        });
        
        return complexity;
    }

    async analyzePatterns(workspaceUri: vscode.Uri): Promise<PatternAnalysis> {
        const commonPatterns: PatternInfo[] = [];
        const antiPatterns: AntiPatternInfo[] = [];
        const codeSmells: CodeSmellInfo[] = [];

        try {
            // Basic pattern detection
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceUri, '**/*.{ts,js}'),
                '{**/node_modules/**,**/dist/**,**/out/**}'
            );

            const sampleFiles = files.slice(0, 30);

            for (const uri of sampleFiles) {
                try {
                    const content = await fs.promises.readFile(uri.fsPath, 'utf8');
                    
                    // Detect singleton pattern
                    if (/private\s+static\s+\w+\s*:\s*\w+\s*=\s*new\s+\w+\(\)/i.test(content)) {
                        commonPatterns.push({
                            name: 'Singleton',
                            occurrences: 1,
                            files: [vscode.workspace.asRelativePath(uri)]
                        });
                    }
                    
                    // Detect factory pattern
                    if (/create\w+\(|factory/i.test(content)) {
                        commonPatterns.push({
                            name: 'Factory',
                            occurrences: 1,
                            files: [vscode.workspace.asRelativePath(uri)]
                        });
                    }
                } catch {
                    // Skip files that can't be read
                }
            }

            this.outputChannel.logInfo(`[Codebase Analyzer] Pattern analysis: ${commonPatterns.length} patterns detected`);

            return { commonPatterns, antiPatterns, codeSmells };
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Analyzer] Pattern analysis failed: ${error.message}`);
            return { commonPatterns, antiPatterns, codeSmells };
        }
    }

    async analyzeRelationships(workspaceUri: vscode.Uri): Promise<RelationshipAnalysis> {
        const importGraph: ImportGraph = {};
        const callGraph: CallGraph = {};
        const inheritanceHierarchy: InheritanceNode[] = [];

        try {
            // Analyze import relationships
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceUri, '**/*.{ts,js}'),
                '{**/node_modules/**,**/dist/**,**/out/**}'
            );

            const sampleFiles = files.slice(0, 50);

            for (const uri of sampleFiles) {
                try {
                    const content = await fs.promises.readFile(uri.fsPath, 'utf8');
                    const relativePath = vscode.workspace.asRelativePath(uri);
                    const imports: string[] = [];
                    
                    // Extract imports
                    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
                    let match;
                    while ((match = importRegex.exec(content)) !== null) {
                        imports.push(match[1]);
                    }
                    
                    if (imports.length > 0) {
                        importGraph[relativePath] = imports;
                    }
                } catch {
                    // Skip files that can't be read
                }
            }

            this.outputChannel.logInfo(`[Codebase Analyzer] Relationship analysis: ${Object.keys(importGraph).length} files with imports`);

            return { importGraph, callGraph, inheritanceHierarchy };
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase Analyzer] Relationship analysis failed: ${error.message}`);
            return { importGraph, callGraph, inheritanceHierarchy };
        }
    }
}

