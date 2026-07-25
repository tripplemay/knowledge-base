import React, { ReactNode } from 'react';
import type { Metadata } from 'next';
import AppWrappers from './AppWrappers';

// 模板未提供 metadata，标签页此前显示的是 URL
export const metadata: Metadata = {
  title: '知识库',
  description: '个人 AI-native 知识库',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="dark" id={'root'}>
        <AppWrappers>{children}</AppWrappers>
      </body>
    </html>
  );
}
