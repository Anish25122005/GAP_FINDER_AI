'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  BookOpen,
  Layers,
  Upload,
  Plus,
  Trash2,
  HelpCircle,
  FileText,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/input';
import type { Subject, Topic, UserProfile } from '@/lib/types';

function SubjectDetailContent() {
  const params = useParams();
  const subjectId = params.id as string;
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Syllabus parsing state
  const [showParseModal, setShowParseModal] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Add individual topic state
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicLevel, setNewTopicLevel] = useState<number>(2);
  const [selectedParentId, setSelectedParentId] = useState<string>('');

  useEffect(() => {
    async function loadData() {
      try {
        const userRes = await fetch('/api/auth/me');
        if (!userRes.ok) {
          router.push('/login');
          return;
        }
        const u = await userRes.json();
        setUser(u.user);

        const subRes = await fetch(`/api/subjects/${subjectId}`);
        if (subRes.ok) {
          const data = await subRes.json();
          setSubject(data.subject);
          setTopics(data.topics || []);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [subjectId, router]);

  const handleParseSyllabus = async () => {
    if (!syllabusText.trim()) return;
    setIsParsing(true);
    setParseError(null);

    try {
      const res = await fetch('/api/syllabus/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: syllabusText, subjectId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse syllabus');

      if (data.objectives && data.objectives.length > 0) {
        setObjectives(data.objectives);
      }

      // Save parsed topics to subject
      const saveRes = await fetch(`/api/subjects/${subjectId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: data.flattened }),
      });

      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Failed to save topics');

      setTopics(saveData.topics);
      setShowParseModal(false);
      setSyllabusText('');
    } catch (err: any) {
      setParseError(err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    try {
      const newTopic = {
        name: newTopicName,
        level: newTopicLevel,
        parentId: selectedParentId || null,
        weight: 1.0,
        orderIndex: topics.length + 1,
      };

      const updated = [...topics, newTopic];
      const res = await fetch(`/api/subjects/${subjectId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: updated }),
      });

      if (res.ok) {
        const data = await res.json();
        setTopics(data.topics);
        setShowAddTopicModal(false);
        setNewTopicName('');
      }
    } catch {
      alert('Failed to add topic');
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    const remaining = topics.filter((t) => t.id !== topicId);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: remaining }),
      });
      if (res.ok) {
        setTopics(remaining);
      }
    } catch {
      alert('Failed to delete topic');
    }
  };

  // Group topics hierarchically
  const units = topics.filter((t) => t.level === 1);
  const getSubtopics = (parentId: string) => topics.filter((t) => t.parentId === parentId);

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/subjects" className="hover:text-indigo-600 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Courses
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{subject?.name || 'Subject'}</span>
        </div>

        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              {subject?.code && (
                <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  {subject.code}
                </span>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {subject?.name}
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              {subject?.description || 'Course topic hierarchy and syllabus mapping.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowParseModal(true)}>
              <Upload className="w-4 h-4 mr-1.5" />
              Import Syllabus
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddTopicModal(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Topic
            </Button>
            <Link href={`/quiz/new?subjectId=${subjectId}`}>
              <Button variant="primary" size="sm">
                <HelpCircle className="w-4 h-4 mr-1.5" />
                Diagnose Subject
              </Button>
            </Link>
          </div>
        </div>

        {/* Syllabus Import Modal */}
        {showParseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
                Import Syllabus Outline
              </h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Paste your course syllabus text below. Our parser will extract the hierarchical Unit, Topic, and Subtopic structure.
              </p>

              {parseError && <Alert variant="danger" className="mb-4">{parseError}</Alert>}

              <textarea
                rows={8}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-950"
                placeholder={`Unit 1: Introduction to Distributed Systems\n1.1 Client-Server Models\n1.2 Byzantine Faults\n\nUnit 2: Consensus\n2.1 Paxos & Raft`}
                value={syllabusText}
                onChange={(e) => setSyllabusText(e.target.value)}
              />

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" size="sm" onClick={() => setShowParseModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleParseSyllabus} isLoading={isParsing}>
                  Parse & Save Topics
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add Individual Topic Modal */}
        {showAddTopicModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Add Syllabus Topic</h3>
              <form onSubmit={handleAddTopic} className="space-y-4">
                <Input
                  label="Topic Name"
                  required
                  placeholder="e.g. 2.1 Logical Clocks"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                />

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hierarchy Level</label>
                  <select
                    value={newTopicLevel}
                    onChange={(e) => setNewTopicLevel(parseInt(e.target.value, 10))}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value={1}>Unit / Module (Level 1)</option>
                    <option value={2}>Main Topic (Level 2)</option>
                    <option value={3}>Subtopic (Level 3)</option>
                  </select>
                </div>

                {newTopicLevel > 1 && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Parent Unit/Topic</label>
                    <select
                      value={selectedParentId}
                      onChange={(e) => setSelectedParentId(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">None (Top Level)</option>
                      {topics
                        .filter((t) => t.level < newTopicLevel)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddTopicModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    Add Topic
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Topic Map Tree Display */}
        {topics.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                No syllabus topics mapped yet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                Import your syllabus outline to generate the topic hierarchy or add topics manually.
              </p>
              <Button variant="primary" onClick={() => setShowParseModal(true)}>
                <Upload className="w-4 h-4 mr-1.5" />
                Import Syllabus Outline
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>{topics.length} syllabus topics extracted</span>
              <span>Units &gt; Topics &gt; Subtopics</span>
            </div>

            {objectives.length > 0 && (
              <Card className="border-indigo-100 bg-indigo-50/40 dark:border-indigo-950 dark:bg-indigo-950/20">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Course Objectives</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                    {objectives.join(' ')}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Render units if present */}
            {units.length > 0 ? (
              units.map((unit) => {
                const childTopics = topics.filter((t) => t.parentId === unit.id && t.level !== 1);
                return (
                  <Card key={unit.id} className="overflow-hidden border-slate-200/90 dark:border-slate-800">
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 px-2 py-0.5 rounded">
                          {unit.code || 'Unit'}
                        </span>
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                          {unit.name}
                        </h3>
                      </div>
                      <button
                        onClick={() => handleDeleteTopic(unit.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded"
                        title="Delete Unit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <CardContent className="p-4 space-y-3">
                      {childTopics.map((topic) => {
                        const subtopics = topics.filter((t) => t.parentId === topic.id);
                        return (
                          <div
                            key={topic.id}
                            className="rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 transition-colors"
                          >
                            <div className="flex items-center justify-between pl-4 pr-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 text-xs">•</span>
                                <span className="font-medium text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                                  {topic.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <Link href={`/quiz/new?subjectId=${subjectId}&topicId=${topic.id}`}>
                                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
                                    Diagnostic
                                  </Button>
                                </Link>
                                <button
                                  onClick={() => handleDeleteTopic(topic.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1"
                                  title="Delete Topic"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {subtopics.length > 0 && (
                              <div className="px-4 pb-2.5 pt-0.5 border-t border-slate-50 dark:border-slate-800/60">
                                <div className="flex flex-wrap gap-1.5 pt-1.5">
                                  {subtopics.map((sub) => (
                                    <span
                                      key={sub.id}
                                      className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                    >
                                      {sub.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              // Flat topic list
              <Card>
                <CardContent className="p-4 space-y-2">
                  {topics.map((topic) => (
                    <div
                      key={topic.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800"
                    >
                      <span className="font-medium text-sm text-slate-800 dark:text-slate-200">
                        {topic.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <Link href={`/quiz/new?subjectId=${subjectId}&topicId=${topic.id}`}>
                          <Button variant="outline" size="sm" className="text-xs">
                            Quiz
                          </Button>
                        </Link>
                        <button
                          onClick={() => handleDeleteTopic(topic.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function SubjectDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SubjectDetailContent />
    </React.Suspense>
  );
}
