import { NextResponse } from 'next/server';
import { listDomains } from 'lib/kb/server';

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: listDomains(), error: null });
  } catch (err: any) {
    console.error('[api/kb/domains]', err);
    return NextResponse.json(
      { success: false, data: null, error: '读取知识域失败' },
      { status: 500 },
    );
  }
}
