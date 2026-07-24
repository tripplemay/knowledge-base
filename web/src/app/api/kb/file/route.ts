import fs from 'fs';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { getPdfFile } from 'lib/kb/server';
import type { KbPdfKind } from 'types/kb';

const VALID_KINDS: KbPdfKind[] = ['source', 'zh', 'dual'];

function stream(filePath: string, start?: number, end?: number): ReadableStream {
  const nodeStream = fs.createReadStream(filePath, { start, end });
  return Readable.toWeb(nodeStream) as ReadableStream;
}

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
    const stat = fs.statSync(filePath);
    const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
    const common = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      ETag: etag,
    };
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: common });
    }
    const range = req.headers.get('range');
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2]
        ? Math.min(parseInt(match[2], 10), stat.size - 1)
        : stat.size - 1;
      if (start >= stat.size || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        });
      }
      return new NextResponse(stream(filePath, start, end), {
        status: 206,
        headers: {
          ...common,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }
    return new NextResponse(stream(filePath), {
      headers: { ...common, 'Content-Length': String(stat.size) },
    });
  } catch (err: any) {
    console.error('[api/kb/file]', err);
    return NextResponse.json(
      { success: false, data: null, error: String(err?.message ?? '读取 PDF 失败') },
      { status: 404 },
    );
  }
}
