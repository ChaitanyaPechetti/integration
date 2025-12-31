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

        // Try Ollama first; if it fails, fall back to a deterministic template.
        try {
            // #region agent log
            const fetchStart = Date.now();
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generator.ts:148',message:'before fetch to ollama',data:{url:`${this.ollamaUrl}/api/chat`,model:modelToUse},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            // Add timeout to fetch call using AbortController (25s timeout to be less than gateway timeout)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            try {
                const resp = await fetch(`${this.ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
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
                            }
                        ]
                    })
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
                    this.output.logError(`Ollama request failed: ${resp.status} ${resp.statusText}`);
                }
            } catch (fetchErr: any) {
                clearTimeout(timeoutId);
                if (fetchErr.name === 'AbortError') {
                    throw new Error(`Ollama request timed out after 25 seconds. The model may be loading or the server is unresponsive.`);
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
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const resp = await fetch(`${this.ollamaUrl}/api/tags`, { method: 'GET', signal: controller.signal });
            clearTimeout(timer);
            return resp.ok;
        } catch {
            return false;
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

