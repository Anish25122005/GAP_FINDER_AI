import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { seedDemoSubjectForUser } from '@/lib/sample-data';

// Mock cookies state
const mockCookieMap = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const val = mockCookieMap.get(name);
      return val !== undefined ? { name, value: val } : undefined;
    },
    set: (name: any, val?: any, _options?: any) => {
      if (typeof name === 'object') {
        mockCookieMap.set(name.name, name.value);
      } else {
        mockCookieMap.set(name, String(val));
      }
    },
    delete: (name: string) => {
      mockCookieMap.delete(name);
    },
  })),
}));

let mockSupabaseUser: any = null;

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => {
    if (!mockSupabaseUser) return null;
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: mockSupabaseUser },
          error: null,
        })),
        signOut: vi.fn(async () => {
          mockSupabaseUser = null;
        }),
      },
    };
  }),
}));

import {
  getCurrentUser,
  setSessionCookie,
  clearDemoModeCookie,
  clearSessionCookie,
  isDemoModeActive,
  DEMO_MODE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';

describe('Demo Mode Navigation, Session Preservation & Isolation Tests', () => {
  const realUserEmail = 'real.student@stanford.edu';
  let realUserId: string;
  let demoUserId: string;

  beforeEach(async () => {
    mockCookieMap.clear();
    mockSupabaseUser = null;

    // Create real user in repository
    const realUser = await repository.createUser(
      realUserEmail,
      'RealPassword123!',
      'Dr. Jane Doe'
    ).catch(async () => {
      return (await repository.getUserById(realUserEmail))!;
    });
    realUserId = realUser.id;

    // Create personal course for Jane
    await repository.createSubject(realUserId, {
      name: 'Advanced Quantum Mechanics',
      code: 'PHYS 501',
    });

    // Ensure demo user exists with sample course CS 401
    const demoEmail = 'demo.student@gapfinder.ai';
    let demoUser = await repository.verifyUser(demoEmail, 'DemoPass123!');
    if (!demoUser) {
      demoUser = await repository.createUser(demoEmail, 'DemoPass123!', 'Alex Taylor (Demo Student)');
      await seedDemoSubjectForUser(demoUser.id);
    }
    demoUserId = demoUser.id;
  });

  it('1. Logged-out visitor initially has no session', async () => {
    const user = await getCurrentUser();
    expect(user).toBeNull();
    const demoActive = await isDemoModeActive();
    expect(demoActive).toBe(false);
  });

  it('2. Logged-out visitor enters Demo Mode and enters demo experience', async () => {
    const demoUser = (await repository.getUserById('demo.student@gapfinder.ai'))!;
    await setSessionCookie(demoUser, true);

    expect(await isDemoModeActive()).toBe(true);

    const currentUser = await getCurrentUser();
    expect(currentUser).not.toBeNull();
    expect(currentUser?.email).toBe('demo.student@gapfinder.ai');
    expect(currentUser?.fullName).toContain('Alex Taylor');

    // Verify demo subject CS 401 is accessible
    const demoSubjects = await repository.getSubjects(currentUser!.id);
    expect(demoSubjects.some((s) => s.code === 'CS 401' || s.name.includes('Distributed Systems'))).toBe(true);
  });

  it('3. Logged-in Supabase user in normal mode accesses personal account', async () => {
    mockSupabaseUser = {
      id: realUserId,
      email: realUserEmail,
      user_metadata: { full_name: 'Dr. Jane Doe' },
      created_at: new Date().toISOString(),
    };

    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.email).toBe(realUserEmail);
    expect(user?.id).toBe(realUserId);

    // Verify Jane's personal subjects
    const subjects = await repository.getSubjects(user!.id);
    expect(subjects.some((s) => s.name === 'Advanced Quantum Mechanics')).toBe(true);
  });

  it('4. Logged-in Supabase user clicks Demo Mode: opens Demo experience, NOT personal dashboard', async () => {
    // Jane is logged into Supabase
    mockSupabaseUser = {
      id: realUserId,
      email: realUserEmail,
      user_metadata: { full_name: 'Dr. Jane Doe' },
      created_at: new Date().toISOString(),
    };

    // Jane clicks "Demo Mode" -> calls /api/auth/demo
    const demoUser = (await repository.getUserById('demo.student@gapfinder.ai'))!;
    await setSessionCookie(demoUser, true);

    expect(await isDemoModeActive()).toBe(true);

    // Even though mockSupabaseUser is present, Demo Mode takes precedence
    const activeUser = await getCurrentUser();
    expect(activeUser).not.toBeNull();
    expect(activeUser?.email).toBe('demo.student@gapfinder.ai');
    expect(activeUser?.fullName).toContain('Alex Taylor');
    expect(activeUser?.id).toBe(demoUserId);
    expect(activeUser?.id).not.toBe(realUserId);

    // Demo data is loaded, NOT Jane's private course
    const demoSubjects = await repository.getSubjects(activeUser!.id);
    expect(demoSubjects.some((s) => s.name === 'Advanced Quantum Mechanics')).toBe(false);
  });

  it('5. Supabase session remains intact while user is in Demo Mode', async () => {
    mockSupabaseUser = {
      id: realUserId,
      email: realUserEmail,
      user_metadata: { full_name: 'Dr. Jane Doe' },
      created_at: new Date().toISOString(),
    };

    const demoUser = (await repository.getUserById('demo.student@gapfinder.ai'))!;
    await setSessionCookie(demoUser, true);

    // Verify Supabase session object is STILL present and intact (not signed out)
    expect(mockSupabaseUser).not.toBeNull();
    expect(mockSupabaseUser.email).toBe(realUserEmail);
  });

  it('6. Returning from Demo Mode restores access to the personal account with all data intact', async () => {
    mockSupabaseUser = {
      id: realUserId,
      email: realUserEmail,
      user_metadata: { full_name: 'Dr. Jane Doe' },
      created_at: new Date().toISOString(),
    };

    // Enter demo
    const demoUser = (await repository.getUserById('demo.student@gapfinder.ai'))!;
    await setSessionCookie(demoUser, true);
    expect((await getCurrentUser())?.email).toBe('demo.student@gapfinder.ai');

    // User clicks "Exit Demo" -> calls /api/auth/demo (DELETE)
    await clearDemoModeCookie();
    expect(await isDemoModeActive()).toBe(false);

    // Now getCurrentUser returns Jane again!
    const restoredUser = await getCurrentUser();
    expect(restoredUser).not.toBeNull();
    expect(restoredUser?.email).toBe(realUserEmail);
    expect(restoredUser?.id).toBe(realUserId);

    // Jane's personal subjects are 100% intact
    const janesSubjects = await repository.getSubjects(restoredUser!.id);
    expect(janesSubjects.some((s) => s.name === 'Advanced Quantum Mechanics')).toBe(true);
  });

  it('7. Strict Data Isolation: Demo user operations cannot see or modify Jane personal data', async () => {
    const demoSubjects = await repository.getSubjects(demoUserId);
    const janesSubjects = await repository.getSubjects(realUserId);

    expect(demoSubjects.some((s) => s.name === 'Advanced Quantum Mechanics')).toBe(false);
    expect(janesSubjects.some((s) => s.code === 'CS 401')).toBe(false);

    // Demo user creating a subject does not touch Jane's records
    const newDemoSub = await repository.createSubject(demoUserId, { name: 'Demo Machine Learning' });
    const janesUpdated = await repository.getSubjects(realUserId);
    expect(janesUpdated.some((s) => s.id === newDemoSub.id)).toBe(false);
  });

  it('8. Repeated navigation between Demo Mode and personal account does not mix data', async () => {
    mockSupabaseUser = {
      id: realUserId,
      email: realUserEmail,
      user_metadata: { full_name: 'Dr. Jane Doe' },
      created_at: new Date().toISOString(),
    };

    const demoUser = (await repository.getUserById('demo.student@gapfinder.ai'))!;

    for (let i = 0; i < 3; i++) {
      // Enter Demo
      await setSessionCookie(demoUser, true);
      const inDemo = await getCurrentUser();
      expect(inDemo?.email).toBe('demo.student@gapfinder.ai');

      // Exit Demo
      await clearDemoModeCookie();
      const inReal = await getCurrentUser();
      expect(inReal?.email).toBe(realUserEmail);
    }
  });

  it('9. Signing out clears all session cookies including demo mode', async () => {
    const demoUser = (await repository.getUserById('demo.student@gapfinder.ai'))!;
    await setSessionCookie(demoUser, true);

    await clearSessionCookie();
    expect(await isDemoModeActive()).toBe(false);
    expect(mockCookieMap.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(mockCookieMap.has(DEMO_MODE_COOKIE_NAME)).toBe(false);
  });
});
