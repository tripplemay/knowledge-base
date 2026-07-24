import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { getPdfFile } from 'lib/kb/server';
import type { KbPdfKind } from 'types/kb';

const VALID_KINDS: KbPdfKind[] = ['source', 'zh', 'dual'];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const domain = params.get('domain');
  const slug = params.get('slug');
  const kind = (params.get('file') ?? 'source') as KbPdfKind;
  if (!domain || !slug || !VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      { success: false, data: null, error: '参数不合法（需 domain、slug，file ∈ source|zh|dual）' },
      { status: 400 },
    );
  }
  try {
    const { path: filePath, filename } = getPdfFile(domain, slug, kind);
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
      { success: false, data: null, error: String(err?.message ?? '读取 PDF 失败') },
      { status: 404 },
    );
  }
}
