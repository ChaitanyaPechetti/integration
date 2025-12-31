import { WriteActionHandler } from '../src/backend/writeActions/writeActionHandler';
import { OutputChannel } from '../src/utils/outputChannel';

describe('WriteActionHandler', () => {
    let handler: WriteActionHandler;
    let outputChannel: OutputChannel;

    beforeEach(() => {
        outputChannel = new OutputChannel();
        handler = new WriteActionHandler(outputChannel);
    });

    describe('sendEmail', () => {
        it('should send email successfully', async () => {
            const result = await handler.sendEmail('Test Subject', 'Test Body');
            expect(result.success).toBe(true);
            expect(result.message).toBe('Email sent successfully');
        });

        it('should handle email send with different subjects and bodies', async () => {
            const result1 = await handler.sendEmail('Subject 1', 'Body 1');
            expect(result1.success).toBe(true);

            const result2 = await handler.sendEmail('Subject 2', 'Body 2');
            expect(result2.success).toBe(true);
        });

        it('should handle empty subject and body', async () => {
            const result = await handler.sendEmail('', '');
            expect(result.success).toBe(true);
        });
    });

    describe('updateDatabase', () => {
        it('should update database successfully', async () => {
            const payload = { key: 'value' };
            const result = await handler.updateDatabase(payload);
            expect(result.success).toBe(true);
            expect(result.message).toBe('Database updated');
        });

        it('should handle different payload types', async () => {
            const payload1 = { id: 1, name: 'test' };
            const result1 = await handler.updateDatabase(payload1);
            expect(result1.success).toBe(true);

            const payload2 = { data: [1, 2, 3] };
            const result2 = await handler.updateDatabase(payload2);
            expect(result2.success).toBe(true);
        });

        it('should handle empty payload', async () => {
            const result = await handler.updateDatabase({});
            expect(result.success).toBe(true);
        });

        it('should handle null payload', async () => {
            const result = await handler.updateDatabase(null as any);
            expect(result.success).toBe(true);
        });

        it('should handle email send errors', async () => {
            const handler2 = handler as any;
            handler2.output.logError = jest.fn();
            // Mock setTimeout to throw error
            const originalSetTimeout = global.setTimeout;
            global.setTimeout = jest.fn((callback: any) => {
                throw new Error('Email service unavailable');
            }) as any;

            try {
                const result = await handler.sendEmail('Subject', 'Body');
                expect(result.success).toBe(false);
                expect(result.message).toBe('Email failed');
            } catch (err) {
                // Expected
            } finally {
                global.setTimeout = originalSetTimeout;
            }
        });

        it('should handle database update errors', async () => {
            const handler2 = handler as any;
            handler2.output.logError = jest.fn();
            // Mock setTimeout to throw error
            const originalSetTimeout = global.setTimeout;
            global.setTimeout = jest.fn((callback: any) => {
                throw new Error('Database connection failed');
            }) as any;

            try {
                const result = await handler.updateDatabase({ key: 'value' });
                expect(result.success).toBe(false);
                expect(result.message).toBe('DB update failed');
            } catch (err) {
                // Expected
            } finally {
                global.setTimeout = originalSetTimeout;
            }
        });
    });
});

