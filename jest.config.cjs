/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['@babel/preset-env'] }],
  },
  collectCoverage: true,
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
    '/coverage/'
  ],
  verbose: true,
  extensionsToTreatAsEsm: ['.js'],
  transformIgnorePatterns: [
    '/node_modules/(?!.*\\.mjs$)'
  ],
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'node'],
};

module.exports = config; 