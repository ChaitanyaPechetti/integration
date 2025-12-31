"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const modelGateway_1 = require("../src/backend/modelGateway/modelGateway");
const outputChannel_1 = require("../src/utils/outputChannel");
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (_k, def) => def
        })
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
// Mocks
class TestOutput extends outputChannel_1.OutputChannel {
    constructor() {
        // @ts-ignore
        super({});
    }
    logInfo(_m) { }
    logWarning(_m) { }
    logError(_m) { }
    logDebug(_m) { }
}
// Mock router/generator/scorer by monkey-patching after construction
describe('ModelGateway', () => {
    it('enforces rate limit', async () => {
        const mg = new modelGateway_1.ModelGateway(new TestOutput());
        // tighten rate limiter
        mg.rateLimiter = { requests: [], maxRequests: 1, windowMs: 60000 };
        mg.withTimeout = jest.fn((p) => p); // avoid timers
        // first call ok
        mg.generator.generate = jest.fn().mockResolvedValue({ response: 'ok', model: 'm', finishReason: 'stop' });
        mg.scorer.score = jest.fn().mockReturnValue(1);
        await mg.process({ context: 'c', query: 'q' });
        await expect(mg.process({ context: 'c', query: 'q' })).rejects.toThrow(/Rate limit exceeded/);
    });
    it('retries then succeeds', async () => {
        const mg = new modelGateway_1.ModelGateway(new TestOutput());
        mg.rateLimiter = { requests: [], maxRequests: 10, windowMs: 60000 };
        mg.withTimeout = jest.fn((p) => p); // avoid timers
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
        const mg = new modelGateway_1.ModelGateway(new TestOutput());
        mg.rateLimiter = { requests: [], maxRequests: 10, windowMs: 60000 };
        mg.maxRetries = 0; // fail fast
        // Mock withTimeout to simulate immediate timeout
        const timeoutErr = new Error('Operation timed out after 10ms');
        mg.withTimeout = jest.fn(() => Promise.reject(timeoutErr)); // no timers
        mg.generator.generate = jest.fn();
        mg.scorer.score = jest.fn();
        await expect(mg.process({ context: 'c', query: 'q' })).rejects.toThrow(/timed out/);
    });
});
//# sourceMappingURL=modelGateway.test.js.map