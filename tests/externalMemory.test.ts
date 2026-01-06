import { ExternalMemory, DocumentRecord, TableRecord, ChatMessage } from '../src/backend/externalMemory';

describe('ExternalMemory', () => {
    let memory: ExternalMemory;

    beforeEach(() => {
        memory = new ExternalMemory();
    });

    describe('seedLanguageDocs', () => {
        it('should seed language documents', async () => {
            await memory.seedLanguageDocs();
            const docs = await memory.getDocuments('javascript', 20);
            expect(docs.length).toBeGreaterThan(0);
        });

        it('should not seed if already seeded', async () => {
            await memory.seedLanguageDocs();
            const firstCount = (await memory.getDocuments('', 100)).length;
            await memory.seedLanguageDocs();
            const secondCount = (await memory.getDocuments('', 100)).length;
            expect(firstCount).toBe(secondCount);
        });

        it('should include JavaScript/TypeScript docs', async () => {
            await memory.seedLanguageDocs();
            const docs = await memory.getDocuments('javascript', 20);
            const jsDoc = docs.find(d => d.id === 'lang-js-ts');
            expect(jsDoc).toBeDefined();
            expect(jsDoc?.content).toContain('JavaScript/TypeScript');
        });

        it('should include Python docs', async () => {
            await memory.seedLanguageDocs();
            const docs = await memory.getDocuments('python', 20);
            const pythonDoc = docs.find(d => d.id === 'lang-python');
            expect(pythonDoc).toBeDefined();
            expect(pythonDoc?.content).toContain('Python');
        });

        it('should include error patterns doc', async () => {
            await memory.seedLanguageDocs();
            const docs = await memory.getDocuments('error', 20);
            const errorDoc = docs.find(d => d.id === 'errors-all-patterns');
            expect(errorDoc).toBeDefined();
            expect(errorDoc?.content).toContain('Error categories');
        });
    });

    describe('getDocuments', () => {
        it('should return documents up to topK', async () => {
            await memory.seedLanguageDocs();
            const docs = await memory.getDocuments('test', 5);
            expect(docs.length).toBeLessThanOrEqual(5);
        });

        it('should return all documents if topK is large', async () => {
            await memory.seedLanguageDocs();
            const docs = await memory.getDocuments('test', 100);
            expect(docs.length).toBeGreaterThan(0);
        });
    });

    describe('getTables', () => {
        it('should return empty array when no tables', async () => {
            const tables = await memory.getTables('test');
            expect(tables).toEqual([]);
        });
    });

    describe('getChatHistory', () => {
        it('should return empty array when no history', async () => {
            const history = await memory.getChatHistory(10);
            expect(history).toEqual([]);
        });

        it('should return chat history up to limit', async () => {
            await memory.storeChatMessage({
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            });
            await memory.storeChatMessage({
                role: 'assistant',
                content: 'Hi there',
                timestamp: Date.now()
            });

            const history = await memory.getChatHistory(10);
            expect(history.length).toBe(2);
            expect(history[0].content).toBe('Hello');
            expect(history[1].content).toBe('Hi there');
        });

        it('should return last N messages', async () => {
            for (let i = 0; i < 5; i++) {
                await memory.storeChatMessage({
                    role: 'user',
                    content: `Message ${i}`,
                    timestamp: Date.now()
                });
            }

            const history = await memory.getChatHistory(3);
            expect(history.length).toBe(3);
            expect(history[0].content).toBe('Message 2');
            expect(history[2].content).toBe('Message 4');
        });
    });

    describe('storeDocument', () => {
        it('should store and retrieve document', async () => {
            const doc: DocumentRecord = {
                id: 'test-doc',
                content: 'Test content',
                metadata: { title: 'Test' },
                timestamp: Date.now()
            };

            await memory.storeDocument(doc);
            const docs = await memory.getDocuments('test', 10);
            const found = docs.find(d => d.id === 'test-doc');
            expect(found).toBeDefined();
            expect(found?.content).toBe('Test content');
        });
    });

    describe('storeChatMessage', () => {
        it('should store chat message', async () => {
            const message: ChatMessage = {
                role: 'user',
                content: 'Test message',
                timestamp: Date.now()
            };

            await memory.storeChatMessage(message);
            const history = await memory.getChatHistory(10);
            expect(history.length).toBe(1);
            expect(history[0].content).toBe('Test message');
        });

        it('should limit chat history to maxChatHistory', async () => {
            const memory = new ExternalMemory();
            // @ts-ignore
            memory.maxChatHistory = 5;

            for (let i = 0; i < 10; i++) {
                await memory.storeChatMessage({
                    role: 'user',
                    content: `Message ${i}`,
                    timestamp: Date.now()
                });
            }

            const history = await memory.getChatHistory(10);
            expect(history.length).toBe(5);
            expect(history[0].content).toBe('Message 5');
            expect(history[4].content).toBe('Message 9');
        });
    });

    describe('clearChatHistory', () => {
        it('should clear all chat history', async () => {
            await memory.storeChatMessage({
                role: 'user',
                content: 'Test',
                timestamp: Date.now()
            });

            await memory.clearChatHistory();
            const history = await memory.getChatHistory(10);
            expect(history).toEqual([]);
        });
    });
});


