'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Upload, Trash2, CheckCircle2, AlertCircle, Clock, BookOpen } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatFileSize, formatDate } from '@/lib/utils';
import type { DocumentRecord, Subject, UserProfile } from '@/lib/types';

export default function DocumentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

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

        const [docRes, subRes] = await Promise.all([
          fetch('/api/documents'),
          fetch('/api/subjects'),
        ]);

        if (docRes.ok) {
          const d = await docRes.json();
          setDocuments(d.documents || []);
        }

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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document and all its indexed vector chunks?')) return;

    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(documents.filter((d) => d.id !== id));
      }
    } catch {
      alert('Failed to delete document');
    }
  };

  const filteredDocs =
    selectedSubject === 'all'
      ? documents
      : documents.filter((d) => d.subjectId === selectedSubject);

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Document Library
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Uploaded syllabus outlines, lecture notes, and textbook chapters indexed into pgvector.
            </p>
          </div>

          <Link href="/documents/upload">
            <Button variant="primary" size="sm">
              <Upload className="w-4 h-4 mr-1.5" />
              Upload New Document
            </Button>
          </Link>
        </div>

        {/* Filters */}
        {subjects.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Filter by Course:</span>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">All Courses ({documents.length})</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Documents Table */}
        {filteredDocs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                No documents uploaded yet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                Upload your course materials (PDF or TXT) to enable vector similarity search and grounded diagnostic questions.
              </p>
              <Link href="/documents/upload">
                <Button variant="primary">
                  <Upload className="w-4 h-4 mr-1.5" />
                  Upload First Document
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                    <th className="p-4">Document Title</th>
                    <th className="p-4">Format</th>
                    <th className="p-4">Size</th>
                    <th className="p-4">Vector Chunks</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Indexed At</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDocs.map((doc) => {
                    const sub = subjects.find((s) => s.id === doc.subjectId);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-4 font-semibold text-slate-900 dark:text-slate-100">
                          <div>{doc.title}</div>
                          {sub && (
                            <span className="text-[11px] text-slate-500 font-normal">
                              Course: {sub.name}
                            </span>
                          )}
                        </td>
                        <td className="p-4 uppercase font-mono text-xs text-slate-600">
                          {doc.fileType}
                        </td>
                        <td className="p-4 text-slate-500">{formatFileSize(doc.fileSize)}</td>
                        <td className="p-4">
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {doc.chunkCount} chunks
                          </span>
                        </td>
                        <td className="p-4">
                          {doc.status === 'indexed' && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Indexed
                            </span>
                          )}
                          {doc.status === 'processing' && (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                              <Clock className="w-3.5 h-3.5 animate-spin" /> Processing
                            </span>
                          )}
                          {doc.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-semibold">
                              <AlertCircle className="w-3.5 h-3.5" /> Error
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-slate-500">{formatDate(doc.createdAt)}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition-colors"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
