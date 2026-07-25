import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker / Coolify deployment.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

export default nextConfig;
