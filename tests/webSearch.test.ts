jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue: any) => defaultValue
    }),
    onDidChangeConfiguration: () => {}
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

import { WebSearch } from '../src/backend/web/webSearch';
import { CacheManager } from '../src/utils/cacheManager';

describe('WebSearch', () => {
  const cacheManager = new CacheManager({} as any);

  it('returns empty when no credentials', async () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: '',
      cseId: '',
      credentialsAvailable: false,
      enabled: false
    });
    const res = await ws.search('test', 3, true);
    expect(res).toEqual([]);
  });

  it('handles empty items response', async () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: 'k',
      cseId: 'c',
      credentialsAvailable: true,
      enabled: true
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ items: [] })
    });
    const res = await ws.search('test', 2, true);
    expect(res).toEqual([]);
  });
});

