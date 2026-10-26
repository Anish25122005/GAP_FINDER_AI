'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Trash2, ArrowRight, Sparkles, Layers } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/input';
import type { Subject, UserProfile } from '@/lib/types';

export default function SubjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const userRes = await fetch('/api/auth/me');
        if (!userRes.ok) {
          router.push('/login');
          return;
        }
        const u = await userRes.json();
        setUser(u.user);

        const subRes = await fetch('/api/subjects');
        if (subRes.ok) {
          const s = await subRes.json();
          setSubjects(s.subjects || []);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [router]);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, description }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create subject');

      setSubjects([data.subject, ...subjects]);
      setShowCreateModal(false);
      setName('');
      setCode('');
      setDescription('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this course and all its topics?')) return;

    try {
      const res = await fetch(`/api/subjects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSubjects(subjects.filter((s) => s.id !== id));
      }
    } catch {
      alert('Failed to delete subject');
    }
  };

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Courses & Subjects
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Manage your academic courses and extract topic maps from course syllabi.
            </p>
          </div>

          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add New Subject
          </Button>
        </div>

        {/* Modal for creating subject */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Create New Subject</h3>
              <p className="text-xs text-slate-500 mb-4">
                Enter your course title and optional subject code to begin mapping your syllabus.
              </p>

              {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

              <form onSubmit={handleCreateSubject} className="space-y-4">
                <Input
                  label="Subject Name"
                  required
                  placeholder="e.g. Distributed Systems, Machine Learning"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label="Course Code (Optional)"
                  placeholder="e.g. CS 401, MATH 220"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description (Optional)</label>
                  <textarea
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-900"
                    placeholder="Brief course overview..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
                    Save Subject
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Subjects Grid */}
        {subjects.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                No courses added yet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                Create a course or import a syllabus to begin tracking topic-level mastery.
              </p>
              <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Your First Course
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((s) => (
              <Card
                key={s.id}
                className="hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors flex flex-col justify-between"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      {s.code && (
                        <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                          {s.code}
                        </span>
                      )}
                      <CardTitle className="mt-2 text-base">{s.name}</CardTitle>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSubject(s.id, e)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      title="Delete Subject"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <CardDescription className="line-clamp-2 mt-2">
                    {s.description || 'No description provided.'}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <Link href={`/subjects/${s.id}`} className="w-full">
                      <Button variant="outline" size="sm" className="w-full text-xs justify-between">
                        <span>View Syllabus & Topic Map</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
