import * as vscode from 'vscode';
import { OutputChannel } from '../../utils/outputChannel';
import { ZerouiClient, ZerouiMessage } from '../../utils/zerouiClient';

export interface GenerationRequest {
    context: string;
    query: string;
    chatHistory?: Array<{ role: string; content: string }>;
}

export interface GenerationResponse {
    response: string;
    model: string;
    finishReason: string;
}

export class Generator {
    private output: OutputChannel;
    private ollamaUrl: string;
    private model: string;
    private useZerouiBackend: boolean;
    private zerouiClient: ZerouiClient | null = null;

    constructor(output: OutputChannel) {
        const config = vscode.workspace.getConfiguration('ragAgent');
        this.output = output;
        this.ollamaUrl = config.get<string>('ollamaUrl', 'http://localhost:11434');
        this.model = config.get<string>('model', 'tinyllama');
        this.useZerouiBackend = config.get<boolean>('useZerouiBackend', false);
        
        if (this.useZerouiBackend) {
            this.zerouiClient = new ZerouiClient();
            this.output.logInfo('Generator configured to use Zeroui FastAPI backend');
        }
    }

    async generate(request: GenerationRequest, modelOverride?: string): Promise<GenerationResponse> {
        // #region agent log
        const genEntryTime = Date.now();
        fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:37',message:'generate entry',data:{useZerouiBackend:this.useZerouiBackend,modelOverride:modelOverride||'none',model:this.model},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // Use model override if provided (for RCA), otherwise use configured model
        const modelToUse = modelOverride || this.model;
        // Use Zeroui backend if enabled
        if (this.useZerouiBackend && this.zerouiClient) {
            try {
                // #region agent log
                const healthCheckStart = Date.now();
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:44',message:'before health check',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                // Check if Zeroui backend is available
                const isHealthy = await this.zerouiClient.checkHealth();
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:46',message:'after health check',data:{isHealthy,elapsed:Date.now()-healthCheckStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                if (!isHealthy) {
                    this.output.logError('Zeroui FastAPI backend is not available, falling back to direct Ollama');
                    return await this.generateWithOllama(request);
                }

                // Build messages for Zeroui
                const messages: ZerouiMessage[] = [
                    {
                        role: 'system',
                        content: [
                            'You are an inventory assistant.',
                            'Stay strictly on-topic for the user question.',
                            'Use only the provided context (internal + web) to answer the question.',
                            'Ignore unrelated/noisy text (installers, downloaders, keybindings, generic shortcuts, old snippets from previous questions).',
                            'Do NOT output or list the web snippets, URLs, source titles, or any [Web X] markers.',
                            'Do NOT include or repeat the context, guidelines, web snippet content, or URLs in your reply.',
                            'Do NOT echo back web snippet text verbatim.',
                            'Synthesize the information and provide ONLY a direct answer to the question.',
                            'If the context is insufficient or unrelated, reply: "No relevant information found."',
                            'Be concise and factual.'
                        ].join(' ')
                    }
                ];

                // Add chat history if available
                if (request.chatHistory && request.chatHistory.length > 0) {
                    for (const msg of request.chatHistory) {
                        if (msg.role === 'user' || msg.role === 'assistant') {
                            messages.push({
                                role: msg.role as 'user' | 'assistant',
                                content: msg.content
                            });
                        }
                    }
                }

                // Add current context and query
                messages.push({
                    role: 'user',
                    content: [
                        'Context:',
                        request.context,
                        '',
                        'Question:',
                        request.query,
                        '',
                        'Instructions:',
                        'Answer ONLY if relevant to the question and grounded in the context above.',
                        'Ignore unrelated/noisy text (installers, downloaders, keybindings, generic shortcuts, old snippets from previous questions).',
                        'Do NOT repeat or list web snippets, URLs, source titles, or web snippet content.',
                        'Do NOT include or repeat the context/guidelines, URLs, or web snippet text.',
                        'Synthesize the information and provide ONLY a direct answer to the question.',
                        'If no relevant info is found, reply exactly: "No relevant information found."'
                    ].join('\n')
                });

                // Override model in zerouiClient if model override provided
                if (modelToUse !== this.model && this.zerouiClient) {
                    const originalModel = this.zerouiClient['model'];
                    this.zerouiClient['model'] = modelToUse;
                    try {
                        const response = await this.zerouiClient.generate(messages);
                        return {
                            response: response,
                            model: modelToUse,
                            finishReason: 'stop'
                        };
                    } finally {
                        // Restore original model
                        this.zerouiClient['model'] = originalModel;
                    }
                }
                
                // #region agent log
                const zerouiGenStart = Date.now();
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:119',message:'before zeroui generate',data:{messageCount:messages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                // Generate using Zeroui
                const response = await this.zerouiClient.generate(messages);
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:121',message:'after zeroui generate',data:{responseLength:response.length,elapsed:Date.now()-zerouiGenStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                
                return {
                    response: response,
                    model: this.zerouiClient['model'] || 'zeroui-backend',
                    finishReason: 'stop'
                };
            } catch (err: any) {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:127',message:'zeroui error',data:{error:err.message,elapsed:Date.now()-genEntryTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                this.output.logError(`Zeroui backend error: ${err.message || err}`);
                this.output.logInfo('Falling back to direct Ollama connection');
                return await this.generateWithOllama(request, modelToUse);
            }
        }

