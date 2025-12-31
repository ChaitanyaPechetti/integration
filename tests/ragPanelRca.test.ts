import { RAGPanel } from '../src/webview/ragPanel';

describe('RAGPanel RCA helpers', () => {
    it('parses root cause and solution sections', () => {
        const panelProto = RAGPanel.prototype as any;
        const parsed = panelProto.parseRcaResponse(
            [
                'rootcause:',
                'Null pointer dereference in handler.',
                '',
                'solution:',
                '1. Add a null guard before accessing the handler.',
                '2. Ensure initialization happens earlier.',
                ''
            ].join('\n')
        );

        expect(parsed.rootCause).toContain('Null pointer');
        expect(parsed.solution).toContain('Add a null guard');
    });

    it('builds RCA template with sources and timing', () => {
        const panelProto = RAGPanel.prototype as any;
        const template = panelProto.buildRcaTemplate(
            'rootcause: Bad config\nsolution: 1. Update config',
            [{ title: 'Doc', link: 'http://example.com' }],
            123
        );

        expect(template).toContain('rootcause:');
        expect(template).toContain('fix steps:');
        expect(template).toContain('sources:');
        expect(template).toContain('Doc');
        expect(template).toContain('time: 123 ms');
    });

    it('picks a fallback sentence from sources', () => {
        const panelProto = RAGPanel.prototype as any;
        const sentence = panelProto.pickSourceSentence([{ title: 'Narendra Modi - Wikipedia' }]);

        expect(sentence).toBe('Narendra Modi is the Prime Minister of India.');
    });
});
