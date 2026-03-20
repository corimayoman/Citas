/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
    NEXT_PUBLIC_STRIPE_DEMO_MODE: process.env.NEXT_PUBLIC_STRIPE_DEMO_MODE || 'false',
  },
};

module.exports = nextConfig;
