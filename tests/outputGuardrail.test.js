"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const outputGuardrail_1 = require("../src/backend/guardrails/outputGuardrail");
const outputChannel_1 = require("../src/utils/outputChannel");
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
describe('OutputGuardrail', () => {
    const guard = new outputGuardrail_1.OutputGuardrail(new TestOutput());
    it('blocks empty output', () => {
        const res = guard.validate('');
        expect(res.isValid).toBe(false);
    });
    it('redacts sensitive data', () => {
        const res = guard.validate('email a@b.com phone 123-456-7890');
        expect(res.isValid).toBe(true);
        expect(res.redactedText).toContain('[EMAIL_REDACTED]');
        expect(res.redactedText).toContain('[PHONE_REDACTED]');
    });
    it('flags unsafe content', () => {
        const res = guard.validate('<script>alert(1)</script>');
        expect(res.isValid).toBe(false);
        expect(res.needsRegeneration).toBe(true);
    });
    it('enforces max length', () => {
        const long = 'x'.repeat(10001);
        const res = guard.validate(long);
        expect(res.isValid).toBe(false);
        expect(res.needsRegeneration).toBe(true);
    });
});
//# sourceMappingURL=outputGuardrail.test.js.map