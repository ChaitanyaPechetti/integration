/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/tests/mocks/vscode.ts',
    '.*/ragPanel\\.js$': '<rootDir>/tests/mocks/empty.js'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  testMatch: ['**/?(*.)+(test|spec).[tj]s?(x)'],
  clearMocks: true
};

