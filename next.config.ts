import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  transpilePackages: ["pg"],
  serverExternalPackages: ["@h-t-m/app-inspect", "@threema/wasm-minisign-verify"],
};

export default nextConfig;