        // Use direct Ollama connection
        return await this.generateWithOllama(request, modelToUse);
    }

    private async generateWithOllama(request: GenerationRequest, modelOverride?: string): Promise<GenerationResponse> {
        // #region agent log
        const ollamaStart = Date.now();
        fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:137',message:'generateWithOllama entry',data:{ollamaUrl:this.ollamaUrl,modelOverride:modelOverride||'none'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const modelToUse = modelOverride || this.model;
        // Quick health check to avoid long timeouts when Ollama is unreachable.
        // #region agent log
        const healthCheckStart = Date.now();
        fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:140',message:'before health check',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const healthy = await this.checkOllamaHealth(3000);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:141',message:'after health check',data:{healthy,elapsed:Date.now()-healthCheckStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (!healthy) {
            this.output.logError(`Ollama at ${this.ollamaUrl} is unreachable; using fallback.`);
            return this.fallbackResponse(request);
        }

        // Determine model characteristics (before try block for scope)
        const modelLower = modelToUse.toLowerCase();
        const isLargeModel = modelLower.includes('phi3') && modelLower.includes('128k') || 
                            modelLower.includes('qwen2.5') || 
                            modelLower.includes('deepseek') ||
                            modelLower.includes('llama3');
        const fetchTimeout = isLargeModel ? 180000 : 60000; // 180s (3 min) for large models, 60s for others

        // Preload model on first use to prevent loading delays (non-blocking)
        // Only preload large models that are known to take time
        const shouldPreload = (modelLower.includes('phi3') && modelLower.includes('128k')) || 
                             modelLower.includes('qwen2.5') || 
                             modelLower.includes('deepseek');
        if (shouldPreload) {
            // Preload asynchronously (don't wait for it)
            this.preloadModel(modelToUse).catch(() => {
                // Preload failure is not critical
            });
        }
        
        // Try Ollama first; if it fails, fall back to a deterministic template.
        try {
            // #region agent log
            const fetchStart = Date.now();
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:148',message:'before fetch to ollama',data:{url:`${this.ollamaUrl}/api/chat`,model:modelToUse,timeout:fetchTimeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            // Add timeout to fetch call using AbortController
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
            try {
                // Determine context limits based on model
                // Rough estimate: 1 token ≈ 4 characters
                const getModelContextLimit = (model: string): { maxTokens: number; maxChars: number } => {
                    const modelLower = model.toLowerCase();
                    if (modelLower.includes('tinyllama')) {
                        return { maxTokens: 2048, maxChars: 6000 }; // Reserve space for prompts
                    } else if (modelLower.includes('phi3') && modelLower.includes('128k')) {
                        return { maxTokens: 131072, maxChars: 500000 }; // 128k tokens, ~500k chars
                    } else if (modelLower.includes('phi3')) {
                        return { maxTokens: 4096, maxChars: 15000 };
                    } else if (modelLower.includes('qwen2.5') || modelLower.includes('qwen')) {
                        return { maxTokens: 32768, maxChars: 120000 }; // 32k tokens
                    } else if (modelLower.includes('deepseek')) {
                        return { maxTokens: 32768, maxChars: 120000 }; // 32k tokens
                    } else if (modelLower.includes('llama3')) {
                        return { maxTokens: 8192, maxChars: 30000 }; // 8k tokens
                    } else {
                        // Default to 4k tokens for unknown models
                        return { maxTokens: 4096, maxChars: 15000 };
                    }
                };
                
                const contextLimit = getModelContextLimit(modelToUse);
                let truncatedContext = request.context;
                
                // Only truncate if context exceeds model's limit
                if (request.context.length > contextLimit.maxChars) {
                    truncatedContext = request.context.substring(0, contextLimit.maxChars) + '\n\n[Context truncated due to model limits]';
                    this.output.logWarning(`Context truncated from ${request.context.length} to ${contextLimit.maxChars} characters for ${modelToUse} (${contextLimit.maxTokens} token limit)`);
                }
                
                // Build request body with appropriate context window
                const requestBody: any = {
                    model: modelToUse,
                    stream: false,
                    messages: [
                            {
                                role: 'system',
                                content: [
                                    'You are an inventory assistant.',
                                    'Stay strictly on-topic for the user question.',
                                    'Use only the provided context (internal + web) to answer the question.',
                                    'Ignore unrelated/noisy text (installers, downloaders, keybindings, generic shortcuts, old snippets from previous questions).',
                                    'Do NOT output or list the web snippets, URLs, source titles, or any [Web X] markers.',
                                    'Do NOT include or repeat the context, guidelines, web snippet content, or URLs in your reply.',
                                    'Do NOT echo back web snippet text verbatim.',
                                    'Synthesize the information and provide ONLY a direct answer to the question.',
                                    'If the context is insufficient or unrelated, reply: "No relevant information found."',
                                    'Be concise and factual.'
                                ].join(' ')
                            },
                            {
                                role: 'user',
                                content: [
                                    'Context:',
                                    truncatedContext,
                                    '',
                                    'Question:',
                                    request.query,
                                    '',
                                    'Instructions:',
                                    'Answer ONLY if relevant to the question and grounded in the context above.',
                                    'Ignore unrelated/noisy text (installers, downloaders, keybindings, generic shortcuts, old snippets from previous questions).',
                                    'Do NOT repeat or list web snippets, URLs, source titles, or web snippet content.',
                                    'Do NOT include or repeat the context/guidelines, URLs, or web snippet text.',
                                    'Synthesize the information and provide ONLY a direct answer to the question.',
                                    'If no relevant info is found, reply exactly: "No relevant information found."'
                                ].join('\n')
                            }
                        ]
                };
                
                // Add num_ctx parameter to explicitly set context window based on model
                // This helps prevent "context size too large" errors
                requestBody.num_ctx = contextLimit.maxTokens;
                
                const resp = await fetch(`${this.ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify(requestBody)
                });
                clearTimeout(timeoutId);
                // #region agent log
                const fetchEnd = Date.now();
                fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:191',message:'after fetch to ollama',data:{ok:resp.ok,status:resp.status,elapsed:fetchEnd-fetchStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (resp.ok) {
                    const data = await resp.json();
                    const content = data?.message?.content || '';
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:195',message:'ollama response parsed',data:{contentLength:content.length,elapsed:Date.now()-ollamaStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    if (content) {
                        return {
                            response: content,
                            model: modelToUse,
                            finishReason: data.done ? 'stop' : 'length'
                        };
                    }
                } else {
                    // Try to get error details from response
                    let errorDetail = `${resp.status} ${resp.statusText}`;
                    try {
                        const errorData = await resp.json();
                        errorDetail = errorData.error || errorData.message || errorDetail;
                        this.output.logError(`Ollama request failed: ${errorDetail}`);
                    } catch {
                        this.output.logError(`Ollama request failed: ${resp.status} ${resp.statusText}`);
                    }
                }
            } catch (fetchErr: any) {
                clearTimeout(timeoutId);
                if (fetchErr.name === 'AbortError') {
                    const timeoutSeconds = Math.round(fetchTimeout / 1000);
                    this.output.logError(`Ollama request timed out after ${timeoutSeconds} seconds for model ${modelToUse}`);
                    throw new Error(`Ollama request timed out after ${timeoutSeconds} seconds. The model may be loading for the first time. Try: ollama run ${modelToUse} to preload the model, or use a smaller model like tinyllama.`);
                }
                throw fetchErr;
            }
        } catch (err: any) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:204',message:'ollama fetch error',data:{error:err.message,elapsed:Date.now()-ollamaStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            this.output.logError(`Ollama call error: ${err.message || err}`);
        }

        // Fallback: deterministic, context-grounded template
        return this.fallbackResponse(request);
    }

    private async checkOllamaHealth(timeoutMs: number): Promise<boolean> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(`${this.ollamaUrl}/api/tags`, { method: 'GET', signal: controller.signal });
            return resp.ok;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Preload a model into Ollama to prevent loading delays on first request
     */
    private async preloadModel(modelName: string): Promise<void> {
        try {
            this.output.logInfo(`Preloading model ${modelName} to prevent first-request delays...`);
            // Send a minimal request to trigger model loading
            const preloadRequest = {
                model: modelName,
                messages: [{ role: 'user', content: 'test' }],
                stream: false,
                num_ctx: 128 // Minimal context for preload
            };
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for preload
            
            try {
                const resp = await fetch(`${this.ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify(preloadRequest)
                });
                clearTimeout(timeoutId);
                if (resp.ok) {
                    this.output.logInfo(`Model ${modelName} preloaded successfully`);
                }
            } catch {
                // Preload failure is not critical, just log
                this.output.logWarning(`Model preload failed, but continuing anyway`);
            }
        } catch (err) {
            // Preload is optional, don't fail if it doesn't work
            this.output.logWarning(`Could not preload model: ${err}`);
        }
    }

    private fallbackResponse(request: GenerationRequest): GenerationResponse {
        const fallback = [
            'Grounded response (fallback):',
            `Question: ${request.query}`,
            'Context summary:',
            request.context.slice(0, 600)
        ].join('\n');
        return {
            response: fallback,
            model: 'fallback-template',
            finishReason: 'fallback'
        };
    }
}

