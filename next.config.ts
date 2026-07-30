import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker / Coolify deployment.
  output: "standalone",
  // Allow larger Server Action bodies for content media uploads (images/reels).
  experimental: {
    serverActions: { bodySizeLimit: "110mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

export default nextConfig;
