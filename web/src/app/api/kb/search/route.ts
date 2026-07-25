import { NextRequest, NextResponse } from 'next/server';
import { searchKb } from 'lib/kb/server';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get('q') ?? '';
  const domain = params.get('domain') ?? undefined;
  if (q.trim().length < 2) {
    return NextResponse.json(
      { success: false, data: null, error: '搜索词至少 2 个字符' },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      success: true,
      data: await searchKb(q, domain),
      error: null,
    });
  } catch (err: any) {
    console.error('[api/kb/search]', err);
    return NextResponse.json(
      { success: false, data: null, error: String(err?.message ?? '搜索失败') },
      { status: 500 },
    );
  }
}
