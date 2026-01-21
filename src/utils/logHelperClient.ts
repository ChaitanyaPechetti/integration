import * as vscode from 'vscode';
import { OutputChannel } from './outputChannel';

export class LogHelperClient {
    private output: OutputChannel;

    constructor(output: OutputChannel) {
        this.output = output;
    }

    async patternAgent(logFiles: string[]): Promise<string> {
        const cfg = vscode.workspace.getConfiguration('ragAgent');
        const enabled = cfg.get<boolean>('logHelperEnabled', false);
        const base = (cfg.get<string>('logHelperUrl', 'http://localhost:8001') || '').replace(/\/$/, '');
        if (!enabled || !base) {
            return 'Log Helper is disabled. Set ragAgent.logHelperEnabled to true and ragAgent.logHelperUrl.';
        }
        try {
            const r = await fetch(`${base}/api/log-helper/pattern-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_files: logFiles })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return (j as { error?: string }).error || `HTTP ${r.status}`;
            return (j as { result?: string }).result ?? '';
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.output.logError(`[LogHelper] patternAgent: ${msg}`);
            return `Log Helper request failed: ${msg}`;
        }
    }

    async mmm(lastError: string, persona: string = 'developer'): Promise<{ mirror: string; mentor: string; multiplier: string } | string> {
        const cfg = vscode.workspace.getConfiguration('ragAgent');
        const enabled = cfg.get<boolean>('logHelperEnabled', false);
        const base = (cfg.get<string>('logHelperUrl', 'http://localhost:8001') || '').replace(/\/$/, '');
        if (!enabled || !base) {
            return 'Log Helper is disabled. Set ragAgent.logHelperEnabled to true and ragAgent.logHelperUrl.';
        }
        try {
            const r = await fetch(`${base}/api/log-helper/mmm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ last_error: lastError, persona: persona })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return (j as { error?: string }).error || `HTTP ${r.status}`;
            if ((j as { error?: string }).error) {
                return (j as { error: string }).error;
            }
            return {
                mirror: (j as { mirror?: string }).mirror ?? '',
                mentor: (j as { mentor?: string }).mentor ?? '',
                multiplier: (j as { multiplier?: string }).multiplier ?? ''
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.output.logError(`[LogHelper] mmm: ${msg}`);
            return `Log Helper request failed: ${msg}`;
        }
    }

    async userActions(logFiles: string[]): Promise<string> {
        const cfg = vscode.workspace.getConfiguration('ragAgent');
        const enabled = cfg.get<boolean>('logHelperEnabled', false);
        const base = (cfg.get<string>('logHelperUrl', 'http://localhost:8001') || '').replace(/\/$/, '');
        if (!enabled || !base) {
            return 'Log Helper is disabled. Set ragAgent.logHelperEnabled to true and ragAgent.logHelperUrl.';
        }
        try {
            const r = await fetch(`${base}/api/log-helper/user-actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_files: logFiles })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return (j as { error?: string }).error || `HTTP ${r.status}`;
            return (j as { result?: string }).result ?? '';
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.output.logError(`[LogHelper] userActions: ${msg}`);
            return `Log Helper request failed: ${msg}`;
        }
    }
}
