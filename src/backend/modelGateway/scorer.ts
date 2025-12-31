export class Scorer {
    score(response: string, context: string): number {
        let score = 0.5;
        if (response && response.length > 50) score += 0.2;
        const topWords = context.split(/\s+/).slice(0, 20);
        const hasRef = topWords.some(w => w && response.toLowerCase().includes(w.toLowerCase()));
        if (hasRef) score += 0.2;
        return Math.min(1, score);
    }
}

