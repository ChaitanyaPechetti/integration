// JSON quick validation
function validateJsonDoc(doc: vscode.TextDocument): vscode.Diagnostic[] {
    const diags: vscode.Diagnostic[] = [];
    try {
        JSON.parse(doc.getText());
    } catch (err: any) {
        const message = err.message || 'Invalid JSON';
        const range = new vscode.Range(0, 0, 0, 1);
        diags.push(new vscode.Diagnostic(range, `JSON Parse Error: ${message}`, vscode.DiagnosticSeverity.Error));
    }
    return diags;
}

// Python quick validation using py_compile
async function validatePythonDoc(doc: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const diags: vscode.Diagnostic[] = [];
    const py = process.env.PYTHON || 'python';
    const tmpFile = path.join(os.tmpdir(), `rag_pycheck_${Date.now()}.py`);
    try {
        fs.writeFileSync(tmpFile, doc.getText(), 'utf8');
        await new Promise<void>((resolve) => {
            execFile(py, ['-m', 'py_compile', tmpFile], (err, _stdout, stderr) => {
                if (err) {
                    const msg = (stderr || err.message || 'Python syntax error').trim();
                    const range = new vscode.Range(0, 0, 0, 1);
                    diags.push(new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error));
                }
                resolve();
            });
        });
    } catch (err: any) {
        const message = err.message || 'Python validation failed';
        const range = new vscode.Range(0, 0, 0, 1);
        diags.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error));
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
    return diags;
}
import * as vscode from 'vscode';
import { RAGPanel } from './webview/ragPanel';
import { CacheManager } from './utils/cacheManager';
import { OutputChannel } from './utils/outputChannel';
import { FileLogger } from './utils/fileLogger';
import { ServerManager } from './services/serverManager';
import { RepoAnalyzer } from './services/repoAnalyzer';
import { ErrorDetector } from './backend/rca/errorDetector';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';

let ragPanel: RAGPanel | undefined;
let statusBarItem: vscode.StatusBarItem;
let cacheManager: CacheManager;
let outputChannel: OutputChannel;
let fileLogger: FileLogger | undefined;
let zerouiOutputChannel: vscode.OutputChannel | undefined;
let diagnostics: vscode.DiagnosticCollection | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let updateStatusBarFn: ((state: 'ready' | 'processing' | 'error') => void) | undefined;
let validationDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
let lastValidationTime: Map<string, number> = new Map();
let lastLintUpdate: Map<string, { errors: number; warnings: number; issueHashes: string[]; timestamp: number }> = new Map();
let lastRepoAnalysis: number = 0;
const CODEBASE_ANALYSIS_MAX_FILES = 300;
const CODEBASE_ANALYSIS_MAX_SIZE_BYTES = 1_000_000; // 1 MB safety cap
const VALIDATION_DEBOUNCE_MS = 500;
const VALIDATION_THROTTLE_MS = 200;
const LINT_UPDATE_DEDUP_MS = 2000; // Don't send duplicate lint updates within 2 seconds
const REPO_ANALYSIS_DEBOUNCE_MS = 2000;
const REPO_ANALYSIS_THROTTLE_MS = 10000;

