import fetch from 'node-fetch';

// Provide global fetch for modules using it
(global as any).fetch = fetch;

