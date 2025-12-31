import { Router } from '../src/backend/modelGateway/router';

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (_k: string, def: any) => def
        })
    }
}));

describe('Router', () => {
    let router: Router;

    beforeEach(() => {
        router = new Router();
    });

    it('should use model override when provided', () => {
        const route = router.selectModel('override-model');
        expect(route.model).toBe('override-model');
    });

    it('should use configured model when no override', () => {
        const route = router.selectModel();
        expect(route.model).toBe('tinyllama');
    });
});

