const readFile = jest.fn();
const joinPath = jest.fn();
const workspaceFolders = [{ uri: { fsPath: 'c:\\repo' } }];

jest.mock('vscode', () => ({
    workspace: {
        fs: { readFile },
        workspaceFolders
    },
    Uri: { joinPath }
}));

import { RepoAnalyzer } from '../src/backend/rca/repoAnalyzer';

describe('RepoAnalyzer', () => {
    beforeEach(() => {
        readFile.mockReset();
        workspaceFolders.length = 1;
        workspaceFolders[0] = { uri: { fsPath: 'c:\\repo' } };
        joinPath.mockImplementation((base: { fsPath?: string }, ...paths: string[]) => ({
            fsPath: `${base.fsPath}\\${paths.join('\\')}`
        }));
    });

    it('extracts error location, context, stack trace, and config files', async () => {
        const fileContent = ['line1', 'line2', 'line3', 'line4'].join('\n');
        readFile.mockImplementation(async (uri: { fsPath?: string }) => {
            const path = (uri.fsPath || '').replace(/\//g, '\\');
            if (path.endsWith('src\\app.ts')) {
                return Buffer.from(fileContent);
            }
            if (path.endsWith('package.json')) {
                return Buffer.from(JSON.stringify({ dependencies: { a: '1.0.0' }, devDependencies: { b: '2.0.0' } }));
            }
            if (path.endsWith('tsconfig.json')) {
                return Buffer.from(JSON.stringify({ compilerOptions: { target: 'ES2020' } }));
            }
            throw new Error('missing');
        });

        const analyzer = new RepoAnalyzer();
        const errorMessage = [
            'TypeError: boom at src/app.ts:2:5',
            '    at src/app.ts:2:5',
            '    at other.ts:9'
        ].join('\n');
        const result = await analyzer.analyzeForRCA(errorMessage, { fsPath: 'c:\\repo' } as any);

        expect(result.errorLocation).toEqual({ file: 'src/app.ts', line: 2, column: 5 });
        expect(result.errorContext).toContain('>>> 2: line2');
        expect(result.stackTrace).toEqual(expect.arrayContaining(['    at src/app.ts:2:5', '    at other.ts:9']));
        expect(result.configFiles).toEqual(expect.arrayContaining(['package.json', 'tsconfig.json']));
        expect(result.dependencies.dependencies).toBeDefined();
        expect(result.dependencies['tsconfig.json']).toBeDefined();
        expect(result.relevantFiles).toEqual(expect.arrayContaining(['src/app.ts', 'other.ts']));
    });

    it('returns empty analysis when no workspace is available', async () => {
        workspaceFolders.length = 0;
        const analyzer = new RepoAnalyzer();
        const result = await analyzer.analyzeForRCA('no file here');

        expect(result.relevantFiles).toEqual([]);
        expect(result.configFiles).toEqual([]);
    });
});
