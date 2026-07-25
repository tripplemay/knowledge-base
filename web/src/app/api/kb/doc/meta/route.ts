// 阅读器骨架接口：只返回 variants/pdfs/hasPages/meta，不含正文
// 与 /api/kb/doc 并存（App Router 允许 doc/route.ts 与 doc/meta/route.ts 同时存在）
import { NextRequest, NextResponse } from 'next/server';
import { getDocMeta } from 'lib/kb/server';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const domain = params.get('domain');
  const slug = params.get('slug');
  if (!domain || !slug) {
    return NextResponse.json(
      { success: false, data: null, error: '参数不合法（需 domain、slug）' },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      success: true,
      data: await getDocMeta(domain, slug),
      error: null,
    });
  } catch (err: any) {
    console.error('[api/kb/doc/meta]', err);
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: String(err?.message ?? '读取文档信息失败'),
      },
      { status: 404 },
    );
  }
}
