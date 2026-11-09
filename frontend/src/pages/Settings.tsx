import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Database, Info, KeyRound, Lock, Palette, ShieldCheck, Trash2, User, Download } from "lucide-react";
import { settingsApi } from "@/services/endpoints";
import { authApi } from "@/services/auth";
import { downloadFile } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type ThemePref } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useAppMutation } from "@/hooks/useCrud";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Alert, Badge, ErrorState, LoadingBlock, MedicalDisclaimer, PageHeader } from "@/components/ui/misc";
import { passwordRule } from "@/schemas/forms";
import { cn } from "@/utils/cn";
import { fmtDateTime } from "@/utils/format";

const TABS = [
  { k: "account", label: "Account", icon: User }, { k: "ai", label: "AI configuration", icon: Bot },
  { k: "privacy", label: "Privacy", icon: ShieldCheck }, { k: "data", label: "Data management", icon: Database },
  { k: "appearance", label: "Appearance", icon: Palette }, { k: "about", label: "About", icon: Info },
] as const;

const COUNTRIES: [string, string][] = [["", "Not set"], ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["IE", "Ireland"], ["AU", "Australia"], ["NZ", "New Zealand"], ["IN", "India"], ["PK", "Pakistan"], ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["SE", "Sweden"], ["JP", "Japan"], ["KR", "South Korea"], ["CN", "China"], ["SG", "Singapore"], ["PH", "Philippines"], ["ZA", "South Africa"], ["BR", "Brazil"], ["MX", "Mexico"]];

function AccountSection() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.display_name ?? "");
  const [units, setUnits] = useState(user?.unit_system ?? "metric");
  const [country, setCountry] = useState(user?.country_code ?? "");
  const [emergency, setEmergency] = useState(user?.emergency_number ?? "");
  const save = useAppMutation(() => authApi.updateMe({ display_name: name.trim() || user!.display_name, unit_system: units, country_code: country || null, emergency_number: emergency.trim() || null }),
    { success: "Account settings saved.", onSuccess: (u) => setUser(u) });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const changePw = useAppMutation(() => authApi.changePassword(pw.current, pw.next), { success: "Password changed.", onSuccess: () => setPw({ current: "", next: "", confirm: "" }) });
  const submitPw = () => {
    setPwErr(null);
    const r = passwordRule.safeParse(pw.next);
    if (!r.success) return setPwErr(r.error.issues[0].message);
    if (pw.next !== pw.confirm) return setPwErr("New passwords do not match.");
    changePw.mutate(undefined, { onError: (e) => setPwErr(e.message) });
  };
  return (<>
    <Card><CardHeader title="Profile & preferences" icon={<User className="size-4" />} />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name">{(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email">{(id) => <Input id={id} value={user?.email ?? ""} disabled />}</Field>
        <Field label="Measurement units">{(id) => <Select id={id} value={units} onChange={(e) => setUnits(e.target.value as "metric" | "imperial")}><option value="metric">Metric (kg, cm)</option><option value="imperial">Imperial (lb, in)</option></Select>}</Field>
        <Field label="Country / region" hint="Used to show the right emergency number.">{(id, d) => <Select id={id} aria-describedby={d} value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select>}</Field>
        <Field label="Custom emergency number (optional)" hint="Overrides the country default in safety messages." className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} value={emergency} maxLength={20} onChange={(e) => setEmergency(e.target.value.replace(/[^0-9+ -]/g, ""))} />}</Field>
        <div className="sm:col-span-2"><Button onClick={() => save.mutate(undefined)} loading={save.isPending}>Save changes</Button></div>
      </CardBody></Card>
    <Card><CardHeader title="Change password" icon={<Lock className="size-4" />} />
      <CardBody className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>
        <Field label="New password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
        <Field label="Confirm new password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}</Field>
        {pwErr && <p className="text-sm text-danger sm:col-span-3" role="alert">{pwErr}</p>}
        <div className="sm:col-span-3"><Button variant="outline" onClick={submitPw} loading={changePw.isPending} disabled={!pw.current || !pw.next}>Update password</Button></div>
      </CardBody></Card>
  </>);
}

