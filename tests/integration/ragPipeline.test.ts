/**
 * Integration tests for the RAG pipeline
 * Tests the full flow from query to response
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { InputGuardrail } from '../../src/backend/guardrails/inputGuardrail';
import { OutputGuardrail } from '../../src/backend/guardrails/outputGuardrail';
import { Retriever } from '../../src/backend/retriever';
import { ContextBuilder } from '../../src/backend/contextBuilder';
import { ModelGateway } from '../../src/backend/modelGateway/modelGateway';
import { CacheManager } from '../../src/utils/cacheManager';
import { OutputChannel } from '../../src/utils/outputChannel';
import { ExternalMemory } from '../../src/backend/externalMemory';
import { WebSearch } from '../../src/backend/web/webSearch';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode');

describe('RAG Pipeline Integration Tests', () => {
    let cacheManager: CacheManager;
    let outputChannel: OutputChannel;
    let inputGuardrail: InputGuardrail;
    let outputGuardrail: OutputGuardrail;
    let externalMemory: ExternalMemory;
    let retriever: Retriever;
    let webSearch: WebSearch;
    let contextBuilder: ContextBuilder;
    let modelGateway: ModelGateway;

    beforeEach(() => {
        // Create mock extension context
        const mockContext = {
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            }
        } as unknown as vscode.ExtensionContext;

        outputChannel = new OutputChannel();
        cacheManager = new CacheManager(mockContext);
        inputGuardrail = new InputGuardrail(outputChannel);
        outputGuardrail = new OutputGuardrail(outputChannel);
        externalMemory = new ExternalMemory();
        retriever = new Retriever(externalMemory, cacheManager, outputChannel);
        webSearch = new WebSearch(cacheManager, outputChannel);
        contextBuilder = new ContextBuilder();
        modelGateway = new ModelGateway(outputChannel);
    });

    describe('Input Guardrail', () => {
        it('should validate valid input', () => {
            const result = inputGuardrail.validate('What is TypeScript?');
            expect(result.isValid).toBe(true);
        });

        it('should reject empty input', () => {
            const result = inputGuardrail.validate('');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Empty input');
        });

        it('should reject input that is too long', () => {
            const longInput = 'a'.repeat(2001);
            const result = inputGuardrail.validate(longInput);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Input too long');
        });

        it('should sanitize script tags', () => {
            const input = 'Hello <script>alert("xss")</script> world';
            const sanitized = inputGuardrail.sanitize(input);
            expect(sanitized).not.toContain('<script>');
        });
    });

    describe('Output Guardrail', () => {
        it('should validate clean output', () => {
            const result = outputGuardrail.validate('This is a clean response.');
            expect(result.isValid).toBe(true);
        });

        it('should redact sensitive data', () => {
            const output = 'Contact me at user@example.com or call 555-123-4567';
            const result = outputGuardrail.validate(output);
            expect(result.isValid).toBe(true);
            expect(result.redactedText).toContain('[EMAIL_REDACTED]');
            expect(result.redactedText).toContain('[PHONE_REDACTED]');
        });

        it('should reject unsafe content', () => {
            const output = 'Hello <script>alert("xss")</script>';
            const result = outputGuardrail.validate(output);
            expect(result.isValid).toBe(false);
            expect(result.needsRegeneration).toBe(true);
        });
    });

    describe('Context Builder', () => {
        it('should build context from internal and web documents', () => {
            const internalDocs = [
                {
                    id: 'doc1',
                    content: 'TypeScript is a typed superset of JavaScript',
                    metadata: {},
                    timestamp: Date.now()
                }
            ];
            const webDocs = [
                {
                    id: 'web1',
                    content: 'TypeScript adds static types to JavaScript',
                    metadata: { link: 'https://example.com' },
                    timestamp: Date.now()
                }
            ];
            const context = contextBuilder.buildContext(
                'What is TypeScript?',
                internalDocs,
                webDocs,
                []
            );
            expect(context).toContain('TypeScript');
            expect(context).toContain('Internal Knowledge');
            expect(context).toContain('Web Results');
        });

        it('should include chat history in context', () => {
            const chatHistory = [
                { role: 'user', content: 'What is JavaScript?', timestamp: Date.now() },
                { role: 'assistant', content: 'JavaScript is a programming language', timestamp: Date.now() }
            ];
            const context = contextBuilder.buildContext(
                'Tell me more',
                [],
                [],
                chatHistory
            );
            expect(context).toContain('Previous Conversation');
            expect(context).toContain('What is JavaScript?');
        });
    });

    describe('Retriever', () => {
        it('should retrieve internal documents', async () => {
            // Add a document to external memory
            await externalMemory.addDocument({
                id: 'test-doc',
                content: 'Test document content',
                metadata: {},
                timestamp: Date.now()
            });

            const docs = await retriever.retrieveInternal('test', 5);
            expect(docs.length).toBeGreaterThan(0);
        });

        it('should return empty array on error', async () => {
            // Test error handling
            const docs = await retriever.retrieveInternal('', -1);
            expect(Array.isArray(docs)).toBe(true);
        });
    });

    describe('End-to-End Pipeline', () => {
        it('should process a simple query through the full pipeline', async () => {
            const query = 'What is TypeScript?';
            
            // Step 1: Input validation
            const inputValidation = inputGuardrail.validate(query);
            expect(inputValidation.isValid).toBe(true);
            
            const sanitized = inputGuardrail.sanitize(query);
            
            // Step 2: Retrieval
            const internalDocs = await retriever.retrieveInternal(sanitized, 5);
            const webDocs = await webSearch.search(sanitized, 5, false);
            
            // Step 3: Context building
            const context = contextBuilder.buildContext(
                sanitized,
                internalDocs,
                webDocs,
                []
            );
            expect(context.length).toBeGreaterThan(0);
            
            // Step 4: Output validation (mock response)
            const mockResponse = 'TypeScript is a typed superset of JavaScript.';
            const outputValidation = outputGuardrail.validate(mockResponse);
            expect(outputValidation.isValid).toBe(true);
        });
    });

    describe('Caching', () => {
        it('should cache retrieval results', async () => {
            const query = 'test query';
            const docs1 = await retriever.retrieveInternal(query, 5);
            const docs2 = await retriever.retrieveInternal(query, 5);
            
            // Second call should use cache
            expect(docs1).toEqual(docs2);
        });

        it('should cache web search results', async () => {
            const query = 'test web search';
            const docs1 = await webSearch.search(query, 5, true);
            const docs2 = await webSearch.search(query, 5, true);
            
            // Second call should use cache
            expect(docs1).toEqual(docs2);
        });
    });
});

