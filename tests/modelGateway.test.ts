import { ModelGateway } from '../src/backend/modelGateway/modelGateway';
import { OutputChannel } from '../src/utils/outputChannel';

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_k: string, def: any) => def
    })
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

// Mocks
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

// Mock router/generator/scorer by monkey-patching after construction

describe('ModelGateway', () => {
  it('enforces rate limit', async () => {
    const mg = new ModelGateway(new TestOutput()) as any;
    // tighten rate limiter
    mg.rateLimiter = { requests: [], maxRequests: 1, windowMs: 60_000 };
    mg.withTimeout = jest.fn((p: Promise<any>) => p); // avoid timers
    // first call ok
    mg.generator.generate = jest.fn().mockResolvedValue({ response: 'ok', model: 'm', finishReason: 'stop' });
    mg.scorer.score = jest.fn().mockReturnValue(1);
    await mg.process({ context: 'c', query: 'q' });
    await expect(mg.process({ context: 'c', query: 'q' })).rejects.toThrow(/Rate limit exceeded/);
  });

  it('retries then succeeds', async () => {
    const mg = new ModelGateway(new TestOutput()) as any;
    mg.rateLimiter = { requests: [], maxRequests: 10, windowMs: 60_000 };
    mg.withTimeout = jest.fn((p: Promise<any>) => p); // avoid timers
    const gen = jest.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockResolvedValueOnce({ response: 'ok', model: 'm', finishReason: 'stop' });
    mg.generator.generate = gen;
    mg.scorer.score = jest.fn().mockReturnValue(1);
    const res = await mg.process({ context: 'c', query: 'q' });
    expect(res.response).toBe('ok');
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('times out', async () => {
    const mg = new ModelGateway(new TestOutput()) as any;
    mg.rateLimiter = { requests: [], maxRequests: 10, windowMs: 60_000 };
    mg.maxRetries = 0; // fail fast
    // Mock withTimeout to simulate immediate timeout
    const timeoutErr = new Error('Operation timed out after 10ms');
    mg.withTimeout = jest.fn(() => Promise.reject(timeoutErr)); // no timers
    mg.generator.generate = jest.fn();
    mg.scorer.score = jest.fn();
    await expect(mg.process({ context: 'c', query: 'q' })).rejects.toThrow(/timed out/);
  });
});

