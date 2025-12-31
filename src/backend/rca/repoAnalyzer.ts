import * as vscode from 'vscode';

export interface RepoAnalysisResult {
    relevantFiles: string[];
    errorLocation?: { file: string; line?: number; column?: number };
    errorContext?: string;
    stackTrace?: string[];
    configFiles: string[];
    dependencies: any;
    fileContents?: Map<string, string>;
}

export class RepoAnalyzer {
    async analyzeForRCA(errorMessage: string, workspaceUri?: vscode.Uri): Promise<RepoAnalysisResult> {
        const analysis: RepoAnalysisResult = {
            relevantFiles: [],
            configFiles: [],
            dependencies: {},
            fileContents: new Map()
        };

        if (!workspaceUri) {
            workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        }

        if (!workspaceUri) {
            return analysis;
        }

        try {
            // Extract file/line from error message (various formats)
            // Format 1: file.ts:123:45
            let fileMatch = errorMessage.match(/([^\s:]+\.(ts|js|tsx|jsx|py|java|go|rs|rb|php|cs)):(\d+)(?::(\d+))?/);
            // Format 2: at file.ts:123
            if (!fileMatch) {
                fileMatch = errorMessage.match(/at\s+([^\s:]+\.(ts|js|tsx|jsx|py|java|go|rs|rb|php|cs)):(\d+)/);
            }
            // Format 3: File "file.py", line 123
            if (!fileMatch) {
                fileMatch = errorMessage.match(/File\s+["']([^"']+)["'],\s+line\s+(\d+)/);
            }

            if (fileMatch) {
                const fileName = fileMatch[1];
                const lineNum = parseInt(fileMatch[3] || fileMatch[2]);
                const columnNum = fileMatch[4] ? parseInt(fileMatch[4]) : undefined;

                analysis.errorLocation = {
                    file: fileName,
                    line: lineNum,
                    column: columnNum
                };
                analysis.relevantFiles.push(fileName);

                // Try to read the file and get context around error line
                try {
                    const filePath = vscode.Uri.joinPath(workspaceUri, fileName);
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const lines = Buffer.from(content).toString().split('\n');
                    
                    // Get context around error line (10 lines before/after)
                    if (lineNum && lineNum > 0 && lineNum <= lines.length) {
                        const start = Math.max(0, lineNum - 11);
                        const end = Math.min(lines.length, lineNum + 10);
                        analysis.errorContext = lines.slice(start, end)
                            .map((line, idx) => {
                                const actualLine = start + idx + 1;
                                const marker = actualLine === lineNum ? '>>>' : '   ';
                                return `${marker} ${actualLine}: ${line}`;
                            })
                            .join('\n');
                        
                        analysis.fileContents?.set(fileName, lines.join('\n'));
                    }
                } catch (err) {
                    // File not found or not readable, continue
                }
            }

            // Extract stack trace lines
            const stackLines = errorMessage.split('\n').filter(line => {
                const trimmed = line.trim();
                return (
                    trimmed.startsWith('at ') ||
                    trimmed.includes('File:') ||
                    /\.(ts|js|tsx|jsx|py|java|go|rs|rb|php|cs):\d+/.test(trimmed) ||
                    trimmed.startsWith('Traceback')
                );
            });
            if (stackLines.length > 0) {
                analysis.stackTrace = stackLines;
            }

            // Read configuration files
            const configFiles = [
                'package.json',
                'package-lock.json',
                'requirements.txt',
                'Cargo.toml',
                'pom.xml',
                'go.mod',
                'tsconfig.json',
                'jsconfig.json',
                '.env',
                '.env.local'
            ];

            for (const configFile of configFiles) {
                try {
                    const configPath = vscode.Uri.joinPath(workspaceUri, configFile);
                    const content = await vscode.workspace.fs.readFile(configPath);
                    const contentStr = Buffer.from(content).toString();
                    
                    analysis.configFiles.push(configFile);
                    
                    if (configFile === 'package.json') {
                        try {
                            analysis.dependencies = JSON.parse(contentStr);
                        } catch {
                            // Invalid JSON, skip
                        }
                    } else if (configFile === 'tsconfig.json' || configFile === 'jsconfig.json') {
                        try {
                            const config = JSON.parse(contentStr);
                            analysis.dependencies[configFile] = config;
                        } catch {
                            // Invalid JSON, skip
                        }
                    }
                } catch {
                    // File doesn't exist, skip
                }
            }

            // Extract additional file references from error message
            const fileRefs = errorMessage.match(/([^\s:]+\.(ts|js|tsx|jsx|py|java|go|rs|rb|php|cs))/g);
            if (fileRefs) {
                const uniqueFiles = [...new Set(fileRefs)];
                uniqueFiles.forEach(file => {
                    if (!analysis.relevantFiles.includes(file)) {
                        analysis.relevantFiles.push(file);
                    }
                });
            }

        } catch (err) {
            // Analysis failed, return partial results
        }

        return analysis;
    }
}

