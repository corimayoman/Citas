module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '@/(.*)': '<rootDir>/src/$1' },
  collectCoverageFrom: [
    'src/modules/**/*.ts',
    '!src/modules/**/*.routes.ts',
    '!src/modules/**/*.d.ts',
    '!src/modules/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 50,
      functions: 45,
      branches: 35,
    },
  },
};
