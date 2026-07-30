import type { Page } from 'playwright';
import type { BrowserWorkerTask } from '../career-os-browser-worker';
import type { ATSAdapterRuntime } from '../career-os-ats-adapter';
import type {
  AtsAdapter,
  AtsExecutionContext,
  AtsPlatform,
  JsonRecord,
} from './contracts';
import { routeAtsApplication } from './router';

export type LegacyAtsAdapterShape = {
  id: string;
  matches(task: BrowserWorkerTask): boolean;
  execute(page: Page, task: BrowserWorkerTask, runtime: ATSAdapterRuntime): Promise<boolean>;
};

export type LegacyAdapterBridgeOptions = {
  legacyAdapter?: LegacyAtsAdapterShape;
  platform?: AtsPlatform;
};

/*
 * Bridge contract:
 * - Legacy input: BrowserWorkerTask, Playwright Page, ATSAdapterRuntime.
 * - Native input: AtsExecutionContext plus typed adapter metadata/capabilities.
 * - Conversion: task.applicationUrl/platform/raw signals are routed through the detector.
 * - Legacy output: boolean execute() completion signal.
 * - Native output: structured phase results emitted by the adapter/orchestrator boundary.
 * - Deprecation path: keep legacy execute() as the behavior owner until the browser
 *   companion invokes orchestrateAtsApplication directly.
 * - Compatibility limit: this bridge does not translate legacy selector internals into
 *   field-level native results. It preserves behavior by delegating when a legacy
 *   adapter is supplied.
 */
export function createLegacyAdapterBridge(
  nativeAdapter: AtsAdapter,
  options: LegacyAdapterBridgeOptions = {},
): LegacyAtsAdapterShape {
  return {
    id: nativeAdapter.metadata.adapterId,
    matches(task: BrowserWorkerTask) {
      const route = routeAtsApplication(taskToDetectionInput(task));
      const selectedAdapterId = route.adapterMetadata.adapterId;
      const platformMatches = options.platform
        ? route.detection.platform === options.platform
        : nativeAdapter.metadata.supportedPlatforms.includes(route.detection.platform);
      return platformMatches && selectedAdapterId === nativeAdapter.metadata.adapterId;
    },
    async execute(page: Page, task: BrowserWorkerTask, runtime: ATSAdapterRuntime) {
      if (options.legacyAdapter) {
        return options.legacyAdapter.execute(page, task, runtime);
      }

      const context = taskToExecutionContext(task, page, runtime);
      if (nativeAdapter.metadata.implementationStatus === 'unsupported') {
        const result = await nativeAdapter.openApplication(context);
        await runtime.report({
          status: 'blocked_technical',
          currentUrl: task.applicationUrl,
          evidenceText: result.failure?.message || 'Unsupported ATS platform.',
          details: {
            adapter: nativeAdapter.metadata.adapterId,
            nativeResult: result,
          },
        });
        return true;
      }

      await runtime.report({
        status: 'heartbeat',
        currentUrl: task.applicationUrl,
        evidenceText: `${nativeAdapter.metadata.adapterId} native compatibility bridge selected; existing legacy execution remains authoritative in Phase 2.`,
        details: {
          adapter: nativeAdapter.metadata.adapterId,
          adapterVersion: nativeAdapter.metadata.adapterVersion,
          compatibilityBridge: true,
        },
      });
      return true;
    },
  };
}

export function taskToExecutionContext(
  task: BrowserWorkerTask,
  page?: Page,
  runtime?: ATSAdapterRuntime,
): AtsExecutionContext {
  return {
    applicationId: task.applicationId,
    ownerEmail: task.ownerEmail,
    employer: task.employer,
    position: task.position,
    sourceUrl: task.applicationUrl,
    platformHint: task.platform,
    rawJobRecord: {
      application_url: task.applicationUrl,
      platform: task.platform,
    },
    candidateProfile: task.candidate as JsonRecord,
    approvedAnswers: {
      legal: task.legal,
      questionCatalog: task.questionCatalog,
    },
    resume: task.resume as JsonRecord,
    mode: 'compatibility',
    dryRun: true,
    page,
    runtime,
  };
}

function taskToDetectionInput(task: BrowserWorkerTask) {
  return {
    applicationId: task.applicationId,
    sourceUrl: task.applicationUrl,
    platformHint: task.platform,
    originalTask: task,
    rawJobRecord: {
      application_url: task.applicationUrl,
      platform: task.platform,
    },
  };
}
