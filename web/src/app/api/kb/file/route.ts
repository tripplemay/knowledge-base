import fs from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { parseRange } from 'lib/kb/range';
import { getPdfFile } from 'lib/kb/server';
import type { KbPdfKind } from 'types/kb';

const VALID_KINDS: KbPdfKind[] = ['source', 'zh', 'dual'];

function stream(
  filePath: string,
  start?: number,
  end?: number,
): ReadableStream {
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
      {
        success: false,
        data: null,
        error: '参数不合法（需 domain、slug，file ∈ source|zh|dual）',
      },
      { status: 400 },
    );
  }
  try {
    const { path: filePath, filename } = await getPdfFile(domain, slug, kind);
    // Range 请求高频（PdfViewer 虚拟化滚动），这里必须走异步 stat，不能阻塞事件循环
    const fileStat = await stat(filePath);
    const etag = `"${fileStat.size}-${Math.round(fileStat.mtimeMs)}"`;
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
    const r = parseRange(req.headers.get('range'), fileStat.size);
    if (r.kind === 'unsatisfiable') {
      return new NextResponse(null, {
        status: 416,
        // 416 也要带 Accept-Ranges/ETag/Cache-Control
        headers: { ...common, 'Content-Range': `bytes */${fileStat.size}` },
      });
    }
    if (r.kind === 'partial') {
      return new NextResponse(stream(filePath, r.start, r.end), {
        status: 206,
        headers: {
          ...common,
          'Content-Range': `bytes ${r.start}-${r.end}/${fileStat.size}`,
          'Content-Length': String(r.end - r.start + 1),
        },
      });
    }
    return new NextResponse(stream(filePath), {
      headers: { ...common, 'Content-Length': String(fileStat.size) },
    });
  } catch (err: any) {
    // 详细信息（含绝对路径）只留在服务端日志，不回显给客户端
    console.error('[api/kb/file]', err);
    const notFound =
      err?.code === 'ENOENT' ||
      /^(未知知识域|文档不存在|PDF 不存在)/.test(String(err?.message ?? ''));
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: notFound ? '资源不存在' : '读取文件失败',
      },
      { status: notFound ? 404 : 500 },
    );
  }
}
