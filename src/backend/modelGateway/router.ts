import * as vscode from 'vscode';

export interface ModelRoute {
    model: string;
}

export class Router {
    selectModel(modelOverride?: string): ModelRoute {
        // If model override provided (e.g., for RCA), use it
        if (modelOverride) {
            return { model: modelOverride };
        }
        
        const config = vscode.workspace.getConfiguration('ragAgent');
        const model = config.get<string>('model', 'tinyllama');
        return { model };
    }
}

