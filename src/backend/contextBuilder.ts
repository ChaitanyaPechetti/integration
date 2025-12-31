import { DocumentRecord, ChatMessage } from './externalMemory';

export class ContextBuilder {
    buildContext(userInput: string, internalDocs: DocumentRecord[], webDocs: DocumentRecord[], chatHistory: ChatMessage[]): string {
        const relevanceGuide = [
            'Use only information that directly answers the user question.',
            'Ignore unrelated snippets (e.g., installers, downloaders, keybindings, generic shortcuts).',
            'Use only web snippets relevant to this exact question; ignore any prior question snippets.',
            'If no relevant information is found, respond exactly: "No relevant information found."'
        ].join('\n');
        let context = `Guidelines:\n${relevanceGuide}\n\n`;

        if (chatHistory.length > 0) {
            context += 'Previous Conversation:\n';
            chatHistory.forEach(msg => {
                context += `${msg.role}: ${msg.content}\n`;
            });
            context += '\n';
        }

        if (internalDocs.length > 0) {
            context += 'Internal Knowledge:\n';
            internalDocs.forEach((doc, idx) => {
                context += `[Internal ${idx + 1}]\n${doc.content}\n\n`;
            });
        }

        // Filter web docs to those likely relevant to the question
        const qLower = userInput.toLowerCase();
        const filteredWeb = webDocs.filter(doc => {
            const text = (doc.content || '').toLowerCase();
            const tokens = qLower.split(/\s+/).filter(t => t.length > 3);
            return tokens.some(tok => text.includes(tok));
        });

        if (filteredWeb.length > 0) {
            context += 'Web Snippets (reference only; do not list these in the answer):\n';
            filteredWeb.forEach((doc, idx) => {
                context += `[Web ${idx + 1}]\n${doc.content}\n\n`;
            });
        } else if (webDocs.length > 0) {
            // There were web docs, but none deemed relevant
            context += 'Web Snippets (reference only; do not list these in the answer):\nNo relevant web snippets found.\n\n';
        }

        context += `User Question: ${userInput}`;
        return context;
    }
}

