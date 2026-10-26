import { NextResponse } from 'next/server';
import { clearDemoModeCookie, getCurrentUser } from '@/lib/auth/session';

export async function POST() {
  try {
    await clearDemoModeCookie();
    const currentUser = await getCurrentUser();
    const destination = currentUser ? '/dashboard' : '/login';
    return NextResponse.json({
      message: 'Exited demo mode successfully',
      destination,
      hasPersonalSession: Boolean(currentUser),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to exit demo mode' }, { status: 500 });
  }
}
