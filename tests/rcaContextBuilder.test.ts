jest.mock('vscode', () => ({
    Uri: {
        joinPath: jest.fn((base: { fsPath?: string }, ...paths: string[]) => ({
            fsPath: `${base.fsPath}\\${paths.join('\\')}`
        }))
    }
}));

import { RcaContextBuilder } from '../src/backend/rca/rcaContextBuilder';

describe('RcaContextBuilder', () => {
    it('builds RCA context with classification and repo data', async () => {
        const builder = new RcaContextBuilder();
        (builder as any).errorDetector = {
            detectError: jest.fn().mockReturnValue({
                detected: true,
                category: 'runtime',
                severity: 'high',
                confidence: 0.8,
                matchedPattern: {
                    commonCauses: ['Cause A'],
                    suggestedFixes: ['Fix A']
                }
            })
        };
        (builder as any).repoAnalyzer = {
            analyzeForRCA: jest.fn().mockResolvedValue({
                errorLocation: { file: 'src/app.ts', line: 3, column: 2 },
                errorContext: '>>> 3: line',
                stackTrace: ['at src/app.ts:3:2'],
                configFiles: ['package.json'],
                dependencies: { dependencies: { a: '1.0.0' } },
                relevantFiles: ['src/app.ts']
            })
        };

        const context = await builder.buildRcaContext(
            'TypeError: boom',
            [{ id: 'w1', content: 'web', metadata: { title: 'Web Title', link: 'http://example.com' }, timestamp: 1 }],
            [{ id: 'i1', content: 'internal', metadata: {}, timestamp: 2 }],
            { fsPath: 'c:\\repo' } as any
        );

        expect(context).toContain('ERROR CLASSIFICATION');
        expect(context).toContain('Cause A');
        expect(context).toContain('Fix A');
        expect(context).toContain('REPOSITORY CONTEXT');
        expect(context).toContain('ERROR LOCATION');
        expect(context).toContain('src/app.ts');
        expect(context).toContain('WEB SEARCH RESULTS');
        expect(context).toContain('INTERNAL KNOWLEDGE BASE');
    });

    it('builds generic context when detection fails and no workspace', async () => {
        const builder = new RcaContextBuilder();
        (builder as any).errorDetector = {
            detectError: jest.fn().mockReturnValue({ detected: false })
        };
        const repoAnalyzer = { analyzeForRCA: jest.fn() };
        (builder as any).repoAnalyzer = repoAnalyzer;

        const context = await builder.buildRcaContext('Unknown error', [], [], undefined);

        expect(context).toContain('Generic error detected');
        expect(repoAnalyzer.analyzeForRCA).not.toHaveBeenCalled();
    });

    it('builds an RCA prompt template', () => {
        const builder = new RcaContextBuilder();
        const prompt = builder.buildRcaPrompt('Any error');

        expect(prompt).toContain('rootcause:');
        expect(prompt).toContain('solution:');
        expect(prompt).toContain('IMPORTANT RULES:');
    });
});
