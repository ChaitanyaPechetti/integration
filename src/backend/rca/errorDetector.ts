export interface ErrorPattern {
    category: 'syntax' | 'runtime' | 'type' | 'import' | 'dependency' | 'configuration' | 'network' | 'permission' | 'memory' | 'other';
    patterns: RegExp[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    commonCauses: string[];
    suggestedFixes: string[];
}

export interface ErrorDetectionResult {
    detected: boolean;
    category?: string;
    severity?: string;
    matchedPattern?: ErrorPattern;
    confidence: number;
}

export class ErrorDetector {
    private errorPatterns: ErrorPattern[] = [
        {
            category: 'syntax',
            patterns: [
                /SyntaxError:/i,
                /syntax error/i,
                /unexpected token/i,
                /missing.*semicolon/i,
                /unexpected end of file/i,
                /invalid syntax/i,
                /unexpected.*end/i,
                /expected.*but found/i
            ],
            severity: 'high',
            commonCauses: ['Missing brackets/parentheses', 'Incorrect indentation', 'Invalid character', 'Missing semicolon'],
            suggestedFixes: ['Check syntax around the error line', 'Verify brackets/parentheses are balanced', 'Check for typos', 'Verify indentation']
        },
        {
            category: 'type',
            patterns: [
                /TypeError:/i,
                /type error/i,
                /cannot read property/i,
                /undefined is not a function/i,
                /.*is not defined/i,
                /.*is not a constructor/i,
                /cannot read.*of undefined/i,
                /cannot read.*of null/i
            ],
            severity: 'high',
            commonCauses: ['Variable not initialized', 'Wrong data type', 'Missing import', 'Null/undefined value'],
            suggestedFixes: ['Check variable declarations', 'Verify imports', 'Check data types', 'Add null checks']
        },
        {
            category: 'import',
            patterns: [
                /ModuleNotFoundError/i,
                /module not found/i,
                /Cannot find module/i,
                /import.*failed/i,
                /require.*is not defined/i,
                /cannot resolve/i,
                /module.*not found/i
            ],
            severity: 'medium',
            commonCauses: ['Missing dependency', 'Incorrect import path', 'Package not installed', 'Wrong module name'],
            suggestedFixes: ['Install missing package', 'Check import paths', 'Verify package.json', 'Check node_modules']
        },
        {
            category: 'runtime',
            patterns: [
                /ReferenceError:/i,
                /reference error/i,
                /RangeError:/i,
                /range error/i,
                /cannot access.*before initialization/i,
                /Maximum call stack/i,
                /stack overflow/i,
                /recursion.*exceeded/i
            ],
            severity: 'high',
            commonCauses: ['Variable scope issue', 'Infinite recursion', 'Array index out of bounds', 'Temporal dead zone'],
            suggestedFixes: ['Check variable scope', 'Review recursive calls', 'Validate array indices', 'Check variable initialization order']
        },
        {
            category: 'dependency',
            patterns: [
                /peer dependency/i,
                /version conflict/i,
                /package.*not found/i,
                /npm.*error/i,
                /pip.*error/i,
                /dependency.*conflict/i,
                /version.*mismatch/i
            ],
            severity: 'medium',
            commonCauses: ['Version mismatch', 'Missing peer dependency', 'Corrupted node_modules', 'Lock file out of sync'],
            suggestedFixes: ['Update dependencies', 'Clear cache and reinstall', 'Check version compatibility', 'Delete node_modules and reinstall']
        },
        {
            category: 'configuration',
            patterns: [
                /config.*not found/i,
                /environment variable/i,
                /missing.*configuration/i,
                /invalid.*config/i,
                /configuration.*error/i,
                /env.*not set/i
            ],
            severity: 'medium',
            commonCauses: ['Missing config file', 'Environment variable not set', 'Invalid config format', 'Config path incorrect'],
            suggestedFixes: ['Create config file', 'Set environment variables', 'Validate config format', 'Check config file path']
        },
        {
            category: 'network',
            patterns: [
                /ECONNREFUSED/i,
                /ETIMEDOUT/i,
                /network error/i,
                /failed to fetch/i,
                /connection.*refused/i,
                /timeout/i,
                /connection.*reset/i
            ],
            severity: 'medium',
            commonCauses: ['Server not running', 'Firewall blocking', 'Wrong port/URL', 'Network connectivity issue'],
            suggestedFixes: ['Check server status', 'Verify network settings', 'Check firewall rules', 'Verify URL and port']
        },
        {
            category: 'permission',
            patterns: [
                /EACCES/i,
                /permission denied/i,
                /access.*denied/i,
                /unauthorized/i,
                /forbidden/i,
                /EACCES/i
            ],
            severity: 'high',
            commonCauses: ['Insufficient permissions', 'File locked', 'Wrong user', 'Read-only filesystem'],
            suggestedFixes: ['Check file permissions', 'Run with appropriate user', 'Unlock files', 'Check filesystem permissions']
        },
        {
            category: 'memory',
            patterns: [
                /out of memory/i,
                /heap.*overflow/i,
                /allocation.*failed/i,
                /memory.*exceeded/i,
                /heap.*out of memory/i
            ],
            severity: 'critical',
            commonCauses: ['Memory leak', 'Large data processing', 'Insufficient memory', 'Infinite loop creating objects'],
            suggestedFixes: ['Check for memory leaks', 'Optimize data processing', 'Increase memory limit', 'Review object creation']
        },
        {
            category: 'other',
            patterns: [
                /error/i,
                /exception/i,
                /failed/i,
                /cannot/i,
                /undefined/i,
                /null/i,
                /traceback/i,
                /stack.*trace/i
            ],
            severity: 'medium',
            commonCauses: ['Unknown error type', 'Multiple potential causes'],
            suggestedFixes: ['Review error message', 'Check logs', 'Search for similar errors']
        }
    ];

    detectError(errorMessage: string): ErrorDetectionResult {
        // Normalize error message
        const normalized = errorMessage.trim();
        
        if (!normalized) {
            return { detected: false, confidence: 0 };
        }

        // Check against specific error patterns (excluding 'other' category)
        for (const pattern of this.errorPatterns.slice(0, -1)) {
            for (const regex of pattern.patterns) {
                if (regex.test(normalized)) {
                    return {
                        detected: true,
                        category: pattern.category,
                        severity: pattern.severity,
                        matchedPattern: pattern,
                        confidence: 0.9
                    };
                }
            }
        }
        
        // Fallback: check for generic error indicators
        const genericErrorPatterns = [
            /error/i, /exception/i, /failed/i, /cannot/i, /undefined/i, /null/i, /traceback/i, /stack.*trace/i
        ];
        const hasGenericError = genericErrorPatterns.some(p => p.test(normalized));
        
        if (hasGenericError) {
            // Use 'other' category pattern
            const otherPattern = this.errorPatterns[this.errorPatterns.length - 1];
            return {
                detected: true,
                category: 'other',
                severity: 'medium',
                matchedPattern: otherPattern,
                confidence: 0.5
            };
        }
        
        return {
            detected: false,
            confidence: 0
        };
    }

    getErrorPatterns(): ErrorPattern[] {
        return this.errorPatterns;
    }
}

