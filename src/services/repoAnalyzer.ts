import * as vscode from 'vscode';
import { OutputChannel } from '../utils/outputChannel';

export interface RepoAnalysisSummary {
    timestamp: number;
    fileCount: number;
    totalBytes: number;
    recentFiles: { file: string; mtime: number }[];
    deps: { packageJson?: string[]; requirements?: string[]; goMod?: string[] } | null;
    diagnostics: { file: string; message: string; line?: number; character?: number }[];
}

export class RepoAnalyzer {
    private maxFiles = 2000;
    private maxBytes = 50 * 1024 * 1024; // 50MB scan cap
    private recentLimit = 8;

    constructor(private output: OutputChannel) {}

    async analyzeWorkspace(workspaceUri: vscode.Uri): Promise<RepoAnalysisSummary> {
        const summary: RepoAnalysisSummary = {
            timestamp: Date.now(),
            fileCount: 0,
            totalBytes: 0,
            recentFiles: [],
            deps: null,
            diagnostics: []
        };

        const files: { uri: vscode.Uri; mtime: number; size: number }[] = [];
        try {
            await this.walk(workspaceUri, files);
        } catch (err: any) {
            this.output.logError(`[RepoAnalyzer] Walk error: ${err.message || err}`);
        }

        files.sort((a, b) => b.mtime - a.mtime);
        summary.recentFiles = files.slice(0, this.recentLimit).map(f => ({
            file: vscode.workspace.asRelativePath(f.uri),
            mtime: f.mtime
        }));

        summary.fileCount = files.length;
        summary.totalBytes = files.reduce((s, f) => s + f.size, 0);

        summary.deps = await this.readDeps(workspaceUri);

        summary.diagnostics = await this.quickDiagnostics(files.slice(0, 200)); // limit diagnostics

        return summary;
    }

    private async walk(root: vscode.Uri, out: { uri: vscode.Uri; mtime: number; size: number }[]) {
        const ignore = ['node_modules', '.git', '.vscode', 'dist', 'out', 'build'];
        const stack: vscode.Uri[] = [root];
        let bytes = 0;

        while (stack.length > 0) {
            const dir = stack.pop()!;
            const entries = await vscode.workspace.fs.readDirectory(dir);
            for (const [name, type] of entries) {
                if (ignore.includes(name)) continue;
                const uri = vscode.Uri.joinPath(dir, name);
                if (type === vscode.FileType.Directory) {
                    stack.push(uri);
                } else if (type === vscode.FileType.File) {
                    if (!/\.(ts|js|tsx|jsx|json|md|yml|yaml|py|java|go|rs|rb|php|cs|cpp|c|h|hpp)$/i.test(name)) continue;
                    const stat = await vscode.workspace.fs.stat(uri);
                    bytes += stat.size;
                    if (bytes > this.maxBytes || out.length >= this.maxFiles) return;
                    out.push({ uri, mtime: stat.mtime, size: stat.size });
                }
            }
        }
    }

    private async readDeps(workspaceUri: vscode.Uri) {
        const deps: { packageJson?: string[]; requirements?: string[]; goMod?: string[] } = {};
        // package.json
        try {
            const pkgUri = vscode.Uri.joinPath(workspaceUri, 'package.json');
            const buf = await vscode.workspace.fs.readFile(pkgUri);
            const pkg = JSON.parse(Buffer.from(buf).toString('utf8'));
            deps.packageJson = Object.keys(pkg.dependencies || {});
        } catch {}
        // requirements.txt
        try {
            const reqUri = vscode.Uri.joinPath(workspaceUri, 'requirements.txt');
            const buf = await vscode.workspace.fs.readFile(reqUri);
            deps.requirements = Buffer.from(buf).toString('utf8').split('\n').map(l => l.trim()).filter(Boolean);
        } catch {}
        // go.mod
        try {
            const goUri = vscode.Uri.joinPath(workspaceUri, 'go.mod');
            const buf = await vscode.workspace.fs.readFile(goUri);
            deps.goMod = Buffer.from(buf).toString('utf8').split('\n').map(l => l.trim()).filter(l => l.startsWith('require '));
        } catch {}

        return Object.keys(deps).length ? deps : null;
    }

    private async quickDiagnostics(files: { uri: vscode.Uri; mtime: number; size: number }[]) {
        const ts = require('typescript') as typeof import('typescript');
        const results: { file: string; message: string; line?: number; character?: number }[] = [];

        for (const f of files) {
            if (!['.ts', '.tsx', '.js', '.jsx'].some(ext => f.uri.fsPath.toLowerCase().endsWith(ext))) continue;
            try {
                const buf = await vscode.workspace.fs.readFile(f.uri);
                const source = Buffer.from(buf).toString('utf8');
                const res = ts.transpileModule(source, {
                    compilerOptions: {
                        noEmit: true,
                        allowJs: true,
                        checkJs: true,
                        strict: true,
                        jsx: ts.JsxEmit.React
                    },
                    reportDiagnostics: true,
                    fileName: f.uri.fsPath
                });
                (res.diagnostics || []).forEach(d => {
                    if (d.start === undefined) return;
                    const { line, character } = ts.getLineAndCharacterOfPosition(
                        ts.createSourceFile(f.uri.fsPath, source, ts.ScriptTarget.Latest, true),
                        d.start
                    );
                    results.push({
                        file: vscode.workspace.asRelativePath(f.uri),
                        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
                        line: line + 1,
                        character: character + 1
                    });
                });
            } catch (err: any) {
                this.output.logError(`[RepoAnalyzer] Diagnostic error for ${f.uri.fsPath}: ${err.message || err}`);
            }
        }
        return results.slice(0, 50); // limit to 50 issues
    }
}

