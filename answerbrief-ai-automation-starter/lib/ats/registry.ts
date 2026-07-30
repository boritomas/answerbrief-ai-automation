import type {
  AtsAdapter,
  AtsAdapterMetadata,
  AtsPlatform,
} from './contracts';
import { greenhouseCompatibilityAdapter } from './adapters/greenhouse';
import { unsupportedAtsAdapter } from './adapters/unsupported';
import { workdayCompatibilityAdapter } from './adapters/workday';

export class AtsAdapterRegistry {
  private readonly adapters = new Map<AtsPlatform, AtsAdapter>();
  private readonly unsupportedAdapter: AtsAdapter;

  constructor(unsupportedAdapter: AtsAdapter = unsupportedAtsAdapter) {
    this.unsupportedAdapter = unsupportedAdapter;
    for (const platform of unsupportedAdapter.metadata.supportedPlatforms) {
      this.register(unsupportedAdapter, platform);
    }
  }

  register(adapter: AtsAdapter, platform?: AtsPlatform) {
    const platforms = platform ? [platform] : adapter.metadata.supportedPlatforms;
    for (const supportedPlatform of platforms) {
      if (this.adapters.has(supportedPlatform)) {
        throw new Error(`ATS adapter is already registered for platform ${supportedPlatform}.`);
      }
      this.adapters.set(supportedPlatform, adapter);
    }
  }

  getAdapter(platform: AtsPlatform) {
    if (platform === 'unknown') return this.unsupportedAdapter;
    return this.adapters.get(platform) || this.unsupportedAdapter;
  }

  hasSupportedAdapter(platform: AtsPlatform) {
    const adapter = this.getAdapter(platform);
    return adapter.metadata.implementationStatus !== 'unsupported';
  }

  listMetadata(): AtsAdapterMetadata[] {
    const unique = new Map<string, AtsAdapterMetadata>();
    this.adapters.forEach((adapter) => {
      unique.set(adapter.metadata.adapterId, adapter.metadata);
    });
    return Array.from(unique.values()).sort((left, right) => left.adapterId.localeCompare(right.adapterId));
  }
}

export function createDefaultAtsAdapterRegistry() {
  const registry = new AtsAdapterRegistry();
  registry.register(greenhouseCompatibilityAdapter, 'greenhouse');
  registry.register(workdayCompatibilityAdapter, 'workday');
  return registry;
}

export const defaultAtsAdapterRegistry = createDefaultAtsAdapterRegistry();
