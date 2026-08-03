import fs from 'node:fs';

const cssFile = new URL('../app/founder-dashboard/founder-dashboard.module.css', import.meta.url);
const componentFile = new URL('../app/founder-dashboard/qualified-role-controls.tsx', import.meta.url);

let css = fs.readFileSync(cssFile, 'utf8');
const replacements = [
  [':global(.qualified-role-grid)', '.qualifiedRoleGrid'],
  [':global(.career-os-action-control.selected)', '.actionControl.selected'],
  [':global(.career-os-action-control)', '.actionControl'],
  [':global(.role-selector input)', '.roleSelector input'],
  [':global(.role-selector span)', '.roleSelector span'],
  [':global(.role-selector strong)', '.roleSelector strong'],
  [':global(.role-selector small)', '.roleSelector small'],
  [':global(.role-selector)', '.roleSelector'],
  [':global(.role-status)', '.roleStatus'],
  [':global(.cta-row .button)', '.ctaRow .button'],
  [':global(.cta-row)', '.ctaRow'],
  [':global(.button.primary)', '.button.primary'],
  [':global(.button.secondary)', '.button.secondary'],
  [':global(.button:disabled)', '.button:disabled'],
  [':global(.button)', '.button'],
];
for (const [from, to] of replacements) css = css.split(from).join(to);
css = css.split('.page .qualifiedRoleGrid').join('.qualifiedRoleGrid');
css = css.split('.page .actionControl').join('.actionControl');
css = css.split('.page .roleSelector').join('.roleSelector');
css = css.split('.page .roleStatus').join('.roleStatus');
css = css.split('.page .ctaRow').join('.ctaRow');
css = css.split('.page .button').join('.button');
fs.writeFileSync(cssFile, css);

let component = fs.readFileSync(componentFile, 'utf8');
if (!component.includes("import styles from './founder-dashboard.module.css';")) {
  component = component.replace("import { useMemo, useState } from 'react';", "import { useMemo, useState } from 'react';\nimport styles from './founder-dashboard.module.css';");
}
component = component
  .replaceAll('className="cta-row"', 'className={styles.ctaRow}')
  .replaceAll('className="qualified-role-grid"', 'className={styles.qualifiedRoleGrid}')
  .replace('className={`career-os-action-control ${checked ? \'selected\' : \'\'}`}', 'className={`${styles.actionControl} ${checked ? styles.selected : \'\'}`}')
  .replaceAll('className="role-selector"', 'className={styles.roleSelector}')
  .replaceAll('className="role-status"', 'className={styles.roleStatus}')
  .replaceAll('className="button secondary"', 'className={`${styles.button} ${styles.secondary}`}')
  .replaceAll('className="button primary"', 'className={`${styles.button} ${styles.primary}`}');
fs.writeFileSync(componentFile, component);

console.log('Applied founder dashboard CSS module build guard.');
