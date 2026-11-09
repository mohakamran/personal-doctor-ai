import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, MessageSquareHeart, Sparkles, FileSearch, FileText, Eye } from "lucide-react";
import { recordsApi, settingsApi } from "@/services/endpoints";
import { downloadFile } from "@/services/api";
import { useAppMutation } from "@/hooks/useCrud";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, Badge, ErrorState, LoadingBlock } from "@/components/ui/misc";
import { cn } from "@/utils/cn";
import { fmtDate, fmtDateTime } from "@/utils/format";
import type { MedicalDocument } from "@/types";

type Tab = "preview" | "extracted" | "ai";

export function DocumentViewer({ doc, onClose }: { doc: MedicalDocument; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("extracted");
  const [consent, setConsent] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const ext = useQuery({ queryKey: ["extraction", doc.id], queryFn: () => recordsApi.extraction(doc.id) });
  const ai = useQuery({ queryKey: ["ai-settings"], queryFn: settingsApi.ai });
  const explain = useAppMutation(() => recordsApi.explain(doc.id), {
    invalidate: [["extraction", doc.id], ["records"], ["conversations"]], success: "Explanation ready.",
  });

  useEffect(() => {
    if (tab !== "preview" || pdfUrl) return;
    let url: string | null = null;
    recordsApi.fileBlob(doc.id).then((b) => { url = URL.createObjectURL(b); setPdfUrl(url); }).catch(() => setPdfUrl(""));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [tab, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const aiBlocked = !ai.data?.verified ? "Connect your OpenAI API key in Settings first."
    : !ai.data?.ai_consent ? "Allow AI use in Settings → Privacy first."
      : !ai.data?.allow_document_ai ? "Turn on “Allow document analysis” in Settings → Privacy first." : null;

  return (
    <Dialog open onClose={onClose} size="lg" title={doc.title}
      description={<>{doc.category.replace(/_/g, " ")} · {doc.report_date ? `report date ${fmtDate(doc.report_date)}` : "no report date"} · {doc.page_count} page(s)</>}
      footer={<>
        <Button variant="outline" onClick={() => downloadFile(`/records/${doc.id}/file?download=true`, doc.original_filename)}><Download className="size-4" /> Download</Button>
        <Button onClick={onClose}>Close</Button>
      </>}>
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist">
        {([["extracted", "Extracted text", FileSearch], ["ai", "AI explanation", Sparkles], ["preview", "Original PDF", Eye]] as const).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "preview" && (pdfUrl === null ? <LoadingBlock label="Loading PDF…" /> : pdfUrl === "" ? <ErrorState error={new Error("Could not load the file.")} />
        : <iframe title={`PDF preview of ${doc.title}`} src={pdfUrl} className="h-[60vh] w-full rounded-lg border border-line" />)}

      {tab !== "preview" && (ext.isLoading ? <LoadingBlock /> : ext.error || !ext.data ? <ErrorState error={ext.error} onRetry={ext.refetch} /> : (
        tab === "extracted" ? (
          <div className="space-y-4">
            <Alert tone="info" title="Extracted content (verbatim)">Text copied directly from the PDF by PyMuPDF on this computer. Nothing here is AI-generated or sent anywhere.</Alert>
            {ext.data.error && <Alert tone="warn">{ext.data.error}</Alert>}
            {ext.data.lab_lines.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Lines that look like results ({ext.data.lab_lines.length})</h3>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-ink-2">
                  {ext.data.lab_lines.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            )}
            {ext.data.text && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Full text</h3>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-ink-2">{ext.data.text}</pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {ext.data.ai_explanation ? (
              <>
                <Alert tone="warn" title="AI-generated interpretation">Written by {ext.data.ai_model ?? "the AI"} on {fmtDateTime(ext.data.explained_at)} from the extracted text. It may contain mistakes — always check values against the original and discuss results with your clinician.</Alert>
                <div className="prose-chat rounded-xl border border-line p-4"><ReactMarkdown remarkPlugins={[remarkGfm]}>{ext.data.ai_explanation}</ReactMarkdown></div>
                <div className="flex flex-wrap gap-2">
                  {ext.data.conversation_id && <Link to={`/ai-doctor/${ext.data.conversation_id}`}><Button variant="accent"><MessageSquareHeart className="size-4" /> Ask follow-up questions</Button></Link>}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-ink-2">Get a plain-language explanation of this document. Values, units and reference ranges are quoted exactly as they appear; missing values are never filled in.</p>
                {!ext.data.text ? <Alert tone="warn">No text could be extracted from this PDF, so it can't be explained.</Alert>
                  : aiBlocked ? <Alert tone="warn">{aiBlocked} <Link className="font-medium underline" to={!ai.data?.verified ? "/settings?tab=ai" : "/settings?tab=privacy"}>Open settings</Link></Alert> : (
                    <>
                      <label className="flex items-start gap-2.5 rounded-xl border border-line p-3 text-sm text-ink-2">
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--teal)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                        <span>I consent to sending the <strong>extracted text</strong> of this document (not the file itself) to OpenAI to generate an explanation. OpenAI usage may incur charges on my API account.</span>
                      </label>
                      <Button variant="accent" disabled={!consent} loading={explain.isPending} onClick={() => explain.mutate(undefined)}><Sparkles className="size-4" /> Explain this document</Button>
                    </>
                  )}
              </div>
            )}
          </div>
        )
      ))}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><FileText className="size-3.5" /> {doc.original_filename} · uploaded {fmtDateTime(doc.created_at)} {doc.has_explanation && <Badge tone="teal">explained</Badge>}</p>
    </Dialog>
  );
}
