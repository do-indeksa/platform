import Script from "next/script";

export function AnalyticsScript() {
  return (
    <Script
      id="analytics-bootstrap"
      src="/analytics/bootstrap.js"
      strategy="afterInteractive"
    />
  );
}
