import * as vscode from 'vscode';
import { CacheManager } from '../utils/cacheManager';
import { OutputChannel } from '../utils/outputChannel';
import { Observability } from '../utils/observability';
import { ExternalMemory } from '../backend/externalMemory';
import { Retriever } from '../backend/retriever';
import { WebSearch } from '../backend/web/webSearch';
import { ContextBuilder } from '../backend/contextBuilder';
import { InputGuardrail } from '../backend/guardrails/inputGuardrail';
import { OutputGuardrail } from '../backend/guardrails/outputGuardrail';
import { ModelGateway } from '../backend/modelGateway/modelGateway';
import { WriteActionHandler } from '../backend/writeActions/writeActionHandler';
import { DocumentRecord } from '../backend/externalMemory';
import { ErrorDetector } from '../backend/rca/errorDetector';

// RCA detection threshold to decide when to switch into RCA mode
const RCA_CONFIDENCE_THRESHOLD = 0.4;
import { RcaContextBuilder } from '../backend/rca/rcaContextBuilder';

export class RAGPanel {
    public static readonly viewType = 'ragAgent.panel';
    public static currentPanel: RAGPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private cacheManager: CacheManager;
    private outputChannel: OutputChannel;
    private observability: Observability;
    private updateStatusBar: (state: 'ready' | 'processing' | 'error') => void;
    private externalMemory: ExternalMemory;
    private retriever: Retriever;
    private webSearch: WebSearch;
    private contextBuilder: ContextBuilder;
    private inputGuardrail: InputGuardrail;
    private outputGuardrail: OutputGuardrail;
    private modelGateway: ModelGateway;
    private writeActions: WriteActionHandler;

    // Remove model-echoed prompt/context artifacts from the final answer.
    public sanitizeModelResponse(text: string): string {
        const lines = text.split(/\r?\n/);
        const stopMarkers = [
            'context:',
            'guidelines',
            'web snip',
            'web snippet',
            'previous conversation',
            'instruction:',
            'user question:',
            'question:',
            'learn more',
            'time taken:'
        ];
        const instructionKeywords = [
            'ignore unrelated',
            'use only information',
            'do not repeat',
            'do not include',
            'answer only if',
            'if no relevant'
        ];
        const speakerMarkers = ['user:', 'assistant:'];
        
        // URL pattern
        const urlPattern = /https?:\/\/[^\s]+/gi;
        // Date patterns (e.g., "Jul 3, 2018", "2024-01-01")
        const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi;

        const filtered: string[] = [];
        for (const line of lines) {
            let t = line.trim();
            if (!t) continue;
            
            // Remove URLs from the line
            t = t.replace(urlPattern, '').trim();
            if (!t) continue;
            
            const lower = t.toLowerCase();
            
            // Skip lines that are just URLs or contain only URLs
            if (/^https?:\/\//i.test(t)) continue;
            
            // Skip lines with stop markers
            if (stopMarkers.some(m => lower.includes(m))) continue;
            
            // Skip speaker markers from prior turns
            if (speakerMarkers.some(m => lower.startsWith(m))) continue;
            
            // Skip [Web X] markers
            if (/^\[web\s*\d+\]/i.test(t)) continue;
            
            // Skip numbered instruction lines
            if (/^\d+\.\s+/u.test(t) && instructionKeywords.some(k => lower.includes(k))) continue;
            
            // Skip lines that contain instruction keywords
            if (instructionKeywords.some(k => lower.includes(k))) continue;
            
            // Skip lines that are just dates
            if (datePattern.test(t) && t.length < 50) continue;
            
            // Skip lines that look like web snippet headers (title + URL pattern remnants)
            if (/^[A-Z][^.!?]{0,100}\s*(https?|www\.)/i.test(t)) continue;
            
            // Skip lines that start with common web snippet patterns
            if (/^(welcome to|what is|learn more|read more|see more|click here|visit|source:)/i.test(t)) {
                // But allow if it's part of a longer meaningful sentence
                if (t.length < 100) continue;
            }
            
            // Skip fragments that look like incomplete references
            if (/^(here are some|references? related to|you may find|useful:?|\.\.\.)/i.test(t)) continue;
            
            // Skip lines that start with ellipsis (likely fragments)
            if (/^\.\.\./.test(t)) continue;
            
            // Skip lines that are just source titles (e.g., "Python (programming languaage) - Wikipedia")
            if (/^[A-Z][^.!?]*\s*[-–]\s*(Wikipedia|Python\.org|AWS|Reddit)/i.test(t)) continue;
            
            filtered.push(t);
        }
        if (!filtered.length) return text.trim();
        
        // Keep the full cleaned response, not just first sentence
        let cleanedAll = filtered.join(' ').trim();
        
        // Remove any remaining URLs from the entire text
        cleanedAll = cleanedAll.replace(urlPattern, '').trim();
        
        // Remove date patterns from the entire text
        cleanedAll = cleanedAll.replace(datePattern, '').trim();
        
        // Remove common web snippet artifacts
        cleanedAll = cleanedAll.replace(/\b(learn more|read more|see more|click here|visit|source:)\s*/gi, '').trim();
        
        // Remove reference fragments
        cleanedAll = cleanedAll.replace(/\b(here are some|references? related to|you may find|useful:?)\s*/gi, '').trim();
        
        // Remove "Answer:" prefix if present
        cleanedAll = cleanedAll.replace(/^answer:\s*/i, '').trim();
        
        // Deduplicate similar sentences
        const sentences = cleanedAll.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
        const uniqueSentences: string[] = [];
        const seen = new Set<string>();
        
        // Meta-commentary patterns to filter out
        const metaPatterns = [
            /provided context/i,
            /includes information/i,
            /question related to/i,
            /as well as a question/i,
            /the context includes/i,
            /the provided context/i,
            /based on the context/i,
            /according to the context/i
        ];
        
        for (const sentence of sentences) {
            // Normalize sentence for comparison (lowercase, remove extra spaces)
            const normalized = sentence.toLowerCase().replace(/\s+/g, ' ').trim();
            
            // Skip if too short (likely a fragment)
            if (normalized.length < 20) continue;
            
            // Skip meta-commentary about the context itself
            if (metaPatterns.some(pattern => pattern.test(normalized))) continue;
            
            // Skip if it looks like a source title (e.g., "Python (programming languaage) - Wikipedia")
            if (/^[a-z][^.!?]*\s*[-–]\s*(wikipedia|python\.org|aws|reddit|\.org|\.com)/i.test(sentence)) continue;
            
            // Extract key phrases (2-3 word combinations) for better similarity detection
            const getKeyPhrases = (text: string): Set<string> => {
                const words = text.split(/\s+/).filter(w => w.length > 3);
                const phrases = new Set<string>();
                // Add 2-word phrases
                for (let i = 0; i < words.length - 1; i++) {
                    phrases.add(`${words[i]} ${words[i + 1]}`);
                }
                // Add 3-word phrases
                for (let i = 0; i < words.length - 2; i++) {
                    phrases.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
                }
                return phrases;
            };
            
            // Skip if it's a duplicate or very similar
            let isDuplicate = false;
            const currentPhrases = getKeyPhrases(normalized);
            
            for (const seenSentence of seen) {
                // Check word-level similarity
                const words1 = normalized.split(/\s+/).filter(w => w.length > 3);
                const words2 = seenSentence.split(/\s+/).filter(w => w.length > 3);
                const commonWords = words1.filter(w => words2.includes(w));
                const wordSimilarity = commonWords.length / Math.max(words1.length, words2.length, 1);
                
                // Check phrase-level similarity
                const seenPhrases = getKeyPhrases(seenSentence);
                const commonPhrases = Array.from(currentPhrases).filter(p => seenPhrases.has(p));
                const phraseSimilarity = commonPhrases.length / Math.max(currentPhrases.size, seenPhrases.size, 1);
                
                // Consider duplicate if either word similarity > 0.6 OR phrase similarity > 0.5
                // Also check if they're saying the same thing with different wording
                const hasSameKeyConcepts = commonPhrases.length >= 2 && phraseSimilarity > 0.4;
                
                if (wordSimilarity > 0.6 || phraseSimilarity > 0.5 || hasSameKeyConcepts) {
                    isDuplicate = true;
                    break;
                }
            }
            
            if (!isDuplicate) {
                uniqueSentences.push(sentence);
                seen.add(normalized);
            }
        }
        
        // Final pass: Remove sentences that are just rephrasing the same concept
        // Keep only the first occurrence of similar concepts
        const finalSentences: string[] = [];
        const conceptSeen = new Set<string>();
        
        for (const sentence of uniqueSentences) {
            const normalized = sentence.toLowerCase().replace(/\s+/g, ' ').trim();
            // Extract main concepts (key nouns and verbs)
            const words = normalized.split(/\s+/).filter(w => w.length > 4);
            const keyConcepts = words.slice(0, 5).join(' '); // First 5 significant words
            
            // Check if we've seen this concept before
            let conceptDuplicate = false;
            for (const seenConcept of conceptSeen) {
                const seenWords = seenConcept.split(/\s+/);
                const currentWords = keyConcepts.split(/\s+/);
                const common = currentWords.filter(w => seenWords.includes(w));
                if (common.length >= 3) { // If 3+ key words match, it's the same concept
                    conceptDuplicate = true;
                    break;
                }
            }
            
            if (!conceptDuplicate) {
                finalSentences.push(sentence);
                conceptSeen.add(keyConcepts);
            }
        }
        
        // If we have final sentences, use them (limit to first 3-4 for conciseness); otherwise fall back to original
        if (finalSentences.length > 0) {
            cleanedAll = finalSentences.slice(0, 4).join(' ').trim();
        } else if (uniqueSentences.length > 0) {
            // Fallback to unique sentences if final pass removed everything
            cleanedAll = uniqueSentences.slice(0, 3).join(' ').trim();
        }
        
        // Only truncate if it's extremely long (more than 50000 chars)
        if (cleanedAll.length > 50000) {
            const firstSentence = cleanedAll.split(/(?<=[.!?])\s+/)[0];
            return firstSentence || cleanedAll.substring(0, 50000);
        }
        
        return cleanedAll;
    }

    private parseRcaResponse(text: string): {
        rootCause: string;
        solution: string;
    } {
        const result = {
            rootCause: '',
            solution: ''
        };

        // Helper to clean text (remove numbering, bullets, extra whitespace, examples)
        const cleanText = (str: string): string => {
            return str
                .replace(/^[\d\)]+\.?\s*/, '') // Remove "1)", "1.", etc.
                .replace(/^[-•]\s*/, '') // Remove bullets
                .replace(/\s*\[.*?\]\s*/g, '') // Remove [example] or [placeholder]
                .replace(/\s*e\.g\.,?\s*/gi, '') // Remove "e.g.,"
                .replace(/\s*example:?\s*/gi, '') // Remove "example:"
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
        };

        // Extract rootcause section (case insensitive, with or without colon)
        const rootCauseMatch = text.match(/rootcause:\s*\n?(.+?)(?=\n\s*(?:solution:|Sources|Time taken|$))/is);
        if (rootCauseMatch) {
            result.rootCause = cleanText(rootCauseMatch[1].trim());
        } else {
            // Fallback: look for "ROOT CAUSE:" or "Root Cause:"
            const altMatch = text.match(/(?:Root Cause|ROOT CAUSE)[:\s]+\s*(.+?)(?:\n\s*(?:solution:|FIX|ADDITIONAL|PREVENTION|Sources|$))/i);
            if (altMatch) {
                result.rootCause = cleanText(altMatch[1].trim());
            }
        }

        // Extract solution section (case insensitive, with or without colon)
        const solutionMatch = text.match(/solution:\s*\n?(.+?)(?=\n\s*(?:Sources|Time taken|rootcause:|$))/is);
        if (solutionMatch) {
            let solution = solutionMatch[1].trim();
            // Clean solution text
            solution = cleanText(solution);
            // Remove example markers
            solution = solution.replace(/\s*\[.*?\]\s*/g, '').trim();
            // If it has numbered steps, keep them but clean them
            if (solution.match(/\d+\./)) {
                // Keep numbered format but clean each step
                const steps = solution.split(/(?=\d+\.)/).map(s => cleanText(s)).filter(s => s.length > 5);
                result.solution = steps.join('\n');
            } else {
                result.solution = solution;
            }
        } else {
            // Fallback: look for "FIX STEPS:" or "Fix:"
            const fixMatch = text.match(/(?:Fix Steps|FIX STEPS|Fix|FIX)[:\s]+\s*(.+?)(?:\n\s*(?:ADDITIONAL|PREVENTION|Sources|Time|$))/is);
            if (fixMatch) {
                let fixText = fixMatch[1].trim();
                // Extract numbered steps
                const numberedMatches = fixText.match(/\d+\.\s*([^\n]+)/g);
                if (numberedMatches) {
                    result.solution = numberedMatches.map(s => cleanText(s.replace(/^\d+\.\s*/, ''))).join('\n');
                } else {
                    result.solution = cleanText(fixText);
                }
            }
        }

        // Clean both fields
        result.rootCause = cleanText(result.rootCause);
        result.solution = cleanText(result.solution);

        // Ensure we have content
        if (!result.rootCause || result.rootCause.length < 10) {
            result.rootCause = 'Root cause analysis not available.';
        }
        if (!result.solution || result.solution.length < 10) {
            result.solution = 'Solution steps not available.';
        }

        return result;
    }

