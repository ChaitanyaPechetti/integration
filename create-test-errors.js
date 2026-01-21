const fs = require('fs');
const path = require('path');

class FileLogger {
    constructor() {
        this.logFilePath = path.join(process.cwd(), 'terminal-errors.log');
        this.initializeLogFile();
    }

    initializeLogFile() {
        try {
            const stats = fs.statSync(this.logFilePath);
            if (stats.size === 0) {
                fs.writeFileSync(this.logFilePath, '=== TERMINAL ERRORS LOG ===\nStarted: ' + new Date().toISOString() + '\nWorkspace: Rag-Experiements\n\n');
            }
        } catch (error) {
            // File doesn't exist, create it
            fs.writeFileSync(this.logFilePath, '=== TERMINAL ERRORS LOG ===\nStarted: ' + new Date().toISOString() + '\nWorkspace: Rag-Experiements\n\n');
        }
    }

    logCommandFailure(command, exitCode, source = 'Terminal') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [COMMAND FAILED] ${source}\nCommand: ${command}\nExit Code: ${exitCode}\n${'-'.repeat(80)}\n`;
        fs.appendFileSync(this.logFilePath, logEntry);
        console.log('Error logged:', logEntry.trim());
    }

    logTerminalError(command, error, source = 'Terminal') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [TERMINAL ERROR] ${source}\nCommand: ${command}\nError: ${error}\n${'-'.repeat(80)}\n`;
        fs.appendFileSync(this.logFilePath, logEntry);
        console.log('Error logged:', logEntry.trim());
    }
}

const logger = new FileLogger();

// Log some test errors
logger.logCommandFailure('npm run nonexistent-script', 1, 'NPM');
logger.logCommandFailure('npm script', 1, 'NPM');
logger.logTerminalError('npx tsc --noEmit test-error.ts', 'test-error.ts(6,5): error TS1005: \',\u0027 expected.', 'TypeScript');
logger.logTerminalError('python nonexistent.py', 'ModuleNotFoundError: No module named \'nonexistent\'', 'Python');
logger.logTerminalError('cd nonexistent-directory', 'cd : Cannot find path \'C:\\Rag-Experiements\\nonexistent-directory\' because it does not exist.', 'PowerShell');

console.log('All test errors have been logged to terminal-errors.log');