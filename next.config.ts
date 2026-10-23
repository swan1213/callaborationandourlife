import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose", "web-push"],
  // Calibri-width font files the PDF renderer reads at runtime (lib/documents.ts, lib/fonts/README.txt).
  outputFileTracingIncludes: { "/**": ["src/lib/fonts/**/*"] },
  // Keep the dev-only Next.js badge away from the sidebar's account button (bottom-left).
  devIndicators: { position: "bottom-right" },
  images: { remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }] },
};

export default nextConfig;
