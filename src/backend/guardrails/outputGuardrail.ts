import { OutputChannel } from '../../utils/outputChannel';

export interface OutputCheck {
    isValid: boolean;
    error?: string;
    redactedText?: string;
    needsRegeneration?: boolean;
}

export class OutputGuardrail {
    private output: OutputChannel;
    private maxLength = 10_000;
    private sensitivePatterns: RegExp[] = [
        // Email addresses
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        // Credit card numbers (basic pattern)
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        // SSN (basic pattern)
        /\b\d{3}-\d{2}-\d{4}\b/g,
        // Phone numbers
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g
    ];
    private unsafePatterns: RegExp[] = [
        /<script/gi,
        /javascript:/gi,
        /on\w+\s*=/gi, // Event handlers like onclick=
        /<iframe/gi,
        /<object/gi,
        /<embed/gi
    ];

    constructor(output: OutputChannel) {
        this.output = output;
    }

    validate(text: string): OutputCheck {
        if (!text) {
            return { isValid: false, error: 'Empty output' };
        }
        if (text.length > this.maxLength) {
            return { isValid: false, error: 'Output too long', needsRegeneration: true };
        }
        
        // Check for unsafe content
        const hasUnsafe = this.containsUnsafeContent(text);
        if (hasUnsafe) {
            this.output.logWarning('Unsafe content detected in output');
            return { isValid: false, error: 'Unsafe content detected', needsRegeneration: true };
        }

        // Check for sensitive data
        const hasSensitive = this.containsSensitiveData(text);
        if (hasSensitive) {
            this.output.logWarning('Sensitive data detected in output, redacting...');
            const redacted = this.redactSensitiveData(text);
            return { isValid: true, redactedText: redacted };
        }

        return { isValid: true };
    }

    redactSensitiveData(text: string): string {
        let redacted = text;
        
        // Redact email addresses
        redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
        
        // Redact credit card numbers
        redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]');
        
        // Redact SSN
        redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');
        
        // Redact phone numbers
        redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
        
        return redacted;
    }

    private containsSensitiveData(text: string): boolean {
        return this.sensitivePatterns.some(pattern => pattern.test(text));
    }

    private containsUnsafeContent(text: string): boolean {
        return this.unsafePatterns.some(pattern => pattern.test(text));
    }

    /**
     * Regenerate output if validation fails
     * This is a placeholder - actual regeneration would require calling the model again
     */
    shouldRegenerate(check: OutputCheck): boolean {
        return check.needsRegeneration === true;
    }
}

