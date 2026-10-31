import type { NextConfig } from "next";
import { productImageClouds } from './src/lib/productImages';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...productImageClouds().map(cloud => ({ protocol: 'https' as const, hostname: 'res.cloudinary.com', pathname: `/${cloud}/**` })),
      {
        // M-10: Restricted Supabase image hosting to specific project subdomain
        protocol: 'https',
        hostname: 'zvlywywbsicbvukuqozb.supabase.co',
        pathname: '/storage/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  // M-9: Configure secure HTTP headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
