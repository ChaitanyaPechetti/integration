import { Scorer } from '../src/backend/modelGateway/scorer';

describe('Scorer', () => {
    let scorer: Scorer;

    beforeEach(() => {
        scorer = new Scorer();
    });

    it('should return base score of 0.5 for short response', () => {
        const score = scorer.score('Short', 'context');
        expect(score).toBe(0.5);
    });

    it('should add 0.2 for response longer than 50 characters', () => {
        const longResponse = 'a'.repeat(51);
        const score = scorer.score(longResponse, 'context');
        expect(score).toBe(0.7);
    });

    it('should add 0.2 when response contains context words', () => {
        const response = 'This is a test response with programming context';
        const context = 'programming language test';
        const score = scorer.score(response, context);
        expect(score).toBeGreaterThan(0.5);
    });

    it('should cap score at 1.0', () => {
        const longResponse = 'a'.repeat(100);
        const context = 'test programming language';
        const response = 'This is a test response with programming language context';
        const score = scorer.score(response, context);
        expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should handle empty context', () => {
        const score = scorer.score('Test response', '');
        expect(score).toBeGreaterThanOrEqual(0.5);
    });

    it('should handle empty response', () => {
        const score = scorer.score('', 'context');
        expect(score).toBe(0.5);
    });

    it('should handle case-insensitive matching', () => {
        const response = 'PROGRAMMING TEST';
        const context = 'programming test';
        const score = scorer.score(response, context);
        expect(score).toBeGreaterThan(0.5);
    });
});

