// Plain object (no "vitest/config" import) because vitest is installed under packages/core, not here.
// Globals are on so the tests need no "vitest" import. Run with `npm test` in this folder.
export default {
  test: { globals: true, include: ["test/**/*.test.ts"] },
};
