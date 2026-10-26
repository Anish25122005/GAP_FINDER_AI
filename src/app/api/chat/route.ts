import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';
import { askTopicAssistant } from '@/lib/ai/topic-assistant';

const ChatSchema = z.object({
  subjectId: z.string().min(1),
  question: z.string().min(3, 'Question must be at least 3 characters'),
  topicId: z.string().optional(),
  sessionId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const parsed = ChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid question payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { subjectId, question, topicId, sessionId } = parsed.data;

    const subject = await repository.getSubjectById(auth.user.id, subjectId);
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found or unauthorized' }, { status: 404 });
    }

    // 1. Resolve or create chat session
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const title = question.slice(0, 40) + (question.length > 40 ? '...' : '');
      const session = await repository.createChatSession(auth.user.id, subjectId, title, topicId);
      activeSessionId = session.id;
    }

    // 2. Save user message
    await repository.addChatMessage(auth.user.id, activeSessionId, {
      role: 'user',
      content: question,
      citations: [],
      isGrounded: true,
    });

    // 3. Query grounded topic assistant
    const assistantResult = await askTopicAssistant(auth.user.id, subjectId, question, topicId);

    // 4. Save assistant response
    const assistantMsg = await repository.addChatMessage(auth.user.id, activeSessionId, {
      role: 'assistant',
      content: assistantResult.content,
      citations: assistantResult.citations,
      isGrounded: assistantResult.isGrounded,
    });

    return NextResponse.json({
      sessionId: activeSessionId,
      message: assistantMsg,
      citations: assistantResult.citations,
      isGrounded: assistantResult.isGrounded,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Chat query failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const subjectId = url.searchParams.get('subjectId');

  if (sessionId) {
    const messages = await repository.getChatMessages(auth.user.id, sessionId);
    return NextResponse.json({ messages });
  }

  if (subjectId) {
    const sessions = await repository.getChatSessions(auth.user.id, subjectId);
    return NextResponse.json({ sessions });
  }

  return NextResponse.json({ error: 'sessionId or subjectId query parameter required' }, { status: 400 });
}
