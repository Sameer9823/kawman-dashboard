import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
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
