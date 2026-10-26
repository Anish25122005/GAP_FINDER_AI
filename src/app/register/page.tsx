'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/input';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            GapFinder <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">AI</span>
          </span>
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Create your student account
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload your syllabus and start pinpointing topic-level knowledge gaps.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
          <CardContent className="pt-6">
            {error && (
              <Alert variant="danger" className="mb-4">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Full Name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
              />

              <Input
                label="Email Address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu"
              />

              <Input
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                helperText="Must contain at least 6 characters"
              />

              <Button type="submit" variant="primary" size="md" isLoading={isLoading} className="w-full mt-2">
                Register & Start Diagnosing
              </Button>
            </form>

            <div className="mt-6 text-center text-xs text-slate-500">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
