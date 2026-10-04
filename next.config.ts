import type { NextConfig } from "next";

const authApiUrl = (
  process.env.AUTH_API_URL ||
  "http://localhost:5007"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/erp-auth/:path*",
          destination: `${authApiUrl}/api/erp-auth/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
