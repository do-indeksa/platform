export const analyticsBootstrap = String.raw`(() => {
  const trackerId = "umami-analytics";
  if (document.getElementById(trackerId)) return;

  void fetch("/analytics/config.json", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then((response) => {
      const contentType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (
        response.status !== 200 ||
        contentType !== "application/json"
      ) {
        return null;
      }
      return response.json();
    })
    .then((config) => {
      if (!isAnalyticsConfig(config) || document.getElementById(trackerId)) {
        return;
      }

      const script = document.createElement("script");
      script.id = trackerId;
      script.defer = true;
      script.src = config.scriptUrl;
      script.dataset.websiteId = config.websiteId;
      script.dataset.domains = config.domains;
      script.dataset.doNotTrack = "true";
      script.dataset.excludeSearch = "true";
      script.dataset.excludeHash = "true";
      document.head.appendChild(script);
    })
    .catch(() => {});

  function isAnalyticsConfig(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      isScriptUrl(value.scriptUrl) &&
      typeof value.websiteId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.websiteId,
      ) &&
      typeof value.domains === "string" &&
      value.domains.length > 0 &&
      !/[\s<>"'\\]/.test(value.domains)
    );
  }

  function isScriptUrl(value) {
    if (typeof value !== "string") return false;
    if (value.startsWith("/") && !value.startsWith("//")) {
      return !value.includes("\\") && !/\s/.test(value);
    }

    try {
      const url = new URL(value);
      if (url.username || url.password || url.hash) return false;
      if (url.protocol === "https:") return true;
      return url.protocol === "http:" && isLoopback(url.hostname);
    } catch {
      return false;
    }
  }

  function isLoopback(hostname) {
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  }
})();`;
