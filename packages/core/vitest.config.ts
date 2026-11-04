import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Fixed zone with DST so schedule tests are deterministic on any machine.
    env: { TZ: 'America/New_York' },
  },
});
