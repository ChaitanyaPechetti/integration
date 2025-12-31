"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.window = exports.workspace = void 0;
exports.workspace = {
    getConfiguration: (_section) => ({
        get: (_key, defaultValue) => defaultValue
    }),
    onDidChangeConfiguration: (_listener) => {
        /* no-op */
    }
};
exports.window = {
    createOutputChannel: (_name) => ({
        appendLine: (_msg) => { },
        show: () => { },
        clear: () => { },
        dispose: () => { }
    })
};
exports.default = { workspace: exports.workspace, window: exports.window };
// Support CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
module.exports = { workspace: exports.workspace, window: exports.window };
//# sourceMappingURL=vscode.js.map