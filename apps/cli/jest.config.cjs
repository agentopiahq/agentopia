module.exports = {
  preset: '@agentopia/jest-presets/node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
