import { ContextBuilder } from '../src/backend/contextBuilder';
import { DocumentRecord, ChatMessage } from '../src/backend/externalMemory';

describe('ContextBuilder', () => {
  const builder = new ContextBuilder();

  it('includes history, internal docs, and filtered web docs', () => {
    const history: ChatMessage[] = [{ role: 'user', content: 'hi', timestamp: Date.now() }];
    const internal: DocumentRecord[] = [{ id: 'i1', content: 'prime minister info', metadata: {}, timestamp: Date.now() }];
    const web: DocumentRecord[] = [
      { id: 'w1', content: 'Primeminister of India is Narendra Modi', metadata: {}, timestamp: Date.now() },
      { id: 'w2', content: 'completely unrelated text about shampoo', metadata: {}, timestamp: Date.now() }
    ];
    const ctx = builder.buildContext('who is prime minister of india', internal, web, history);
    expect(ctx).toContain('Previous Conversation');
    expect(ctx).toContain('Internal Knowledge');
    expect(ctx).toContain('[Web 1]');
    expect(ctx).not.toContain('shampoo');
  });

  it('marks when no relevant web snippets', () => {
    const ctx = builder.buildContext('python', [], [{ id: 'w1', content: 'java only', metadata: {}, timestamp: Date.now() }], []);
    expect(ctx).toContain('No relevant web snippets found');
  });
});

