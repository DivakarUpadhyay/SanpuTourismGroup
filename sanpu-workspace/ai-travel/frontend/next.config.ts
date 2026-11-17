import path from "node:path";
import type { NextConfig } from "next";

const api = process.env.API_URL ?? "http://localhost:5102";
const dev = process.env.NODE_ENV !== "production";
// Strict-ish CSP. Next.js needs inline scripts for hydration; dev additionally needs eval for HMR.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'"
].join("; ");

const config: NextConfig = {
  devIndicators: false,
  // Public, non-secret technical constant: the API cookie prefix for this app (cookies are not port-isolated on localhost).
  env: { NEXT_PUBLIC_COOKIE_PREFIX: "ai" },
  transpilePackages: ["@sanpu/web"],
  turbopack: { root: path.join(__dirname, "../..") },
  poweredByHeader: false,
  // The browser only talks to this origin; Next proxies /api to the ASP.NET Core API (cookies stay first-party).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
      ]
    }];
  }
};
export default config;
