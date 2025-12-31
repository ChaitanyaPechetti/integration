import { Generator } from '../src/backend/modelGateway/generator';
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

describe('Generator', () => {
    let generator: Generator;
    let output: TestOutput;

    beforeEach(() => {
        output = new TestOutput();
        generator = new Generator(output);
    });

    describe('constructor', () => {
        it('should initialize ZerouiClient when useZerouiBackend is true', () => {
            jest.mock('vscode', () => ({
                workspace: {
                    getConfiguration: () => ({
                        get: (key: string, def: any) => {
                            if (key === 'useZerouiBackend') return true;
                            return def;
                        }
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
            
            const gen = new Generator(output);
            expect((gen as any).zerouiClient).toBeDefined();
        });
    });

    describe('generate', () => {
        it('should use Zeroui backend when enabled', async () => {
            const gen = generator as any;
            gen.useZerouiBackend = true;
            gen.zerouiClient = {
                checkHealth: jest.fn().mockResolvedValue(true),
                generate: jest.fn().mockResolvedValue('Test response'),
                model: 'test-model'
            };

            const result = await generator.generate({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toBe('Test response');
            expect(gen.zerouiClient.checkHealth).toHaveBeenCalled();
            expect(gen.zerouiClient.generate).toHaveBeenCalled();
        });

        it('should fallback to Ollama when Zeroui backend is unhealthy', async () => {
            const gen = generator as any;
            gen.useZerouiBackend = true;
            gen.zerouiClient = {
                checkHealth: jest.fn().mockResolvedValue(false),
                generate: jest.fn()
            };
            gen.generateWithOllama = jest.fn().mockResolvedValue({
                response: 'Ollama response',
                model: 'ollama-model',
                finishReason: 'stop'
            });

            const result = await generator.generate({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toBe('Ollama response');
            expect(gen.generateWithOllama).toHaveBeenCalled();
        });

        it('should handle Zeroui backend errors and fallback', async () => {
            const gen = generator as any;
            gen.useZerouiBackend = true;
            gen.zerouiClient = {
                checkHealth: jest.fn().mockResolvedValue(true),
                generate: jest.fn().mockRejectedValue(new Error('Zeroui error'))
            };
            gen.generateWithOllama = jest.fn().mockResolvedValue({
                response: 'Ollama fallback',
                model: 'ollama-model',
                finishReason: 'stop'
            });

            const result = await generator.generate({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toBe('Ollama fallback');
            expect(gen.generateWithOllama).toHaveBeenCalled();
        });

        it('should use model override when provided', async () => {
            const gen = generator as any;
            gen.useZerouiBackend = true;
            gen.zerouiClient = {
                checkHealth: jest.fn().mockResolvedValue(true),
                generate: jest.fn().mockResolvedValue('Response'),
                model: 'default-model'
            };

            await generator.generate({
                context: 'Test context',
                query: 'Test query'
            }, 'override-model');

            expect(gen.zerouiClient['model']).toBe('default-model'); // Should restore
        });

        it('should include chat history in Zeroui messages', async () => {
            const gen = generator as any;
            gen.useZerouiBackend = true;
            gen.zerouiClient = {
                checkHealth: jest.fn().mockResolvedValue(true),
                generate: jest.fn().mockResolvedValue('Response'),
                model: 'test-model'
            };

            await generator.generate({
                context: 'Test context',
                query: 'Test query',
                chatHistory: [
                    { role: 'user', content: 'Previous question' },
                    { role: 'assistant', content: 'Previous answer' }
                ]
            });

            const callArgs = gen.zerouiClient.generate.mock.calls[0][0];
            expect(callArgs.length).toBeGreaterThan(1);
            expect(callArgs.some((m: any) => m.content.includes('Previous question'))).toBe(true);
        });

        it('should use direct Ollama when Zeroui is disabled', async () => {
            const gen = generator as any;
            gen.useZerouiBackend = false;
            gen.generateWithOllama = jest.fn().mockResolvedValue({
                response: 'Ollama direct',
                model: 'ollama-model',
                finishReason: 'stop'
            });

            const result = await generator.generate({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toBe('Ollama direct');
            expect(gen.generateWithOllama).toHaveBeenCalled();
        });
    });

    describe('generateWithOllama', () => {
        it('should return fallback when Ollama is unhealthy', async () => {
            const gen = generator as any;
            gen.checkOllamaHealth = jest.fn().mockResolvedValue(false);
            gen.fallbackResponse = jest.fn().mockReturnValue({
                response: 'Fallback response',
                model: 'fallback-template',
                finishReason: 'fallback'
            });

            const result = await gen.generateWithOllama({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toContain('Fallback response');
            expect(gen.fallbackResponse).toHaveBeenCalled();
        });

        it('should handle Ollama fetch timeout', async () => {
            const gen = generator as any;
            gen.checkOllamaHealth = jest.fn().mockResolvedValue(true);
            gen.ollamaUrl = 'http://localhost:11434';
            
            // Mock fetch to timeout
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockImplementation(() => {
                return new Promise((_, reject) => {
                    setTimeout(() => {
                        const err = new Error('Timeout');
                        err.name = 'AbortError';
                        reject(err);
                    }, 100);
                });
            });

            try {
                await gen.generateWithOllama({
                    context: 'Test context',
                    query: 'Test query'
                });
            } catch (err: any) {
                expect(err.message).toContain('timed out');
            } finally {
                global.fetch = originalFetch;
            }
        });

        it('should handle Ollama fetch errors', async () => {
            const gen = generator as any;
            gen.checkOllamaHealth = jest.fn().mockResolvedValue(true);
            gen.fallbackResponse = jest.fn().mockReturnValue({
                response: 'Fallback',
                model: 'fallback-template',
                finishReason: 'fallback'
            });
            gen.ollamaUrl = 'http://localhost:11434';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

            const result = await gen.generateWithOllama({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toContain('Fallback');
            global.fetch = originalFetch;
        });

        it('should handle non-OK Ollama response', async () => {
            const gen = generator as any;
            gen.checkOllamaHealth = jest.fn().mockResolvedValue(true);
            gen.fallbackResponse = jest.fn().mockReturnValue({
                response: 'Fallback',
                model: 'fallback-template',
                finishReason: 'fallback'
            });
            gen.ollamaUrl = 'http://localhost:11434';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            } as any);

            const result = await gen.generateWithOllama({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toContain('Fallback');
            global.fetch = originalFetch;
        });

        it('should handle empty Ollama response content', async () => {
            const gen = generator as any;
            gen.checkOllamaHealth = jest.fn().mockResolvedValue(true);
            gen.fallbackResponse = jest.fn().mockReturnValue({
                response: 'Fallback',
                model: 'fallback-template',
                finishReason: 'fallback'
            });
            gen.ollamaUrl = 'http://localhost:11434';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    message: { content: '' }
                })
            } as any);

            const result = await gen.generateWithOllama({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toContain('Fallback');
            global.fetch = originalFetch;
        });

        it('should return successful Ollama response', async () => {
            const gen = generator as any;
            gen.checkOllamaHealth = jest.fn().mockResolvedValue(true);
            gen.ollamaUrl = 'http://localhost:11434';
            gen.model = 'test-model';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    message: { content: 'Ollama response content' },
                    done: true
                })
            } as any);

            const result = await gen.generateWithOllama({
                context: 'Test context',
                query: 'Test query'
            });

            expect(result.response).toBe('Ollama response content');
            expect(result.model).toBe('test-model');
            expect(result.finishReason).toBe('stop');
            global.fetch = originalFetch;
        });
    });

    describe('checkOllamaHealth', () => {
        it('should return true when Ollama is healthy', async () => {
            const gen = generator as any;
            gen.ollamaUrl = 'http://localhost:11434';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: true
            } as any);

            const result = await gen.checkOllamaHealth(3000);
            expect(result).toBe(true);
            global.fetch = originalFetch;
        });

        it('should return false when Ollama is unhealthy', async () => {
            const gen = generator as any;
            gen.ollamaUrl = 'http://localhost:11434';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: false
            } as any);

            const result = await gen.checkOllamaHealth(3000);
            expect(result).toBe(false);
            global.fetch = originalFetch;
        });

        it('should return false on fetch error', async () => {
            const gen = generator as any;
            gen.ollamaUrl = 'http://localhost:11434';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

            const result = await gen.checkOllamaHealth(3000);
            expect(result).toBe(false);
            global.fetch = originalFetch;
        });

        it('should handle timeout', async () => {
            const gen = generator as any;
            gen.ollamaUrl = 'http://localhost:11434';

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockImplementation(() => {
                return new Promise((_, reject) => {
                    setTimeout(() => {
                        const err = new Error('Timeout');
                        err.name = 'AbortError';
                        reject(err);
                    }, 100);
                });
            });

            const result = await gen.checkOllamaHealth(3000);
            expect(result).toBe(false);
            global.fetch = originalFetch;
        });
    });

    describe('fallbackResponse', () => {
        it('should return fallback response with context', () => {
            const gen = generator as any;
            const result = gen.fallbackResponse({
                context: 'Test context content here',
                query: 'Test query'
            });

            expect(result.response).toContain('Grounded response (fallback)');
            expect(result.response).toContain('Test query');
            expect(result.response).toContain('Test context');
            expect(result.model).toBe('fallback-template');
            expect(result.finishReason).toBe('fallback');
        });
    });
});

