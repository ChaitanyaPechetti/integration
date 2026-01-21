import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FileLogger {
    private logFilePath: string;
    private logStream: fs.WriteStream | null = null;
    private disposables: vscode.Disposable[] = [];

    constructor(private workspaceFolder: vscode.WorkspaceFolder) {
        this.logFilePath = path.join(workspaceFolder.uri.fsPath, 'terminal-errors.log');
        this.initializeLogFile();
        this.setupErrorMonitoring();
    }

    private initializeLogFile(): void {
        try {
            // Create write stream for appending to log file
            this.logStream = fs.createWriteStream(this.logFilePath, {
                flags: 'a', // append mode
                encoding: 'utf8'
            });

            // Write header if file is new or empty
            const stats = fs.statSync(this.logFilePath);
            if (stats.size === 0) {
                this.writeToFile(`=== TERMINAL ERRORS LOG ===\nStarted: ${new Date().toISOString()}\nWorkspace: ${this.workspaceFolder.name}\n\n`);
            }
        } catch (error) {
            console.error('Failed to initialize error log file:', error);
        }
    }

    private setupErrorMonitoring(): void {
        // Monitor task execution for errors (build tasks, npm scripts, etc.)
        const taskExecution = vscode.tasks.onDidEndTaskProcess((event) => {
            if (event.exitCode !== 0) {
                // Task failed with non-zero exit code
                const task = event.execution.task;
                this.logCommandFailure(
                    `${task.name} (${task.definition?.type || 'unknown'})`,
                    event.exitCode || -1,
                    'Task Execution'
                );
            }
        });

        // Monitor for problems in the workspace (compilation errors, etc.)
        const problemMatcher = vscode.languages.onDidChangeDiagnostics((event) => {
            event.uris.forEach(uri => {
                const diagnostics = vscode.languages.getDiagnostics(uri);
                const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

                if (errors.length > 0) {
                    const fileName = vscode.workspace.asRelativePath(uri);
                    const errorMessages = errors.map(e => e.message).join('; ');
                    this.logTerminalError(
                        `File: ${fileName}`,
                        `Found ${errors.length} error(s): ${errorMessages}`,
                        'Language Server'
                    );
                }
            });
        });

        // Monitor terminal creation and close events
        const terminalOpened = vscode.window.onDidOpenTerminal((terminal) => {
            // Monitor terminal close to capture exit codes
            const terminalClose = vscode.window.onDidCloseTerminal((closedTerminal) => {
                if (closedTerminal === terminal && closedTerminal.exitStatus && closedTerminal.exitStatus.code !== undefined) {
                    const exitCode = closedTerminal.exitStatus.code;
                    if (exitCode !== 0) {
                        this.logCommandFailure(
                            terminal.name || 'Terminal Command',
                            exitCode,
                            'Terminal'
                        );
                    }
                }
            });
            // Add to disposables to clean up when extension deactivates
            this.disposables.push(terminalClose);
        });

        // Monitor terminal state changes
        const terminalState = vscode.window.onDidChangeActiveTerminal((terminal) => {
            if (terminal) {
                // Additional monitoring can be added here if needed
            }
        });

        // Store disposables for cleanup
        this.disposables = [taskExecution, problemMatcher, terminalOpened, terminalState];
    }


    public logTerminalError(command: string, error: string, source?: string): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [TERMINAL ERROR] ${source || 'Unknown'}\nCommand: ${command}\nError: ${error}\n${'-'.repeat(80)}\n`;

        this.writeToFile(logEntry);

        // Show notification for immediate feedback
        vscode.window.showErrorMessage(`Terminal Error Logged: ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`);
    }

    public logCommandFailure(command: string, exitCode: number, source?: string): void {
        if (exitCode !== 0) {
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] [COMMAND FAILED] ${source || 'Unknown'}\nCommand: ${command}\nExit Code: ${exitCode}\n${'-'.repeat(80)}\n`;

            this.writeToFile(logEntry);
        }
    }

    public logBuildError(error: string): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [BUILD ERROR]\n${error}\n${'-'.repeat(80)}\n`;

        this.writeToFile(logEntry);
    }

    public logNpmError(error: string): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [NPM ERROR]\n${error}\n${'-'.repeat(80)}\n`;

        this.writeToFile(logEntry);
    }

    private writeToFile(content: string): void {
        if (this.logStream) {
            try {
                this.logStream.write(content);
            } catch (error) {
                console.error('Failed to write to error log file:', error);
            }
        }
    }

    public getLogFilePath(): string {
        return this.logFilePath;
    }

    public showLogFile(): void {
        vscode.workspace.openTextDocument(this.logFilePath).then(doc => {
            vscode.window.showTextDocument(doc);
        }, (error: any) => {
            vscode.window.showErrorMessage(`Failed to open error log: ${error.message}`);
        });
    }

    public dispose(): void {
        // Dispose all event listeners
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];

        // Close log stream
        if (this.logStream) {
            this.logStream.end();
            this.logStream = null;
        }
    }
}