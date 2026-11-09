import type { ReactNode } from "react";
import { ShieldCheck, Stethoscope, FileText, MessageSquareHeart } from "lucide-react";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-[#0f2a4a] p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-[#14b8a6]/15 text-[#2dd4bf]"><Stethoscope className="size-5" /></div>
          <div>
            <p className="font-semibold">Personal Doctor AI</p>
            <p className="text-xs text-white/60">Your Personal AI Health Companion</p>
          </div>
        </div>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">Understand your health. Prepare for better conversations with your doctor.</h2>
          <ul className="space-y-4 text-sm text-white/80">
            <li className="flex gap-3"><MessageSquareHeart className="size-5 shrink-0 text-[#2dd4bf]" /> Ask health questions and get clear, educational explanations.</li>
            <li className="flex gap-3"><FileText className="size-5 shrink-0 text-[#2dd4bf]" /> Keep your records, measurements and medications in one place.</li>
            <li className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-[#2dd4bf]" /> Runs locally on your Mac. Your data stays on this computer unless you choose to use AI.</li>
          </ul>
        </div>
        <p className="text-xs text-white/50">An AI health assistant — not a licensed physician. It does not diagnose or prescribe.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Stethoscope className="size-6 text-teal" /><span className="font-semibold text-ink">Personal Doctor AI</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
