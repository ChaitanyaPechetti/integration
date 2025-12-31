let configValues: Record<string, string> = {
    zerouiEndpoint: 'http://localhost:8001',
    zerouiModel: 'test-model'
};

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (key: string, def: any) => configValues[key] ?? def
        })
    }
}));

import { ZerouiClient } from '../src/utils/zerouiClient';

const defaultFetch = global.fetch;

describe('ZerouiClient', () => {
    beforeEach(() => {
        configValues = {
            zerouiEndpoint: 'http://localhost:8001',
            zerouiModel: 'test-model'
        };
    });

    afterEach(() => {
        global.fetch = defaultFetch;
    });

    it('checkHealth returns true when ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
        const client = new ZerouiClient();

        await expect(client.checkHealth()).resolves.toBe(true);
    });

    it('checkHealth returns false on error', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('fail')) as any;
        const client = new ZerouiClient();

        await expect(client.checkHealth()).resolves.toBe(false);
    });

    it('generate returns concatenated content', async () => {
        global.fetch = jest.fn(async (url: string) => {
            if (url.includes('/api/chat')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => '{"message":{"content":"Hello"}}\n{"content":" World","done":true}\n'
                } as any;
            }
            return { ok: true, status: 200, text: async () => '' } as any;
        }) as any;

        const client = new ZerouiClient();
        const result = await client.generate([{ role: 'user', content: 'hi' }]);

        expect(result).toBe('Hello World');
    });

    it('generate throws on non-ok response', async () => {
        global.fetch = jest.fn(async (url: string) => {
            if (url.includes('/api/chat')) {
                return { ok: false, status: 500, text: async () => 'oops' } as any;
            }
            return { ok: true, status: 200, text: async () => '' } as any;
        }) as any;

        const client = new ZerouiClient();

        await expect(client.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow('FastAPI error: 500');
    });

    it('generate maps connection errors', async () => {
        global.fetch = jest.fn(async (url: string) => {
            if (url.includes('/api/chat')) {
                throw new Error('ECONNREFUSED');
            }
            return { ok: true, status: 200, text: async () => '' } as any;
        }) as any;

        const client = new ZerouiClient();

        await expect(client.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(
            'Cannot connect to FastAPI server'
        );
    });

    it('updateConfig reloads settings', () => {
        const client = new ZerouiClient();
        configValues = {
            zerouiEndpoint: 'http://localhost:9000',
            zerouiModel: 'new-model'
        };

        client.updateConfig();

        expect((client as any).baseUrl).toBe('http://localhost:9000');
        expect((client as any).model).toBe('new-model');
    });
});
