import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /meetings/new uploads meeting video (up to 500MB) directly via a
  // Server Action to Cloudinary — so the body must survive BOTH the
  // proxy (edge, default 10MB → truncated → "Unexpected end of form")
  // and the Server Action (node, also 10MB by default). Raise both.
  experimental: {
    proxyClientMaxBodySize: "500mb",
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },

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