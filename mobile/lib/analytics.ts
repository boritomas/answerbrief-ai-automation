type AnalyticsEvent = {
  name: string;
  properties?: Record<string, string | number | boolean | undefined>;
};

export function track(event: AnalyticsEvent) {
  if (__DEV__) {
    console.log('[analytics]', event.name, event.properties || {});
  }
}

