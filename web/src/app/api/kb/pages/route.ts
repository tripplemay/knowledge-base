import { NextRequest, NextResponse } from 'next/server';
import { getPages } from 'lib/kb/server';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const domain = params.get('domain');
  const slug = params.get('slug');
  if (!domain || !slug) {
    return NextResponse.json(
      { success: false, data: null, error: '缺少 domain/slug 参数' },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ success: true, data: getPages(domain, slug), error: null });
  } catch (err: any) {
    console.error('[api/kb/pages]', err);
    return NextResponse.json(
      { success: false, data: null, error: String(err?.message ?? '读取按页翻译失败') },
      { status: 404 },
    );
  }
}
