"""Rule-based urgent warning sign detection.

This is a conservative, deterministic safety layer that runs BEFORE any AI call.
It is NOT a validated triage tool and never produces a risk score. When a
potential emergency is detected, the app replies with urgent-care guidance
instead of continuing an ordinary AI conversation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

EMERGENCY_NUMBERS = {
    "US": "911", "CA": "911", "MX": "911", "GB": "999", "IE": "112", "AU": "000", "NZ": "111",
    "IN": "112", "PK": "1122 (Rescue) or 115", "JP": "119", "KR": "119", "CN": "120",
    "AE": "998", "SA": "997", "ZA": "10177 or 112", "BR": "192", "SG": "995", "PH": "911",
    "DE": "112", "FR": "112", "ES": "112", "IT": "112", "NL": "112", "SE": "112",
}

CRISIS_LINES = {
    "US": "988 (Suicide & Crisis Lifeline, call or text)",
    "CA": "988 (Suicide Crisis Helpline)",
    "GB": "Samaritans at 116 123",
    "IE": "Samaritans at 116 123",
    "AU": "Lifeline at 13 11 14",
}


@dataclass(frozen=True)
class SafetyRule:
    category: str
    label: str
    patterns: tuple[str, ...]


RULES: tuple[SafetyRule, ...] = (
    SafetyRule("self_harm", "thoughts of suicide or self-harm", (
        r"\b(kill|hurt|harm)(ing)? myself\b", r"\bsuicid(e|al)\b", r"\bend (my|it) (life|all)\b",
        r"\bwant to die\b", r"\bdon'?t want to (live|be alive)\b", r"\bself[- ]harm\b",
        r"\boverdos(e|ed|ing)\b",
    )),
    SafetyRule("cardiac", "possible heart attack warning signs", (
        r"\bchest (pain|pressure|tightness)\b.*\b(arm|jaw|neck|back|sweat|breath|nausea)",
        r"\b(crushing|severe|sudden) chest (pain|pressure)\b",
        r"\b(having|had) a heart attack\b", r"\bi think (i'?m|i am) having a heart attack\b",
    )),
    SafetyRule("stroke", "possible stroke warning signs", (
        r"\b(face|facial) (droop|drooping)\b", r"\bslurred speech\b",
        r"\b(sudden|one[- ]sided) (weakness|numbness)\b", r"\bcan'?t (move|feel) (my )?(arm|leg|face)\b",
        r"\b(having|had) a stroke\b",
    )),
    SafetyRule("breathing", "severe breathing difficulty", (
        r"\bcan'?t breathe\b", r"\bcannot breathe\b", r"\b(struggling|unable) to breathe\b",
        r"\bchoking\b", r"\blips? (turning )?(blue|grey|gray)\b",
    )),
    SafetyRule("anaphylaxis", "possible severe allergic reaction", (
        r"\banaphyla", r"\b(throat|tongue|lips?) (is |are )?(swelling|swollen|closing)\b",
    )),
    SafetyRule("bleeding", "severe bleeding", (
        r"\b(heavy|severe|uncontrolled|won'?t stop) bleeding\b", r"\bbleeding (heavily|won'?t stop)\b",
        r"\bvomiting blood\b", r"\bcoughing up blood\b",
    )),
    SafetyRule("neuro", "loss of consciousness or seizure", (
        r"\b(passed out|fainted|unconscious|unresponsive)\b", r"\b(having|had) a seizure\b",
        r"\bworst headache of my life\b", r"\bsudden severe headache\b",
    )),
    SafetyRule("poisoning", "possible poisoning", (r"\bswallowed (bleach|poison|chemicals?)\b", r"\bi (was|got|have been|think i was) poisoned\b")),
)


@dataclass(frozen=True)
class SafetyResult:
    triggered: bool
    category: str | None = None
    label: str | None = None


def assess(text: str) -> SafetyResult:
    t = text.lower()
    for rule in RULES:
        for p in rule.patterns:
            if re.search(p, t):
                return SafetyResult(True, rule.category, rule.label)
    return SafetyResult(False)


def emergency_number(country_code: str | None, custom: str | None) -> str:
    if custom:
        return custom
    if country_code and country_code in EMERGENCY_NUMBERS:
        return EMERGENCY_NUMBERS[country_code]
    return "your local emergency number (for example 911, 112 or 999)"


def urgent_response(result: SafetyResult, country_code: str | None, custom_number: str | None) -> str:
    number = emergency_number(country_code, custom_number)
    lines = [
        "## ⚠️ This may need urgent medical attention",
        "",
        f"What you described may include **{result.label}**. I can't assess emergencies, "
        "and this should not wait for a chat conversation.",
        "",
        f"- **Call {number} now**, or go to the nearest emergency department.",
        "- If you are not alone, tell someone nearby what is happening.",
        "- Do not drive yourself if you feel faint, confused, or very unwell.",
    ]
    if result.category == "self_harm":
        crisis = CRISIS_LINES.get(country_code or "")
        lines += [
            "- You don't have to go through this alone. "
            + (f"You can reach {crisis}." if crisis else "Please contact a local crisis line or someone you trust right now."),
        ]
    if result.category == "anaphylaxis":
        lines += ["- If you have a prescribed epinephrine auto-injector, follow its instructions."]
    lines += [
        "",
        "_Personal Doctor AI is an AI assistant, not a doctor, and cannot provide emergency care. "
        "When you are safe, you can continue this conversation._",
    ]
    return "\n".join(lines)
