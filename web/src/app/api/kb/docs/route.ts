import { NextRequest, NextResponse } from 'next/server';
import { listDocs } from 'lib/kb/server';

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain');
  if (!domain) {
    return NextResponse.json(
      { success: false, data: null, error: '缺少 domain 参数' },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      success: true,
      data: await listDocs(domain),
      error: null,
    });
  } catch (err: any) {
    console.error('[api/kb/docs]', err);
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: String(err?.message ?? '读取文档列表失败'),
      },
      { status: 404 },
    );
  }
}
