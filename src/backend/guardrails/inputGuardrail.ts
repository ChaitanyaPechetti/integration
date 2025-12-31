import { OutputChannel } from '../../utils/outputChannel';

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

export class InputGuardrail {
    private output: OutputChannel;
    private maxLength = 2000;
    private maxRequestsPerMinute = 60;
    private rateMap: Map<string, number[]> = new Map();

    constructor(output: OutputChannel) {
        this.output = output;
    }

    validate(input: string, userId = 'default'): ValidationResult {
        if (!input || input.trim().length === 0) {
            return { isValid: false, error: 'Empty input' };
        }
        if (input.length > this.maxLength) {
            return { isValid: false, error: 'Input too long' };
        }
        if (!this.checkRateLimit(userId)) {
            return { isValid: false, error: 'Rate limit exceeded' };
        }
        if (this.containsScript(input)) {
            return { isValid: false, error: 'Unsafe input detected' };
        }
        return { isValid: true };
    }

    sanitize(input: string): string {
        return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/javascript:/gi, '').trim();
    }

    private checkRateLimit(userId: string): boolean {
        const now = Date.now();
        const windowMs = 60_000;
        const history = this.rateMap.get(userId) || [];
        const recent = history.filter(ts => now - ts < windowMs);
        if (recent.length >= this.maxRequestsPerMinute) {
            return false;
        }
        recent.push(now);
        this.rateMap.set(userId, recent);
        return true;
    }

    private containsScript(text: string): boolean {
        const patterns = [
            /<script/gi,
            /onerror=/gi,
            /onload=/gi,
            /javascript:/gi
        ];
        return patterns.some(p => p.test(text));
    }
}

