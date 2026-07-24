import { NextRequest, NextResponse } from 'next/server';
import { getDocContent } from 'lib/kb/server';
import type { KbDocVariant } from 'types/kb';

const VALID_VARIANTS: KbDocVariant[] = ['zh', 'bilingual', 'en'];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const domain = params.get('domain');
  const slug = params.get('slug');
  const variant = (params.get('variant') ?? 'zh') as KbDocVariant;
  if (!domain || !slug || !VALID_VARIANTS.includes(variant)) {
    return NextResponse.json(
      { success: false, data: null, error: '参数不合法（需 domain、slug，variant ∈ zh|bilingual|en）' },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      success: true,
      data: getDocContent(domain, slug, variant),
      error: null,
    });
  } catch (err: any) {
    console.error('[api/kb/doc]', err);
    return NextResponse.json(
      { success: false, data: null, error: String(err?.message ?? '读取文档失败') },
      { status: 404 },
    );
  }
}
