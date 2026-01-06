import * as vscode from 'vscode';

export interface ZerouiMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ZerouiChatRequest {
    model: string;
    messages: ZerouiMessage[];
    stream?: boolean;
}

export interface ZerouiChatResponse {
    message?: {
        content: string;
    };
    content?: string;
    response?: string;
    text?: string;
    done?: boolean;
    error?: string;
}

export class ZerouiClient {
    private baseUrl: string;
    private model: string;

    constructor() {
        const config = vscode.workspace.getConfiguration('ragAgent');
        // FastAPI server endpoint (default: http://localhost:8001)
        this.baseUrl = config.get<string>('zerouiEndpoint', 'http://localhost:8001');
        this.model = config.get<string>('zerouiModel', 'phi3:mini-128k');
    }

    /**
     * Check if FastAPI server is healthy
     */
    public async checkHealth(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate response using FastAPI server (non-streaming)
     */
    public async generate(messages: ZerouiMessage[]): Promise<string> {
        // #region agent log
        const zerouiStart = Date.now();
        fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'zerouiClient.ts:54',message:'zeroui generate entry',data:{baseUrl:this.baseUrl,model:this.model,messageCount:messages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        try {
            const request: ZerouiChatRequest = {
                model: this.model,
                messages: messages,
                stream: false
            };

            // #region agent log
            const fetchStart = Date.now();
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'zerouiClient.ts:62',message:'before fetch to zeroui',data:{url:`${this.baseUrl}/api/chat`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            // Add timeout to fetch call using AbortController (55s timeout to be less than gateway timeout of 60s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 55000);
            let response: Response;
            try {
                response = await fetch(`${this.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify(request)
                });
                clearTimeout(timeoutId);
            } catch (fetchErr: any) {
                clearTimeout(timeoutId);
                if (fetchErr.name === 'AbortError') {
                    throw new Error(`FastAPI request timed out after 55 seconds. The server may be slow or unresponsive.`);
                }
                throw fetchErr;
            }
            // #region agent log
            const fetchEnd = Date.now();
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'zerouiClient.ts:68',message:'after fetch to zeroui',data:{ok:response.ok,status:response.status,elapsed:fetchEnd-fetchStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`FastAPI error: ${response.status} - ${errorText}`);
            }

            // Parse streaming response (even though stream=false, FastAPI may still return chunks)
            const text = await response.text();
            const lines = text.trim().split('\n').filter(line => line.trim());
            
            let fullResponse = '';
            for (const line of lines) {
                try {
                    const data: ZerouiChatResponse = JSON.parse(line);
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    if (data.message?.content) {
                        fullResponse += data.message.content;
                    } else if (data.content) {
                        fullResponse += data.content;
                    } else if (data.response) {
                        fullResponse += data.response;
                    } else if (data.text) {
                        fullResponse += data.text;
                    }
                    if (data.done) {
                        break;
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                    continue;
                }
            }

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'zerouiClient.ts:102',message:'zeroui generate success',data:{responseLength:fullResponse.length,elapsed:Date.now()-zerouiStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            return fullResponse || 'No response received from FastAPI server';
        } catch (error: any) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'zerouiClient.ts:104',message:'zeroui generate error',data:{error:error.message,elapsed:Date.now()-zerouiStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            let errorMessage = error.message || 'Unknown error';
            
            if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
                errorMessage = `Cannot connect to FastAPI server at ${this.baseUrl}. Make sure the FastAPI server is running.`;
            } else if (error.message.includes('ETIMEDOUT')) {
                errorMessage = `Network timeout to FastAPI server at ${this.baseUrl}. Check your network connection.`;
            }
            
            throw new Error(errorMessage);
        }
    }

    /**
     * Update configuration from VS Code settings
     */
    public updateConfig(): void {
        const config = vscode.workspace.getConfiguration('ragAgent');
        this.baseUrl = config.get<string>('zerouiEndpoint', 'http://localhost:8001');
        this.model = config.get<string>('zerouiModel', 'phi3:mini-128k');
    }
}

