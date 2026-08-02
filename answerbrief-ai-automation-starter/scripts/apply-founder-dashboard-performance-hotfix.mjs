import { readFile, writeFile } from 'node:fs/promises';

const files = {
  page: new URL('../app/founder-dashboard/page.tsx', import.meta.url),
  qualified: new URL('../app/founder-dashboard/qualified-role-controls.tsx', import.meta.url),
  controls: new URL('../app/founder-dashboard/founder-run-controls.tsx', import.meta.url),
};

async function patchPage() {
  let source = await readFile(files.page, 'utf8');
  source = source.replace(
    "import { getCareerOsStatus } from '@/lib/career-os-status';",
    "import { getCachedCareerOsStatus } from '@/lib/career-os-status-cache';",
  );
  source = source.replace(
    'const status = await getCareerOsStatus();',
    'const status = await getCachedCareerOsStatus();',
  );
  await writeFile(files.page, source);
}

async function patchQualifiedControls() {
  let source = await readFile(files.qualified, 'utf8');
  source = source.replace("import { useRouter } from 'next/navigation';\n", '');
  source = source.replace('  const router = useRouter();\n', '');
  source = source.replace('      router.refresh();\n', '');
  source = source.replace(
    "setMessage(result.message || 'Approved and queued. Click Run One Production Application to execute this role.');",
    "setMessage(result.message || 'Approved and queued. Continue approving roles or process one approved role.');",
  );
  await writeFile(files.qualified, source);
}

async function patchRunControls() {
  let source = await readFile(files.controls, 'utf8');
  source = source.replace("import { useRouter } from 'next/navigation';\n", '');
  source = source.replace('  const router = useRouter();\n', '');
  source = source.replace('      router.refresh();\n', '');
  source = source.replace(
    'onClick={() => window.location.reload()}',
    "onClick={() => window.location.assign('/founder-dashboard?refresh=' + Date.now())}",
  );
  await writeFile(files.controls, source);
}

await patchPage();
await patchQualifiedControls();
await patchRunControls();
console.log('Founder dashboard performance hotfix applied.');
