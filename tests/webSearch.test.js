"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (_key, defaultValue) => defaultValue
        }),
        onDidChangeConfiguration: () => { }
    },
    window: {
        createOutputChannel: () => ({
            appendLine() { },
            show() { },
            clear() { },
            dispose() { }
        })
    }
}));
const webSearch_1 = require("../src/backend/web/webSearch");
const cacheManager_1 = require("../src/utils/cacheManager");
describe('WebSearch', () => {
    const cacheManager = new cacheManager_1.CacheManager({});
    it('returns empty when no credentials', async () => {
        const ws = new webSearch_1.WebSearch(cacheManager, { logInfo() { }, logWarning() { }, logError() { } });
        jest.spyOn(ws, 'getConfig').mockReturnValue({
            apiKey: '',
            cseId: '',
            credentialsAvailable: false,
            enabled: false
        });
        const res = await ws.search('test', 3, true);
        expect(res).toEqual([]);
    });
    it('handles empty items response', async () => {
        const ws = new webSearch_1.WebSearch(cacheManager, { logInfo() { }, logWarning() { }, logError() { } });
        jest.spyOn(ws, 'getConfig').mockReturnValue({
            apiKey: 'k',
            cseId: 'c',
            credentialsAvailable: true,
            enabled: true
        });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ items: [] })
        });
        const res = await ws.search('test', 2, true);
        expect(res).toEqual([]);
    });
});
//# sourceMappingURL=webSearch.test.js.map