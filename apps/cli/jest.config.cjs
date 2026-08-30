module.exports = {
  preset: '@cubicle/jest-presets/node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
