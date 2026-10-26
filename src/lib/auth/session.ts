import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/types';
import { repository } from '@/lib/db/repository';

export const SESSION_COOKIE_NAME = 'gapfinder_session';
export const DEMO_MODE_COOKIE_NAME = 'gapfinder_demo_mode';

export async function isDemoModeActive(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_MODE_COOKIE_NAME)?.value === 'true';
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const cookieStore = await cookies();
  const demoActive = cookieStore.get(DEMO_MODE_COOKIE_NAME)?.value === 'true';

  // 1. If Demo Mode is explicitly active, prioritize the isolated demo user
  if (demoActive) {
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (sessionToken) {
      try {
        const sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString('utf-8'));
        if (sessionData?.userId && sessionData?.isDemo) {
          const demoUser = await repository.getUserById(sessionData.userId);
          if (demoUser) return demoUser;
        }
      } catch {
        // Fallback to email lookup below
      }
    }
    const demoUser = await repository.getUserById('demo.student@gapfinder.ai');
    if (demoUser) return demoUser;
  }

  // 2. Otherwise (Normal Mode), try Supabase Auth first
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

  // 3. Fallback to local secure session cookie
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

export async function setSessionCookie(user: UserProfile, isDemo = false) {
  const cookieStore = await cookies();
  const sessionData = {
    userId: user.id,
    email: user.email,
    isDemo,
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

  if (isDemo) {
    cookieStore.set(DEMO_MODE_COOKIE_NAME, 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
  } else {
    // Normal login clears demo mode
    cookieStore.delete(DEMO_MODE_COOKIE_NAME);
  }
}

export async function clearDemoModeCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_MODE_COOKIE_NAME);
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    try {
      const sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString('utf-8'));
      if (sessionData?.isDemo) {
        cookieStore.delete(SESSION_COOKIE_NAME);
      }
    } catch {
      // ignore
    }
  }
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(DEMO_MODE_COOKIE_NAME);
}