function AISection() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["ai-settings"], queryFn: settingsApi.ai });
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string; key: string; model: string } | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (data && !model) setModel(data.model ?? data.default_model); }, [data, model]);

  const payload = () => ({ ...(key.trim() ? { api_key: key.trim() } : {}), model: model.trim() });
  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await settingsApi.test(payload());
      setResult({ ...r, key, model });
      if (r.ok) settingsApi.models(payload()).then(setModels).catch(() => setModels([]));
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message, key, model });
    } finally { setTesting(false); }
  };
  const save = useAppMutation(() => settingsApi.save(payload()), {
    success: "AI configuration saved.",
    onSuccess: (d) => { qc.setQueryData(["ai-settings"], d); setKey(""); setResult(null); },
  });
  const removeKey = useAppMutation(() => settingsApi.removeKey(), {
    success: "API key removed.", onSuccess: (d) => { qc.setQueryData(["ai-settings"], d); setResult(null); },
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const tested = result?.ok && result.key === key && result.model === model;
  const canSave = !!model.trim() && (tested || (!key.trim() && data.has_api_key && model !== data.model && result?.ok));

  return (
    <Card><CardHeader title="OpenAI configuration" icon={<KeyRound className="size-4" />} description="Use your own OpenAI API key. It is encrypted on this computer and never shown again."
      action={data.verified ? <Badge tone="ok"><CheckCircle2 className="size-3" /> Connected</Badge> : <Badge tone="warn">Not connected</Badge>} />
      <CardBody className="space-y-4">
        <Alert tone="info">OpenAI API usage is billed separately by OpenAI to your account. Check your usage limits at platform.openai.com.</Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="AI provider">{(id) => <Select id={id} value="openai" disabled><option value="openai">OpenAI</option></Select>}</Field>
          <Field label="Connection status">{() => <p className="flex h-10 items-center text-sm text-ink-2">{data.verified ? `Verified ${fmtDateTime(data.verified_at)}` : data.has_api_key ? "Key saved but not verified" : "No API key saved"}</p>}</Field>
          <Field label="API key" hint={data.has_api_key ? `Saved key: ${data.masked_key}. Leave blank to keep it.` : "Starts with “sk-”. Find it at platform.openai.com → API keys."} className="sm:col-span-2">
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} placeholder={data.has_api_key ? "•••••••• (unchanged)" : "sk-..."} value={key} onChange={(e) => setKey(e.target.value)} />}</Field>
          <Field label="Model" hint="Test the connection to load the models available to your key." className="sm:col-span-2">
            {(id, d) => (<>
              <Input id={id} aria-describedby={d} list="model-options" value={model} onChange={(e) => setModel(e.target.value)} placeholder={data.default_model} />
              <datalist id="model-options">{models.map((m) => <option key={m} value={m} />)}</datalist>
            </>)}</Field>
        </div>
        {result && <Alert tone={result.ok ? "info" : "danger"} title={result.ok ? "Connection successful" : "Connection failed"}>{result.message}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={test} loading={testing} disabled={!model.trim() || (!key.trim() && !data.has_api_key)}>Test connection</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!canSave}>Save configuration</Button>
          {data.has_api_key && <Button variant="danger-outline" onClick={() => removeKey.mutate(undefined)} loading={removeKey.isPending}><Trash2 className="size-4" /> Remove API key</Button>}
        </div>
        {!canSave && !testing && <p className="text-xs text-muted">Test the connection successfully before saving.</p>}
        {data.verified && !data.ai_consent && <Alert tone="warn">One more step: allow AI use in the Privacy tab. <Link className="font-medium underline" to="/settings?tab=privacy">Open Privacy</Link></Alert>}
      </CardBody></Card>
  );
}

function PrivacySection() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["ai-settings"], queryFn: settingsApi.ai });
  const upd = useAppMutation((d: Parameters<typeof settingsApi.privacy>[0]) => settingsApi.privacy(d), {
    success: "Privacy settings updated.", onSuccess: (d) => qc.setQueryData(["ai-settings"], d),
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <Card><CardHeader title="Privacy & consent" icon={<ShieldCheck className="size-4" />} description="You decide what, if anything, is shared with OpenAI." />
      <CardBody className="space-y-5">
        <Switch label="Allow sending my chat messages to OpenAI" checked={data.ai_consent} disabled={upd.isPending}
          description="Required for the AI Doctor. Your messages are sent to OpenAI to generate replies (with storage disabled on the request). Turning this off also turns off the options below."
          onChange={(v) => upd.mutate({ ai_consent: v })} />
        <div className="h-px bg-line" />
        <Switch label="Use my saved health information in AI conversations" checked={data.use_health_context} disabled={!data.ai_consent || upd.isPending}
          description="Only relevant items are included — e.g. age, allergies, conditions, current medications, recent symptoms and related measurements. You can also turn this off per conversation."
          onChange={(v) => upd.mutate({ use_health_context: v })} />
        <Switch label="Include summaries of previous conversations" checked={data.include_conversation_summaries} disabled={!data.ai_consent || upd.isPending}
          description="Up to three conversation summaries you've generated may be included for continuity."
          onChange={(v) => upd.mutate({ include_conversation_summaries: v })} />
        <Switch label="Allow document analysis" checked={data.allow_document_ai} disabled={!data.ai_consent || upd.isPending}
          description="Lets you send the extracted text of a medical document to OpenAI for an explanation. You'll still confirm each document."
          onChange={(v) => upd.mutate({ allow_document_ai: v })} />
        <Alert tone="info">All data is stored locally in an SQLite database and a private folder on this Mac. Personal Doctor AI does not claim HIPAA, GDPR or other regulatory compliance.</Alert>
      </CardBody></Card>
  );
}

function DataSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true); setErr(null);
    try { await authApi.deleteAccount(pw); toast.success("Your account and all data were deleted."); await logout().catch(() => {}); navigate("/login"); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (<>
    <Card><CardHeader title="Export your data" icon={<Download className="size-4" />} />
      <CardBody className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => downloadFile("/reports/export", "personal-doctor-ai-export.json").catch((e) => toast.error(e.message))}><Download className="size-4" /> Download all data (JSON)</Button>
        <Button variant="outline" onClick={() => downloadFile("/reports/health-summary?days=365", "health-summary.md").catch((e) => toast.error(e.message))}><Download className="size-4" /> Health summary (Markdown)</Button>
        <p className="w-full text-xs text-muted">The export includes everything you've entered, extracted document text and conversations. API keys are never exported. Uploaded PDFs can be downloaded from Medical Records.</p>
      </CardBody></Card>
    <Card className="border-danger/30"><CardHeader title="Delete account" icon={<Trash2 className="size-4" />} description="Permanently deletes your account, all health records, conversations and uploaded files from this computer." />
      <CardBody><Button variant="danger-outline" onClick={() => setOpen(true)}>Delete my account…</Button></CardBody></Card>
    <Dialog open={open} onClose={() => setOpen(false)} title="Delete account permanently?" size="sm"
      footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" onClick={del} loading={busy} disabled={!pw || confirm !== "DELETE"}>Delete everything</Button></>}>
      <div className="space-y-3 text-sm text-ink-2">
        <p>This cannot be undone. Consider exporting your data first.</p>
        <Field label="Password">{(id) => <Input id={id} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <Field label="Type DELETE to confirm">{(id) => <Input id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        {err && <p className="text-danger" role="alert">{err}</p>}
      </div>
    </Dialog>
  </>);
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <Card><CardHeader title="Appearance" icon={<Palette className="size-4" />} />
      <CardBody>
        <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {(["light", "dark", "system"] as ThemePref[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}
              className={cn("rounded-xl border p-3 text-sm font-medium capitalize", theme === t ? "border-teal bg-teal-soft text-ink" : "border-line text-ink-2 hover:bg-surface-2")}>{t}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Stored only in this browser.</p>
      </CardBody></Card>
  );
}

function AboutSection() {
  return (
    <Card><CardHeader title="About Personal Doctor AI" icon={<Info className="size-4" />} />
      <CardBody className="space-y-3 text-sm text-ink-2">
        <p><strong>Version 1.0.0</strong> — a local, personal AI health education assistant.</p>
        <p>Built with React, FastAPI, SQLite and the OpenAI Responses API. Runs entirely on this Mac; only the content you explicitly allow is sent to OpenAI.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Does not diagnose disease, prescribe or change medication, or replace professional care.</li>
          <li>Not clinically validated. Not a medical device. No regulatory compliance is claimed.</li>
          <li>Urgent-symptom detection is a simple rule-based safety net, not a triage tool.</li>
        </ul>
        <p>API documentation: <a className="text-teal underline" href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">http://127.0.0.1:8000/docs</a></p>
        <MedicalDisclaimer />
      </CardBody></Card>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.k === params.get("tab"))?.k ?? "account") as (typeof TABS)[number]["k"];
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title="Settings" />
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:flex-col">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setParams({ tab: t.k })} aria-current={tab === t.k ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium", tab === t.k ? "bg-teal-soft text-ink" : "text-ink-2 hover:bg-surface-2")}>
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          {tab === "account" && <AccountSection />}
          {tab === "ai" && <AISection />}
          {tab === "privacy" && <PrivacySection />}
          {tab === "data" && <DataSection />}
          {tab === "appearance" && <AppearanceSection />}
          {tab === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
