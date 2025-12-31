"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ragPanel_1 = require("../src/webview/ragPanel");
describe('sanitizeModelResponse', () => {
    it('removes context/guidelines/web markers', () => {
        const panelProto = ragPanel_1.RAGPanel.prototype;
        const input = `Context:\nGuidelines\n[Web 1]\nAnswer: Modi`;
        const cleaned = panelProto.sanitizeModelResponse(input);
        expect(cleaned).toBe('Answer: Modi');
    });
});
//# sourceMappingURL=sanitizeModelResponse.test.js.map