export function activate(context: vscode.ExtensionContext) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c47a3d23-afbb-4cc7-9310-d8092e7a1878',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'extension.ts:73',message:'activate function entry',data:{workspaceFolders:vscode.workspace.workspaceFolders?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.log('RAG Agent extension is now active');

    // Store extension context for use in other functions
    extensionContext = context;

    // Initialize utilities
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c47a3d23-afbb-4cc7-9310-d8092e7a1878',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'extension.ts:80',message:'before initializing utilities',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    cacheManager = new CacheManager(context);
    outputChannel = new OutputChannel();
    diagnostics = vscode.languages.createDiagnosticCollection('ragAgentLint');
    context.subscriptions.push(diagnostics);

    // Initialize file logger for automatic terminal error logging
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        fileLogger = new FileLogger(workspaceFolder);
        context.subscriptions.push({
            dispose: () => fileLogger?.dispose()
        });
    }

    // Initialize Zeroui AI Agent components (optional)
    const zerouiConfig = vscode.workspace.getConfiguration('ragAgent');
    const autoStartServers = zerouiConfig.get<boolean>('zerouiAutoStartServers', false);
    
    if (autoStartServers) {
        zerouiOutputChannel = vscode.window.createOutputChannel('Zeroui AI Agent Servers');
        context.subscriptions.push(zerouiOutputChannel);
        
        ServerManager.initialize(zerouiOutputChannel);
        
        // Auto-start Zeroui servers in background (non-blocking)
        void ServerManager.startServers(context).then(() => {
            console.log('Zeroui server auto-start process completed');
            zerouiOutputChannel?.appendLine('=== Zeroui server startup process finished ===');
        }).catch((error) => {
            console.error('Error auto-starting Zeroui servers:', error);
            zerouiOutputChannel?.appendLine(`Error auto-starting servers: ${error.message}`);
        });
    }

    // Create status bar item
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c47a3d23-afbb-4cc7-9310-d8092e7a1878',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'extension.ts:105',message:'before creating status bar item',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'rag.openPanel';
    statusBarItem.text = '$(database) RAG: Ready';
    statusBarItem.tooltip = 'Zeroui Ai Agent - Click to open';
    statusBarItem.show();
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c47a3d23-afbb-4cc7-9310-d8092e7a1878',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'extension.ts:110',message:'after showing status bar item',data:{statusBarItemText:statusBarItem.text},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    context.subscriptions.push(statusBarItem);

    // Update status bar function
    function updateStatusBar(state: 'ready' | 'processing' | 'error') {
        switch (state) {
            case 'ready':
                statusBarItem.text = '$(database) RAG: Ready';
                statusBarItem.backgroundColor = undefined;
                break;
            case 'processing':
                statusBarItem.text = '$(sync~spin) RAG: Processing...';
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
                break;
            case 'error':
                statusBarItem.text = '$(error) RAG: Error';
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }
    }
    
    // Store updateStatusBar function for use in other functions
    updateStatusBarFn = updateStatusBar;

    // Register commands
    const openPanelCommand = vscode.commands.registerCommand('rag.openPanel', () => {
        RAGPanel.createOrShow(context.extensionUri, cacheManager, outputChannel, updateStatusBar);
        ragPanel = RAGPanel.getCurrentPanel();
    });

    const closePanelCommand = vscode.commands.registerCommand('rag.closePanel', () => {
        const panel = RAGPanel.getCurrentPanel();
        if (panel) {
            panel.dispose();
            ragPanel = undefined;
        }
    });

    const clearCacheCommand = vscode.commands.registerCommand('rag.clearCache', () => {
        cacheManager.clear();
        outputChannel.logInfo('Cache cleared');
        if (ragPanel) {
            ragPanel.sendMessage({ type: 'cacheCleared' });
        }
        vscode.window.showInformationMessage('Cache cleared successfully');
    });

    const refreshCacheStatsCommand = vscode.commands.registerCommand('rag.refreshCacheStats', () => {
        if (ragPanel) {
            const stats = cacheManager.getStats();
            ragPanel.sendMessage({ type: 'cacheStatsUpdate', stats });
        }
    });

    const showStatusCommand = vscode.commands.registerCommand('rag.showStatus', () => {
        const stats = cacheManager.getStats();
        vscode.window.showInformationMessage(
            `RAG Agent Status: Ready\nCache: ${stats.size}/${stats.maxSize} entries\nHit Rate: ${stats.hitRate}%`
        );
    });

    const showOutputCommand = vscode.commands.registerCommand('rag.showOutput', () => {
        outputChannel.show();
    });

    const showProblemsCommand = vscode.commands.registerCommand('rag.showProblems', () => {
        vscode.commands.executeCommand('workbench.actions.view.problems');
    });

    const analyzeCodebaseCommand = vscode.commands.registerCommand('rag.analyzeCodebase', async () => {
        try {
            const panel = RAGPanel.getCurrentPanel();
            if (!panel) {
                RAGPanel.createOrShow(context.extensionUri, cacheManager, outputChannel, updateStatusBar);
            }
            await runCodebaseAnalysis();
        } catch (err: any) {
            outputChannel.logError(`[Codebase Analysis] Failed: ${err.message || err}`);
            vscode.window.showErrorMessage(`Codebase analysis failed: ${err.message || err}`);
        }
    });

    const openSettingsCommand = vscode.commands.registerCommand('rag.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:rag-inventory-assistant');
    });

    const showErrorLogCommand = vscode.commands.registerCommand('rag.showErrorLog', () => {
        if (fileLogger) {
            fileLogger.showLogFile();
        } else {
            vscode.window.showErrorMessage('Error logger not initialized. Please reload the window.');
        }
    });

    const clearErrorLogCommand = vscode.commands.registerCommand('rag.clearErrorLog', async () => {
        if (fileLogger) {
            const logPath = fileLogger.getLogFilePath();
            const confirm = await vscode.window.showWarningMessage(
                'Clear all error logs? This action cannot be undone.',
                'Yes', 'No'
            );

            if (confirm === 'Yes') {
                try {
                    const fs = require('fs');
                    const header = `=== TERMINAL ERRORS LOG ===\nCleared: ${new Date().toISOString()}\nWorkspace: ${vscode.workspace.workspaceFolders?.[0]?.name || 'Unknown'}\n\n`;
                    fs.writeFileSync(logPath, header, 'utf8');
                    vscode.window.showInformationMessage('Error log cleared successfully.');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to clear error log: ${error}`);
                }
            }
        } else {
            vscode.window.showErrorMessage('Error logger not initialized. Please reload the window.');
        }
    });

    const indexCodebaseCommand = vscode.commands.registerCommand('rag.indexCodebase', async () => {
        const panel = RAGPanel.getCurrentPanel();
        if (!panel) {
            vscode.window.showWarningMessage('Please open RAG Agent panel first');
            return;
        }
        
        try {
            const result = await panel.triggerComprehensiveIndexing();
            vscode.window.showInformationMessage(
                `Codebase indexed: ${result.indexedDocuments} documents from ${result.indexedFiles} files`
            );
        } catch (err: any) {
            outputChannel.logError(`[Index Codebase] Failed: ${err.message}`);
            vscode.window.showErrorMessage(`Codebase indexing failed: ${err.message}`);
        }
    });

    const analyzeCodebaseComprehensiveCommand = vscode.commands.registerCommand('rag.analyzeCodebaseComprehensive', async () => {
        const panel = RAGPanel.getCurrentPanel();
        if (!panel && extensionContext && updateStatusBarFn) {
            RAGPanel.createOrShow(extensionContext.extensionUri, cacheManager, outputChannel, updateStatusBarFn);
            await new Promise(resolve => setTimeout(resolve, 500));
            const newPanel = RAGPanel.getCurrentPanel();
            if (newPanel) {
                try {
                    await newPanel.triggerComprehensiveAnalysis();
                } catch (err: any) {
                    outputChannel.logError(`[Comprehensive Analysis] Failed: ${err.message}`);
                    vscode.window.showErrorMessage(`Analysis failed: ${err.message}`);
                }
            }
        } else if (panel) {
            try {
                await panel.triggerComprehensiveAnalysis();
            } catch (err: any) {
                outputChannel.logError(`[Comprehensive Analysis] Failed: ${err.message}`);
                vscode.window.showErrorMessage(`Analysis failed: ${err.message}`);
            }
        }
    });

    context.subscriptions.push(
        openPanelCommand,
        closePanelCommand,
        clearCacheCommand,
        refreshCacheStatsCommand,
        showStatusCommand,
        showOutputCommand,
        showProblemsCommand,
        analyzeCodebaseCommand,
        openSettingsCommand,
        showErrorLogCommand,
        clearErrorLogCommand,
        indexCodebaseCommand,
        analyzeCodebaseComprehensiveCommand
    );

    // Continuous error monitoring setup
    setupContinuousErrorMonitoring(context);

    // Repo analysis temporarily disabled

    outputChannel.logInfo('RAG Agent extension activated');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c47a3d23-afbb-4cc7-9310-d8092e7a1878',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'extension.ts:213',message:'activate function exit - extension fully activated',data:{statusBarItemCreated:!!statusBarItem},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
}

function setupContinuousErrorMonitoring(context: vscode.ExtensionContext) {
    if (!diagnostics) return;

    // Watch for file saves (immediate validation on save)
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            outputChannel.logInfo(`[RAG Monitor] File saved: ${doc.fileName}`);
            validateDocImmediate(doc);
        })
    );

    // Watch for file opens
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            validateDocDebounced(doc);
        })
    );

    // Watch for file changes (with debouncing)
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            validateDocDebounced(e.document);
        })
    );

    // Watch for workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            outputChannel.logInfo('[RAG Monitor] Workspace folders changed - revalidating all open files');
            vscode.workspace.textDocuments.forEach(doc => validateDocDebounced(doc));
        })
    );

    // Watch for file system changes (file creation, deletion, rename)
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const pattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders[0],
            '**/*.{ts,js,tsx,jsx,json}'
        );
        fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        
        fileWatcher.onDidCreate(uri => {
            outputChannel.logInfo(`[RAG Monitor] File created: ${uri.fsPath}`);
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            if (doc) validateDocDebounced(doc);
        });
        
        fileWatcher.onDidDelete(uri => {
            outputChannel.logInfo(`[RAG Monitor] File deleted: ${uri.fsPath}`);
            if (diagnostics) diagnostics.delete(uri);
        });
        
        fileWatcher.onDidChange(uri => {
            outputChannel.logInfo(`[RAG Monitor] File changed: ${uri.fsPath}`);
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            if (doc) validateDocDebounced(doc);
        });
        
        context.subscriptions.push(fileWatcher);
    }

    // Initial validation for all open documents
    vscode.workspace.textDocuments.forEach(doc => validateDocDebounced(doc));
}

function setupRepoAnalysis(context: vscode.ExtensionContext) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return;
    const workspaceUri = vscode.workspace.workspaceFolders[0].uri;
    const repoAnalyzer = new RepoAnalyzer(outputChannel);
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,js,tsx,jsx,json,md,py,java,go,rs,rb,php,cs,cpp,c,h,hpp}');
    context.subscriptions.push(watcher);

    let debounceTimer: NodeJS.Timeout | undefined;

    const triggerAnalysis = () => {
        const now = Date.now();
        if (now - lastRepoAnalysis < REPO_ANALYSIS_THROTTLE_MS) return; // throttle
        lastRepoAnalysis = now;
        void (async () => {
            try {
                const summary = await repoAnalyzer.analyzeWorkspace(workspaceUri);
                const panel = RAGPanel.getCurrentPanel();
                if (panel) {
                    panel.sendMessage({
                        type: 'repoAnalysis',
                        summary,
                        timestamp: summary.timestamp
                    });
                }
            } catch (err: any) {
                outputChannel.logError(`[RepoAnalysis] Failed: ${err.message || err}`);
            }
        })();
    };

    const schedule = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            triggerAnalysis();
        }, REPO_ANALYSIS_DEBOUNCE_MS);
    };

    watcher.onDidCreate(schedule);
    watcher.onDidChange(schedule);
    watcher.onDidDelete(schedule);

    // initial run
    schedule();
}

// Helper function to check if a file should be excluded from validation
function isExcludedFile(filePath: string): boolean {
    if (!filePath) return false;
    
    // Normalize path separators for cross-platform compatibility
    // Handle both Windows (C:\...) and Unix (/...) paths
    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
    
    const excludedPatterns = [
        '/node_modules/',
        '\\node_modules\\',  // Windows backslash variant
        '/dist/',
        '/out/',
        '/build/',
        '/coverage/',
        '/.git/',
        '/.venv/',
        '/__pycache__/',
        '.min.js',
        '.bundle.js'
    ];
    
    const isExcluded = excludedPatterns.some(pattern => {
        if (pattern.startsWith('/') || pattern.startsWith('\\')) {
            // Directory pattern - check if it appears as a path segment
            // Use word boundaries or path separators to avoid false positives
            const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`[/\\\\]${escapedPattern.substring(1)}`, 'i');
            return regex.test(filePath);
        } else {
            // File extension pattern
            return normalizedPath.endsWith(pattern);
        }
    });
    
    // Additional check: if path contains node_modules anywhere, exclude it
    if (!isExcluded && (normalizedPath.includes('node_modules') || filePath.includes('node_modules'))) {
        return true;
    }
    
    return isExcluded;
}

function validateDocDebounced(doc: vscode.TextDocument) {
    if (!diagnostics) return;
    
    // Early exit: Skip files in excluded directories BEFORE any processing
    if (isExcludedFile(doc.uri.fsPath)) {
        return;
    }
    
    // Skip unsupported files
    if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'json', 'python'].includes(doc.languageId)) {
        return;
    }

    const docKey = doc.uri.toString();
    
    // Clear existing timer for this document
    const existingTimer = validationDebounceTimers.get(docKey);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
        validateDocImmediate(doc);
        validationDebounceTimers.delete(docKey);
    }, VALIDATION_DEBOUNCE_MS);
    
    validationDebounceTimers.set(docKey, timer);
}

function validateDocImmediate(doc: vscode.TextDocument) {
    if (!diagnostics) return;
    
    // Early exit: Skip files in excluded directories BEFORE any processing
    if (isExcludedFile(doc.uri.fsPath)) {
        diagnostics.set(doc.uri, []);
        return;
    }
    
    // Skip unsupported files
    if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'json', 'python'].includes(doc.languageId)) {
        diagnostics.set(doc.uri, []);
        return;
    }

    const docKey = doc.uri.toString();
    const now = Date.now();
    const lastTime = lastValidationTime.get(docKey) || 0;
    
    // Throttle: don't validate same file more than once per throttle period
    if (now - lastTime < VALIDATION_THROTTLE_MS) {
        return;
    }
    lastValidationTime.set(docKey, now);

    // Use existing validateDoc logic
    void validateDoc(doc);
}

export function deactivate() {
    // Clear all debounce timers
    validationDebounceTimers.forEach(timer => clearTimeout(timer));
    validationDebounceTimers.clear();
    lastValidationTime.clear();
    lastLintUpdate.clear();
    
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    
    if (diagnostics) {
        diagnostics.dispose();
    }
    
    if (ragPanel) {
        ragPanel.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    outputChannel.dispose();
    
    // Stop Zeroui servers if they were started
    const zerouiConfig = vscode.workspace.getConfiguration('ragAgent');
    const autoStartServers = zerouiConfig.get<boolean>('zerouiAutoStartServers', false);
    if (autoStartServers) {
        ServerManager.stopServers();
    }
    
    if (zerouiOutputChannel) {
        zerouiOutputChannel.dispose();
    }
}

// Lightweight, per-file validation to surface errors in real time
async function validateDoc(doc: vscode.TextDocument) {
    if (!diagnostics) return;
    
    // Skip files in excluded directories (node_modules, dist, out, etc.)
    if (isExcludedFile(doc.uri.fsPath)) {
        diagnostics.set(doc.uri, []);
        return;
    }
    
    // Limit to supported languages
    if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'json', 'python'].includes(doc.languageId)) {
        diagnostics.set(doc.uri, []);
        return;
    }
    
    // Skip very large files (over 500KB) to avoid performance issues and TypeScript assertion failures
    const fileSize = doc.getText().length;
    if (fileSize > 500_000) { // 500KB limit
        outputChannel.logInfo(`[RAG Monitor] Skipped large file: ${doc.fileName} (${Math.round(fileSize / 1024)}KB)`);
        diagnostics.set(doc.uri, []);
        return;
    }
    
    try {
        // JSON quick check
        if (doc.languageId === 'json') {
            const jsonDiags = validateJsonDoc(doc);
            diagnostics.set(doc.uri, jsonDiags);
            const panel = RAGPanel.getCurrentPanel();
            if (panel) {
                panel.sendMessage({
                    type: 'lintUpdate',
                    file: doc.fileName,
                    errors: jsonDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length,
                    warnings: jsonDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length,
                    issues: jsonDiags.map(d => ({
                        message: d.message,
                        severity: d.severity,
                        range: {
                            start: { line: d.range.start.line, character: d.range.start.character },
                            end: { line: d.range.end.line, character: d.range.end.character }
                        }
                    })),
                    timestamp: Date.now()
                });
            }
            return;
        }

        // Python quick check
        if (doc.languageId === 'python') {
            const pyDiags = await validatePythonDoc(doc);
            diagnostics.set(doc.uri, pyDiags);
            const panel = RAGPanel.getCurrentPanel();
            if (panel) {
                panel.sendMessage({
                    type: 'lintUpdate',
                    file: doc.fileName,
                    errors: pyDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length,
                    warnings: pyDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length,
                    issues: pyDiags.map(d => ({
                        message: d.message,
                        severity: d.severity,
                        range: {
                            start: { line: d.range.start.line, character: d.range.start.character },
                            end: { line: d.range.end.line, character: d.range.end.character }
                        }
                    })),
                    timestamp: Date.now()
                });
            }
            return;
        }

        // Use TypeScript transpile diagnostics on current text (TS/JS)
        const ts = require('typescript') as typeof import('typescript');
        const sourceText = doc.getText();
        
        // Create source file once for position mapping (reused for all diagnostics)
        let sourceFile: import('typescript').SourceFile | undefined;
        const getSourceFile = () => {
            if (!sourceFile) {
                try {
                    sourceFile = ts.createSourceFile(doc.fileName, sourceText, ts.ScriptTarget.Latest, true);
                } catch (err: any) {
                    outputChannel.logError(`[RAG Monitor] Failed to create source file for ${doc.fileName}: ${err.message || err}`);
                    return undefined;
                }
            }
            return sourceFile;
        };
        
        let res: import('typescript').TranspileOutput;
        try {
            res = ts.transpileModule(sourceText, {
                compilerOptions: {
                    noEmit: true,
                    allowJs: true,
                    checkJs: true,
                    strict: false, // Changed from true to false to avoid assertion failures on complex files
                    jsx: ts.JsxEmit.React
                },
                reportDiagnostics: true,
                fileName: doc.fileName
            });
        } catch (err: any) {
            // If transpileModule fails (e.g., hits TypeScript internal assertions), log and skip
            outputChannel.logWarning(`[RAG Monitor] TypeScript transpilation failed for ${doc.fileName}: ${err.message || err}`);
            diagnostics.set(doc.uri, []);
            return;
        }
        
        const diags: vscode.Diagnostic[] = [];
        (res.diagnostics || []).forEach(d => {
            if (d.start === undefined) return;
            
            const srcFile = getSourceFile();
            if (!srcFile) return;
            
            try {
                const { line, character } = ts.getLineAndCharacterOfPosition(srcFile, d.start);
                const range = new vscode.Range(line, character, line, character + 1);
                const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
                const severity = d.category === ts.DiagnosticCategory.Error
                    ? vscode.DiagnosticSeverity.Error
                    : d.category === ts.DiagnosticCategory.Warning
                    ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information;
                diags.push(new vscode.Diagnostic(range, message, severity));
            } catch (err: any) {
                // Skip diagnostics that fail to map positions
                outputChannel.logWarning(`[RAG Monitor] Failed to map diagnostic position in ${doc.fileName}: ${err.message || err}`);
            }
        });
        diagnostics.set(doc.uri, diags);

        const errorCount = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        const warningCount = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;

        if (diags.length) {
            outputChannel.logWarning(`[RAG Monitor] ${doc.fileName}: ${errorCount} error(s), ${warningCount} warning(s) detected`);
            diags.slice(0, 3).forEach(d => outputChannel.logWarning(`- ${d.message}`));
        } else {
            outputChannel.logInfo(`[RAG Monitor] ${doc.fileName}: clean`);
        }

        // Create issue hash for deduplication (hash of error messages and positions)
        const issueHashes = diags.map(d => {
            const pos = `${d.range.start.line}:${d.range.start.character}`;
            return `${d.severity}:${pos}:${d.message.substring(0, 50)}`;
        }).sort();

        // Check if this is a duplicate of the last lint update for this file
        const docKey = doc.uri.toString();
        const lastUpdate = lastLintUpdate.get(docKey);
        const now = Date.now();
        
        const isDuplicate = lastUpdate &&
            lastUpdate.errors === errorCount &&
            lastUpdate.warnings === warningCount &&
            JSON.stringify(lastUpdate.issueHashes) === JSON.stringify(issueHashes);

        // Only send to RAG Panel if not a duplicate
        if (!isDuplicate) {
            // Update last lint update record
            lastLintUpdate.set(docKey, {
                errors: errorCount,
                warnings: warningCount,
                issueHashes: issueHashes,
                timestamp: now
            });

            const panel = RAGPanel.getCurrentPanel();
            if (panel) {
                // Send lint update (existing)
                panel.sendMessage({
                    type: 'lintUpdate',
                    file: doc.fileName,
                    errors: errorCount,
                    warnings: warningCount,
                    issues: diags.map(d => ({
                        message: d.message,
                        severity: d.severity,
                        range: {
                            start: { line: d.range.start.line, character: d.range.start.character },
                            end: { line: d.range.end.line, character: d.range.end.character }
                        }
                    })),
                    timestamp: now
                });

                // Auto-trigger RCA if errors detected (only for actual errors, not warnings)
                if (errorCount > 0) {
                    // Build error message from diagnostics
                    const errorMessages = diags
                        .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
                        .map(d => {
                            const line = d.range.start.line + 1;
                            const char = d.range.start.character + 1;
                            return `${doc.fileName}:${line}:${char} - ${d.message}`;
                        })
                        .join('\n');
                    
                    // Send auto-RCA request
                    panel.sendMessage({
                        type: 'autoRcaRequest',
                        file: doc.fileName,
                        errorMessage: errorMessages,
                        errors: errorCount,
                        issues: diags
                            .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
                            .map(d => ({
                                message: d.message,
                                severity: d.severity,
                                range: {
                                    start: { line: d.range.start.line, character: d.range.start.character },
                                    end: { line: d.range.end.line, character: d.range.end.character }
                                }
                            })),
                        timestamp: now
                    });
                }
            }
        } else {
            // Duplicate lint update skipped (same file, same errors within 2 seconds)
        }
    } catch (err: any) {
        outputChannel.logError(`[RAG Live Check] Failed to validate ${doc.fileName}: ${err.message || err}`);
    }
}

async function runCodebaseAnalysis() {
    if (!diagnostics) return;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('No workspace open for codebase analysis.');
        return;
    }

    let panel = RAGPanel.getCurrentPanel();
    if (!panel && extensionContext && updateStatusBarFn) {
        RAGPanel.createOrShow(extensionContext.extensionUri, cacheManager, outputChannel, updateStatusBarFn);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for panel to initialize
        panel = RAGPanel.getCurrentPanel();
    }

    if (panel) {
        panel.sendMessage({
            type: 'response',
            response: '🔍 Analyzing entire codebase... This may take a few moments.',
            cached: false,
            sources: []
        });
    }

    if (updateStatusBarFn) {
        updateStatusBarFn('processing');
    }
    const startTime = Date.now();

    try {
        const root = folders[0].uri;
        const files = await vscode.workspace.findFiles(
            '**/*.{ts,js,tsx,jsx,json,py}',
            '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/build/**,**/coverage/**,**/.venv/**,**/__pycache__/**,**/*.min.js,**/*.bundle.js}'
        );

        const limitedFiles = files.slice(0, CODEBASE_ANALYSIS_MAX_FILES);
        let totalErrors = 0;
        let totalWarnings = 0;
        let processed = 0;

        // Collect comprehensive error data for codebase-wide RCA
        const allErrors: Array<{
            file: string;
            line: number;
            character: number;
            message: string;
            severity: vscode.DiagnosticSeverity;
            category?: string;
        }> = [];
        const errorsByCategory = new Map<string, number>();
        const errorDetector = new ErrorDetector();

        // Step 1: Scan and validate all files
        outputChannel.logInfo(`[Codebase Analysis] Scanning ${limitedFiles.length} files...`);
        for (const uri of limitedFiles) {
            try {
                const stat = await fs.promises.stat(uri.fsPath);
                if (stat.size > CODEBASE_ANALYSIS_MAX_SIZE_BYTES) {
                    outputChannel.logInfo(`[Codebase Analysis] Skipped large file: ${uri.fsPath}`);
                    continue;
                }

                const doc = await vscode.workspace.openTextDocument(uri);
                await validateDoc(doc); // Reuse existing diagnostics + auto-RCA pipeline
                processed += 1;

                const diags = diagnostics.get(uri) || [];
                const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
                const warnings = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning);
                
                totalErrors += errors.length;
                totalWarnings += warnings.length;

                // Collect error details with categorization
                if (errors.length > 0) {
                    const relativePath = vscode.workspace.asRelativePath(uri);
                    errors.forEach(err => {
                        // Classify error first
                        const detection = errorDetector.detectError(err.message);
                        const errorDetail: {
                            file: string;
                            line: number;
                            character: number;
                            message: string;
                            severity: vscode.DiagnosticSeverity;
                            category?: string;
                        } = {
                            file: relativePath,
                            line: err.range.start.line + 1,
                            character: err.range.start.character + 1,
                            message: err.message,
                            severity: err.severity
                        };
                        
                        if (detection.detected && detection.category) {
                            errorDetail.category = detection.category;
                            errorsByCategory.set(
                                detection.category,
                                (errorsByCategory.get(detection.category) || 0) + 1
                            );
                        }
                        
                        allErrors.push(errorDetail);
                    });
                }
            } catch (err: any) {
                outputChannel.logError(`[Codebase Analysis] Failed to process ${uri.fsPath}: ${err.message || err}`);
            }
        }

        const summary = `[Codebase Analysis] Scanned ${processed} file(s). Found ${totalErrors} error(s) and ${totalWarnings} warning(s).`;
        outputChannel.logInfo(summary);

        // Step 2: Generate comprehensive RCA summary if errors found
        if (totalErrors > 0 && panel) {
            outputChannel.logInfo(`[Codebase Analysis] Generating comprehensive root cause analysis for ${totalErrors} error(s)...`);
            
            // Use RAG pipeline to generate comprehensive RCA
            await panel.generateCodebaseRcaSummary(
                allErrors,
                errorsByCategory,
                processed,
                totalErrors,
                totalWarnings
            );
        } else if (panel) {
            // No errors found - show clean report
            const elapsedMs = Date.now() - startTime;
            panel.sendMessage({
                type: 'response',
                response: `✅ **Codebase Analysis Complete**\n\n` +
                    `📊 **Summary:**\n` +
                    `- Files Scanned: ${processed}\n` +
                    `- Errors: 0\n` +
                    `- Warnings: ${totalWarnings}\n\n` +
                    `🎉 Your codebase is clean! No errors detected.\n\n` +
                    `*Analysis completed in ${elapsedMs}ms*`,
                cached: false,
                sources: []
            });
            if (updateStatusBarFn) {
                updateStatusBarFn('ready');
            }
        }

        vscode.window.showInformationMessage(summary);
    } catch (err: any) {
        outputChannel.logError(`[Codebase Analysis] Failed: ${err.message || err}`);
        vscode.window.showErrorMessage(`Codebase analysis failed: ${err.message || err}`);
        if (updateStatusBarFn) {
            updateStatusBarFn('error');
        }
        
        if (panel) {
            panel.sendMessage({
                type: 'error',
                message: `Codebase analysis failed: ${err.message || err}`
            });
        }
    }
}

