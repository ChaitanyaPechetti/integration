jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue: any) => defaultValue
    }),
    onDidChangeConfiguration: () => {},
    workspaceFolders: []
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

  it('isEnabled returns true when enabled', () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: 'k',
      cseId: 'c',
      credentialsAvailable: true,
      enabled: true
    });
    expect(ws.isEnabled()).toBe(true);
  });

  it('isEnabled returns false when disabled', () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: 'k',
      cseId: 'c',
      credentialsAvailable: true,
      enabled: false
    });
    expect(ws.isEnabled()).toBe(false);
  });

  it('hasCredentials returns true when credentials available', () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: 'k',
      cseId: 'c',
      credentialsAvailable: true,
      enabled: true
    });
    expect(ws.hasCredentials()).toBe(true);
  });

  it('hasCredentials returns false when credentials not available', () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: '',
      cseId: '',
      credentialsAvailable: false,
      enabled: false
    });
    expect(ws.hasCredentials()).toBe(false);
  });

  it('should skip search when not enabled and forceSearch is false', async () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: 'k',
      cseId: 'c',
      credentialsAvailable: true,
      enabled: false
    });
    const res = await ws.search('test', 5, false);
    expect(res).toEqual([]);
  });

  it('should handle API error responses', async () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: 'k',
      cseId: 'c',
      credentialsAvailable: true,
      enabled: true
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Invalid API key'
    });
    const res = await ws.search('test', 5, true);
    expect(res).toEqual([]);
  });

  it('should handle fetch errors', async () => {
    const ws = new WebSearch(cacheManager, { logInfo() {}, logWarning() {}, logError() {} } as any);
    jest.spyOn(ws as any, 'getConfig').mockReturnValue({
      apiKey: 'k',
      cseId: 'c',
      credentialsAvailable: true,
      enabled: true
    });
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const res = await ws.search('test', 5, true);
    expect(res).toEqual([]);
  });
});
