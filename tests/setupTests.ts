// Provide a safe default fetch mock to avoid real network calls in tests.
(global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ items: [] }),
    text: async () => ''
});

