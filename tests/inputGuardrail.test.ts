import { InputGuardrail } from '../src/backend/guardrails/inputGuardrail';
import { OutputChannel } from '../src/utils/outputChannel';

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

describe('InputGuardrail', () => {
    let guardrail: InputGuardrail;
    let output: TestOutput;

    beforeEach(() => {
        output = new TestOutput();
        guardrail = new InputGuardrail(output);
    });

    describe('validate', () => {
        it('should reject empty input', () => {
            const result = guardrail.validate('');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Empty input');
        });

        it('should reject whitespace-only input', () => {
            const result = guardrail.validate('   \n\t  ');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Empty input');
        });

        it('should reject input that is too long', () => {
            const longInput = 'a'.repeat(2001);
            const result = guardrail.validate(longInput);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Input too long');
        });

        it('should reject when rate limit exceeded', () => {
            const guard = guardrail as any;
            guard.checkRateLimit = jest.fn().mockReturnValue(false);

            const result = guardrail.validate('test input', 'user1');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Rate limit exceeded');
        });

        it('should reject unsafe input with script tags', () => {
            const result = guardrail.validate('Hello <script>alert("xss")</script> world');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Unsafe input detected');
        });

        it('should reject input with javascript: protocol', () => {
            const result = guardrail.validate('Click javascript:void(0)');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Unsafe input detected');
        });

        it('should reject input with onerror attribute', () => {
            const result = guardrail.validate('Image onerror="alert(1)"');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Unsafe input detected');
        });

        it('should reject input with onload attribute', () => {
            const result = guardrail.validate('Body onload="alert(1)"');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Unsafe input detected');
        });

        it('should accept valid input', () => {
            const result = guardrail.validate('What is TypeScript?');
            expect(result.isValid).toBe(true);
        });
    });

    describe('sanitize', () => {
        it('should remove script tags', () => {
            const input = 'Hello <script>alert("xss")</script> world';
            const sanitized = guardrail.sanitize(input);
            expect(sanitized).not.toContain('<script>');
            expect(sanitized).not.toContain('</script>');
        });

        it('should remove javascript: protocol', () => {
            const input = 'Click javascript:void(0)';
            const sanitized = guardrail.sanitize(input);
            expect(sanitized).not.toContain('javascript:');
        });

        it('should trim whitespace', () => {
            const input = '   Hello world   ';
            const sanitized = guardrail.sanitize(input);
            expect(sanitized).toBe('Hello world');
        });
    });

    describe('checkRateLimit', () => {
        it('should allow requests within rate limit', () => {
            const guard = guardrail as any;
            const result1 = guard.checkRateLimit('user1');
            const result2 = guard.checkRateLimit('user1');
            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        it('should enforce rate limit per user', () => {
            const guard = guardrail as any;
            guard.maxRequestsPerMinute = 2;

            expect(guard.checkRateLimit('user1')).toBe(true);
            expect(guard.checkRateLimit('user1')).toBe(true);
            expect(guard.checkRateLimit('user1')).toBe(false);
        });

        it('should track rate limits separately per user', () => {
            const guard = guardrail as any;
            guard.maxRequestsPerMinute = 1;

            expect(guard.checkRateLimit('user1')).toBe(true);
            expect(guard.checkRateLimit('user2')).toBe(true);
            expect(guard.checkRateLimit('user1')).toBe(false);
            expect(guard.checkRateLimit('user2')).toBe(false);
        });
    });
});


