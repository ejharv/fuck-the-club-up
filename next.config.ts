import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const embedHosts = "https://www.youtube-nocookie.com https://open.spotify.com https://w.soundcloud.com https://challenges.cloudflare.com";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts.
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://media.fucktheclubup.com https://*.googleusercontent.com",
      "media-src 'self' blob: https://media.fucktheclubup.com",
      // Browser uploads go straight to R2.
      "connect-src 'self' https://*.r2.cloudflarestorage.com",
      `frame-src ${embedHosts}`,
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // /media and the /api file routes set their own stricter, sandboxed headers.
    // Party links carry a secret token in the URL: never send it as a referrer.
    return [
      { source: "/((?!media/|api/).*)", headers: securityHeaders },
      { source: "/drop/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/nights/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;

// Gives `next dev` local D1/R2 bindings through Wrangler.
initOpenNextCloudflareForDev();
