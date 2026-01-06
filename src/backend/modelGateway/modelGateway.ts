import * as vscode from 'vscode';
import { Router } from './router';
import { Generator, GenerationRequest } from './generator';
import { Scorer } from './scorer';
import { OutputChannel } from '../../utils/outputChannel';

export interface GatewayResult {
    response: string;
    score: number;
    model: string;
}

interface RateLimiter {
    requests: number[];
    maxRequests: number;
    windowMs: number;
}

export class ModelGateway {
    private router: Router;
    private generator: Generator;
    private scorer: Scorer;
    private output: OutputChannel;
    private timeout: number; // milliseconds
    private maxRetries: number;
    private retryDelay: number; // milliseconds
    private rateLimiter: RateLimiter;

    constructor(output: OutputChannel) {
        const config = vscode.workspace.getConfiguration('ragAgent');
        this.router = new Router();
        this.generator = new Generator(output);
        this.scorer = new Scorer();
        this.output = output;
        
        // Load gateway controls from configuration
        // Use longer timeout for large models (180s default, configurable)
        this.timeout = config.get<number>('gatewayTimeout', 180000); // 180 seconds default (3 minutes for large models like phi3:mini-128k)
        this.maxRetries = config.get<number>('gatewayMaxRetries', 3);
        this.retryDelay = config.get<number>('gatewayRetryDelay', 1000); // 1 second default
        
        // Rate limiting: max requests per window
        const rateLimitWindow = config.get<number>('gatewayRateLimitWindow', 60000); // 1 minute default
        const rateLimitMaxRequests = config.get<number>('gatewayRateLimitMaxRequests', 10);
        this.rateLimiter = {
            requests: [],
            maxRequests: rateLimitMaxRequests,
            windowMs: rateLimitWindow
        };
    }

    private checkRateLimit(): boolean {
        const now = Date.now();
        // Remove requests outside the window
        this.rateLimiter.requests = this.rateLimiter.requests.filter(
            timestamp => now - timestamp < this.rateLimiter.windowMs
        );
        
        if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
            return false; // Rate limit exceeded
        }
        
        this.rateLimiter.requests.push(now);
        return true;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => 
                setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    async process(request: GenerationRequest): Promise<GatewayResult> {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'modelGateway.ts:79',message:'process entry',data:{queryLength:request.query.length,contextLength:request.context.length,timeout:this.timeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        // Check rate limit
        if (!this.checkRateLimit()) {
            const error = `Rate limit exceeded: maximum ${this.rateLimiter.maxRequests} requests per ${this.rateLimiter.windowMs / 1000} seconds`;
            this.output.logError(error);
            throw new Error(error);
        }

        // Detect RCA queries: check if context contains RCA markers
        const isRcaQuery = request.context.includes('ROOT CAUSE ANALYSIS REQUEST') || 
                          request.query.includes('rootcause:') ||
                          request.context.includes('ERROR CLASSIFICATION:');
        
        // Force tinyllama for RCA queries
        const modelOverride = isRcaQuery ? 'tinyllama' : undefined;
        const route = this.router.selectModel(modelOverride);
        
        // Adjust timeout based on model size (large models need more time)
        const modelLower = route.model.toLowerCase();
        const isLargeModel = modelLower.includes('phi3') && modelLower.includes('128k') || 
                            modelLower.includes('qwen2.5') || 
                            modelLower.includes('deepseek') ||
                            modelLower.includes('llama3');
        const effectiveTimeout = isLargeModel ? Math.max(this.timeout, 180000) : this.timeout; // At least 180s (3 min) for large models
        
        this.output.logInfo(`Routing to model: ${route.model}${isRcaQuery ? ' (RCA mode)' : ''} [timeout: ${effectiveTimeout}ms]`);

        let lastError: Error | null = null;
        
        // Retry logic with exponential backoff
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            let genStartTime = Date.now();
            try {
                if (attempt > 0) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    this.output.logInfo(`Retry attempt ${attempt}/${this.maxRetries} after ${delay}ms delay`);
                    await this.sleep(delay);
                    genStartTime = Date.now();
                }

                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'modelGateway.ts:109',message:'before withTimeout',data:{attempt:attempt+1,model:route.model,timeout:this.timeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                // Execute with timeout, pass model from router
                // Use effective timeout (longer for large models)
                const genResult = await this.withTimeout(
                    this.generator.generate(request, route.model),
                    effectiveTimeout
                );
                // #region agent log
                const genEndTime = Date.now();
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'modelGateway.ts:115',message:'after withTimeout success',data:{attempt:attempt+1,elapsed:genEndTime-genStartTime,responseLength:genResult.response.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                
                const score = this.scorer.score(genResult.response, request.context);
                
                this.output.logInfo(`Generation successful on attempt ${attempt + 1}`);
                
                return {
                    response: genResult.response,
                    score,
                    model: genResult.model
                };
            } catch (error: any) {
                // #region agent log
                const genEndTime = Date.now();
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'modelGateway.ts:124',message:'withTimeout error',data:{attempt:attempt+1,error:error.message,isTimeout:error.message.includes('timed out'),elapsed:genEndTime-genStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                lastError = error;
                this.output.logWarning(`Generation attempt ${attempt + 1} failed: ${error.message}`);
                
                // Don't retry on certain errors (e.g., rate limit, validation errors)
                if (error.message.includes('Rate limit') || error.message.includes('Invalid')) {
                    throw error;
                }
            }
        }

        // All retries exhausted
        this.output.logError(`Generation failed after ${this.maxRetries + 1} attempts`);
        throw lastError || new Error('Generation failed after all retries');
    }
}

