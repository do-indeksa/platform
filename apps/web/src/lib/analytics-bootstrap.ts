import type { AnalyticsConfig } from "./analytics-config";

export function buildAnalyticsBootstrap(config: AnalyticsConfig): string {
  const serializedConfig = JSON.stringify(config);

  return `(()=>{if(document.getElementById("umami-analytics"))return;const c=${serializedConfig};const s=document.createElement("script");s.id="umami-analytics";s.defer=true;s.src=c.scriptUrl;s.dataset.websiteId=c.websiteId;s.dataset.domains=c.domains;s.dataset.doNotTrack="true";s.dataset.excludeSearch="true";s.dataset.excludeHash="true";document.head.appendChild(s)})();`;
}
