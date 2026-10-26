import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { repository } from '@/lib/db/repository';
import { setSessionCookie } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid credentials format', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // 1. Try Supabase Auth
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }

      if (data.user) {
        const user = {
          id: data.user.id,
          email: data.user.email || email,
          fullName: data.user.user_metadata?.full_name || email.split('@')[0],
          createdAt: data.user.created_at,
          updatedAt: data.user.updated_at || data.user.created_at,
        };
        await setSessionCookie(user);
        return NextResponse.json({ user, message: 'Login successful' });
      }
    }

    // 2. Local Fallback
    const user = await repository.verifyUser(email, password);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password. Please check your credentials.' },
        { status: 401 }
      );
    }

    await setSessionCookie(user);
    return NextResponse.json({ user, message: 'Login successful' });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error during login' },
      { status: 500 }
    );
  }
}
