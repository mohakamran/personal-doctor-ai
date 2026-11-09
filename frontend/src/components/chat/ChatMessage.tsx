import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShieldAlert, Stethoscope, User } from "lucide-react";
import type { Message } from "@/types";
import { cn } from "@/utils/cn";
import { fmtDateTime, fmtTime } from "@/utils/format";

const CONTEXT_LABELS: Record<string, string> = {
  profile: "profile", allergies: "allergies", conditions: "conditions", medications: "medications",
  symptoms: "symptoms", measurements: "measurements", family_history: "family history",
  conversation_summaries: "past summaries", document: "document",
};

export function ChatMessage({ m, streaming }: { m: Pick<Message, "role" | "content" | "created_at" | "safety_flag" | "context_used">; streaming?: boolean }) {
  const isUser = m.role === "user";
  const urgent = !!m.safety_flag;
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-full",
        isUser ? "bg-navy text-white dark:text-[#0b1320]" : urgent ? "bg-danger-soft text-danger" : "bg-teal-soft text-teal")}>
        {isUser ? <User className="size-4" /> : urgent ? <ShieldAlert className="size-4" /> : <Stethoscope className="size-4" />}
      </div>
      <div className={cn("min-w-0 max-w-[85%] sm:max-w-[75%]", isUser && "items-end text-right")}>
        <div className={cn("inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed",
          isUser ? "rounded-tr-sm bg-navy text-white dark:text-[#0b1320]"
            : urgent ? "rounded-tl-sm border border-danger/40 bg-danger-soft text-ink"
              : "rounded-tl-sm border border-line bg-surface text-ink")}>
          {isUser ? <p className="whitespace-pre-wrap">{m.content}</p> : (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>
                {m.content}
              </ReactMarkdown>
              {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-teal align-middle" aria-hidden />}
            </div>
          )}
        </div>
        <p className={cn("mt-1 px-1 text-[11px] text-muted", isUser && "text-right")} title={fmtDateTime(m.created_at)}>
          {fmtTime(m.created_at)}
          {!isUser && m.context_used?.length > 0 && <> · used your {m.context_used.map((c) => CONTEXT_LABELS[c] ?? c).join(", ")}</>}
          {urgent && <> · safety guidance</>}
        </p>
      </div>
    </div>
  );
}
