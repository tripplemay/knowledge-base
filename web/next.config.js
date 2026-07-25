/** @type {import('next').NextConfig} */

const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH,
  // react-pdf/pdfjs-dist：避免 webpack 解析 Node 端可选依赖 canvas
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  images: {
    // unoptimized 下图片优化器被完全绕过，远程域名白名单不生效，故不配置
    unoptimized: true,
  },
};

module.exports = nextConfig;
