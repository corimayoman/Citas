/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Ignorar imports de CSS/imágenes
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__tests__/mocks/style-mock.js',
    '\\.(jpg|jpeg|png|gif|svg|ico)$': '<rootDir>/src/__tests__/mocks/file-mock.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
      },
    }],
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  passWithNoTests: true,
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
};
