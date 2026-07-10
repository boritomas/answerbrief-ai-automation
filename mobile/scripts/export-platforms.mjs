import { spawnSync } from 'node:child_process';

const platforms = ['ios', 'android', 'web'];

for (const platform of platforms) {
  console.log(`\nExporting ${platform} bundle...`);
  const result = spawnSync('npx', ['expo', 'export', '--platform', platform, '--clear'], {
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: '1'
    },
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nAll Expo export bundles completed.');
