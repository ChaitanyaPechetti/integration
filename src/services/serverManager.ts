import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';

export class ServerManager {
    private static fastApiProcess: child_process.ChildProcess | null = null;
    private static ollamaProcess: child_process.ChildProcess | null = null;
    private static outputChannel: vscode.OutputChannel;

    public static initialize(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Check if a server is running by making an HTTP request
     */
    private static async checkServerHealth(url: string, timeout: number = 3000): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                // Validate URL input
                if (!url || typeof url !== 'string') {
                    resolve(false);
                    return;
                }

                const parsedUrl = new URL(url);
                const client = parsedUrl.protocol === 'https:' ? https : http;
                
                // Safe port parsing with validation
                let port: number;
                if (parsedUrl.port) {
                    const parsedPort = parseInt(parsedUrl.port, 10);
                    if (isNaN(parsedPort)) {
                        resolve(false);
                        return;
                    }
                    port = parsedPort;
                } else {
                    port = parsedUrl.protocol === 'https:' ? 443 : 80;
                }

                const options = {
                    hostname: parsedUrl.hostname,
                    port: port,
                    path: parsedUrl.pathname,
                    method: 'GET',
                    timeout: timeout
                };

                const req = client.request(options, (res) => {
                    resolve(res.statusCode === 200 || res.statusCode === 404);
                });

                req.on('error', () => {
                    resolve(false);
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve(false);
                });

                req.end();
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * Start Ollama server if not running
     */
    public static async startOllama(): Promise<boolean> {
        // Safety check for outputChannel
        if (!this.outputChannel) {
            console.error('ServerManager not initialized');
            return false;
        }

        const ollamaUrl = 'http://localhost:11434/api/tags';
        
        // Check if Ollama is already running
        const isRunning = await this.checkServerHealth(ollamaUrl);
        if (isRunning) {
            this.outputChannel.appendLine('✓ Ollama server is already running');
            return true;
        }

        this.outputChannel.appendLine('Starting Ollama server...');
        
        // Try up to 2 times
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                if (attempt > 0) {
                    this.outputChannel.appendLine(`Retry attempt ${attempt + 1}/2...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // Try to start Ollama (assuming it's in PATH)
                // On Windows, this might be 'ollama.exe' or just 'ollama'
                const isWindows = process.platform === 'win32';
                const ollamaCommand = isWindows ? 'ollama.exe' : 'ollama';
                
                this.ollamaProcess = child_process.spawn(ollamaCommand, ['serve'], {
                    detached: false,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    shell: isWindows
                });

                if (this.ollamaProcess.stdout) {
                    this.ollamaProcess.stdout.on('data', (data) => {
                        this.outputChannel.appendLine(`[Ollama] ${data.toString().trim()}`);
                    });
                }

                if (this.ollamaProcess.stderr) {
                    this.ollamaProcess.stderr.on('data', (data) => {
                        this.outputChannel.appendLine(`[Ollama Error] ${data.toString().trim()}`);
                    });
                }

                this.ollamaProcess.on('error', (error) => {
                    this.outputChannel.appendLine(`Failed to start Ollama: ${error.message}`);
                    if (attempt === 1) {
                        this.outputChannel.appendLine('Make sure Ollama is installed and in your PATH');
                        this.outputChannel.appendLine('Download from: https://ollama.ai');
                    }
                    this.ollamaProcess = null;
                });

                // Wait progressively longer for Ollama to start
                const waitTime = 2000 + (attempt * 1000);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Check multiple times with increasing delays
                for (let check = 0; check < 3; check++) {
                    const started = await this.checkServerHealth(ollamaUrl, 5000);
                    if (started) {
                        this.outputChannel.appendLine('✓ Ollama server started successfully');
                        return true;
                    }
                    if (check < 2) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
                
                // If we get here, server didn't start - kill process and retry
                if (this.ollamaProcess) {
                    this.ollamaProcess.kill();
                    this.ollamaProcess = null;
                }
            } catch (error: any) {
                this.outputChannel.appendLine(`Error starting Ollama (attempt ${attempt + 1}): ${error.message}`);
                if (attempt === 1) {
                    return false;
                }
            }
        }
        
        // Final check - maybe Ollama started as a system service
        this.outputChannel.appendLine('Checking if Ollama is running as a system service...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const finalCheck = await this.checkServerHealth(ollamaUrl, 10000);
        if (finalCheck) {
            this.outputChannel.appendLine('✓ Ollama server is running (system service)');
            return true;
        }
        
        return false;
    }

    /**
     * Start FastAPI server if not running
     */
    public static async startFastAPI(context: vscode.ExtensionContext): Promise<boolean> {
        // Safety check for outputChannel
        if (!this.outputChannel) {
            console.error('ServerManager not initialized');
            return false;
        }

        const config = vscode.workspace.getConfiguration('ragAgent');
        const fastApiUrl = config.get<string>('zerouiEndpoint', 'http://localhost:8001');
        const healthUrl = `${fastApiUrl}/api/health`;
        
        // Read Log Helper source path from VS Code setting
        const logHelperSourcePath = config.get<string>('logHelperSourcePath', '');
        let validatedLogHelperPath: string | undefined;
        
        if (logHelperSourcePath && logHelperSourcePath.trim()) {
            const resolvedPath = path.resolve(logHelperSourcePath);
            const analyzerPath = path.join(resolvedPath, 'analyzer.py');
            if (fs.existsSync(analyzerPath)) {
                validatedLogHelperPath = resolvedPath;
                this.outputChannel.appendLine(`[Log Helper] Using configured source path: ${validatedLogHelperPath}`);
            } else {
                this.outputChannel.appendLine(`[Log Helper] Warning: Configured path not found: ${resolvedPath}`);
                this.outputChannel.appendLine(`[Log Helper] Will use auto-detection or fallback`);
            }
        }
        
        // Check if FastAPI is already running
        const isRunning = await this.checkServerHealth(healthUrl);
        if (isRunning) {
            this.outputChannel.appendLine('✓ FastAPI server is already running');
            return true;
        }

        this.outputChannel.appendLine('Starting FastAPI server...');
        
        // Try up to 2 times
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                if (attempt > 0) {
                    this.outputChannel.appendLine(`Retry attempt ${attempt + 1}/2...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // Get the extension path (where fastapi_server.py should be)
                // Use extensionUri.fsPath if extensionPath is not available
                const extensionPath = context.extensionPath || context.extensionUri.fsPath;
                const fastApiScriptPath = path.join(extensionPath, 'fastapi_server.py');

                // Check if fastapi_server.py exists in extension directory
                if (!fs.existsSync(fastApiScriptPath)) {
                    // Try workspace folder as fallback
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (workspaceFolder) {
                        const workspacePath = workspaceFolder.uri.fsPath;
                        const workspaceFastApiPath = path.join(workspacePath, 'fastapi_server.py');
                        if (fs.existsSync(workspaceFastApiPath)) {
                            return await this.startFastAPIFromPath(workspaceFastApiPath, workspacePath, fastApiUrl, validatedLogHelperPath, attempt === 1);
                        }
                    }
                    if (attempt === 1) {
                        this.outputChannel.appendLine(`✗ FastAPI server script not found at: ${fastApiScriptPath}`);
                        this.outputChannel.appendLine(`Also checked workspace folder but script not found.`);
                    }
                    continue;
                }

                return await this.startFastAPIFromPath(fastApiScriptPath, extensionPath, fastApiUrl, validatedLogHelperPath, attempt === 1);
            } catch (error: any) {
                this.outputChannel.appendLine(`Error starting FastAPI (attempt ${attempt + 1}): ${error.message}`);
                if (attempt === 1) {
                    this.outputChannel.appendLine(`Error stack: ${error.stack}`);
                    return false;
                }
            }
        }
        
        return false;
    }

    /**
     * Start FastAPI from a specific path
     */
    private static async startFastAPIFromPath(scriptPath: string, workingDir: string, fastApiUrl: string, logHelperSourcePath?: string, isLastAttempt: boolean = false): Promise<boolean> {
        const healthUrl = `${fastApiUrl}/api/health`;
        
        try {
            // Determine Python command (try python3 first, then python)
            const isWindows = process.platform === 'win32';
            const pythonCommand = isWindows ? 'python' : 'python3';

            // Parse port from URL with error handling
            let port = '8001';
            try {
                const parsedUrl = new URL(fastApiUrl);
                port = parsedUrl.port || '8001';
            } catch (urlError) {
                // If URL parsing fails, use default port
                this.outputChannel.appendLine(`Warning: Invalid FastAPI URL format, using default port 8001`);
            }

            // Normalize paths to handle spaces properly
            const normalizedScriptPath = path.normalize(scriptPath);
            const normalizedWorkingDir = path.normalize(workingDir);

            this.outputChannel.appendLine(`Starting FastAPI with script: ${normalizedScriptPath}`);
            this.outputChannel.appendLine(`Working directory: ${normalizedWorkingDir}`);
            this.outputChannel.appendLine(`Python command: ${pythonCommand}`);
            this.outputChannel.appendLine(`Port: ${port}`);

            // Start FastAPI server
            // On Windows with shell: true, we need to properly quote paths with spaces
            if (isWindows) {
                // Build command string with proper quoting for paths with spaces
                // Use double quotes for Windows paths
                const quotedScriptPath = normalizedScriptPath.includes(' ') 
                    ? `"${normalizedScriptPath}"` 
                    : normalizedScriptPath;
                const command = `${pythonCommand} ${quotedScriptPath}`;
                
                this.outputChannel.appendLine(`Windows command: ${command}`);
                
                this.fastApiProcess = child_process.spawn(
                    command,
                    [],
                    {
                        cwd: normalizedWorkingDir,
                        detached: false,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        shell: true,
                        env: {
                            ...process.env,
                            FASTAPI_PORT: port,
                            OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
                            ...(logHelperSourcePath && logHelperSourcePath.trim() ? {
                                LOG_HELPER_SOURCE_PATH: path.resolve(logHelperSourcePath)
                            } : {})
                        }
                    }
                );
            } else {
                // Unix-like systems: use array format
                this.fastApiProcess = child_process.spawn(
                    pythonCommand,
                    [normalizedScriptPath],
                    {
                        cwd: normalizedWorkingDir,
                        detached: false,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        shell: false,
                        env: {
                            ...process.env,
                            FASTAPI_PORT: port,
                            OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
                            ...(logHelperSourcePath && logHelperSourcePath.trim() ? {
                                LOG_HELPER_SOURCE_PATH: path.resolve(logHelperSourcePath)
                            } : {})
                        }
                    }
                );
            }

            if (this.fastApiProcess.stdout) {
                this.fastApiProcess.stdout.on('data', (data) => {
                    this.outputChannel.appendLine(`[FastAPI] ${data.toString().trim()}`);
                });
            }

            if (this.fastApiProcess.stderr) {
                this.fastApiProcess.stderr.on('data', (data) => {
                    this.outputChannel.appendLine(`[FastAPI Error] ${data.toString().trim()}`);
                });
            }

            this.fastApiProcess.on('error', (error) => {
                this.outputChannel.appendLine(`Failed to start FastAPI: ${error.message}`);
                if (isLastAttempt) {
                    this.outputChannel.appendLine('Make sure Python is installed and fastapi_server.py exists');
                    this.outputChannel.appendLine(`Script path: ${normalizedScriptPath}`);
                    this.outputChannel.appendLine(`Working directory: ${normalizedWorkingDir}`);
                }
                this.fastApiProcess = null;
            });

            // Wait for FastAPI to start with progressive delays
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check multiple times
            for (let check = 0; check < 3; check++) {
                const started = await this.checkServerHealth(healthUrl, 5000);
                if (started) {
                    this.outputChannel.appendLine('✓ FastAPI server started successfully');
                    return true;
                }
                if (check < 2) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // If we get here, server didn't start
            if (this.fastApiProcess) {
                this.fastApiProcess.kill();
                this.fastApiProcess = null;
            }
            
            return false;
        } catch (error: any) {
            this.outputChannel.appendLine(`Error starting FastAPI: ${error.message}`);
            return false;
        }
    }

    /**
     * Start both servers automatically
     */
    public static async startServers(context: vscode.ExtensionContext): Promise<void> {
        // Safety check for outputChannel
        if (!this.outputChannel) {
            console.error('ServerManager not initialized. Cannot start servers.');
            return;
        }

        this.outputChannel.appendLine('=== Auto-starting Zeroui servers ===');
        this.outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);
        
        try {
            // Start Ollama first
            this.outputChannel.appendLine('Step 1: Starting Ollama server...');
            const ollamaStarted = await this.startOllama();
            if (!ollamaStarted) {
                this.outputChannel.appendLine('⚠ Warning: Ollama server may not be running.');
                this.outputChannel.appendLine('  - Ollama might already be running as a system service');
                this.outputChannel.appendLine('  - Or Ollama may not be installed. Download from: https://ollama.ai');
            } else {
                this.outputChannel.appendLine('✓ Ollama server is ready');
            }

            // Wait before starting FastAPI to ensure Ollama is ready
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Then start FastAPI
            this.outputChannel.appendLine('Step 2: Starting FastAPI server...');
            const fastApiStarted = await this.startFastAPI(context);
            if (!fastApiStarted) {
                this.outputChannel.appendLine('⚠ Warning: FastAPI server may not be running.');
                this.outputChannel.appendLine('  - Check error messages above for details');
                this.outputChannel.appendLine('  - Ensure Python and required packages are installed');
                this.outputChannel.appendLine('  - Verify fastapi_server.py exists in extension directory');
            } else {
                this.outputChannel.appendLine('✓ FastAPI server is ready');
                
                // Pre-load the model to prevent loading timeouts
                this.outputChannel.appendLine('Step 3: Pre-loading Ollama model...');
                await this.preloadModel();
            }

            // Summary
            if (ollamaStarted && fastApiStarted) {
                this.outputChannel.appendLine('=== ✓ All Zeroui servers started successfully ===');
            } else if (ollamaStarted || fastApiStarted) {
                this.outputChannel.appendLine('=== ⚠ Partial server startup: Some servers are running ===');
                this.outputChannel.appendLine('  RAG Agent will work with available servers');
            } else {
                this.outputChannel.appendLine('=== ✗ Server startup failed ===');
                this.outputChannel.appendLine('  Please check error messages above and ensure:');
                this.outputChannel.appendLine('  1. Ollama is installed (https://ollama.ai)');
                this.outputChannel.appendLine('  2. Python is installed and in PATH');
                this.outputChannel.appendLine('  3. fastapi_server.py exists in extension directory');
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`=== Critical error during server startup: ${error.message} ===`);
            this.outputChannel.appendLine(`Stack trace: ${error.stack}`);
        }
    }

    /**
     * Pre-load the Ollama model to prevent loading timeouts
     */
    private static async preloadModel(): Promise<void> {
        if (!this.outputChannel) {
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('ragAgent');
            const fastApiUrl = config.get<string>('zerouiEndpoint', 'http://localhost:8001');
            const modelName = config.get<string>('zerouiModel', 'phi3:mini-128k');
            const preloadUrl = `${fastApiUrl}/api/model/preload`;

            // Wait a moment for FastAPI to be fully ready
            await new Promise(resolve => setTimeout(resolve, 2000));

            this.outputChannel.appendLine(`Pre-loading model: ${modelName}...`);

            const http = require('http');
            const https = require('https');
            const { URL } = require('url');

            const url = new URL(preloadUrl);
            const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
            const client = url.protocol === 'https:' ? https : http;

            const requestData = JSON.stringify({ model_name: modelName });

            return new Promise<void>((resolve) => {
                const options = {
                    hostname: url.hostname,
                    port: port,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(requestData)
                    }
                };

                const req = client.request(options, (res: any) => {
                    let data = '';
                    res.on('data', (chunk: any) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            if (response.status === 'success') {
                                this.outputChannel.appendLine(`✓ Model ${modelName} pre-loaded successfully`);
                            } else if (response.status === 'timeout') {
                                this.outputChannel.appendLine(`⚠ Model ${modelName} pre-load timed out (may still be loading in background)`);
                            } else {
                                this.outputChannel.appendLine(`⚠ Model pre-load warning: ${response.error || response.message || 'Unknown error'}`);
                            }
                        } catch (e) {
                            // Non-JSON response or parse error - not critical
                            this.outputChannel.appendLine(`⚠ Model pre-load: Received non-JSON response (this is usually fine)`);
                        }
                        resolve();
                    });
                });

                req.on('error', (error: any) => {
                    // Pre-load failure is not critical - model will load on first use
                    this.outputChannel.appendLine(`⚠ Model pre-load failed: ${error.message} (model will load on first use)`);
                    resolve();
                });

                req.on('timeout', () => {
                    req.destroy();
                    this.outputChannel.appendLine(`⚠ Model pre-load timed out (model will load on first use)`);
                    resolve();
                });

                req.setTimeout(30000); // 30 second timeout for pre-load
                req.write(requestData);
                req.end();
            });
        } catch (error: any) {
            // Pre-load failure is not critical - model will load on first use
            this.outputChannel.appendLine(`⚠ Model pre-load error: ${error.message} (model will load on first use)`);
        }
    }

    /**
     * Stop all managed servers
     */
    public static stopServers(): void {
        // Safety check for outputChannel
        if (!this.outputChannel) {
            return;
        }

        if (this.fastApiProcess) {
            this.outputChannel.appendLine('Stopping FastAPI server...');
            this.fastApiProcess.kill();
            this.fastApiProcess = null;
        }

        if (this.ollamaProcess) {
            this.outputChannel.appendLine('Stopping Ollama server...');
            this.ollamaProcess.kill();
            this.ollamaProcess = null;
        }
    }
}

