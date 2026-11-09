import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, MessageSquarePlus, NotebookPen, SendHorizonal, Square, Stethoscope, Trash2, MessagesSquare, ArrowLeft } from "lucide-react";
import { chatApi, settingsApi } from "@/services/endpoints";
import { ApiError } from "@/services/api";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/components/ui/misc";
import { useToast } from "@/contexts/ToastContext";
import { useAppMutation } from "@/hooks/useCrud";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/format";
import ReactMarkdown from "react-markdown";
import type { Message } from "@/types";

const SUGGESTIONS = [
  "I've had a headache for three days. What could be causing it?",
  "Can you explain what my blood pressure readings mean?",
  "What questions should I ask at my next check-up?",
  "How can I improve my sleep?",
];

export default function DoctorChat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const location = useLocation();
  const [input, setInput] = useState<string>(() => (location.state as { prefill?: string } | null)?.prefill ?? "");
  const [pending, setPending] = useState<{ user: string; reply: string } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatApi.list });
  const ai = useQuery({ queryKey: ["ai-settings"], queryFn: settingsApi.ai });
  const conv = useQuery({ queryKey: ["conversation", conversationId], queryFn: () => chatApi.get(conversationId!), enabled: !!conversationId });

  const aiReady = !!ai.data?.verified && !!ai.data?.ai_consent;
  const messages: Message[] = conv.data?.messages ?? [];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, pending?.reply]);
  const selfNav = useRef(false);
  useEffect(() => {
    if (selfNav.current) { selfNav.current = false; return; } // we just created this conversation mid-send
    setError(null); setPending(null); inputRef.current?.focus();
  }, [conversationId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const del = useAppMutation((id: string) => chatApi.remove(id), {
    invalidate: [["conversations"]], success: "Conversation deleted.",
    onSuccess: (_, id) => { setToDelete(null); if (id === conversationId) navigate("/ai-doctor"); },
  });
  const toggleContext = useAppMutation((v: boolean) => chatApi.update(conversationId!, { use_health_context: v }), {
    invalidate: [["conversation", conversationId], ["conversations"]],
  });
  const summarize = useAppMutation(() => chatApi.summarize(conversationId!), {
    invalidate: [["conversation", conversationId], ["conversations"]], success: "Summary saved.",
    onSuccess: () => setShowSummary(true),
  });

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    setError(null);
    let id = conversationId;
    try {
      if (!id) {
        const c = await chatApi.create({});
        id = c.id;
        qc.setQueryData(["conversation", id], { ...c, messages: [] });
        selfNav.current = true;
        navigate(`/ai-doctor/${id}`, { replace: true });
      }
      setInput("");
      setPending({ user: content, reply: "" });
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let failed: ApiError | null = null;
      await chatApi.stream(id!, content, {
        onDelta: (t) => setPending((p) => (p ? { ...p, reply: p.reply + t } : p)),
        onDone: () => {},
        onError: (e) => { failed = e; },
      }, ctrl.signal);
      if (failed) throw failed;
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.error("Response stopped. The unfinished reply was not saved.");
      } else {
        setError(e instanceof ApiError ? e : new ApiError(0, "unknown", (e as Error).message));
      }
      setInput((cur) => cur || content);
    } finally {
      abortRef.current = null;
      setPending(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["conversation", id] }),
        qc.invalidateQueries({ queryKey: ["conversations"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    }
  }

  const now = useMemo(() => new Date().toISOString(), [pending?.user]); // eslint-disable-line react-hooks/exhaustive-deps
  const settingsLink = error && ["ai_not_configured", "ai_not_verified", "ai_key_unreadable", "ai_invalid_key"].includes(error.code)
    ? "/settings?tab=ai" : error && ["consent_required", "document_consent_required"].includes(error.code) ? "/settings?tab=privacy" : null;

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list */}
      <aside className={cn("w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-72", conversationId ? "hidden" : "flex")}>
        <div className="p-3">
          <Button className="w-full" onClick={() => navigate("/ai-doctor")}><MessageSquarePlus className="size-4" /> New conversation</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {convs.isLoading ? <LoadingBlock /> : convs.error ? <div className="p-2"><ErrorState error={convs.error} onRetry={convs.refetch} /></div>
            : !convs.data?.length ? <EmptyState icon={<MessagesSquare className="size-5" />} title="No conversations" description="Your saved conversations will appear here." /> : (
              <ul className="space-y-0.5" aria-label="Conversations">
                {convs.data.map((c) => (
                  <li key={c.id} className="group relative">
                    <Link to={`/ai-doctor/${c.id}`} aria-current={c.id === conversationId ? "page" : undefined}
                      className={cn("block rounded-lg px-3 py-2.5 pr-9", c.id === conversationId ? "bg-teal-soft" : "hover:bg-surface-2")}>
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                        {c.document_id && <FileText className="size-3.5 shrink-0 text-teal" />}{c.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{relativeTime(c.updated_at)} · {c.message_count} messages</p>
                    </Link>
                    <button aria-label={`Delete conversation ${c.title}`} onClick={() => setToDelete(c.id)}
                      className="absolute right-2 top-2.5 rounded p-1 text-muted opacity-0 hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </aside>

      {/* Chat panel */}
      <section className={cn("min-w-0 flex-1 flex-col", conversationId ? "flex" : "hidden md:flex")} aria-label="Chat">
        {conversationId && conv.data && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
            <button className="md:hidden" aria-label="Back to conversations" onClick={() => navigate("/ai-doctor")}><ArrowLeft className="size-5" /></button>
            <p className="min-w-40 flex-1 truncate text-sm font-semibold text-ink" title={conv.data.title}>{conv.data.title}</p>
            {!conv.data.document_id && (
              <div className="shrink-0" title={ai.data?.use_health_context ? "Share relevant saved health info in this conversation" : "Enable “Use my saved health information” in Settings → Privacy first"}>
                <Switch label="Use my health info" checked={conv.data.use_health_context && !!ai.data?.use_health_context}
                  disabled={!ai.data?.use_health_context} onChange={(v) => toggleContext.mutate(v)} /></div>
            )}
            <Button variant="outline" size="sm" onClick={() => conv.data?.summary && !summarize.isPending ? setShowSummary(true) : summarize.mutate(undefined)}
              loading={summarize.isPending} disabled={!messages.length || !aiReady}>
              <NotebookPen className="size-3.5" /> {conv.data.summary ? "View summary" : "Summarize"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setToDelete(conversationId)} aria-label="Delete this conversation"><Trash2 className="size-3.5" /></Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            {ai.data && !aiReady && (
              <Alert tone="warn" title={!ai.data.verified ? "AI is not connected yet" : "Consent needed"}>
                {!ai.data.verified
                  ? <>Add and test your OpenAI API key in <Link className="font-medium underline" to="/settings?tab=ai">Settings → AI configuration</Link>.</>
                  : <>Allow sending messages to OpenAI in <Link className="font-medium underline" to="/settings?tab=privacy">Settings → Privacy</Link>.</>}
                {" "}Urgent-symptom safety guidance still works without AI.
              </Alert>
            )}
            {ai.data && aiReady && !ai.data.use_health_context && !conv.data?.document_id && (
              <p className="text-center text-xs text-muted">Your saved health information is not shared with the AI. You can change this in Settings → Privacy.</p>
            )}
            {conv.data?.document_id && <Alert tone="info">This conversation is about an uploaded document. Answers are based on the text extracted from it.</Alert>}

            {conversationId && conv.isLoading ? <LoadingBlock /> : conv.error ? <ErrorState error={conv.error} onRetry={conv.refetch} /> : null}

            {!conversationId && !pending && (
              <div className="py-8 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-teal-soft text-teal"><Stethoscope className="size-7" /></div>
                <h2 className="mt-4 text-xl font-semibold text-ink">How can I help you today?</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">Ask about symptoms, health terms, test results or how to prepare for an appointment. I'll explain things clearly — I can't diagnose or prescribe.</p>
                <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} disabled={!!pending}
                      className="rounded-xl border border-line bg-surface p-3 text-left text-sm text-ink-2 hover:border-teal/50 hover:bg-teal-soft/40">{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => <ChatMessage key={m.id} m={m} />)}
            {pending && (
              <>
                <ChatMessage m={{ role: "user", content: pending.user, created_at: now, safety_flag: null, context_used: [] }} />
                {pending.reply
                  ? <ChatMessage streaming m={{ role: "assistant", content: pending.reply, created_at: now, safety_flag: null, context_used: [] }} />
                  : <div className="flex items-center gap-2 pl-11 text-sm text-muted"><Spinner className="size-4" /> Thinking…</div>}
              </>
            )}
            {error && (
              <Alert tone="danger" title="Message not sent">
                <p>{error.message}</p>
                <div className="mt-1 flex gap-3">
                  {settingsLink && <Link className="font-medium underline" to={settingsLink}>Open settings</Link>}
                  <button className="font-medium underline" onClick={() => send(input)}>Retry</button>
                </div>
              </Alert>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-line bg-surface p-3 sm:p-4">
          <form className="mx-auto flex max-w-3xl items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <label htmlFor="chat-input" className="sr-only">Message the AI Doctor</label>
            <textarea id="chat-input" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={8000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
              placeholder="Describe your question or symptoms…  (Enter to send, Shift+Enter for a new line)"
              className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20" />
            {pending ? (
              <Button variant="outline" size="icon" className="size-11" aria-label="Stop generating" onClick={() => abortRef.current?.abort()}><Square className="size-4" /></Button>
            ) : (
              <Button type="submit" variant="accent" size="icon" className="size-11" aria-label="Send message" disabled={!input.trim()}><SendHorizonal className="size-4" /></Button>
            )}
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted">
            AI health assistant — not a doctor. It can make mistakes. For emergencies call your local emergency number.
          </p>
        </div>
      </section>

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete)} title="Delete conversation?"
        message="This permanently deletes the conversation and all of its messages." />
      <Dialog open={showSummary} onClose={() => setShowSummary(false)} title="Conversation summary"
        description="AI-generated from this conversation. For your records — not a medical document."
        footer={<><Button variant="outline" onClick={() => summarize.mutate(undefined)} loading={summarize.isPending}>Regenerate</Button><Button onClick={() => setShowSummary(false)}>Close</Button></>}>
        <div className="prose-chat"><ReactMarkdown>{conv.data?.summary ?? ""}</ReactMarkdown></div>
      </Dialog>
    </div>
  );
}
