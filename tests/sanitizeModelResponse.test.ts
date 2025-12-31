import { RAGPanel } from '../src/webview/ragPanel';

describe('sanitizeModelResponse', () => {
  it('removes context/guidelines/web markers', () => {
    const panelProto = RAGPanel.prototype as any;
    const input = `Context:\nGuidelines\n[Web 1]\nAnswer: Modi`;
    const cleaned = panelProto.sanitizeModelResponse(input);
    expect(cleaned).toBe('Answer: Modi');
  });
});

