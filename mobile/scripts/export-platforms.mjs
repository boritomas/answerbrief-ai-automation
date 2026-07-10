import { spawnSync } from 'node:child_process';

const platforms = ['ios', 'android', 'web'];
const maxAttempts = 2;

for (const platform of platforms) {
  let result;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`\nExporting ${platform} bundle${attempt > 1 ? ` (retry ${attempt})` : ''}...`);
    result = spawnSync('npx', ['expo', 'export', '--platform', platform, '--clear'], {
      env: {
        ...process.env,
        EXPO_NO_TELEMETRY: '1'
      },
      stdio: 'inherit'
    });

    if (result.status === 0) {
      break;
    }
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nAll Expo export bundles completed.');
