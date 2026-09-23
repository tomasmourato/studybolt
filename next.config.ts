import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// connect-src is the important line: the browser itself refuses to send data anywhere except this site
// and Google's Gemini API, so the student's key and files can't leak to another server.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://generativelanguage.googleapis.com",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "frame-src 'self' blob: https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
