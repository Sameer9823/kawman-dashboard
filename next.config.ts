import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /meetings/new uploads meeting video (up to 500MB) directly via a
  // Server Action to Cloudinary — so the action must accept large
  // multipart bodies. All other actions are small form posts.
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    // Proxy runs before the Server Action; its own 10MB default truncates
    // the multipart stream before bodySizeLimit is ever checked (hence the
    // "Request body exceeded 10MB" + "Unexpected end of form" loop).
    proxyClientMaxBodySize: "500mb",
  },
  async redirects() {
    return [{ source: "/admin/audit-logs/:path*", destination: "/admin/activity", permanent: false }]
  },
};

export default nextConfig;
