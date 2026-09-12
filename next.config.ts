import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Video upload for /meetings/new can be large, but the upload itself
  // goes to Cloudinary via an API route that streams the buffer — the
  // Server Action only receives the returned Cloudinary URL, so a
  // conservative limit is safe and prevents OOM from forged multipart
  // bodies against any other Server Action.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
