import { OutputGuardrail } from '../src/backend/guardrails/outputGuardrail';
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

describe('OutputGuardrail', () => {
  const guard = new OutputGuardrail(new TestOutput());

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

