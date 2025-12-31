import * as vscode from 'vscode';
import { CacheManager } from '../../utils/cacheManager';
import { OutputChannel } from '../../utils/outputChannel';
import { DocumentRecord } from '../externalMemory';

interface GoogleSearchItem {
    title?: string;
    snippet?: string;
    link?: string;
}

export class WebSearch {
    private cache: CacheManager;
    private output: OutputChannel;

    constructor(cacheManager: CacheManager, outputChannel: OutputChannel) {
        this.cache = cacheManager;
        this.output = outputChannel;
    }

    private getConfig() {
        // Prefer workspace-scoped configuration; fall back to process env for resilience.
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        const config = vscode.workspace.getConfiguration('ragAgent', workspaceUri);

        // Pull from VS Code settings first
        const settingsApiKey = config.get<string>('googleApiKey', '') || '';
        const settingsCseId = config.get<string>('googleCseId', '') || '';
        const enableWebSearchSetting = config.get<boolean>('enableWebSearch', false);

        // Hard fallback to provided credentials if nothing is set (user explicitly shared these)
        const hardFallbackApiKey = 'AIzaSyBf57C0gNKrrPSj6_ca4UDn0LQoOAhR7W8';
        const hardFallbackCseId = '73cf9050a00e54311';

        // Fallback to environment variables if settings are empty
        const envApiKey = process.env.RAG_AGENT_GOOGLE_API_KEY || '';
        const envCseId = process.env.RAG_AGENT_GOOGLE_CSE_ID || '';

        const apiKey = settingsApiKey || envApiKey || hardFallbackApiKey;
        const cseId = settingsCseId || envCseId || hardFallbackCseId;
        const credentialsAvailable = !!apiKey && !!cseId;
        const enabled = enableWebSearchSetting && credentialsAvailable;

        // Log where we sourced the credentials to aid troubleshooting
        const apiKeySource = settingsApiKey ? 'settings' : (envApiKey ? 'env' : 'none');
        const cseIdSource = settingsCseId ? 'settings' : (envCseId ? 'env' : 'none');
        this.output.logInfo(`[WebSearch] Config sources -> API Key: ${apiKeySource}, CSE ID: ${cseIdSource}, enableWebSearch: ${enableWebSearchSetting}, credentialsAvailable: ${credentialsAvailable}`);

        return { apiKey, cseId, credentialsAvailable, enabled };
    }

    isEnabled(): boolean {
        return this.getConfig().enabled;
    }

    hasCredentials(): boolean {
        return this.getConfig().credentialsAvailable;
    }

    async search(query: string, topK: number, forceSearch: boolean = false): Promise<DocumentRecord[]> {
        // Reload config on each search to pick up settings changes
        const config = this.getConfig();
        this.output.logInfo(`[WebSearch] search() called with query="${query}", topK=${topK}, forceSearch=${forceSearch}`);
        this.output.logInfo(`[WebSearch] Config - API Key: ${config.apiKey ? config.apiKey.substring(0, 10) + '...' + config.apiKey.substring(config.apiKey.length - 4) : 'NOT SET'}, CSE ID: ${config.cseId || 'NOT SET'}`);
        this.output.logInfo(`[WebSearch] credentialsAvailable: ${config.credentialsAvailable}, enabled: ${config.enabled}`);
        
        // Always allow search if credentials exist (forceSearch=true means always use)
        if (!config.credentialsAvailable) {
            this.output.logWarning('[WebSearch] Google web search not configured. Set ragAgent.googleApiKey and ragAgent.googleCseId in settings.');
            this.output.logWarning(`[WebSearch] Current API Key: ${config.apiKey ? 'SET (' + config.apiKey.length + ' chars)' : 'NOT SET'}, CSE ID: ${config.cseId ? 'SET (' + config.cseId + ')' : 'NOT SET'}`);
            return [];
        }
        
        // If forceSearch is true, always perform search regardless of enableWebSearch setting
        if (!config.enabled && !forceSearch) {
            this.output.logInfo(`[WebSearch] Search skipped - enabled=${config.enabled}, forceSearch=${forceSearch}`);
            return [];
        }
        
        this.output.logInfo(`[WebSearch] Proceeding with search (enabled=${config.enabled}, forceSearch=${forceSearch})`);

        const cached = this.cache.getWebCache(query);
        if (cached) {
            this.output.logInfo('Web cache hit');
            return cached;
        }

        try {
            this.output.logInfo(`[WebSearch] Performing Google web search for: "${query}"`);
            this.output.logInfo(`[WebSearch] Using API Key: ${config.apiKey.substring(0, 10)}...${config.apiKey.substring(config.apiKey.length - 4)}, CSE ID: ${config.cseId}`);
            const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(config.apiKey)}&cx=${encodeURIComponent(config.cseId)}&q=${encodeURIComponent(query)}&num=${Math.min(topK, 10)}`;
            this.output.logInfo(`[WebSearch] Fetching URL: https://www.googleapis.com/customsearch/v1?key=***&cx=${config.cseId}&q=${encodeURIComponent(query)}&num=${Math.min(topK, 10)}`);
            
            const response = await fetch(url);
            this.output.logInfo(`[WebSearch] Response status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                this.output.logError(`[WebSearch] API Error Response: ${errorText.substring(0, 500)}`);
                throw new Error(`Google CSE error: ${response.status} ${response.statusText}${errorText ? ' - ' + errorText.substring(0, 200) : ''}`);
            }
            
            const data = await response.json();
            this.output.logInfo(`[WebSearch] API Response received, checking for items...`);
            this.output.logInfo(`[WebSearch] Response keys: ${Object.keys(data).join(', ')}`);
            
            const items: GoogleSearchItem[] = data.items || [];
            this.output.logInfo(`[WebSearch] Found ${items.length} items in API response`);
            
            if (items.length === 0) {
                this.output.logWarning(`[WebSearch] Google web search returned no results for query: "${query}"`);
                this.output.logWarning(`[WebSearch] API Response: ${JSON.stringify(data).substring(0, 500)}`);
                return [];
            }
            
            const docs: DocumentRecord[] = items.slice(0, topK).map((item, idx) => {
                const doc = {
                    id: item.link || `web-${idx}`,
                    content: `${item.title || ''}\n${item.snippet || ''}\n${item.link || ''}`.trim(),
                    metadata: { link: item.link, title: item.title },
                    timestamp: Date.now()
                };
                this.output.logInfo(`[WebSearch] Mapped item ${idx + 1}: ${item.title || 'No title'} -> ${item.link || 'No link'}`);
                return doc;
            });
            
            this.cache.setWebCache(query, docs);
            this.output.logInfo(`[WebSearch] Google web search returned ${docs.length} results and cached them`);
            return docs;
        } catch (err: any) {
            this.output.logError(`[WebSearch] Web search failed: ${err.message || err}`);
            this.output.logError(`[WebSearch] Error type: ${err.constructor?.name || 'Unknown'}`);
            if (err.stack) {
                this.output.logError(`[WebSearch] Error stack: ${err.stack.substring(0, 500)}`);
            }
            return [];
        }
    }
}

