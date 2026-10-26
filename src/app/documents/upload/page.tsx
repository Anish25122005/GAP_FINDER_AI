'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/input';
import type { Subject, UserProfile } from '@/lib/types';

export default function DocumentUploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any>(null);

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
          if (s.subjects && s.subjects.length > 0) {
            setSelectedSubjectId(s.subjects[0].id);
          }
        }
      } catch {
        // ignore
      }
    }
    init();
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    setError(null);
    if (!selected) return;

    const validExtensions = ['.pdf', '.txt'];
    const hasValidExt = validExtensions.some((ext) => selected.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setError('Unsupported file type. Please upload a PDF (.pdf) or Plain Text (.txt) file.');
      return;
    }

    if (selected.size > 15 * 1024 * 1024) {
      setError('File size exceeds 15MB limit.');
      return;
    }

    setFile(selected);
    if (!title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title || file.name);
      if (selectedSubjectId) {
        formData.append('subjectId', selectedSubjectId);
      }

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Document processing and indexing failed.');
      }

      setSuccessResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AppShell user={user}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/documents" className="hover:text-indigo-600 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Document Library
          </Link>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Upload Learning Material
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Upload course notes, textbook chapters, or syllabus outlines to build your semantic vector store.
          </p>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {successResult ? (
          <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Document Successfully Indexed!
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                <strong>{successResult.document?.title}</strong> was processed into{' '}
                <strong>{successResult.chunkCount} vector chunks</strong> with embeddings and mapped to your syllabus topics.
              </p>

              <div className="flex items-center justify-center gap-3 pt-4">
                <Button variant="outline" size="sm" onClick={() => { setSuccessResult(null); setFile(null); setTitle(''); }}>
                  Upload Another File
                </Button>
                <Link href="/quiz/new">
                  <Button variant="primary" size="sm">
                    Generate Diagnostic Quiz
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleUpload} className="space-y-6">
                {/* Course Selection */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Assign to Course
                  </label>
                  {subjects.length > 0 ? (
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-900"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code ? `[${s.code}] ` : ''}
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
                      No subjects created yet. Your document will be uploaded as general material. You can create a course in the Subjects tab.
                    </div>
                  )}
                </div>

                {/* Document Title */}
                <Input
                  label="Document Title"
                  placeholder="e.g. Chapter 2: Distributed Consensus & Raft"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                {/* Drag and Drop Zone */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select File (PDF or Plain Text)
                  </label>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
                    <input
                      type="file"
                      id="file-upload"
                      accept=".pdf,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="font-semibold text-sm text-indigo-600 hover:text-indigo-500">
                        Click to select a file
                      </span>
                      <span className="text-xs text-slate-500 mt-1">PDF or Plain Text TXT up to 15MB</span>

                      {file && (
                        <div className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200">
                          <FileText className="w-4 h-4 text-indigo-600" />
                          <span>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Link href="/documents">
                    <Button variant="ghost" size="md">
                      Cancel
                    </Button>
                  </Link>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isUploading}
                    disabled={!file}
                  >
                    {isUploading ? 'Extracting, Chunking & Indexing...' : 'Upload & Process Document'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
