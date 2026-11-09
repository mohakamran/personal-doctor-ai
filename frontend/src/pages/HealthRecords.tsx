import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, FileUp, Pencil, Trash2, Eye } from "lucide-react";
import { recordsApi } from "@/services/endpoints";
import { useAppMutation } from "@/hooks/useCrud";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { DocumentViewer } from "@/components/records/DocumentViewer";
import { fmtBytes, fmtDate, orNull } from "@/utils/format";
import type { MedicalDocument } from "@/types";

export const CATEGORIES: Record<string, string> = {
  lab_report: "Lab report", imaging: "Imaging", prescription: "Prescription", discharge_summary: "Discharge summary",
  consultation: "Consultation note", vaccination: "Vaccination", insurance: "Insurance", other: "Other",
};
const MAX_MB = 15;

function UploadDialog({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("lab_report");
  const [date, setDate] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const upload = useAppMutation((fd: FormData) => recordsApi.upload(fd), { invalidate: [["records"]], success: "Document uploaded and text extracted.", onSuccess: onClose });

  const pick = (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) return setErr("Only PDF files are supported.");
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`File is larger than ${MAX_MB} MB.`);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
  };
  const submit = () => {
    if (!file) return setErr("Choose a PDF file.");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    if (orNull(title)) fd.append("title", title.trim());
    if (orNull(desc)) fd.append("description", desc.trim());
    if (date) fd.append("report_date", date);
    upload.mutate(fd, { onError: (e) => setErr(e.message) });
  };

  return (
    <Dialog open onClose={onClose} title="Upload medical document" description="PDF only, up to 15 MB. Stored privately on this computer."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={upload.isPending}><FileUp className="size-4" /> Upload</Button></>}>
      <div className="space-y-4">
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
          className="flex flex-col items-center rounded-xl border-2 border-dashed border-line p-6 text-center">
          <FileUp className="size-8 text-muted" />
          <p className="mt-2 text-sm text-ink-2">{file ? <><strong>{file.name}</strong> · {fmtBytes(file.size)}</> : "Drag a PDF here or"}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>{file ? "Choose another file" : "Browse files"}</Button>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="PDF file" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">{(id) => <Input id={id} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Category">{(id) => <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label="Report date">{(id) => <Input id={id} type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} value={desc} maxLength={2000} onChange={(e) => setDesc(e.target.value)} />}</Field>
        </div>
      </div>
    </Dialog>
  );
}

function EditDialog({ doc, onClose }: { doc: MedicalDocument; onClose: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [category, setCategory] = useState(doc.category);
  const [date, setDate] = useState(doc.report_date ?? "");
  const [desc, setDesc] = useState(doc.description ?? "");
  const save = useAppMutation(() => recordsApi.update(doc.id, { title: title.trim() || doc.title, category, report_date: date || null, description: orNull(desc) }),
    { invalidate: [["records"]], success: "Document updated.", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Edit document details"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Category">{(id) => <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        <Field label="Report date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

export default function HealthRecords() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["records"], queryFn: recordsApi.list });
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<MedicalDocument | null>(null);
  const [edit, setEdit] = useState<MedicalDocument | null>(null);
  const [del, setDel] = useState<MedicalDocument | null>(null);
  const [cat, setCat] = useState("all");
  const remove = useAppMutation((id: string) => recordsApi.remove(id), { invalidate: [["records"]], success: "Document deleted.", onSuccess: () => setDel(null) });
  const list = (data ?? []).filter((d) => cat === "all" || d.category === cat);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader title="Medical Records" description="Upload PDFs such as lab reports. Text is extracted locally; nothing is sent to AI without your consent."
        actions={<Button onClick={() => setUploading(true)}><FileUp className="size-4" /> Upload PDF</Button>} />
      {!!data?.length && (
        <div className="mb-4 max-w-56"><Select aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select></div>
      )}
      {isLoading ? <LoadingBlock /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.length ? (
        <Card><EmptyState icon={<FileText className="size-5" />} title="No documents yet" description="Upload lab results, discharge summaries, prescriptions and other PDF records."
          action={<Button onClick={() => setUploading(true)}><FileUp className="size-4" /> Upload your first document</Button>} /></Card>
      ) : !list.length ? <Card><EmptyState title="No documents in this category" /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Card key={d.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger"><FileText className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink" title={d.title}>{d.title}</p>
                  <p className="text-xs text-muted">{CATEGORIES[d.category] ?? d.category} · {fmtBytes(d.size_bytes)} · {d.page_count} pg</p>
                </div>
              </div>
              {d.description && <p className="mt-3 line-clamp-2 text-sm text-ink-2">{d.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{d.report_date ? `Report ${fmtDate(d.report_date)}` : `Uploaded ${fmtDate(d.created_at)}`}</Badge>
                {d.extraction_status === "success" ? <Badge tone="ok">text extracted</Badge> : <Badge tone="warn">{d.extraction_status === "empty" ? "no text found" : "extraction failed"}</Badge>}
                {d.has_explanation && <Badge tone="teal">AI explained</Badge>}
              </div>
              <div className="mt-4 flex gap-1 border-t border-line pt-3">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setView(d)}><Eye className="size-3.5" /> Open</Button>
                <Button size="icon" variant="ghost" aria-label={`Edit ${d.title}`} onClick={() => setEdit(d)}><Pencil className="size-3.5" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => setDel(d)}><Trash2 className="size-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
      {view && <DocumentViewer doc={view} onClose={() => setView(null)} />}
      {edit && <EditDialog doc={edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}
        title="Delete document?" message={<>“{del?.title}”, its extracted text and AI explanation will be permanently deleted from this computer.</>} />
    </div>
  );
}
