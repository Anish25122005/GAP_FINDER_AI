import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { setSessionCookie, clearDemoModeCookie, getCurrentUser } from '@/lib/auth/session';
import { seedDemoSubjectForUser } from '@/lib/sample-data';

export async function POST() {
  try {
    const demoEmail = 'demo.student@gapfinder.ai';
    let user = await repository.verifyUser(demoEmail, 'DemoPass123!');

    if (!user) {
      try {
        user = await repository.createUser(demoEmail, 'DemoPass123!', 'Alex Taylor (Demo Student)');
        // Seed initial course
        await seedDemoSubjectForUser(user.id);
      } catch {
        // In case user was already created
        const existing = await repository.getUserById(demoEmail);
        user = existing;
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Failed to initialize demo session' }, { status: 500 });
    }

    // Check if subject exists, otherwise seed
    const subjects = await repository.getSubjects(user.id);
    if (subjects.length === 0) {
      await seedDemoSubjectForUser(user.id);
    }

    // Activate Demo Mode specifically
    await setSessionCookie(user, true);

    return NextResponse.json({
      user,
      message: 'Demo account signed in successfully with sample subject CS 401 seeded.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Demo error' }, { status: 500 });
  }
}

export async function DELETE() {
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
