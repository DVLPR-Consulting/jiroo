import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.JIROO_E2E_ISOLATED === "1" ? ".next-e2e" : ".next",
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
