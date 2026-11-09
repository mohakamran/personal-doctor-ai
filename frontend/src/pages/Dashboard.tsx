import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Calendar, HeartPulse, MessageSquareHeart, Moon, Pill, Scale, ArrowRight, Gauge, UserCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { measurementsApi, settingsApi } from "@/services/endpoints";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, MedicalDisclaimer } from "@/components/ui/misc";
import { COLORS, TrendChart } from "@/components/dashboard/charts";
import { fmtDate, fmtDateTime, fmtMeasurement, relativeTime } from "@/utils/format";
import type { Measurement } from "@/types";

function Stat({ icon, label, value, sub, to }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; to: string }) {
  return (
    <Link to={to} className="group block focus-visible:outline-none">
      <Card className="h-full p-4 transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="grid size-8 place-items-center rounded-lg bg-teal-soft text-teal">{icon}</span>{label}
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </Card>
    </Link>
  );
}

const latestOf = (arr?: Measurement[]) => (arr && arr.length ? arr[0] : null);

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: measurementsApi.dashboard });
  const { data: ai } = useQuery({ queryKey: ["ai-settings"], queryFn: settingsApi.ai });

  if (isLoading) return <div className="p-6"><LoadingBlock /></div>;
  if (error || !data) return <div className="p-6"><ErrorState error={error} onRetry={refetch} /></div>;

  const bp = latestOf(data.latest.blood_pressure);
  const hr = latestOf(data.latest.heart_rate);
  const sleep = latestOf(data.latest.sleep);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const bpData = data.blood_pressure_history.map((m) => ({ t: m.recorded_at, systolic: m.value, diastolic: m.value2 }));
  const hrData = data.heart_rate_history.map((m) => ({ t: m.recorded_at, value: m.value }));
  const sleepData = data.sleep_history.map((m) => ({ t: m.recorded_at, value: m.value }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{greet}, {data.display_name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">Here's an overview of the health information you've recorded.</p>
        </div>
        <Link to="/ai-doctor"><Button size="lg" variant="accent"><MessageSquareHeart className="size-4" /> Talk to AI Doctor</Button></Link>
      </div>

      {ai && !ai.verified && (
        <Alert tone="info" title="Set up the AI Doctor">
          Add your OpenAI API key in <Link to="/settings?tab=ai" className="font-medium text-teal underline">Settings → AI configuration</Link> to start conversations. Everything else works without it.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat to="/health/profile" icon={<UserCircle2 className="size-4" />} label="Profile" value={`${data.profile_completion}%`}
          sub={<span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-teal" style={{ width: `${data.profile_completion}%` }} /></span>} />
        <Stat to="/health/measurements" icon={<Scale className="size-4" />} label="Weight / BMI"
          value={data.weight_kg ? `${data.weight_kg} kg` : "—"}
          sub={data.bmi ? `BMI ${data.bmi} (calculated, not a diagnosis)` : "Add height & weight to see BMI"} />
        <Stat to="/health/measurements" icon={<Gauge className="size-4" />} label="Blood pressure"
          value={bp ? fmtMeasurement(bp) : "—"} sub={bp ? relativeTime(bp.recorded_at) : "No readings yet"} />
        <Stat to="/health/measurements" icon={<HeartPulse className="size-4" />} label="Heart rate"
          value={hr ? fmtMeasurement(hr) : "—"} sub={hr ? relativeTime(hr.recorded_at) : "No readings yet"} />
        <Stat to="/health/measurements" icon={<Moon className="size-4" />} label="Sleep"
          value={sleep ? fmtMeasurement(sleep) : "—"} sub={sleep ? relativeTime(sleep.recorded_at) : "Nothing logged yet"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Blood pressure history" description="Your last 14 recorded readings" icon={<Gauge className="size-4" />}
            action={<Link to="/analytics" className="text-sm font-medium text-teal hover:underline">Analytics</Link>} />
          <CardBody>
            {bpData.length ? <TrendChart data={bpData} unit="mmHg" series={[
              { key: "systolic", label: "Systolic", color: COLORS.navy }, { key: "diastolic", label: "Diastolic", color: COLORS.teal }]} />
              : <EmptyState icon={<Gauge className="size-5" />} title="No blood pressure readings" description="Record a reading to see your history here."
                action={<Link to="/health/measurements"><Button variant="outline" size="sm">Add measurement</Button></Link>} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Heart rate" description="Recent readings" icon={<HeartPulse className="size-4" />} />
          <CardBody>
            {hrData.length ? <TrendChart data={hrData} unit="bpm" height={200} series={[{ key: "value", label: "Heart rate", color: COLORS.teal }]} />
              : <EmptyState title="No heart rate readings" description="Log your resting heart rate to track trends." />}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Sleep" description="Hours per night" icon={<Moon className="size-4" />} />
          <CardBody>
            {sleepData.length ? <TrendChart bar data={sleepData} unit="h" height={180} series={[{ key: "value", label: "Sleep", color: COLORS.navy }]} />
              : <EmptyState title="No sleep logged" description="Track sleep under Measurements." />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent symptoms" icon={<Activity className="size-4" />}
            action={<Link to="/health/symptoms" className="text-sm font-medium text-teal hover:underline">View all</Link>} />
          <CardBody className="pt-3">
            {data.recent_symptoms.length ? (
              <ul className="divide-y divide-line">
                {data.recent_symptoms.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                      <p className="text-xs text-muted">{fmtDate(s.started_at)}{s.severity ? ` · self-rated ${s.severity}/10` : ""}</p>
                    </div>
                    <Badge tone={s.status === "resolved" ? "ok" : s.status === "improving" ? "teal" : "warn"}>{s.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No symptoms recorded" description="Use the symptom journal to keep track of how you feel." />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Medications" icon={<Pill className="size-4" />}
            action={<Link to="/medications" className="text-sm font-medium text-teal hover:underline">Manage</Link>} />
          <CardBody className="pt-3">
            {data.active_medications.length ? (
              <ul className="divide-y divide-line">
                {data.active_medications.map((m) => (
                  <li key={m.id} className="py-2.5">
                    <p className="text-sm font-medium text-ink">{m.name}</p>
                    <p className="text-xs text-muted">{[m.dosage, m.frequency].filter(Boolean).join(" · ") || "No dosage recorded"}
                      {m.reminder_enabled && m.reminder_times.length ? ` · reminders ${m.reminder_times.join(", ")}` : ""}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No active medications" description="Record medications exactly as prescribed to you." />}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent AI conversations" icon={<MessageSquareHeart className="size-4" />}
            action={<Link to="/ai-doctor" className="text-sm font-medium text-teal hover:underline">Open AI Doctor</Link>} />
          <CardBody className="pt-3">
            {data.recent_conversations.length ? (
              <ul className="divide-y divide-line">
                {data.recent_conversations.map((c) => (
                  <li key={c.id}>
                    <Link to={`/ai-doctor/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-teal">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                        <p className="truncate text-xs text-muted">{c.last_message_preview ?? "No messages yet"}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{relativeTime(c.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No conversations yet" description="Ask the AI Doctor a health question to get started." />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Upcoming appointments" icon={<Calendar className="size-4" />}
            action={<Link to="/appointments" className="text-sm font-medium text-teal hover:underline">View all</Link>} />
          <CardBody className="pt-3">
            {data.upcoming_appointments.length ? (
              <ul className="divide-y divide-line">
                {data.upcoming_appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                      <p className="truncate text-xs text-muted">{[a.provider, a.location].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-ink-2">{fmtDateTime(a.scheduled_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No upcoming appointments" description="Add appointments and prepare questions for your clinician."
                action={<Link to="/appointments"><Button variant="outline" size="sm">Add appointment <ArrowRight className="size-3.5" /></Button></Link>} />}
          </CardBody>
        </Card>
      </div>
      <MedicalDisclaimer className="text-center" />
    </div>
  );
}
