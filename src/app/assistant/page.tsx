'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BotMessageSquare,
  Send,
  Quote,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  BookOpen,
  User,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { Subject, ChatMessage, UserProfile } from '@/lib/types';

export default function AssistantPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Load chat session if exists
  useEffect(() => {
    if (!selectedSubjectId) return;

    async function loadChat() {
      try {
        const res = await fetch(`/api/chat?subjectId=${selectedSubjectId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.sessions && data.sessions.length > 0) {
            const latestSession = data.sessions[0];
            setSessionId(latestSession.id);
            const msgRes = await fetch(`/api/chat?sessionId=${latestSession.id}`);
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              setMessages(msgData.messages || []);
            }
          } else {
            setSessionId(null);
            setMessages([]);
          }
        }
      } catch {
        // ignore
      }
    }
    loadChat();
  }, [selectedSubjectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (queryToSend?: string) => {
    const q = (queryToSend || inputQuery).trim();
    if (!q || !selectedSubjectId) return;

    setInputQuery('');
    const tempUserMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      sessionId: sessionId || 'temp',
      userId: user?.id || 'temp',
      role: 'user',
      content: q,
      citations: [],
      isGrounded: true,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          question: q,
          sessionId: sessionId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to query topic assistant.');

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      setMessages((prev) => [...prev, data.message]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sessionId: sessionId || 'temp',
        userId: user?.id || 'temp',
        role: 'assistant',
        content: `Error: ${err.message}`,
        citations: [],
        isGrounded: false,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const sampleQueries = [
    'What is the difference between synchronous and asynchronous systems?',
    'Explain the CAP theorem and the PACELC extension.',
    'Why is Two-Phase Commit (2PC) considered a blocking protocol?',
    'How does consistent hashing minimize data migration during node join?',
  ];

  return (
    <AppShell user={user}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Strict Grounding: Answers from Your Notes Only</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Grounded Topic Assistant
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Ask questions about your course. If your uploaded material does not contain the answer, the assistant will explicitly tell you rather than hallucinating external facts.
            </p>
          </div>

          {subjects.length > 0 && (
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Chat Card */}
        <Card className="flex flex-col h-[600px] border-slate-200 dark:border-slate-800 shadow-sm">
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 flex items-center justify-center">
                  <BotMessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                    What concept would you like to review?
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Every answer is retrieved from your indexed chunks and verified against citations.
                  </p>
                </div>

                {/* Sample Prompt Chips */}
                <div className="space-y-2 w-full pt-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">
                    Suggested Questions:
                  </span>
                  <div className="flex flex-col gap-1.5 text-left">
                    {sampleQueries.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(q)}
                        className="text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
                      >
                        &quot;{q}&quot;
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === 'user';

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                        <BotMessageSquare className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed space-y-3 ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {/* Source Citations */}
                      {!isUser && msg.citations && msg.citations.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                          <span className="font-semibold text-indigo-700 dark:text-indigo-400 block text-[11px]">
                            Cited Learning Material:
                          </span>
                          {msg.citations.map((c, cIdx) => (
                            <div
                              key={cIdx}
                              className="rounded bg-white/60 dark:bg-slate-900/40 p-2 text-[11px] space-y-0.5 border border-slate-200 dark:border-slate-700"
                            >
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                {c.sectionTitle || 'Course Notes'}{' '}
                                {c.pageNumber ? `(Page ${c.pageNumber})` : ''}
                              </div>
                              <div className="italic text-slate-500 line-clamp-2">
                                &quot;{c.excerpt}&quot;
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {isLoading && (
              <div className="flex gap-3 items-center text-xs text-slate-400 italic">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <BotMessageSquare className="w-4 h-4 animate-spin" />
                </div>
                <span>Searching vector store and synthesizing cited response...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask about a concept in your course notes..."
                disabled={isLoading}
                className="flex-1 h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-950"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!inputQuery.trim() || isLoading}
                className="h-11 px-5"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
