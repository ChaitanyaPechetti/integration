import { OutputChannel } from '../../utils/outputChannel';
import { Observability } from '../../utils/observability';

export type NodeState = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface Node {
    id: string;
    name: string;
    execute: (context: OrchestrationContext) => Promise<any>;
    condition?: (context: OrchestrationContext) => boolean;
    retries?: number;
    timeout?: number;
}

export interface OrchestrationContext {
    query: string;
    sanitizedQuery: string;
    embedding?: number[];
    internalDocs?: any[];
    webDocs?: any[];
    context?: string;
    response?: string;
    error?: string;
    metadata: Record<string, any>;
}

export interface OrchestrationResult {
    success: boolean;
    response?: string;
    error?: string;
    path: string[];
    metadata: Record<string, any>;
}

export class Orchestrator {
    private nodes: Map<string, Node> = new Map();
    private edges: Map<string, string[]> = new Map(); // nodeId -> [nextNodeIds]
    private output: OutputChannel;
    private observability: Observability;

    constructor(output: OutputChannel, observability: Observability) {
        this.output = output;
        this.observability = observability;
    }

    addNode(node: Node): void {
        this.nodes.set(node.id, node);
        if (!this.edges.has(node.id)) {
            this.edges.set(node.id, []);
        }
    }

    addEdge(fromNodeId: string, toNodeId: string): void {
        if (!this.edges.has(fromNodeId)) {
            this.edges.set(fromNodeId, []);
        }
        this.edges.get(fromNodeId)!.push(toNodeId);
    }

    private async executeNode(node: Node, context: OrchestrationContext): Promise<any> {
        const traceId = this.observability.startTrace(`orchestration_${node.id}`, { node: node.name });
        const startTime = Date.now();

        try {
            // Check condition
            if (node.condition && !node.condition(context)) {
                this.output.logInfo(`[Orchestrator] Node ${node.name} skipped due to condition`);
                this.observability.endTrace(traceId, 'success', { skipped: true });
                return { skipped: true };
            }

            // Execute with timeout and retries
            const timeout = node.timeout || 30000;
            const maxRetries = node.retries || 0;
            let lastError: Error | null = null;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    if (attempt > 0) {
                        const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff
                        this.output.logInfo(`[Orchestrator] Retrying ${node.name} (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms`);
                        await this.sleep(delay);
                    }

                    const result = await Promise.race([
                        node.execute(context),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Node ${node.name} timed out after ${timeout}ms`)), timeout)
                        )
                    ]);

                    const duration = Date.now() - startTime;
                    this.observability.recordLatency(`orchestration_${node.id}`, duration);
                    this.observability.endTrace(traceId, 'success', { attempt: attempt + 1, duration });
                    return result;
                } catch (error: any) {
                    lastError = error;
                    this.output.logWarning(`[Orchestrator] Node ${node.name} attempt ${attempt + 1} failed: ${error.message}`);
                }
            }

            // All retries exhausted
            throw lastError || new Error(`Node ${node.name} failed after ${maxRetries + 1} attempts`);
        } catch (error: any) {
            const duration = Date.now() - startTime;
            this.observability.recordError(`orchestration_${node.id}`, error.message);
            this.observability.endTrace(traceId, 'error', { error: error.message, duration });
            throw error;
        }
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getNextNodes(nodeId: string): string[] {
        return this.edges.get(nodeId) || [];
    }

    async execute(startNodeId: string, initialContext: OrchestrationContext): Promise<OrchestrationResult> {
        const executionTraceId = this.observability.startTrace('orchestration_execution');
        const path: string[] = [];
        const context: OrchestrationContext = { ...initialContext, metadata: { ...initialContext.metadata } };
        
        try {
            let currentNodeId: string | null = startNodeId;
            const visited = new Set<string>();

            while (currentNodeId) {
                if (visited.has(currentNodeId)) {
                    this.output.logWarning(`[Orchestrator] Cycle detected at node ${currentNodeId}, stopping`);
                    break;
                }
                visited.add(currentNodeId);

                const node = this.nodes.get(currentNodeId);
                if (!node) {
                    throw new Error(`Node ${currentNodeId} not found`);
                }

                path.push(node.name);
                this.output.logInfo(`[Orchestrator] Executing node: ${node.name}`);

                try {
                    const result = await this.executeNode(node, context);
                    
                    // Update context with result
                    if (result && typeof result === 'object' && !result.skipped) {
                        Object.assign(context, result);
                    }

                    // Determine next node(s) - support branching
                    const nextNodeIds = this.getNextNodes(currentNodeId);
                    
                    if (nextNodeIds.length === 0) {
                        // End of execution
                        currentNodeId = null;
                    } else if (nextNodeIds.length === 1) {
                        // Linear flow
                        currentNodeId = nextNodeIds[0];
                    } else {
                        // Branching - execute all branches and merge results
                        this.output.logInfo(`[Orchestrator] Branching to ${nextNodeIds.length} nodes`);
                        const branchResults = await Promise.allSettled(
                            nextNodeIds.map(id => {
                                const branchNode = this.nodes.get(id);
                                if (!branchNode) return Promise.reject(new Error(`Branch node ${id} not found`));
                                return this.executeNode(branchNode, context);
                            })
                        );

                        // Merge successful branch results
                        branchResults.forEach((result, index) => {
                            if (result.status === 'fulfilled' && result.value && typeof result.value === 'object') {
                                Object.assign(context, result.value);
                            } else if (result.status === 'rejected') {
                                this.output.logWarning(`[Orchestrator] Branch ${nextNodeIds[index]} failed: ${result.reason}`);
                            }
                        });

                        // After branching, continue with the first next node (or end)
                        currentNodeId = null; // End after branching (can be customized)
                    }
                } catch (error: any) {
                    // Node execution failed - check for fallback paths
                    this.output.logError(`[Orchestrator] Node ${node.name} failed: ${error.message}`);
                    context.error = error.message;
                    
                    // Look for fallback nodes (nodes that can handle errors)
                    if (currentNodeId) {
                        const nextNodes = this.getNextNodes(currentNodeId);
                        const fallbackNodes: string[] = nextNodes.filter(id => {
                            const n = this.nodes.get(id);
                            return n && n.name.toLowerCase().includes('fallback');
                        });

                        if (fallbackNodes.length > 0) {
                            this.output.logInfo(`[Orchestrator] Attempting fallback: ${fallbackNodes[0]}`);
                            currentNodeId = fallbackNodes[0];
                            this.observability.recordFallback(`orchestration_${node.name}`);
                        } else {
                            // No fallback, execution fails
                            throw error;
                        }
                    } else {
                        // No current node, execution fails
                        throw error;
                    }
                }
            }

            // Execution completed successfully
            this.observability.endTrace(executionTraceId, 'success', { path, steps: path.length });
            
            return {
                success: true,
                response: context.response,
                path,
                metadata: context.metadata
            };
        } catch (error: any) {
            this.observability.recordError('orchestration_execution', error.message);
            this.observability.endTrace(executionTraceId, 'error', { path, error: error.message });
            
            return {
                success: false,
                error: error.message,
                path,
                metadata: context.metadata
            };
        }
    }
}

