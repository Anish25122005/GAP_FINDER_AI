import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }

  await clearSessionCookie();
  return NextResponse.json({ message: 'Logged out successfully' });
}
