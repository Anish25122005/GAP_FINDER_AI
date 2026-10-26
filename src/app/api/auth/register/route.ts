import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { repository } from '@/lib/db/repository';
import { setSessionCookie } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  fullName: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { email, password, fullName } = parsed.data;

    // 1. Try Supabase Auth if configured
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (data.user) {
        const user = {
          id: data.user.id,
          email: data.user.email || email,
          fullName: fullName || email.split('@')[0],
          createdAt: data.user.created_at,
          updatedAt: data.user.updated_at || data.user.created_at,
        };
        await setSessionCookie(user);
        return NextResponse.json({ user, message: 'Registration successful' });
      }
    }

    // 2. Local Fallback
    const user = await repository.createUser(email, password, fullName);
    await setSessionCookie(user);

    return NextResponse.json({ user, message: 'Registration successful' });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error during registration' },
      { status: 500 }
    );
  }
}
