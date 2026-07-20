import type { Page } from 'playwright';
import type { BrowserWorkerTask } from './career-os-browser-worker';

type JsonRecord = Record<string, unknown>;

export type ATSAdapterStatus =
  | 'running'
  | 'heartbeat'
  | 'waiting_on_tomas'
  | 'blocked_technical'
  | 'retry_scheduled'
  | 'submitted'
  | 'confirmed'
  | 'failed';

export type ATSAdapterReport = {
  confirmationNumber?: string;
  currentUrl?: string;
  details?: JsonRecord;
  evidenceText?: string;
  evidenceUrl?: string;
  screenshotPath?: string;
  status: ATSAdapterStatus;
};

export type ATSAdapterRuntime = {
  detectCommonHumanGate(): Promise<boolean>;
  ensureResumeFile(): Promise<string>;
  fillByLabel(labelPattern: RegExp, value?: string): Promise<void>;
  report(payload: ATSAdapterReport): Promise<void>;
  safeShot(label: string): Promise<string>;
  selectValue(labelPattern: RegExp, value?: string): Promise<void>;
  takeShot(label: string): Promise<string>;
};

export interface ATSAdapter {
  id: string;
  matches(task: BrowserWorkerTask): boolean;
  execute(page: Page, task: BrowserWorkerTask, runtime: ATSAdapterRuntime): Promise<boolean>;
}
