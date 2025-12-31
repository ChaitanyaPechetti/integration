import * as vscode from 'vscode';
import { ErrorDetector, ErrorDetectionResult } from './errorDetector';
import { RepoAnalyzer, RepoAnalysisResult } from './repoAnalyzer';
import { DocumentRecord } from '../externalMemory';

export class RcaContextBuilder {
    private errorDetector: ErrorDetector;
    private repoAnalyzer: RepoAnalyzer;

    constructor() {
        this.errorDetector = new ErrorDetector();
        this.repoAnalyzer = new RepoAnalyzer();
    }

    async buildRcaContext(
        errorMessage: string,
        webDocs: DocumentRecord[],
        internalDocs: DocumentRecord[],
        workspaceUri?: vscode.Uri
    ): Promise<string> {
        const detection = this.errorDetector.detectError(errorMessage);
        
        let context = `=== ROOT CAUSE ANALYSIS REQUEST ===\n\n`;
        context += `ERROR MESSAGE:\n${errorMessage}\n\n`;
        
        if (detection.detected && detection.matchedPattern) {
            context += `ERROR CLASSIFICATION:\n`;
            context += `Category: ${detection.category}\n`;
            context += `Severity: ${detection.severity}\n`;
            context += `Confidence: ${(detection.confidence * 100).toFixed(0)}%\n\n`;
            
            context += `COMMON CAUSES FOR THIS ERROR TYPE:\n`;
            detection.matchedPattern.commonCauses.forEach((cause, idx) => {
                context += `  ${idx + 1}. ${cause}\n`;
            });
            context += `\nSUGGESTED FIXES:\n`;
            detection.matchedPattern.suggestedFixes.forEach((fix, idx) => {
                context += `  ${idx + 1}. ${fix}\n`;
            });
            context += `\n`;
        } else {
            context += `ERROR CLASSIFICATION: Generic error detected\n\n`;
        }

        // Add repository context if available
        if (workspaceUri) {
            try {
                const repoAnalysis = await this.repoAnalyzer.analyzeForRCA(errorMessage, workspaceUri);
                
                if (repoAnalysis.errorLocation || repoAnalysis.configFiles.length > 0 || repoAnalysis.stackTrace) {
                    context += `=== REPOSITORY CONTEXT ===\n\n`;
                    
                    if (repoAnalysis.errorLocation) {
                        context += `ERROR LOCATION:\n`;
                        context += `File: ${repoAnalysis.errorLocation.file}\n`;
                        if (repoAnalysis.errorLocation.line) {
                            context += `Line: ${repoAnalysis.errorLocation.line}\n`;
                        }
                        if (repoAnalysis.errorLocation.column) {
                            context += `Column: ${repoAnalysis.errorLocation.column}\n`;
                        }
                        context += `\n`;
                        
                        if (repoAnalysis.errorContext) {
                            context += `CODE CONTEXT (10 lines before/after error):\n`;
                            context += `${repoAnalysis.errorContext}\n\n`;
                        }
                    }
                    
                    if (repoAnalysis.stackTrace && repoAnalysis.stackTrace.length > 0) {
                        context += `STACK TRACE:\n`;
                        repoAnalysis.stackTrace.slice(0, 10).forEach((line, idx) => {
                            context += `  ${idx + 1}. ${line}\n`;
                        });
                        context += `\n`;
                    }
                    
                    if (repoAnalysis.configFiles.length > 0) {
                        context += `CONFIGURATION FILES FOUND:\n`;
                        repoAnalysis.configFiles.forEach(file => {
                            context += `  - ${file}\n`;
                        });
                        context += `\n`;
                    }
                    
                    if (repoAnalysis.dependencies && Object.keys(repoAnalysis.dependencies).length > 0) {
                        context += `DEPENDENCIES:\n`;
                        if (repoAnalysis.dependencies.dependencies) {
                            context += `  Dependencies: ${Object.keys(repoAnalysis.dependencies.dependencies || {}).join(', ')}\n`;
                        }
                        if (repoAnalysis.dependencies.devDependencies) {
                            context += `  Dev Dependencies: ${Object.keys(repoAnalysis.dependencies.devDependencies || {}).join(', ')}\n`;
                        }
                        context += `\n`;
                    }
                    
                    if (repoAnalysis.relevantFiles.length > 0) {
                        context += `RELEVANT FILES:\n`;
                        repoAnalysis.relevantFiles.slice(0, 5).forEach(file => {
                            context += `  - ${file}\n`;
                        });
                        context += `\n`;
                    }
                }
            } catch (err) {
                // Skip repo analysis if it fails
            }
        }

        // Add web search results
        if (webDocs.length > 0) {
            context += `=== WEB SEARCH RESULTS (Similar Errors & Solutions) ===\n\n`;
            webDocs.slice(0, 5).forEach((doc, idx) => {
                context += `[Web Result ${idx + 1}] ${doc.metadata?.title || 'Result'}\n`;
                if (doc.metadata?.link) {
                    context += `Source: ${doc.metadata.link}\n`;
                }
                context += `Content: ${doc.content.substring(0, 800)}\n\n`;
            });
        }

        // Add internal knowledge
        if (internalDocs.length > 0) {
            context += `=== INTERNAL KNOWLEDGE BASE ===\n\n`;
            internalDocs.forEach((doc, idx) => {
                context += `[Internal ${idx + 1}]\n`;
                context += `${doc.content.substring(0, 500)}\n\n`;
            });
        }

        context += `=== CRITICAL INSTRUCTIONS FOR ROOT CAUSE ANALYSIS ===\n\n`;
        context += `You MUST respond EXACTLY in the format: rootcause: and solution:\n`;
        context += `Do NOT use placeholders, examples, or "e.g.," - provide the ACTUAL analysis for THIS specific error.\n`;
        context += `Do NOT say "follow these steps" or "analyze the error" - provide the ACTUAL root cause and solution.\n`;
        context += `Focus ONLY on the error message provided - do not get distracted.\n\n`;
        context += `1. rootcause: Explain WHY this specific error is happening (1-3 sentences, technical and specific)\n`;
        context += `2. solution: Provide the actual solution steps to fix THIS error (numbered steps, specific and actionable)\n\n`;
        context += `If code context is provided, reference the specific file and line number.\n`;
        context += `If error category is identified, use the common causes and suggested fixes as guidance.\n`;
        context += `Be technical, specific, and actionable. No generic responses, no examples, no placeholders.\n`;

        return context;
    }

    buildRcaPrompt(errorMessage: string): string {
        return [
            'You are an expert software engineer performing root cause analysis.',
            'Analyze ONLY the error message and context provided above.',
            'Focus EXCLUSIVELY on the specific error - do not provide examples or generic instructions.',
            '',
            'CRITICAL: Respond EXACTLY in this format (no other text, no examples, no placeholders):',
            '',
            'rootcause:',
            '[Provide the ACTUAL root cause of THIS specific error. Be technical and specific. Explain WHY this error is happening for THIS error message. 1-3 sentences.]',
            '',
            'solution:',
            '[Provide the ACTUAL solution steps to fix THIS specific error. Be specific and actionable. Number each step. Reference file names and line numbers if provided in the error.]',
            '',
            'IMPORTANT RULES:',
            '- Do NOT use placeholders like "e.g.," or "[example]"',
            '- Do NOT say "follow these steps" or "analyze the error"',
            '- Do NOT provide generic examples - give the ACTUAL analysis for THIS error',
            '- Reference the exact file and line number from the error message',
            '- Use the code context provided if available',
            '- Be technical, specific, and direct',
            '- Focus ONLY on the error provided, nothing else'
        ].join('\n');
    }
}

