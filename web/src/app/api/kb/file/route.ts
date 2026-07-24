import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { getSourceFile } from 'lib/kb/server';

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
    const { path: filePath, filename } = getSourceFile(domain, slug);
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('[api/kb/file]', err);
    return NextResponse.json(
      { success: false, data: null, error: String(err?.message ?? '读取原件失败') },
      { status: 404 },
    );
  }
}
