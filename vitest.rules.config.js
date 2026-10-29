// Security rules tests. They need the Firestore emulator, so run them with
// `npm run test:rules` (which starts it) rather than `npm test`.
export default {
  test: {
    include: ['tests/rules/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
};
