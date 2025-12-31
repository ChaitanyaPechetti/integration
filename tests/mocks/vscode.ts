export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue: T): T => defaultValue
  }),
  onDidChangeConfiguration: (_listener: any) => {
    /* no-op */
  }
};

export const window = {
  createOutputChannel: (_name: string) => ({
    appendLine: (_msg: string) => {},
    show: () => {},
    clear: () => {},
    dispose: () => {}
  })
};

export type ExtensionContext = any;

export default { workspace, window };

// Support CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
module.exports = { workspace, window };

