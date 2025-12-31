import { OutputChannel } from '../src/utils/outputChannel';

const mockAppendLine = jest.fn();
const mockShow = jest.fn();
const mockDispose = jest.fn();

jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: mockAppendLine,
            show: mockShow,
            clear: jest.fn(),
            dispose: mockDispose
        }))
    }
}));

describe('OutputChannel', () => {
    let outputChannel: OutputChannel;

    beforeEach(() => {
        mockAppendLine.mockClear();
        mockShow.mockClear();
        mockDispose.mockClear();
        outputChannel = new OutputChannel();
    });

    it('should log info messages', () => {
        outputChannel.logInfo('Test info message');
        expect(mockAppendLine).toHaveBeenCalled();
        const call = mockAppendLine.mock.calls[0][0];
        expect(call).toContain('[INFO]');
        expect(call).toContain('Test info message');
    });

    it('should log warning messages', () => {
        outputChannel.logWarning('Test warning message');
        expect(mockAppendLine).toHaveBeenCalled();
        const call = mockAppendLine.mock.calls[0][0];
        expect(call).toContain('[WARNING]');
        expect(call).toContain('Test warning message');
    });

    it('should log error messages', () => {
        outputChannel.logError('Test error message');
        expect(mockAppendLine).toHaveBeenCalled();
        const call = mockAppendLine.mock.calls[0][0];
        expect(call).toContain('[ERROR]');
        expect(call).toContain('Test error message');
    });

    it('should show the channel', () => {
        outputChannel.show();
        expect(mockShow).toHaveBeenCalled();
    });

    it('should dispose the channel', () => {
        outputChannel.dispose();
        expect(mockDispose).toHaveBeenCalled();
    });
});

