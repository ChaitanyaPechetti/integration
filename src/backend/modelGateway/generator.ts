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
            this.output.logError(`Ollama at ${this.ollamaUrl} is unreachable. Please ensure Ollama is running.`);
            throw new Error(`Ollama server at ${this.ollamaUrl} is unreachable. Please ensure Ollama is running and accessible.`);
        }

        // Check if model exists (non-blocking, don't fail if check times out)
        const modelExists = await this.checkModelExists(modelToUse).catch(() => false);
        if (!modelExists) {
            this.output.logWarning(`Model ${modelToUse} may not be installed. Attempting request anyway...`);
        }

        // Determine model characteristics (before try block for scope)
        const modelLower = modelToUse.toLowerCase();
        const isLargeModel = modelLower.includes('phi3') && modelLower.includes('128k') || 
                            modelLower.includes('qwen2.5') || 
                            modelLower.includes('deepseek') ||
                            modelLower.includes('llama3');
        const isTinyLlama = modelLower.includes('tinyllama');
        // TinyLlama needs more time for first load, but less than large models
        const fetchTimeout = isLargeModel ? 180000 : (isTinyLlama ? 90000 : 60000); // 90s for TinyLlama, 180s for large, 60s for others

        // Preload ALL models to prevent first-request delays (non-blocking, safe)
        // Preloading is asynchronous and won't block or break anything
        const shouldPreload = true; // Always preload for faster first response
        if (shouldPreload) {
            // Preload asynchronously (don't wait for it) - won't block or break anything
            this.preloadModel(modelToUse).catch(() => {
                // Preload failure is not critical - silently continue
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
                        return { maxTokens: 2048, maxChars: 4000 }; // TinyLlama has 2048 token limit, use 4000 chars (reserve space for prompts/system)
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
                    messages: []
                };

                // Use shorter but strict system prompt ONLY for TinyLlama to save context
                // Apply extra-strict prompt for Qwen2.5 models for maximum accuracy
                // All other models keep the full prompt (backward compatible)
                const isQwen25 = modelLower.includes('qwen2.5') || modelLower.includes('qwen');
                
                if (modelLower.includes('tinyllama')) {
                    requestBody.messages.push({
                        role: 'system',
                        content: [
                            'You are a strict factual retrieval system. Answer ONLY the exact question asked.',
                            'CRITICAL: Answer the question directly. Do NOT infer what the user might want.',
                            'If the question is "what is X", answer what X IS, not errors, fixes, or other topics.',
                            'Only use information EXPLICITLY in the context. No assumptions. No inferences.',
                            'If the answer is not in context, reply: "No relevant information found."'
                        ].join(' ')
                    });
                    requestBody.messages.push({
                        role: 'user',
                        content: [
                            `Context:\n${truncatedContext}`,
                            '',
                            `Question: ${request.query}`,
                            '',
                            'CRITICAL INSTRUCTIONS:',
                            `1. Answer the question "${request.query}" directly and exactly.`,
                            '2. Do NOT infer what you think the user wants - answer what they asked.',
                            '3. If the question asks "what is X", provide what X IS, not related topics like errors or fixes.',
                            '4. Use ONLY information from the context above.',
                            '5. If the answer is not in the context, reply: "No relevant information found."',
                            '6. No assumptions. No inferences. No elaboration beyond what is asked.'
                        ].join('\n')
                    });
                } else if (isQwen25) {
                    // Extra-strict prompt for Qwen2.5 models
                    requestBody.messages.push({
                        role: 'system',
                        content: [
                            'You are a STRICT factual information retrieval system. Extract and present ONLY information explicitly stated in the provided context.',
                            '',
                            'CRITICAL RULES - ZERO TOLERANCE - 10/10 GOLD STANDARD:',
                            '1. NO HALLUCINATION: Only state facts EXPLICITLY written in the context. If information is not in the context, reply: "No relevant information found."',
                            '2. NO ASSUMPTIONS: Do not infer, deduce, or assume. Do not use general knowledge to fill gaps. Answer ONLY what is explicitly stated.',
                            '3. NO SYCOPHANCY: Do not add flattery, pleasantries, or elaboration. Answer ONLY what is asked. No artificial content.',
                            '4. NO FICTION: Do not create examples, scenarios, or hypotheticals unless explicitly requested.',
                            '5. NO INFERENCES: Do not draw conclusions beyond what is directly stated. Present facts as-is.',
                            '6. STRICT ACCURACY: Every claim must be directly traceable to the context. If you cannot point to exact text, do not include it.',
                            '7. ELIMINATE FALSE POSITIVES: When uncertain, default to "No relevant information found" rather than guessing.',
                            '8. DIRECT ANSWERS ONLY: Answer the EXACT question asked. Do NOT infer what the user might want. If asked "what is X", answer what X IS, not related topics.',
                            '',
                            'RESPONSE FORMAT:',
                            '- Answer ONLY the specific question asked',
                            '- Use ONLY information from the provided context',
                            '- If context is insufficient: reply EXACTLY "No relevant information found."',
                            '- Do NOT add explanations, examples, or additional context unless explicitly requested',
                            '- Do NOT repeat the question or add introductory phrases',
                            '- Do NOT output URLs, source titles, or web snippet markers',
                            '',
                            'QUALITY STANDARD: 10/10 Gold Standard - Zero tolerance for errors, assumptions, creative interpretation, or artificial content. 100% Accurate response required. No inferences. No artificial.'
                        ].join('\n')
                    });
                    requestBody.messages.push({
                        role: 'user',
                        content: [
                            'Context:',
                            truncatedContext,
                            '',
                            'Question:',
                            request.query,
                            '',
                            'CRITICAL INSTRUCTIONS - STRICT COMPLIANCE REQUIRED:',
                            `1. Answer the question "${request.query}" directly and exactly. Do NOT infer what you think the user wants.`,
                            '2. If the question asks "what is X", provide what X IS, not related topics like errors, fixes, or other information.',
                            '3. Answer ONLY if the answer is EXPLICITLY stated in the context above.',
                            '4. Do NOT infer, assume, or use general knowledge.',
                            '5. Do NOT add flattery, examples, or elaboration.',
                            '6. If the context does not contain the answer, reply EXACTLY: "No relevant information found."',
                            '7. Present facts as-is from the context. No inferences. No assumptions. No artificial content.',
                            '8. 100% accuracy required. Zero tolerance for hallucination or false positives.',
                            '9. Strict, careful processing demanded: no hallucination, no assumptions, no sycophancy, no fiction.',
                            '10. Deliver 10/10 Gold Standard Quality with elimination of all false positives. Do what is asked. 100% Accurate response, no inferences, no artificial.'
                        ].join('\n')
                    });
                } else {
                    // Full system prompt for all other models (unchanged, backward compatible)
                    requestBody.messages.push({
                        role: 'system',
                        content: [
                            'You are a strict factual information retrieval system. Extract and present ONLY information explicitly stated in the provided context.',
                            '',
                            'CRITICAL RULES - ZERO TOLERANCE:',
                            '1. NO HALLUCINATION: Only state facts EXPLICITLY written in the context. If information is not in the context, reply: "No relevant information found."',
                            '2. NO ASSUMPTIONS: Do not infer, deduce, or assume. Do not use general knowledge to fill gaps.',
                            '3. NO SYCOPHANCY: Do not add flattery, pleasantries, or elaboration. Answer ONLY what is asked.',
                            '4. NO FICTION: Do not create examples, scenarios, or hypotheticals unless explicitly requested.',
                            '5. NO INFERENCES: Do not draw conclusions beyond what is directly stated. Present facts as-is.',
                            '6. STRICT ACCURACY: Every claim must be directly traceable to the context. If you cannot point to exact text, do not include it.',
                            '7. ELIMINATE FALSE POSITIVES: When uncertain, default to "No relevant information found" rather than guessing.',
                            '',
                            'RESPONSE FORMAT:',
                            '- Answer ONLY the specific question asked',
                            '- Use ONLY information from the provided context',
                            '- If context is insufficient: reply EXACTLY "No relevant information found."',
                            '- Do NOT add explanations, examples, or additional context unless explicitly requested',
                            '- Do NOT repeat the question or add introductory phrases',
                            '- Do NOT output URLs, source titles, or web snippet markers',
                            '',
                            'QUALITY STANDARD: 10/10 Gold Standard - Zero tolerance for errors, assumptions, or creative interpretation.'
                        ].join('\n')
                    });
                    requestBody.messages.push({
                        role: 'user',
                        content: [
                            'Context:',
                            truncatedContext,
                            '',
                            'Question:',
                            request.query,
                            '',
                            'CRITICAL INSTRUCTIONS:',
                            'Answer ONLY if the answer is EXPLICITLY stated in the context above.',
                            'Do NOT infer, assume, or use general knowledge.',
                            'Do NOT add flattery, examples, or elaboration.',
                            'If the context does not contain the answer, reply EXACTLY: "No relevant information found."',
                            'Present facts as-is from the context. No inferences. No assumptions. No artificial content.',
                            '100% accuracy required. Zero tolerance for hallucination or false positives.'
                        ].join('\n')
                    });
                }
                
                // Fix: Use options object for num_ctx (correct Ollama API format)
                // This helps prevent "context size too large" errors
                // For TinyLlama, use a conservative context size to avoid memory issues
                const numCtxToUse = modelLower.includes('tinyllama') 
                    ? Math.min(contextLimit.maxTokens, 2048) // TinyLlama max is 2048 tokens
                    : contextLimit.maxTokens;
                requestBody.options = {
                    num_ctx: numCtxToUse
                };
                
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
                    } else {
                        // Empty content - this shouldn't happen, but handle it
                        this.output.logWarning(`Ollama returned empty content for model ${modelToUse}. Response data: ${JSON.stringify(data).substring(0, 200)}`);
                        throw new Error(`Ollama returned empty content. The model ${modelToUse} may not be installed or may have encountered an error. Try: ollama pull ${modelToUse}`);
                    }
                } else {
                    // Try to get error details from response
                    let errorDetail = `${resp.status} ${resp.statusText}`;
                    try {
                        const errorData = await resp.json();
                        errorDetail = errorData.error || errorData.message || errorDetail;
                        this.output.logError(`Ollama request failed: ${errorDetail}`);
                        
                        // Check for memory errors and provide helpful guidance
                        const errorLower = errorDetail.toLowerCase();
                        if (errorLower.includes('memory') || errorLower.includes('gib') || errorLower.includes('system memory')) {
                            this.output.logError(`Memory error detected. The model ${modelToUse} requires more memory than available.`);
                            this.output.logError(`Suggestions: 1) Use a smaller model like 'tinyllama', 2) Reduce context size, 3) Close other applications to free memory.`);
                            throw new Error(`Insufficient memory: ${errorDetail}. Try using a smaller model like 'tinyllama' or reduce the context size.`);
                        }
                    } catch (parseErr) {
                        if (parseErr instanceof Error && parseErr.message.includes('Insufficient memory')) {
                            throw parseErr; // Re-throw memory errors
                        }
                        this.output.logError(`Ollama request failed: ${resp.status} ${resp.statusText}`);
                    }
                    // Throw error so it can be caught and handled properly
                    throw new Error(`Ollama API error: ${errorDetail}`);
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
            
            // Check for specific error types and provide helpful guidance
            const errorMsg = (err.message || '').toLowerCase();
            if (errorMsg.includes('model') && (errorMsg.includes('not found') || errorMsg.includes('does not exist'))) {
                this.output.logError(`Model ${modelToUse} not found. Please install it with: ollama pull ${modelToUse}`);
            } else if (errorMsg.includes('memory') || errorMsg.includes('gib') || errorMsg.includes('system memory') || errorMsg.includes('insufficient memory')) {
                this.output.logError(`Memory error: ${err.message}`);
                this.output.logError(`The model ${modelToUse} requires more memory than available. Consider:`);
                this.output.logError(`1. Switch to a smaller model: Change 'ragAgent.model' setting to 'tinyllama'`);
                this.output.logError(`2. Reduce context size in settings`);
                this.output.logError(`3. Close other applications to free system memory`);
            }
            
            // Re-throw the error so ModelGateway can handle retries
            throw err;
        }
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
     * Check if a specific model is available in Ollama
     */
    private async checkModelExists(modelName: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000); // 5s timeout
            try {
                const resp = await fetch(`${this.ollamaUrl}/api/tags`, { method: 'GET', signal: controller.signal });
                clearTimeout(timer);
                if (resp.ok) {
                    const data = await resp.json();
                    const models = data?.models || [];
                    return models.some((m: any) => m.name === modelName || m.name?.includes(modelName));
                }
                return false;
            } catch {
                clearTimeout(timer);
                return false;
            }
        } catch {
            return false; // If check fails, assume model might exist and let the request fail with better error
        }
    }

    /**
     * Preload a model into Ollama to prevent loading delays on first request
     */
    private async preloadModel(modelName: string): Promise<void> {
        try {
            this.output.logInfo(`Preloading model ${modelName} to prevent first-request delays...`);
            const modelLower = modelName.toLowerCase();
            const isTinyLlama = modelLower.includes('tinyllama');
            
            // Send a minimal request to trigger model loading
            const preloadRequest: any = {
                model: modelName,
                messages: [{ role: 'user', content: 'test' }],
                stream: false,
                options: {
                    num_ctx: isTinyLlama ? 512 : 128 // Minimal context for preload
                }
            };
            
            const controller = new AbortController();
            const timeoutMs = isTinyLlama ? 60000 : 30000; // 60s for TinyLlama, 30s for others
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            
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
                // Preload failure is not critical - silently continue
                this.output.logWarning(`Model preload failed, but continuing anyway`);
            }
        } catch (err) {
            // Preload is optional - don't fail if it doesn't work
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

