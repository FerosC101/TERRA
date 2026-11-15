import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The website used to live at /welcome; it is now the home page
  async redirects() {
    return [{ source: "/welcome", destination: "/", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