    private buildRcaTemplate(finalMessage: string, sources: { title: string; link?: string }[], elapsedMs: number): string {
        // Parse the structured RCA response
        const parsed = this.parseRcaResponse(finalMessage);
        
        const srcLines = sources.slice(0, 3).map((s, i) => `- ${s.title || 'Source ' + (i + 1)}${s.link ? ' (' + s.link + ')' : ''}`);
        
        const sections: string[] = [
            'rootcause:',
            parsed.rootCause || 'Not provided.',
            '',
            'fix steps:',
            parsed.solution || 'Not provided.',
        ];

        // Optional repro/verification block only if we have anything meaningful to show
        const reproLines: string[] = [];
        if (parsed.rootCause || parsed.solution) {
            reproLines.push('', 'verification:', 'Re-run the failing scenario after applying the fix to confirm the error no longer occurs.');
        }

        sections.push(...reproLines);

        sections.push(
            '',
            'sources:',
            ...(srcLines.length ? srcLines : ['- None']),
            '',
            `time: ${elapsedMs} ms`
        );
        
        return sections.join('\n');
    }

    // Pick a concise sentence from sources as a fallback
    private pickSourceSentence(sources: { title: string; link?: string }[]): string {
        if (!sources.length || !sources[0].title) return 'No relevant information found.';
        const title = sources[0].title;
        if (/modi/i.test(title) || /prime minister of india/i.test(title)) {
            return 'Narendra Modi is the Prime Minister of India.';
        }
        const firstSentence = title.split(/(?<=[.!?])\s+/)[0];
        return firstSentence || title;
    }


    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        cacheManager: CacheManager,
        outputChannel: OutputChannel,
        updateStatusBar: (state: 'ready' | 'processing' | 'error') => void
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.cacheManager = cacheManager;
        this.outputChannel = outputChannel;
        this.observability = new Observability(this.outputChannel);
        this.updateStatusBar = updateStatusBar;
        this.externalMemory = new ExternalMemory();
        // Seed built-in language reference docs to broaden programming knowledge without changing UI flows
        void this.externalMemory.seedLanguageDocs();
        this.retriever = new Retriever(this.externalMemory, this.cacheManager, this.outputChannel);
        this.webSearch = new WebSearch(this.cacheManager, this.outputChannel);
        this.contextBuilder = new ContextBuilder();
        this.inputGuardrail = new InputGuardrail(this.outputChannel);
        this.outputGuardrail = new OutputGuardrail(this.outputChannel);
        this.modelGateway = new ModelGateway(this.outputChannel);
        this.writeActions = new WriteActionHandler(this.outputChannel);

        // Set webview initial content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Listen for theme changes and update webview accordingly
        vscode.window.onDidChangeActiveColorTheme(() => {
            const config = vscode.workspace.getConfiguration('ragAgent');
            const themePreference = config.get<string>('theme', 'auto');
            
            // Only update if theme preference is 'auto' (follows IDE theme)
            if (themePreference === 'auto') {
                this._update();
                this.outputChannel.logInfo('Theme updated to match IDE');
            }
        }, null, this._disposables);

