import { NextResponse } from 'next/server';
import { clearDemoModeCookie } from '@/lib/auth/session';

export async function POST() {
  try {
    await clearDemoModeCookie();
    return NextResponse.json({ message: 'Exited demo mode successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to exit demo mode' }, { status: 500 });
  }
}
