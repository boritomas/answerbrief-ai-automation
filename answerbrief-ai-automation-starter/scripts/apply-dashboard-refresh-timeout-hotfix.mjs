import { readFile, writeFile } from 'node:fs/promises';

const routeUrl = new URL('../app/api/career-os/actions/route.ts', import.meta.url);
const source = await readFile(routeUrl, 'utf8');

const before = 'const discovery = await runDailyGreenhouseDiscovery(ownerEmail, before.evidence, { maxBoards: FOREGROUND_DISCOVERY_MAX_BOARDS });';
const after = 'const discovery = await runDailyGreenhouseDiscovery(ownerEmail, before.evidence, { maxBoards: 1 });';

if (!source.includes(before) && !source.includes(after)) {
  throw new Error('Career OS dashboard refresh target was not found.');
}

if (source.includes(before)) {
  await writeFile(routeUrl, source.replace(before, after), 'utf8');
  console.log('Applied bounded Career OS dashboard refresh hotfix.');
} else {
  console.log('Career OS dashboard refresh hotfix already applied.');
}
