import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /meetings/new uploads meeting video (up to 500MB) directly via a
  // Server Action to Cloudinary — so the action must accept large
  // multipart bodies.
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },

  // NOTE: proxyClientMaxBodySize is not a valid NextConfig property and
  // causes "Object literal may only specify known properties" TS error.
  // Large uploads are handled by serverActions.bodySizeLimit above.

  async redirects() {
    return [
      {
        source: "/admin/audit-logs/:path*",
        destination: "/admin/activity",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;