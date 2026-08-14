export type WebSecurityHeader = {
  key: string;
  value: string;
};

export function contentSecurityPolicy(isDevelopment: boolean): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline' https:${
      isDevelopment ? " http: 'unsafe-eval'" : ""
    }`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' blob: data: https:",
    `connect-src 'self' https:${isDevelopment ? " http: ws: wss:" : ""}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ];

  return directives.map((directive) => `${directive};`).join(" ");
}

export function webSecurityHeaders(
  isDevelopment: boolean,
): WebSecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: contentSecurityPolicy(isDevelopment),
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: permissionsPolicy() },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ...(isDevelopment
      ? []
      : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
}

function permissionsPolicy(): string {
  return [
    "camera=()",
    "display-capture=()",
    "geolocation=()",
    "microphone=()",
    "payment=()",
    "usb=()",
  ].join(", ");
}
