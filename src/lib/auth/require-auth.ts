import { NextResponse } from 'next/server';
import { getCurrentUser } from './session';
import type { UserProfile } from '@/lib/types';

export async function requireAuth(): Promise<
  { user: UserProfile; errorResponse: null } | { user: null; errorResponse: NextResponse }
> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized. Please sign in to access this resource.' },
        { status: 401 }
      ),
    };
  }

  return { user, errorResponse: null };
}