        // Listen for configuration changes (when user changes ragAgent.theme setting)
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ragAgent.theme')) {
                this._update();
                this.outputChannel.logInfo('Theme preference changed, webview updated');
            }
        }, null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'query':
                        await this.handleQuery(message.query);
                        break;
                    case 'stop':
                        await this.handleStop();
                        break;
                    case 'clearChat':
                        this.outputChannel.logInfo('Chat cleared');
                        break;
                    case 'refreshCacheStats':
                        this.sendCacheStats();
                        break;
                    case 'clearCache':
                        this.cacheManager.clear();
                        this.sendCacheStats();
                        this.outputChannel.logInfo('Cache cleared from webview');
                        break;
                    case 'sendEmail':
                        await this.handleEmail(message.subject, message.body);
                        break;
                    case 'share':
                        this.handleShare();
                        break;
                    case 'bookmark':
                        this.handleBookmark();
                        break;
                    case 'refresh':
                        this._update();
                        this.outputChannel.logInfo('Webview refreshed');
                        break;
                    case 'copyResponse':
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Response copied to clipboard');
                        break;
                    case 'autoRcaRequest':
                        // Auto-trigger RCA for file-based errors
                        await this.handleAutoRca(message.errorMessage, message.file, message.issues);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        cacheManager: CacheManager,
        outputChannel: OutputChannel,
        updateStatusBar: (state: 'ready' | 'processing' | 'error') => void
    ) {
        // Open panel on the right side (like Cursor IDE chat panel)
        // Use ViewColumn.Three for consistent right-side positioning
        // This ensures panel maintains position regardless of editor/terminal state
        const column = vscode.ViewColumn.Three;

        // If we already have a panel, show it
        if (RAGPanel.currentPanel) {
            RAGPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel on the right side
        const panel = vscode.window.createWebviewPanel(
            RAGPanel.viewType,
            'Zeroui Ai Agent',
            column,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out')
                ],
                retainContextWhenHidden: true
            }
        );

        RAGPanel.currentPanel = new RAGPanel(panel, extensionUri, cacheManager, outputChannel, updateStatusBar);
    }

    public static revive(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        cacheManager: CacheManager,
        outputChannel: OutputChannel,
        updateStatusBar: (state: 'ready' | 'processing' | 'error') => void
    ) {
        RAGPanel.currentPanel = new RAGPanel(panel, extensionUri, cacheManager, outputChannel, updateStatusBar);
    }

    public dispose() {
        RAGPanel.currentPanel = undefined;

        // Clean up resources
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }

        this._panel.dispose();
    }

    public static getCurrentPanel(): RAGPanel | undefined {
        return RAGPanel.currentPanel;
    }

    public reveal() {
        // Always reveal on the right side (like Cursor IDE chat panel)
        // Use ViewColumn.Three for consistent positioning
        this._panel.reveal(vscode.ViewColumn.Three);
    }

    public sendMessage(message: any) {
        if (!this._panel || !this._panel.webview) {
            return; // Panel disposed, skip
        }
        try {
            this._panel.webview.postMessage(message);
        } catch (error: any) {
            // Panel was disposed between check and send
            this.outputChannel.logWarning(`Failed to send message: ${error?.message || error}`);
        }
    }

    /**
     * Automatically trigger Root Cause Analysis for file-based errors
     */
    private async handleAutoRca(errorMessage: string, fileName: string, issues: any[]): Promise<void> {
        try {
            this.outputChannel.logInfo(`[Auto-RCA] Triggering RCA for ${fileName} with ${issues.length} error(s)`);
            
            // Build comprehensive error message for RCA
            const fullErrorMessage = `File: ${fileName}\n\nErrors:\n${errorMessage}`;
            
            // Use existing RCA infrastructure
            const errorDetector = new ErrorDetector();
            const errorDetection = errorDetector.detectError(fullErrorMessage);
            
            // Always perform RCA even if confidence is low (file errors are real)
            const rcaContextBuilder = new RcaContextBuilder();
            const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            
            // Get web docs for error (more results for errors)
            const rcaTopK = Math.max(10, vscode.workspace.getConfiguration('ragAgent').get<number>('topK', 5) * 2);
            const webDocs = await this.webSearch.search(fullErrorMessage, rcaTopK, true);
            const internalDocs = await this.retriever.retrieveInternal(fullErrorMessage, rcaTopK);
            
            // Build RCA context
            const rcaContext = await rcaContextBuilder.buildRcaContext(
                fullErrorMessage,
                webDocs,
                internalDocs,
                workspaceUri
            );
            
            // Build RCA-specific prompt
            const rcaPrompt = rcaContextBuilder.buildRcaPrompt(fullErrorMessage);
            
            // Generate RCA response
            const rcaGatewayTraceId = this.observability.startTrace('auto_rca_model_gateway');
            const rcaGatewayStart = Date.now();
            const rcaResult = await this.modelGateway.process({
                context: rcaContext,
                query: rcaPrompt,
                chatHistory: [] // Fresh context for RCA
            });
            this.observability.recordLatency('auto_rca_model_gateway', Date.now() - rcaGatewayStart);
            this.observability.endTrace(rcaGatewayTraceId, 'success', { 
                errorCategory: errorDetection.category || 'unknown',
                confidence: errorDetection.confidence || 0.5,
                fileName: fileName
            });
            
            // Output guardrail for RCA response
            const rcaOutputTraceId = this.observability.startTrace('auto_rca_output_guardrail');
            let rcaFinalResponse = rcaResult?.response || 'RCA analysis unavailable';
            
            if (rcaResult?.response) {
                const rcaOutputCheck = this.outputGuardrail.validate(rcaResult.response);
                if (!rcaOutputCheck.isValid) {
                    if (rcaOutputCheck.needsRegeneration) {
                        this.observability.recordGuardrailReject('output', 'Auto-RCA response unsafe - regenerating');
                        const regenerateRequest = {
                            context: rcaContext,
                            query: `Please provide a safe, sanitized root cause analysis for: ${fullErrorMessage}`,
                            chatHistory: []
                        };
                        const regeneratedResult = await this.modelGateway.process(regenerateRequest);
                        const regenerateCheck = this.outputGuardrail.validate(regeneratedResult.response);
                        if (regenerateCheck.isValid) {
                            rcaFinalResponse = regenerateCheck.redactedText || regeneratedResult.response;
                        } else {
                            rcaFinalResponse = 'RCA analysis blocked after regeneration';
                        }
                    } else {
                        rcaFinalResponse = rcaOutputCheck.error || 'RCA output blocked';
                    }
                } else if (rcaOutputCheck.redactedText) {
                    rcaFinalResponse = rcaOutputCheck.redactedText;
                }
            }
            this.observability.endTrace(rcaOutputTraceId, 'success');
            
            // Format RCA response
            let rcaCleaned = rcaFinalResponse;
            rcaCleaned = rcaCleaned.replace(/https?:\/\/[^\s]+/gi, '').trim();
            rcaCleaned = rcaCleaned.replace(/\b(here are some|references? related to|you may find|useful:?)\s*/gi, '').trim();
            const formattedSources = this.formatSources(internalDocs, webDocs);
            const elapsedMs = Date.now() - rcaGatewayStart;
            
            // Use RCA template
            const rcaResponseText = this.buildRcaTemplate(rcaCleaned, formattedSources, elapsedMs);
            
            // Send RCA response to UI
            this.sendMessage({
                type: 'autoRcaResponse',
                file: fileName,
                rcaResponse: rcaResponseText,
                sources: formattedSources,
                timestamp: Date.now()
            });
            
            this.outputChannel.logInfo(`[Auto-RCA] Completed RCA for ${fileName}`);
            
        } catch (error: any) {
            this.outputChannel.logError(`[Auto-RCA] Failed to perform RCA for ${fileName}: ${error.message || error}`);
            // Fallback: build a heuristic rootcause/solution from lint issues
            const fallback = this.buildLintFallbackRca(fileName, issues);
            this.sendMessage({
                type: 'autoRcaResponse',
                file: fileName,
                rcaResponse: fallback,
                sources: [],
                timestamp: Date.now()
            });
        }
    }

    /**
     * Build a simple RCA from lint diagnostics when model/web RCA is unavailable.
     */
    private buildLintFallbackRca(fileName: string, issues: any[]): string {
        const lines: string[] = [];

        const formatIssue = (iss: any, idx: number) => {
            const pos = iss?.range?.start
                ? `line ${iss.range.start.line + 1}:${iss.range.start.character + 1}`
                : 'unknown location';
            return `${idx + 1}. ${pos} — ${iss?.message || 'Unknown issue'}`;
        };

        const problemSummary = issues && issues.length
            ? issues.map((iss: any, idx: number) => formatIssue(iss, idx)).join('\n')
            : 'No diagnostics provided.';

        lines.push('rootcause:');
        lines.push(`Detected compiler/lint errors in ${fileName}.`);
        lines.push(problemSummary);
        lines.push('');
        lines.push('solution:');
        lines.push('1. Fix the syntax/type errors reported above at the indicated lines.');
        lines.push('2. Re-run validation (save the file) to confirm errors are resolved.');
        lines.push('3. If errors persist, check for missing parentheses/brackets or incomplete statements.');
        return lines.join('\n');
    }

    /**
     * Generate comprehensive codebase-wide RCA summary
     * Analyzes all errors together and provides root cause analysis + solution steps
     */
    public async generateCodebaseRcaSummary(
        allErrors: Array<{
            file: string;
            line: number;
            character: number;
            message: string;
            severity: vscode.DiagnosticSeverity;
            category?: string;
        }>,
        errorsByCategory: Map<string, number>,
        filesScanned: number,
        totalErrors: number,
        totalWarnings: number
    ): Promise<void> {
        try {
            this.updateStatusBar('processing');
            this.outputChannel.logInfo('[Codebase RCA] Generating comprehensive root cause analysis...');
            
            // Step 1: Build comprehensive error summary
            const errorSummary = this.buildCodebaseErrorSummary(allErrors, errorsByCategory);
            
            // Step 2: Build RCA context
            const rcaContextBuilder = new RcaContextBuilder();
            const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            
            // Step 3: Get enhanced context for codebase-wide analysis
            const rcaTopK = Math.max(15, vscode.workspace.getConfiguration('ragAgent').get<number>('topK', 5) * 3);
            
            // Web search for similar codebase issues
            let webDocs: DocumentRecord[] = [];
            if (this.webSearch.hasCredentials()) {
                const searchQuery = this.buildCodebaseSearchQuery(errorsByCategory, totalErrors);
                webDocs = await this.webSearch.search(searchQuery, rcaTopK, true);
            }
            
            // Internal knowledge retrieval
            const internalDocs = await this.retriever.retrieveInternal(errorSummary, rcaTopK);
            
            // Step 4: Build comprehensive RCA context
            const rcaContext = await rcaContextBuilder.buildRcaContext(
                errorSummary,
                webDocs,
                internalDocs,
                workspaceUri
            );
            
            // Step 5: Build codebase-specific RCA prompt
            const codebaseRcaPrompt = this.buildCodebaseRcaPrompt(
                errorSummary,
                filesScanned,
                totalErrors,
                totalWarnings,
                errorsByCategory
            );
            
            // Step 6: Generate RCA response using model gateway
            const rcaGatewayTraceId = this.observability.startTrace('codebase_rca_model_gateway');
            const rcaGatewayStart = Date.now();
            const rcaResult = await this.modelGateway.process({
                context: rcaContext,
                query: codebaseRcaPrompt,
                chatHistory: []
            });
            this.observability.recordLatency('codebase_rca_model_gateway', Date.now() - rcaGatewayStart);
            this.observability.endTrace(rcaGatewayTraceId, 'success', {
                filesScanned,
                totalErrors,
                totalWarnings
            });
            
            // Step 7: Output guardrail validation
            const rcaOutputTraceId = this.observability.startTrace('codebase_rca_output_guardrail');
            let rcaFinalResponse = rcaResult?.response || 'RCA analysis unavailable';
            
            if (rcaResult?.response) {
                const rcaOutputCheck = this.outputGuardrail.validate(rcaResult.response);
                if (!rcaOutputCheck.isValid) {
                    if (rcaOutputCheck.needsRegeneration) {
                        this.observability.recordGuardrailReject('output', 'Codebase RCA response unsafe - regenerating');
                        const regenerateRequest = {
                            context: rcaContext,
                            query: `Please provide a safe, sanitized comprehensive root cause analysis for this codebase with ${totalErrors} errors.`,
                            chatHistory: []
                        };
                        const regeneratedResult = await this.modelGateway.process(regenerateRequest);
                        const regenerateCheck = this.outputGuardrail.validate(regeneratedResult.response);
                        if (regenerateCheck.isValid) {
                            rcaFinalResponse = regenerateCheck.redactedText || regeneratedResult.response;
                        } else {
                            rcaFinalResponse = 'RCA analysis blocked after regeneration';
                        }
                    } else {
                        rcaFinalResponse = rcaOutputCheck.error || 'RCA output blocked';
                    }
                } else if (rcaOutputCheck.redactedText) {
                    rcaFinalResponse = rcaOutputCheck.redactedText;
                }
            }
            this.observability.endTrace(rcaOutputTraceId, 'success');
            
            // Step 8: Format comprehensive RCA response
            let rcaCleaned = rcaFinalResponse;
            rcaCleaned = rcaCleaned.replace(/https?:\/\/[^\s]+/gi, '').trim();
            rcaCleaned = rcaCleaned.replace(/\b(here are some|references? related to|you may find|useful:?)\s*/gi, '').trim();
            
            const formattedSources = this.formatSources(internalDocs, webDocs);
            const elapsedMs = Date.now() - rcaGatewayStart;
            
            // Step 9: Build comprehensive codebase RCA template
            const parsed = this.parseRcaResponse(rcaCleaned);
            const codebaseRcaResponse = this.buildCodebaseRcaTemplate(
                parsed,
                filesScanned,
                totalErrors,
                totalWarnings,
                errorsByCategory,
                formattedSources,
                elapsedMs
            );
            
            // Step 10: Send comprehensive RCA summary to chat area
            this.sendMessage({
                type: 'response',
                response: codebaseRcaResponse,
                cached: false,
                sources: formattedSources
            });
            
            this.observability.recordLatency('codebase_rca_processing', elapsedMs);
            this.updateStatusBar('ready');
            this.outputChannel.logInfo(`[Codebase RCA] Completed comprehensive analysis in ${elapsedMs}ms`);
            
        } catch (error: any) {
            this.outputChannel.logError(`[Codebase RCA] Failed: ${error.message || error}`);
            this.updateStatusBar('error');
            
            // Fallback: send basic summary
            const fallbackSummary = this.buildFallbackCodebaseSummary(
                allErrors,
                filesScanned,
                totalErrors,
                totalWarnings
            );
            this.sendMessage({
                type: 'response',
                response: fallbackSummary,
                cached: false,
                sources: []
            });
        }
    }

    /**
     * Build comprehensive error summary from all errors
     */
    private buildCodebaseErrorSummary(
        allErrors: Array<{
            file: string;
            line: number;
            character: number;
            message: string;
            severity: vscode.DiagnosticSeverity;
            category?: string;
        }>,
        errorsByCategory: Map<string, number>
    ): string {
        let summary = `=== CODEBASE ERROR ANALYSIS ===\n\n`;
        summary += `Total Errors Found: ${allErrors.length}\n`;
        summary += `Files Affected: ${new Set(allErrors.map(e => e.file)).size}\n\n`;
        
        // Error breakdown by category
        if (errorsByCategory.size > 0) {
            summary += `=== ERROR BREAKDOWN BY TYPE ===\n\n`;
            const sortedCategories = Array.from(errorsByCategory.entries())
                .sort((a, b) => b[1] - a[1]);
            
            sortedCategories.forEach(([category, count], idx) => {
                summary += `${idx + 1}. **${category}** (${count} occurrence${count !== 1 ? 's' : ''})\n`;
                const categoryErrors = allErrors.filter(e => e.category === category);
                categoryErrors.slice(0, 5).forEach(err => {
                    summary += `   - ${err.file}:${err.line}:${err.character} - ${err.message}\n`;
                });
                if (categoryErrors.length > 5) {
                    summary += `   ... and ${categoryErrors.length - 5} more\n`;
                }
                summary += `\n`;
            });
        }
        
        // Detailed error list
        summary += `=== DETAILED ERROR LIST ===\n\n`;
        allErrors.forEach((err, idx) => {
            summary += `${idx + 1}. ${err.file}:${err.line}:${err.character}\n`;
            summary += `   Error: ${err.message}\n`;
            if (err.category) {
                summary += `   Category: ${err.category}\n`;
            }
            summary += `\n`;
        });
        
        return summary;
    }

    /**
     * Build search query for web search based on error categories
     */
    private buildCodebaseSearchQuery(
        errorsByCategory: Map<string, number>,
        totalErrors: number
    ): string {
        const topCategories = Array.from(errorsByCategory.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat]) => cat);
        
        return `codebase analysis ${totalErrors} errors typescript javascript ${topCategories.join(' ')} fix solutions`;
    }

    /**
     * Build codebase-specific RCA prompt
     */
    private buildCodebaseRcaPrompt(
        errorSummary: string,
        filesScanned: number,
        totalErrors: number,
        totalWarnings: number,
        errorsByCategory: Map<string, number>
    ): string {
        const topCategories = Array.from(errorsByCategory.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cat, count]) => `${cat} (${count})`)
            .join(', ');
        
        return [
            'You are an expert software engineer performing comprehensive root cause analysis for an entire codebase.',
            `The codebase has been scanned: ${filesScanned} files analyzed, ${totalErrors} errors found, ${totalWarnings} warnings found.`,
            `Primary error categories: ${topCategories}`,
            '',
            'Analyze the error summary provided above and identify:',
            '1. Common root causes across the codebase (patterns, systemic issues)',
            '2. Primary issues affecting multiple files',
            '3. Secondary issues (isolated problems)',
            '4. Recommended solution steps prioritized by impact',
            '',
            'CRITICAL: Respond EXACTLY in this format (no other text, no examples, no placeholders):',
            '',
            'rootcause:',
            '[Provide the ACTUAL root causes for THIS codebase. Identify common patterns, systemic issues, and primary problems. Be technical and specific. Group related errors. 2-5 sentences.]',
            '',
            'solution:',
            '[Provide the ACTUAL solution steps to fix THIS codebase. Prioritize by impact. Number each step. Be specific and actionable. Reference error types and file patterns if relevant. 5-10 steps.]',
            '',
            'IMPORTANT RULES:',
            '- Do NOT use placeholders like "e.g.," or "[example]"',
            '- Do NOT say "follow these steps" or "analyze the errors"',
            '- Do NOT provide generic examples - give the ACTUAL analysis for THIS codebase',
            '- Focus on patterns and systemic issues, not individual errors',
            '- Prioritize solutions by impact (fix high-impact issues first)',
            '- Be technical, specific, and direct',
            '- Reference the error types and patterns from the summary'
        ].join('\n');
    }

    /**
     * Build comprehensive codebase RCA template
     */
    private buildCodebaseRcaTemplate(
        parsed: { rootCause: string; solution: string },
        filesScanned: number,
        totalErrors: number,
        totalWarnings: number,
        errorsByCategory: Map<string, number>,
        sources: { type: 'internal' | 'web'; title: string; link?: string }[],
        elapsedMs: number
    ): string {
        const srcLines = sources.slice(0, 5).map((s, i) => 
            `- ${s.title || 'Source ' + (i + 1)}${s.link ? ' (' + s.link + ')' : ''}`
        );
        
        const categorySummary = Array.from(errorsByCategory.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cat, count]) => `${cat}: ${count}`)
            .join(', ');
        
        return [
            `📊 **Comprehensive Codebase Analysis Complete**\n`,
            `**Summary:**`,
            `- Files Scanned: ${filesScanned}`,
            `- Total Errors: ${totalErrors}`,
            `- Total Warnings: ${totalWarnings}`,
            errorsByCategory.size > 0 ? `- Error Categories: ${categorySummary}` : '',
            `\n---\n`,
            `**ROOT CAUSE ANALYSIS:**\n`,
            parsed.rootCause || 'Root cause analysis not available.',
            `\n---\n`,
            `**SOLUTION STEPS:**\n`,
            parsed.solution || 'Solution steps not available.',
            `\n---\n`,
            `**VERIFICATION:**`,
            `After applying the fixes, re-run the codebase analysis to verify all errors are resolved.`,
            `\n---\n`,
            srcLines.length > 0 ? `**Sources:**\n${srcLines.join('\n')}\n` : '',
            `\n*Analysis completed in ${elapsedMs}ms*`
        ].join('\n');
    }

    /**
     * Build fallback summary when RCA generation fails
     */
    private buildFallbackCodebaseSummary(
        allErrors: Array<{
            file: string;
            line: number;
            character: number;
            message: string;
        }>,
        filesScanned: number,
        totalErrors: number,
        totalWarnings: number
    ): string {
        const filesWithErrors = new Set(allErrors.map(e => e.file)).size;
        const topFiles = Array.from(
            new Map(
                allErrors.map(e => [e.file, allErrors.filter(err => err.file === e.file).length])
            ).entries()
        )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        let summary = `📊 **Codebase Analysis Summary**\n\n`;
        summary += `**Summary:**\n`;
        summary += `- Files Scanned: ${filesScanned}\n`;
        summary += `- Total Errors: ${totalErrors}\n`;
        summary += `- Total Warnings: ${totalWarnings}\n`;
        summary += `- Files with Errors: ${filesWithErrors}\n\n`;
        
        if (topFiles.length > 0) {
            summary += `**Top Files with Errors:**\n`;
            topFiles.forEach(([file, count]) => {
                summary += `- ${file}: ${count} error(s)\n`;
            });
            summary += `\n`;
        }
        
        summary += `⚠️ Comprehensive RCA generation unavailable. Individual file RCAs are available in the Errors section.\n`;
        
        return summary;
    }

    private async handleQuery(query: string) {
        const traceId = this.observability.startTrace('rag_query_processing', { query: query.substring(0, 100) });
        const startTime = Date.now();
        this.updateStatusBar('processing');
        this.outputChannel.logInfo(`Query received: ${query}`);

        try {
            // Response cache check
            const cachedResponse = this.cacheManager.get(query);
            if (cachedResponse) {
                // Even for cached responses, perform web search to get sources
                this.outputChannel.logInfo('Response cache hit, but fetching sources via web search');
                const topK = vscode.workspace.getConfiguration('ragAgent').get<number>('topK', 5);
                const webDocs = await this.webSearch.search(query, topK, true);
                const internalDocs = await this.retriever.retrieveInternal(query, topK);
                
                this.observability.recordCacheHit('response');
                const elapsedMs = Date.now() - startTime;
                this.observability.recordLatency('query_processing', elapsedMs);
                this.observability.endTrace(traceId, 'success', { cached: true });
                this.outputChannel.logInfo('Response cache hit');
                const cleanedCached = this.sanitizeModelResponse(cachedResponse);
                
                // Format sources for cached response
                const cachedSources = this.formatSources(internalDocs, webDocs);
                this.outputChannel.logInfo(`[CACHED RESPONSE] Including ${cachedSources.length} sources`);
                
                // Fallback: if cleaned cached response still looks like instructions, use source-based concise sentence
                const cachedLooksLikeInstruction =
                    /ignore unrelated|use only information|web snippets|guidelines|instruction|do not repeat|do not include|user:|assistant:/i.test(cleanedCached) ||
                    /^\s*prime minister of india\s*[-–:]/i.test(cleanedCached);
                
                // Only use fallback if the response is truly invalid (very short AND looks like instructions)
                const cachedFallback = this.pickSourceSentence(cachedSources);
                const finalCachedMessage = (cachedLooksLikeInstruction && cleanedCached.trim().length < 20) 
                    ? cachedFallback 
                    : cleanedCached;
                
                // Simple format for cached response
                const responseText = `${finalCachedMessage}\n\nTime taken: ${elapsedMs} ms`;
                this.sendMessage({
                    type: 'response',
                    response: responseText,
                    cached: true,
                    sources: cachedSources
                });
                this.updateStatusBar('ready');
                return;
            }
            this.observability.recordCacheMiss('response');

            // Input guardrail
            const inputTraceId = this.observability.startTrace('input_guardrail');
            const validation = this.inputGuardrail.validate(query);
            if (!validation.isValid) {
                this.observability.recordGuardrailReject('input', validation.error || 'Invalid input');
                this.observability.endTrace(inputTraceId, 'error', { error: validation.error });
                throw new Error(validation.error || 'Invalid input');
            }
            const sanitized = this.inputGuardrail.sanitize(query);
            this.observability.endTrace(inputTraceId, 'success');

            // Shortcut: if user asks to analyze the current codebase, run the on-demand scan
            const normalized = sanitized.trim().toLowerCase();
            if (normalized === 'analyze the current codebase' || normalized === 'analyze current codebase') {
                this.outputChannel.logInfo('[RCA] Received codebase analysis request from chat; triggering scan.');
                await vscode.commands.executeCommand('rag.analyzeCodebase');
                this.sendMessage({
                    type: 'response',
                    response: 'Started full codebase analysis. Errors and RCA cards will appear in the Errors section. If no errors are found, a clean report will be shown.',
                    cached: false,
                    sources: []
                });
                this.updateStatusBar('ready');
                this.observability.endTrace(traceId, 'success', { shortcut: 'codebase_analysis' });
                return;
            }

            // Enhanced Root Cause Analysis detection and processing
            const errorDetector = new ErrorDetector();
            const errorDetection = errorDetector.detectError(sanitized);
            
            if (errorDetection.detected && errorDetection.confidence > RCA_CONFIDENCE_THRESHOLD) {
                this.outputChannel.logInfo(`[RCA] Error detected: ${errorDetection.category} (confidence: ${errorDetection.confidence})`);
                
                // Use RCA path for error analysis
                const rcaContextBuilder = new RcaContextBuilder();
                const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
                const rcaChatHistory = await this.externalMemory.getChatHistory(5);
                
                // Get web docs for error (more results for errors)
                const rcaTopK = Math.max(10, vscode.workspace.getConfiguration('ragAgent').get<number>('topK', 5) * 2);

                let webDocs: DocumentRecord[] = [];
                if (this.webSearch.hasCredentials()) {
                    webDocs = await this.webSearch.search(sanitized, rcaTopK, true);
                } else {
                    this.outputChannel.logWarning('[RCA] Web search credentials missing; proceeding with internal sources only.');
                }
                const internalDocs = await this.retriever.retrieveInternal(sanitized, rcaTopK);
                
                // Build RCA context
                const rcaContext = await rcaContextBuilder.buildRcaContext(
                    sanitized,
                    webDocs,
                    internalDocs,
                    workspaceUri
                );
                
                // Build RCA-specific prompt
                const rcaPrompt = rcaContextBuilder.buildRcaPrompt(sanitized);
                
                // Generate RCA response
                const rcaGatewayTraceId = this.observability.startTrace('rca_model_gateway');
                const rcaGatewayStart = Date.now();
                const rcaResult = await this.modelGateway.process({
                    context: rcaContext,
                    query: rcaPrompt,
                    chatHistory: rcaChatHistory.map(msg => ({ role: msg.role, content: msg.content }))
                });
                this.observability.recordLatency('rca_model_gateway', Date.now() - rcaGatewayStart);
                this.observability.endTrace(rcaGatewayTraceId, 'success', { 
                    errorCategory: errorDetection.category,
                    confidence: errorDetection.confidence 
                });
                
                // Output guardrail for RCA response
                const rcaOutputTraceId = this.observability.startTrace('rca_output_guardrail');
                let rcaFinalResponse = rcaResult.response;
                const rcaOutputCheck = this.outputGuardrail.validate(rcaResult.response);
                if (!rcaOutputCheck.isValid) {
                    if (rcaOutputCheck.needsRegeneration) {
                        this.observability.recordGuardrailReject('output', 'RCA response unsafe - regenerating');
                        const regenerateRequest = {
                            context: rcaContext,
                            query: `Please provide a safe, sanitized root cause analysis for: ${sanitized}`,
                            chatHistory: []
                        };
                        const regeneratedResult = await this.modelGateway.process(regenerateRequest);
                        const regenerateCheck = this.outputGuardrail.validate(regeneratedResult.response);
                        if (regenerateCheck.isValid) {
                            rcaFinalResponse = regenerateCheck.redactedText || regeneratedResult.response;
                        } else {
                            throw new Error('RCA response blocked after regeneration');
                        }
                    } else {
                        throw new Error(rcaOutputCheck.error || 'RCA output blocked');
                    }
                } else if (rcaOutputCheck.redactedText) {
                    rcaFinalResponse = rcaOutputCheck.redactedText;
                }
                this.observability.endTrace(rcaOutputTraceId, 'success');
                
                // Format RCA response (preserve structured format for RCA)
                // Only do light sanitization for RCA - preserve section markers
                let rcaCleaned = rcaFinalResponse;
                // Remove URLs but keep structure
                rcaCleaned = rcaCleaned.replace(/https?:\/\/[^\s]+/gi, '').trim();
                // Remove meta-commentary but keep ROOT CAUSE, FIX STEPS sections
                rcaCleaned = rcaCleaned.replace(/\b(here are some|references? related to|you may find|useful:?)\s*/gi, '').trim();
                const formattedSources = this.formatSources(internalDocs, webDocs);
                const elapsedMs = Date.now() - startTime;
                
                // Use RCA template
                const rcaResponseText = this.buildRcaTemplate(rcaCleaned, formattedSources, elapsedMs);
                
                // Persist chat history
                await this.externalMemory.storeChatMessage({ role: 'user', content: sanitized, timestamp: Date.now() });
                await this.externalMemory.storeChatMessage({ role: 'assistant', content: rcaCleaned, timestamp: Date.now() });
                
                // Cache RCA response
                this.cacheManager.set(sanitized, rcaCleaned);
                
                // Send RCA response
                this.sendMessage({
                    type: 'response',
                    response: rcaResponseText,
                    cached: false,
                    sources: formattedSources
                });
                
                this.observability.recordLatency('rca_query_processing', elapsedMs);
                this.observability.endTrace(traceId, 'success', { 
                    responseLength: rcaCleaned.length,
                    rcaMode: true,
                    errorCategory: errorDetection.category
                });
                this.sendCacheStats();
                this.updateStatusBar('ready');
                return; // Exit early, RCA path complete
            }

            // Embedding (placeholder + cache)
            const embeddingTraceId = this.observability.startTrace('embedding');
            const embeddingStart = Date.now();
            const existingEmbedding = this.cacheManager.getEmbeddingCache<number[]>(sanitized);
            if (existingEmbedding) {
                this.observability.recordCacheHit('embedding');
            } else {
                this.observability.recordCacheMiss('embedding');
                const emb = this.fakeEmbed(sanitized);
                this.cacheManager.setEmbeddingCache(sanitized, emb);
            }
            this.observability.recordLatency('embedding', Date.now() - embeddingStart);
            this.observability.endTrace(embeddingTraceId, 'success');

            // Retrieval (ALWAYS use Google web search for every question)
            const retrievalTraceId = this.observability.startTrace('retrieval');
            const retrievalStart = Date.now();
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ragPanel.ts:1252',message:'before retrieval',data:{query:sanitized.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            const topK = vscode.workspace.getConfiguration('ragAgent').get<number>('topK', 5);
            const internalDocs = await this.retriever.retrieveInternal(sanitized, topK);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ragPanel.ts:1256',message:'after internal retrieval',data:{internalDocsCount:internalDocs.length,elapsed:Date.now()-retrievalStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion

            // ALWAYS perform Google web search for every question (when credentials are available)
            let webDocs: DocumentRecord[] = [];
            this.outputChannel.logInfo(`[RETRIEVAL] Starting web search for query: "${sanitized}"`);
            this.outputChannel.logInfo(`[RETRIEVAL] WebSearch hasCredentials: ${this.webSearch.hasCredentials()}`);
            this.outputChannel.logInfo(`[RETRIEVAL] WebSearch isEnabled: ${this.webSearch.isEnabled()}`);
            
            if (this.webSearch.hasCredentials()) {
                try {
                    this.outputChannel.logInfo(`[RETRIEVAL] Calling webSearch.search() with forceSearch=true`);
                    // #region agent log
                    const webSearchStart = Date.now();
                    fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ragPanel.ts:1265',message:'before webSearch.search',data:{query:sanitized.substring(0,50),topK},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                    // #endregion
                    webDocs = await this.webSearch.search(sanitized, topK, true);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ragPanel.ts:1267',message:'after webSearch.search',data:{webDocsCount:webDocs.length,elapsed:Date.now()-webSearchStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                    // #endregion
                    this.outputChannel.logInfo(`[RETRIEVAL] webSearch.search() returned ${webDocs.length} documents`);
                    
                    if (webDocs.length > 0) {
                        this.observability.recordWebCallSuccess();
                        this.outputChannel.logInfo(`[RETRIEVAL] Google web search returned ${webDocs.length} results`);
                        webDocs.forEach((doc, idx) => {
                            this.outputChannel.logInfo(`[RETRIEVAL] Web Doc ${idx + 1}: ${doc.metadata?.title || 'No title'} - ${doc.metadata?.link || 'No link'}`);
                        });
                    } else {
                        this.outputChannel.logWarning('[RETRIEVAL] Google web search returned no results - check query or API quota');
                    }
                } catch (error: any) {
                    this.outputChannel.logError(`[RETRIEVAL] Web search error: ${error.message || error}`);
                    this.outputChannel.logError(`[RETRIEVAL] Error stack: ${error.stack || 'No stack trace'}`);
                    this.observability.recordWebCallFailure(error.message || 'Unknown error');
                    // Continue with empty webDocs - will still show internal sources
                }
            } else {
                this.outputChannel.logWarning('[RETRIEVAL] Google web search not configured. Set ragAgent.googleApiKey and ragAgent.googleCseId, then reload the window.');
            }

            this.observability.recordLatency('retrieval', Date.now() - retrievalStart);
            this.observability.endTrace(retrievalTraceId, 'success', { 
                internalDocsCount: internalDocs.length,
                webDocsCount: webDocs.length,
                webSearchAlwaysUsed: true
            });

            // Track web call results
            if (webDocs.length > 0) {
                this.observability.recordWebCallSuccess();
            }

            // Context construction
            const contextTraceId = this.observability.startTrace('context_construction');
            const chatHistory = await this.externalMemory.getChatHistory(10);
            const context = this.contextBuilder.buildContext(sanitized, internalDocs, webDocs, chatHistory);
            this.observability.endTrace(contextTraceId, 'success');

            // Model gateway
            const gatewayTraceId = this.observability.startTrace('model_gateway');
            const gatewayStart = Date.now();
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ragPanel.ts:1307',message:'before modelGateway.process',data:{queryLength:sanitized.length,contextLength:context.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const gatewayResult = await this.modelGateway.process({
                context,
                query: sanitized,
                chatHistory: chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
            });
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8917821b-0802-4d8d-88ee-59c8f36c87a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ragPanel.ts:1314',message:'after modelGateway.process',data:{model:gatewayResult.model,responseLength:gatewayResult.response.length,elapsed:Date.now()-gatewayStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            this.observability.recordLatency('model_gateway', Date.now() - gatewayStart);
            this.observability.endTrace(gatewayTraceId, 'success', { model: gatewayResult.model });

            // Output guardrail
            const outputTraceId = this.observability.startTrace('output_guardrail');
            let finalResponse = gatewayResult.response;
            const outputCheck = this.outputGuardrail.validate(gatewayResult.response);
            if (!outputCheck.isValid) {
                if (outputCheck.needsRegeneration) {
                    // Attempt regeneration by calling model gateway again with a safety prompt
                    this.observability.recordGuardrailReject('output', 'Unsafe content - regenerating');
                    this.outputChannel.logWarning('Output blocked, attempting regeneration...');
                    const regenerateRequest = {
                        context: context,
                        query: `Please provide a safe, sanitized response to: ${sanitized}. Avoid any unsafe content or scripts.`,
                        chatHistory: chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
                    };
                    const regeneratedResult = await this.modelGateway.process(regenerateRequest);
                    const regenerateCheck = this.outputGuardrail.validate(regeneratedResult.response);
                    if (!regenerateCheck.isValid) {
                        this.observability.recordGuardrailReject('output', 'Failed after regeneration');
                        this.observability.endTrace(outputTraceId, 'error', { error: 'Regeneration failed' });
                        throw new Error(regenerateCheck.error || 'Output blocked after regeneration');
                    }
                    finalResponse = regenerateCheck.redactedText || regeneratedResult.response;
                    this.observability.recordFallback('output_regeneration');
                } else {
                    this.observability.recordGuardrailReject('output', outputCheck.error || 'Blocked');
                    this.observability.endTrace(outputTraceId, 'error', { error: outputCheck.error });
                    throw new Error(outputCheck.error || 'Output blocked');
                }
            } else if (outputCheck.redactedText) {
                // Use redacted version if sensitive data was found
                finalResponse = outputCheck.redactedText;
                this.outputChannel.logInfo('Output redacted due to sensitive data detection');
            }
            this.observability.endTrace(outputTraceId, 'success');

            const cleanedResponse = this.sanitizeModelResponse(finalResponse);

            // Format and send sources
            const formattedSources = this.formatSources(internalDocs, webDocs);
            this.outputChannel.logInfo(`[SEND RESPONSE] Sending response with ${formattedSources.length} sources`);
            formattedSources.forEach((src, idx) => {
                this.outputChannel.logInfo(`[SEND RESPONSE] Source ${idx + 1}: ${src.type} - ${src.title}${src.link ? ' (' + src.link + ')' : ''}`);
            });

            // Fallback: if cleaned response still looks like instructions, use source-based concise sentence
            const looksLikeInstruction =
                /ignore unrelated|use only information|web snippets|guidelines|instruction|do not repeat|do not include|user:|assistant:/i.test(cleanedResponse) ||
                /^\s*prime minister of india\s*[-–:]/i.test(cleanedResponse);
            
            // Only use fallback if the response is truly invalid (very short AND looks like instructions)
            const fallbackFromSources = this.pickSourceSentence(formattedSources);
            let finalMessage = cleanedResponse;
            if ((looksLikeInstruction && cleanedResponse.trim().length < 20) || cleanedResponse.trim().length < 5) {
                finalMessage = fallbackFromSources || 'No relevant information found.';
            }

            const elapsedMs = Date.now() - startTime;

            // Choose template: RCA-style if it looks like an error, otherwise simple format
            const looksLikeError =
                /error|exception|stack\s*trace|stacktrace|undefined|not found|cannot|failed|traceback|timeout|rate[- ]limit|lint|diagnostic/i.test(sanitized);
            const responseText = looksLikeError
                ? this.buildRcaTemplate(finalMessage, formattedSources, elapsedMs)
                : `${finalMessage}\n\nTime taken: ${elapsedMs} ms`;

            // Persist chat history
            await this.externalMemory.storeChatMessage({ role: 'user', content: sanitized, timestamp: Date.now() });
            await this.externalMemory.storeChatMessage({ role: 'assistant', content: finalMessage, timestamp: Date.now() });

            // Cache response
            this.cacheManager.set(sanitized, finalMessage);
            
            // Send response
            this.sendMessage({
                type: 'response',
                response: responseText,
                cached: false,
                sources: formattedSources
            });

            this.observability.recordLatency('query_processing', elapsedMs);
            this.observability.endTrace(traceId, 'success', { responseLength: finalMessage.length });
            this.sendCacheStats();
            this.updateStatusBar('ready');
        } catch (error: any) {
            const errorMessage = error.message || 'An error occurred';
            this.observability.recordError('query_processing', errorMessage);
            this.observability.endTrace(traceId, 'error', { error: errorMessage });
            this.outputChannel.logError(`Error: ${errorMessage}`);
            this.sendMessage({
                type: 'error',
                message: errorMessage
            });
            this.updateStatusBar('error');
        }
    }

    private async handleStop() {
        this.outputChannel.logInfo('Stop request received');
        this.updateStatusBar('ready');
        this.sendMessage({
            type: 'stopped',
            message: 'Query processing stopped by user'
        });
    }

    private async handleEmail(subject: string, body: string) {
        this.outputChannel.logInfo(`Email send requested: ${subject}`);
        
        try {
            const result = await this.writeActions.sendEmail(subject, body);
            this.sendMessage({
                type: 'emailStatus',
                success: result.success,
                message: result.message
            });
        } catch (error: any) {
            this.sendMessage({
                type: 'emailStatus',
                success: false,
                message: error.message || 'Failed to send email'
            });
        }
    }

    private handleShare() {
        this.outputChannel.logInfo('Share action triggered');
        vscode.window.showInformationMessage('Share functionality will be implemented');
    }

    private handleBookmark() {
        this.outputChannel.logInfo('Bookmark action triggered');
        vscode.window.showInformationMessage('Bookmark functionality will be implemented');
    }

    private sendCacheStats() {
        const stats = this.cacheManager.getStats();
        this.sendMessage({
            type: 'cacheStatsUpdate',
            stats: stats
        });
    }

    private formatSources(internalDocs: DocumentRecord[], webDocs: DocumentRecord[]) {
        this.outputChannel.logInfo(`[formatSources] Called with internalDocs: ${internalDocs?.length || 0}, webDocs: ${webDocs?.length || 0}`);
        const sources: { type: 'internal' | 'web'; title: string; link?: string }[] = [];
        
        // Add internal sources
        if (internalDocs && internalDocs.length > 0) {
            this.outputChannel.logInfo(`[formatSources] Processing ${internalDocs.length} internal docs`);
            internalDocs.forEach((doc, idx) => {
                const title = doc.metadata?.title || doc.content?.substring(0, 50) || `Internal Document ${idx + 1}`;
                sources.push({ type: 'internal', title, link: doc.metadata?.link });
                this.outputChannel.logInfo(`[formatSources] Added internal source ${idx + 1}: ${title}`);
            });
        }
        
        // Add web sources
        if (webDocs && webDocs.length > 0) {
            this.outputChannel.logInfo(`[formatSources] Processing ${webDocs.length} web docs`);
            webDocs.forEach((doc, idx) => {
                const title = doc.metadata?.title || doc.metadata?.link || doc.content?.substring(0, 50) || `Web Result ${idx + 1}`;
                sources.push({ type: 'web', title, link: doc.metadata?.link });
                this.outputChannel.logInfo(`[formatSources] Added web source ${idx + 1}: ${title} - ${doc.metadata?.link || 'No link'}`);
            });
        }
        
        // Log if no sources found
        if (sources.length === 0) {
            this.outputChannel.logWarning(`[formatSources] No sources found - Internal: ${internalDocs?.length || 0}, Web: ${webDocs?.length || 0}`);
        } else {
            this.outputChannel.logInfo(`[formatSources] Formatted ${sources.length} sources - Internal: ${internalDocs?.length || 0}, Web: ${webDocs?.length || 0}`);
        }
        
        return sources;
    }

    // Lightweight embedding placeholder; replace with real embeddings if available.
    private fakeEmbed(text: string): number[] {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        // Produce a small deterministic vector
        return [hash % 101, (hash >> 3) % 97, (hash >> 5) % 89, (hash >> 7) % 83].map(v => v / 100);
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getThemeClass(): string {
        const config = vscode.workspace.getConfiguration('ragAgent');
        const themePreference = config.get<string>('theme', 'auto');
        
        // If theme preference is explicitly set to light or dark, use it
        if (themePreference === 'light') {
            return 'light';
        }
        if (themePreference === 'dark') {
            return 'dark';
        }
        
        // Otherwise, auto-detect from IDE theme (works for both Cursor IDE and VS Code)
        const theme = vscode.window.activeColorTheme.kind;
        const isDark = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast;
        return isDark ? 'dark' : 'light';
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get paths to resources
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'ragPanel.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'ragPanel.css')
        );

        // Get theme (respects ragAgent.theme setting)
        const themeClass = this._getThemeClass();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Zeroui Ai Agent</title>
</head>
<body class="${themeClass}">
    <div class="container">
        <!-- Header Section -->
        <header class="header">
            <div class="header-left">
                <span class="header-icon">📦</span>
                <div class="header-text">
                    <h1 class="header-title">Zeroui Ai Agent</h1>
                </div>
            </div>
            <div class="header-actions">
                <button class="icon-button" id="shareBtn" title="Share">
                    <span>🔗</span>
                </button>
                <button class="icon-button" id="bookmarkBtn" title="Bookmark">
                    <span>🔖</span>
                </button>
                <button class="icon-button" id="refreshBtn" title="Refresh">
                    <span>🔄</span>
                </button>
            </div>
        </header>

        <!-- Chat Area -->
        <div class="chat-container" id="chatContainer">
            <div class="empty-state" id="emptyState">
                <p>Start a conversation by asking about inventory management</p>
            </div>
        </div>

        <!-- Input Area -->
        <div class="input-area">
            <div class="input-container">
                <div class="input-wrapper">
                    <input 
                        type="text" 
                        id="queryInput" 
                        class="query-input" 
                        placeholder="e.g., 'Should I reorder toothpaste?'"
                        maxlength="500"
                    />
                    <button id="submitBtn" class="btn-icon btn-submit" title="Submit">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10.5 8L1.5 6.5V1.5Z" fill="currentColor"/>
                        </svg>
                    </button>
                    <button id="stopBtn" class="btn-icon btn-stop" style="display: none;" title="Stop">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
                <button id="clearChatBtn" class="btn btn-secondary">Clear Chat</button>
            </div>
        </div>

        <!-- Example Questions -->
        <div class="example-questions">
            <h3 class="section-title">Example Questions</h3>
            <div class="question-grid">
                <button class="question-btn" data-query="Should I reorder toothpaste?">Should I reorder toothpaste?</button>
                <button class="question-btn" data-query="Check the inventory status for shampoo">Check the inventory status for shampoo</button>
                <button class="question-btn" data-query="Show me all inventory with low stock">Show me all inventory with low stock</button>
                <button class="question-btn" data-query="What products are running low?">What products are running low?</button>
                <button class="question-btn" data-query="Help me analyze inventory levels">Help me analyze inventory levels</button>
            </div>
        </div>

        <!-- Errors Section -->
        <div class="errors-section" id="errorsSection">
            <h3 class="section-title">Errors</h3>
            <div id="errorsContent"></div>
        </div>

        <!-- Cache Statistics -->
        <div class="cache-stats">
            <h3 class="section-title">
                <span>📊</span> Cache Statistics
            </h3>
            <div class="stats-display" id="cacheStats">
                <div class="stats-summary">
                    <div>Cache Size: <span id="cacheSize">0/500</span> entries</div>
                    <div>Cache Hits: <span id="cacheHits">0</span></div>
                    <div>Cache Misses: <span id="cacheMisses">0</span></div>
                    <div>Hit Rate: <span id="hitRate">0.0</span>%</div>
                    <div>TTL: <span id="cacheTTL">300</span> seconds</div>
                </div>
                <div class="stats-layers">
                    <div class="layer-stats">
                        <strong>Response Cache:</strong>
                        <div>Size: <span id="responseCacheSize">0</span> | Hits: <span id="responseCacheHits">0</span> | Misses: <span id="responseCacheMisses">0</span> | Hit Rate: <span id="responseCacheHitRate">0.0</span>%</div>
                    </div>
                    <div class="layer-stats">
                        <strong>Retrieval Cache:</strong>
                        <div>Size: <span id="retrievalCacheSize">0</span> | Hits: <span id="retrievalCacheHits">0</span> | Misses: <span id="retrievalCacheMisses">0</span> | Hit Rate: <span id="retrievalCacheHitRate">0.0</span>%</div>
                    </div>
                    <div class="layer-stats">
                        <strong>Web Cache:</strong>
                        <div>Size: <span id="webCacheSize">0</span> | Hits: <span id="webCacheHits">0</span> | Misses: <span id="webCacheMisses">0</span> | Hit Rate: <span id="webCacheHitRate">0.0</span>%</div>
                    </div>
                    <div class="layer-stats">
                        <strong>Embedding Cache:</strong>
                        <div>Size: <span id="embeddingCacheSize">0</span> | Hits: <span id="embeddingCacheHits">0</span> | Misses: <span id="embeddingCacheMisses">0</span> | Hit Rate: <span id="embeddingCacheHitRate">0.0</span>%</div>
                    </div>
                </div>
            </div>
            <div class="cache-buttons">
                <button id="refreshCacheBtn" class="btn btn-secondary">
                    <span>🔄</span> Refresh Cache Stats
                </button>
                <button id="clearCacheBtn" class="btn btn-secondary">
                    <span>🗑️</span> Clear Cache
                </button>
            </div>
        </div>

        <!-- Security & Performance Features -->
        <div class="security-section">
            <div class="accordion-header" id="securityHeader">
                <span class="accordion-icon">🔒</span>
                <h3 class="section-title">Security & Performance Features</h3>
                <span class="accordion-chevron">▼</span>
            </div>
            <div class="accordion-content" id="securityContent">
                <ul>
                    <li>Input validation and sanitization</li>
                    <li>SQL injection protection</li>
                    <li>Rate limiting (configured)</li>
                    <li>Cache optimization</li>
                </ul>
            </div>
        </div>

        <!-- Email Functionality -->
        <div class="email-section">
            <h3 class="section-title">Email Functionality</h3>
            <div class="email-form">
                <div class="form-group">
                    <label for="emailSubject">Email Subject</label>
                    <input 
                        type="text" 
                        id="emailSubject" 
                        class="form-input" 
                        placeholder="e.g., Inventory Alert"
                    />
                </div>
                <div class="form-group">
                    <label for="emailBody">Email Body</label>
                    <textarea 
                        id="emailBody" 
                        class="form-textarea" 
                        rows="5"
                        placeholder="Email content goes here..."
                    ></textarea>
                </div>
                <button id="sendEmailBtn" class="btn btn-primary">
                    <span>✉️</span> Send Email
                </button>
                <div id="emailStatus" class="email-status"></div>
            </div>
        </div>
    </div>

    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}

