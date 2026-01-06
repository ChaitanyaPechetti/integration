import { Retriever } from '../src/backend/retriever';
import { ExternalMemory } from '../src/backend/externalMemory';
import { CacheManager } from '../src/utils/cacheManager';
import { OutputChannel } from '../src/utils/outputChannel';

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (_k: string, def: any) => def
        }),
        onDidChangeConfiguration: () => ({ dispose: jest.fn() })
    },
    window: {
        createOutputChannel: () => ({
            appendLine() {},
            show() {},
            clear() {},
            dispose() {}
        })
    }
}));

class TestOutput extends OutputChannel {
    constructor() {
        // @ts-ignore
        super({} as any);
    }
    logInfo(_m: string) {}
    logWarning(_m: string) {}
    logError(_m: string) {}
    logDebug(_m: string) {}
}

describe('Retriever', () => {
    let retriever: Retriever;
    let externalMemory: ExternalMemory;
    let cacheManager: CacheManager;
    let output: TestOutput;

    beforeEach(() => {
        output = new TestOutput();
        externalMemory = new ExternalMemory();
        cacheManager = new CacheManager({} as any);
        retriever = new Retriever(externalMemory, cacheManager, output);
    });

    it('should retrieve internal documents', async () => {
        await externalMemory.seedLanguageDocs();
        const docs = await retriever.retrieveInternal('javascript', 5);
        expect(docs.length).toBeGreaterThan(0);
    });

    it('should use cache on second call', async () => {
        await externalMemory.seedLanguageDocs();
        const docs1 = await retriever.retrieveInternal('test', 5);
        const docs2 = await retriever.retrieveInternal('test', 5);
        expect(docs1).toEqual(docs2);
    });

    it('should return empty array on error', async () => {
        const ret = retriever as any;
        ret.externalMemory.getDocuments = jest.fn().mockRejectedValue(new Error('Test error'));
        
        const docs = await retriever.retrieveInternal('test', 5);
        expect(docs).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
        const ret = retriever as any;
        ret.externalMemory.getDocuments = jest.fn().mockRejectedValue(new Error('Database error'));
        
        const docs = await retriever.retrieveInternal('test', 5);
        expect(Array.isArray(docs)).toBe(true);
        expect(docs.length).toBe(0);
    });
});


