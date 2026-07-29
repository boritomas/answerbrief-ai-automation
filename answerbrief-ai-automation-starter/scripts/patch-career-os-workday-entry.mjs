#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const runtimeRoot = process.argv[2]
  || process.env.CAREER_OS_RUNTIME
  || path.join(process.env.HOME || '', 'Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter');
const target = path.join(runtimeRoot, 'scripts/lib/career-os-ats-adapters.mjs');
const marker = 'CAREER_OS_WORKDAY_ENTRY_FLOW_V1';

if (!fs.existsSync(target)) {
  throw new Error(`Career OS ATS adapter not found: ${target}`);
}

let source = fs.readFileSync(target, 'utf8');
if (source.includes(marker)) {
  console.log(`Workday entry-flow patch already present in ${target}`);
  process.exit(0);
}

const helperAnchor = 'async function maybeUploadWorkdayResume(page, task, runtime) {';
const helper = `// ${marker}\nasync function workdayApplicationFormVisible(page) {\n  const text = await bodyText(page);\n  if (/you are applying for|my information|my experience|application questions|voluntary disclosures|review your application/i.test(text)) return true;\n  const signals = [\n    'input[type="file"]',\n    '[data-automation-id="legalNameSection"]',\n    '[data-automation-id="contactInformationSection"]',\n    '[data-automation-id="workExperienceSection"]',\n    '[data-automation-id="educationSection"]',\n  ];\n  for (const selector of signals) {\n    if (await page.locator(selector).first().count().catch(() => 0)) return true;\n  }\n  return false;\n}\n\nasync function maybeOpenWorkdayApplication(page, task, runtime) {\n  if (await workdayApplicationFormVisible(page)) return true;\n\n  const entryPatterns = [\n    /^apply manually$/i,\n    /^start application$/i,\n    /^apply now$/i,\n    /^apply$/i,\n    /autofill with resume/i,\n  ];\n\n  for (let pass = 1; pass <= 3; pass += 1) {\n    for (const pattern of entryPatterns) {\n      const result = await clickSubmitControl(page, [pattern]);\n      if (!result.clicked) continue;\n\n      await runtime.report({\n        status: 'heartbeat',\n        currentUrl: page.url(),\n        evidenceText: \`Advanced Workday entry flow using \${result.selectorType}: \${result.selectorValue}.\`,\n        details: {\n          classification: 'workday_entry_transition',\n          pass,\n          selectorType: result.selectorType,\n          selectorValue: result.selectorValue,\n        },\n      });\n\n      await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);\n      await page.waitForTimeout(2500);\n      if (await workdayApplicationFormVisible(page)) return true;\n    }\n    await page.waitForTimeout(1000);\n  }\n\n  return workdayApplicationFormVisible(page);\n}\n\n`;

if (!source.includes(helperAnchor)) {
  throw new Error(`Patch anchor missing: ${helperAnchor}`);
}
source = source.replace(helperAnchor, `${helper}${helperAnchor}`);

const executeAnchor = `    if (await runtime.detectCommonHumanGate()) return true;\n    if (await detectWorkdayAccountGate(page, task, runtime)) return true;\n\n    for (let step = 1; step <= 8; step += 1) {`;
const executeReplacement = `    if (await runtime.detectCommonHumanGate()) return true;\n\n    const workdayEntryOpened = await maybeOpenWorkdayApplication(page, task, runtime);\n    if (await runtime.detectCommonHumanGate()) return true;\n    if (await detectWorkdayAccountGate(page, task, runtime)) return true;\n    if (!workdayEntryOpened) {\n      await runtime.report({\n        status: 'blocked_technical',\n        currentUrl: page.url(),\n        evidenceText: 'Workday adapter could not advance from the public job or start-application screen into the application form.',\n        screenshotPath: await runtime.safeShot('workday-entry-not-opened'),\n        details: { classification: 'workday_entry_transition' },\n      });\n      return true;\n    }\n\n    await runtime.takeShot('workday-application-opened');\n\n    for (let step = 1; step <= 8; step += 1) {`;

if (!source.includes(executeAnchor)) {
  throw new Error('Workday execute-flow patch anchor missing. Refusing to modify an unexpected source version.');
}
source = source.replace(executeAnchor, executeReplacement);

const backup = `${target}.pre-workday-entry-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
fs.copyFileSync(target, backup);
fs.writeFileSync(target, source, 'utf8');

console.log(`Patched Workday entry flow: ${target}`);
console.log(`Backup: ${backup}`);
