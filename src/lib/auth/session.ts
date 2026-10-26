import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/types';
import { repository } from '@/lib/db/repository';

const SESSION_COOKIE_NAME = 'gapfinder_session';

export async function getCurrentUser(): Promise<UserProfile | null> {
  // 1. Try Supabase Auth first
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user) {
        return {
          id: user.id,
          email: user.email || '',
          fullName: user.user_metadata?.full_name || user.email?.split('@')[0],
          avatarUrl: user.user_metadata?.avatar_url,
          createdAt: user.created_at,
          updatedAt: user.updated_at || user.created_at,
        };
      }
    } catch {
      // Fallback to local session cookie if Supabase connection fails
    }
  }

  // 2. Fallback to local secure session cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return null;
  }

  try {
    const sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString('utf-8'));
    if (!sessionData?.userId) return null;
    const user = await repository.getUserById(sessionData.userId);
    return user;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: UserProfile) {
  const cookieStore = await cookies();
  const sessionData = {
    userId: user.id,
    email: user.email,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const token = Buffer.from(JSON.stringify(sessionData)).toString('base64');
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
