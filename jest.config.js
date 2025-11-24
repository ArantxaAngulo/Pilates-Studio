
module.exports = {
  // The test environment that will be used for testing
  testEnvironment: 'node',

  // A list of paths to directories that Jest should use to search for files in
  roots: ['<rootDir>'],

  // The paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: [],

  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/__tests__/**/*.js?(x)',
    '**/?(*.)+(spec|test).js?(x)'
  ],

  // A map from regular expressions to paths to transformers
  transform: {},

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!server.js', // Often excluded as it's an entry point
    '!seed*.js', // Exclude seeding scripts
  ],

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'lcov',
    'clover',
    'cobertura' // Important for Azure DevOps
  ],

  // Jest-JUnit reporter configuration
  reporters: [
    'default',
    [ 'jest-junit', {
        outputDirectory: 'test-results',
        outputName: 'junit.xml',
        suiteName: 'Jest Tests'
      }
    ]
  ]
};
