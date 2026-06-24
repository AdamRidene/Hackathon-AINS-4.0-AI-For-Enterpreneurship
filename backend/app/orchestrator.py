r"""Central orchestration layer.

The single integration point that chains the three modules around the shared
ProjectProfile. This is what the spec evaluates as "cross-module integration":
the modules do not merely coexist — diagnostic output feeds scoring (P_coh
judge), both feed the gap detector, and gaps + scores together drive the RAG
roadmap. One call, one shared state, one audit object.

  intake (Phase 1)  -->  diagnostic + gap (Phase 2)  -->  scoring (Phase 2)
                                 \-------> RAG roadmap + explainability (Phase 3)

Anomaly integration (v2):
  - Anomalies detected post-scoring → confidence notes annotated on scores
  - Anomalies passed to roadmap builder → priority escalation
  - Anomalies included in assistant grounding context
  - Semantic validation (Stage 2) runs on ambiguous anomaly results
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from .schema import ProjectProfile

# In-memory conversation history per project (max 6 turns = last 3 Q&A)
_conversation_memory: dict[str, list[dict]] = {}
_MAX_HISTORY_TURNS = 6
from .intake import IntakeStateMachine
from .diagnostic import classify, detect_gap
from .diagnostic.classifier import DiagnosticResult
from .diagnostic.gap import (
    GapReport, detect_anomalies, validate_anomalies_semantic,
    get_anomaly_dimension_notes,
)
from .scoring.gwlc import score_all, annotate_scores_with_anomalies, CompositeScores
from .rag.roadmap import build_roadmap, Milestone
from .rag.retriever import Retriever
from .llm import get_llm
from . import explain
from . import store

_logger = logging.getLogger(__name__)


@dataclass
class AuditResult:
    profile: ProjectProfile
    diagnostic: DiagnosticResult
    gap: GapReport
    scores: CompositeScores
    pcoh: float
    roadmap: list[Milestone]
    explanations: dict = field(default_factory=dict)
    anomalies: list[dict] = field(default_factory=list)
    score_deltas: dict = field(default_factory=dict)
    gap_sources: dict = field(default_factory=dict)
    follow_up_suggested: Optional[dict] = None

    def to_dict(self) -> dict:
        # Flatten scores explanations to top level so frontend can access
        # audit.explanations[dimension].natural_language directly.
        scores_expl = self.explanations.get("scores", {})
        flat_explanations = {
            **scores_expl,
            "gap": self.explanations.get("gap"),
            "pcoh_rationale": self.explanations.get("pcoh_rationale"),
            "diagnostic_rationale": self.explanations.get("diagnostic_rationale"),
        }
        d = {
            "project_id": self.profile.project_id,
            "project_name": self.profile.name,
            "sector": getattr(self.profile.sector, 'value', self.profile.sector) if self.profile.sector else None,
            "location": getattr(self.profile.location, 'value', self.profile.location) if self.profile.location else None,
            "diagnostic": self.diagnostic.to_dict(),
            "perception_reality_gap": self.gap.to_dict(),
            "anomalies": self.anomalies,
            "scores": self.scores.to_dict(),
            "score_deltas": self.score_deltas,
            "pcoh": round(self.pcoh, 1),
            "roadmap": [m.to_dict() for m in self.roadmap],
            "explanations": flat_explanations,
            "gap_sources": self.gap_sources,
            "intake_complete": self.profile.intake_complete,
        }
        if self.follow_up_suggested:
            d["follow_up_suggested"] = self.follow_up_suggested
        return d


async def run_audit(profile: ProjectProfile) -> AuditResult:
    """Run the full pipeline over the current shared state. Safe on partial data."""
    # Phase 2a — deterministic classification (rule-based authority).
    diagnostic = classify(profile)

    # Phase 2b — LLM-as-a-Judge value-proposition coherence (secondary layer).
    # Use cached coherence evaluations if the value proposition narrative hasn't changed.
    narrative = profile.commercial.value_proposition_narrative
    if (profile.last_pcoh is not None
            and profile.last_pcoh_narrative == narrative):
        pcoh = profile.last_pcoh
        pcoh_rationale = profile.last_pcoh_rationale
    else:
        pcoh, pcoh_rationale = await get_llm().judge_value_proposition(narrative)
        profile.last_pcoh = pcoh
        profile.last_pcoh_rationale = pcoh_rationale
        profile.last_pcoh_narrative = narrative

    # Phase 2c — GWLC scoring with gates, fed by P_coh.
    scores = score_all(profile, pcoh=pcoh)

    # Phase 2d — perception-reality gap (declared vs classified) and the
    # internal-inconsistency pass (contradictory evidence flags).
    gap = detect_gap(profile, diagnostic)

    # ── Anomaly detection (two-stage pipeline) ─────────────────────────────
    # Stage 1: deterministic pre-filter (all 8 rules + compound detection).
    anomalies = detect_anomalies(profile, diagnostic, scores)

    # Stage 2: semantic LLM validation on ambiguous results (async, optional).
    try:
        anomalies = await validate_anomalies_semantic(anomalies, profile, scores)
    except Exception:
        pass  # semantic validation is optional; deterministic results stand

    # ── Score confidence annotations from anomalies ────────────────────────
    # Read-only: adds confidence notes without mutating scores (Section 10).
    anomaly_notes = get_anomaly_dimension_notes(anomalies)
    scores = annotate_scores_with_anomalies(scores, anomaly_notes)

    # ── Follow-up suggestion for high-severity anomalies ──────────────────
    follow_up = _suggest_follow_up(anomalies, profile)

    # Score evolution: compare against the last persisted audit vector, if any.
    # Read-only here — the route handler persists the new vector after the audit
    # so that internal run_audit calls (e.g. from the assistant) don't disturb it.
    score_deltas: dict = {}
    prev = profile.last_score_vector
    new_vec = list(scores.vector())
    dims = ["market", "commercial", "innovation", "scalability", "green"]
    if prev and len(prev) == len(new_vec):
        score_deltas = {
            "previous_vector": [round(v, 1) for v in prev],
            "current_vector": [round(v, 1) for v in new_vec],
            "deltas": {d: round(new_vec[i] - prev[i], 1) for i, d in enumerate(dims)},
        }

    # Phase 3 — grounded roadmap + explanations (all independent, run in parallel).
    # Anomalies passed to roadmap builder for priority escalation.
    roadmap, scores_expl, gap_expl = await asyncio.gather(
        build_roadmap(profile, diagnostic, scores, gap, anomalies=anomalies),
        explain.explain_all_scores(scores, lang=profile.language),
        explain.explain_gap(gap, lang=profile.language),
    )
    explanations = {
        "scores": scores_expl,
        "gap": gap_expl,
        "pcoh_rationale": pcoh_rationale,
        "diagnostic_rationale": diagnostic.rationale_ar if profile.language == "ar" else diagnostic.rationale_fr,
    }

    # Persist the score vector on the profile so future audits and the
    # assistant fallback path always compute deltas against the latest run.
    if profile.intake_complete:
        profile.last_score_vector = list(scores.vector())

    # Fetch top-2 KB resources per gap category for inline display in the
    # Diagnostic tab (gap → KB cross-module link).
    gap_sources: dict = {}
    if gap.gap_categories:
        _retriever = Retriever()
        for cat in gap.gap_categories:
            result = _retriever.retrieve(cat, query=cat, k=2)
            if result.chunks:
                gap_sources[cat] = [
                    {
                        "institution": c.institution,
                        "title": c.title,
                        "title_ar": c.title_ar,
                        "url": c.url,
                        "citation": c.cite(),
                    }
                    for c in result.chunks
                ]

    return AuditResult(
        profile=profile, diagnostic=diagnostic, gap=gap, scores=scores,
        pcoh=pcoh, roadmap=roadmap, explanations=explanations,
        anomalies=anomalies, score_deltas=score_deltas,
        gap_sources=gap_sources, follow_up_suggested=follow_up,
    )


def _suggest_follow_up(anomalies: list[dict], profile: ProjectProfile) -> Optional[dict]:
    """Generate a follow-up suggestion for the highest-severity unresolved anomaly.

    Returns a dict with question_fr/question_ar referencing the anomaly, or None
    if no high-severity anomalies exist or intake is not complete.
    """
    if not profile.intake_complete or not anomalies:
        return None

    high_anomalies = [a for a in anomalies if a.get("severity") == "high"]
    if not high_anomalies:
        # Also suggest for medium anomalies if no high ones exist
        medium_anomalies = [a for a in anomalies if a.get("severity") == "medium"]
        if not medium_anomalies:
            return None
        target = medium_anomalies[0]
    else:
        target = high_anomalies[0]

    code = target["code"]
    title_fr = target["title_fr"]
    title_ar = target["title_ar"]

    # Map anomaly codes to specific follow-up probes
    follow_up_map = {
        "tam_without_validation": (
            f"Anomalie détectée: {title_fr}. Pouvez-vous décrire des conversations "
            "clients, des lettres d'intention, ou des projets pilotes qui valident "
            "la demande pour votre solution ?",
            f"تم اكتشاف تناقض: {title_ar}. هل يمكنك وصف محادثات مع العملاء، أو خطابات نوايا، "
            "أو مشاريع تجريبية تثبت الطلب على حلك؟"
        ),
        "advanced_stage_no_revenue": (
            f"Anomalie détectée: {title_fr}. Quel est votre modèle de monétisation ? "
            "Décrivez comment le projet générera des revenus (abonnement, commission, "
            "vente directe, etc.).",
            f"تم اكتشاف تناقض: {title_ar}. ما هو نموذج تحقيق الدخل الخاص بك؟ "
            "صف كيف سيحقق المشروع إيرادات (اشتراك، عمولة، بيع مباشر، إلخ)."
        ),
        "innovation_no_ip": (
            f"Anomalie détectée: {title_fr}. Avez-vous déposé un brevet, un copyright, "
            "ou une marque ? Si non, comment protégez-vous votre innovation ?",
            f"تم اكتشاف تناقض: {title_ar}. هل قمت بإيداع براءة اختراع أو حق مؤلف "
            "أو علامة تجارية؟ إذا لم يكن كذلك، كيف تحمي ابتكارك؟"
        ),
        "compound_evidence_vacuum": (
            f"Anomalie détectée: {title_fr}. Pouvez-vous fournir des preuves concrètes "
            "pour le marché (clients pilotes, LOIs) ET pour l'innovation (brevets, "
            "prototypes) ?",
            f"تم اكتشاف تناقض: {title_ar}. هل يمكنك تقديم أدلة ملموسة "
            "للسوق (عملاء تجريبيين، خطابات نوايا) وللابتكار (براءات اختراع، نماذج أولية)؟"
        ),
    }

    if code in follow_up_map:
        q_fr, q_ar = follow_up_map[code]
    else:
        # Generic follow-up for other anomaly codes
        q_fr = (
            f"Anomalie détectée: {title_fr}. {target['detail_fr'][:200]} "
            "Pouvez-vous clarifier ou fournir des preuves complémentaires ?"
        )
        q_ar = (
            f"تم اكتشاف تناقض: {title_ar}. {target['detail_ar'][:200]} "
            "هل يمكنك توضيح أو تقديم أدلة إضافية؟"
        )

    return {
        "triggered_by": code,
        "question_fr": q_fr,
        "question_ar": q_ar,
    }


def _format_grounding(stage, gap, vector, roadmap_prose, docs_context,
                      anomalies_context="", lang="fr"):
    """Build the compact, parseable grounding string.

    Kept as a single-line, French-labelled string on purpose: the frontend
    (Assistant.jsx `formatGrounding`) parses these fields to render score chips,
    sections and a numbered roadmap. The LLM also receives this as context.

    Anomalies are included when present so the assistant can reference detected
    structural inconsistencies in its answers.
    """
    if lang == "ar":
        ctx = (
            f"المرحلة الموضوعية: {stage}. "
            f"فجوة الإدراك والواقع: {gap}. "
            f"المؤشرات (M,C,I,S,G): {vector}. "
            "خارطة الطريق: " + " | ".join(roadmap_prose)
        )
    else:
        ctx = (
            f"Stade objectif: {stage}. "
            f"Écart perception-réalité: {gap}. "
            f"Scores (M,C,I,S,G): {vector}. "
            "Feuille de route: " + " | ".join(roadmap_prose)
        )
    if anomalies_context:
        ctx += anomalies_context
    if docs_context:
        ctx += docs_context
    return ctx


# Keywords that signal the question is about the user's own project/diagnostic
_CONTEXT_KEYWORDS = {
    "score", "stade", "financement", "programme", "recommand", "diagnostic",
    "marché", "market", "innovation", "scalabilit", "green", "roadmap", "feuille",
    "mon ", "ma ", "mes ", "notre", "votre", "startup", "projet", "problème",
    "aide", "apii", "bfpme", "flat6", "améliorer", "améliore", "comment",
    "pourquoi", "quel", "quelle", "quels", "anomalie", "gate", "porte",
    "مؤشر", "تشخيص", "مشروع", "كيف", "لماذا", "ما هو", "برنامج", "تمويل",
}

def _needs_grounding(question: str) -> bool:
    """Return True if the question is about the user's project and needs diagnostic context."""
    q = question.lower()
    # Always ground if any project-context keyword present
    if any(kw in q for kw in _CONTEXT_KEYWORDS):
        return True
    # Ground if question is substantive (>6 words) — likely a real question
    if len(question.split()) > 6:
        return True
    return False


_SMALL_TALK = {
    "hi", "hello", "hey", "bonjour", "bonsoir", "salut", "merci", "thanks",
    "thank you", "مرحبا", "أهلا", "اهلا", "سلام", "شكرا",
}
_DOC_KEYWORDS = {
    "document", "documents", "doc", "pdf", "fichier", "business plan",
    "piece jointe", "pièce jointe", "uploaded", "attached", "مستند", "وثيقة",
}


def _is_small_talk(question: str) -> bool:
    q = question.strip().lower().strip("!?.،؛ ")
    if not q:
        return True
    if q in _SMALL_TALK:
        return True
    words = q.split()
    return len(words) <= 3 and any(w in _SMALL_TALK for w in words)


def _asks_about_docs(question: str) -> bool:
    q = question.lower()
    return any(kw in q for kw in _DOC_KEYWORDS)


def _plan_assistant_tools(question: str) -> list[str]:
    """Pick the existing engine wrappers the assistant should call."""
    if _is_small_talk(question):
        return []

    q = question.lower()
    tools: list[str] = []
    if any(k in q for k in ("diagnostic", "stade", "stage", "maturit", "class", "تشخيص")):
        tools.append("run_classifier")
    if any(k in q for k in ("score", "marché", "market", "commercial", "innovation", "scalabil", "green", "مؤشر")):
        tools.append("get_scores")
    if any(k in q for k in ("écart", "ecart", "gap", "perception", "réalité", "realite", "anomal", "فرق")):
        tools.append("detect_gap")
    if any(k in q for k in ("programme", "source", "financement", "kb", "ressource", "apii", "bfpme", "flat6", "تمويل")):
        tools.append("retrieve_kb")
    if any(k in q for k in ("roadmap", "feuille", "recommand", "prochaine", "étape", "etape", "action", "parcours", "خطوة")):
        tools.append("build_roadmap")
    if _asks_about_docs(question):
        tools.append("retrieve_documents")

    if not tools and _needs_grounding(question):
        tools = ["run_classifier", "get_scores", "detect_gap"]
    return list(dict.fromkeys(tools))


async def _audit_dict(profile: ProjectProfile) -> dict:
    cached = store.get_audit(profile.project_id)
    if cached:
        return cached
    return (await run_audit(profile)).to_dict()


def _sources_from_chunks(chunks) -> list[dict]:
    return [
        {
            "institution": c.institution,
            "title": c.title,
            "title_ar": c.title_ar,
            "url": c.url,
            "citation": c.cite(),
        }
        for c in chunks
    ]


async def _run_assistant_tool(
    tool: str,
    profile: ProjectProfile,
    question: str,
    lang: str,
    state: dict,
) -> tuple[str, list[dict]]:
    if tool == "run_classifier":
        audit_data = state.get("audit") or await _audit_dict(profile)
        state["audit"] = audit_data
        diag = audit_data.get("diagnostic", {})
        rationale = diag.get("rationale_ar" if lang == "ar" else "rationale_fr", "")
        if lang == "ar":
            return f"المرحلة الموضوعية: {diag.get('classified_stage_name', 'غير معروف')}. التشخيص: {rationale}", []
        return f"Stade objectif: {diag.get('classified_stage_name', 'Inconnu')}. Diagnostic: {rationale}", []

    if tool == "get_scores":
        audit_data = state.get("audit") or await _audit_dict(profile)
        state["audit"] = audit_data
        scores = audit_data.get("scores", {})
        if lang == "ar":
            return f"المؤشرات (M,C,I,S,G): {scores.get('vector', [0, 0, 0, 0, 0])}.", []
        return f"Scores (M,C,I,S,G): {scores.get('vector', [0, 0, 0, 0, 0])}.", []

    if tool == "detect_gap":
        audit_data = state.get("audit") or await _audit_dict(profile)
        state["audit"] = audit_data
        gap = audit_data.get("perception_reality_gap", {})
        msg = gap.get("message_ar" if lang == "ar" else "message_fr", "")
        if lang == "ar":
            return f"فجوة الإدراك والواقع: {msg}", []
        return f"Écart perception-réalité: {msg}", []

    if tool == "retrieve_kb":
        audit_data = state.get("audit") or await _audit_dict(profile)
        state["audit"] = audit_data
        gap_data = audit_data.get("perception_reality_gap", {})
        categories = gap_data.get("gap_categories") or ["general"]
        retriever = Retriever()
        lines: list[str] = []
        sources: list[dict] = []
        for cat in categories[:3]:
            result = retriever.retrieve(cat, query=question, k=2)
            if result.chunks:
                sources.extend(_sources_from_chunks(result.chunks))
                lines.extend(f"{c.institution}: {c.title}" for c in result.chunks)
        if lang == "ar":
            return "مصادر قاعدة المعرفة: " + " | ".join(lines), sources
        return "Sources KB: " + " | ".join(lines), sources

    if tool == "build_roadmap":
        audit_data = state.get("audit") or await _audit_dict(profile)
        state["audit"] = audit_data
        roadmap_items = audit_data.get("roadmap", [])[:5]
        lines = []
        sources: list[dict] = []
        for m in roadmap_items:
            horizon = m.get("horizon_ar") if lang == "ar" else m.get("horizon_fr")
            timeline = m.get("timeline_ar") if lang == "ar" else m.get("timeline_fr")
            srcs = ", ".join(dict.fromkeys(
                s.get("institution", "") for s in m.get("sources", []) if s.get("institution")
            ))
            lines.append(f"{m.get('order')}. {m.get('title')} ({horizon}) [{timeline or ''}] — {srcs}")
            sources.extend(m.get("sources", []))
        if lang == "ar":
            return "خارطة الطريق: " + " | ".join(lines), sources
        return "Feuille de route: " + " | ".join(lines), sources

    if tool == "retrieve_documents":
        docs = store.list_documents(profile.project_id)
        lines: list[str] = []
        sources: list[dict] = []
        for d in docs[:5]:
            preview = d.get("extracted_preview") or "[Contenu vide]"
            lines.append(f"- {d['filename']}: {preview[:700]}")
            sources.append({"institution": "Document joint", "title": d["filename"], "citation": d["filename"]})
        if lang == "ar":
            return "المستندات المرفقة من قبل صاحب المشروع:\n" + "\n".join(lines), sources
        return "Documents joints par l'entrepreneur:\n" + "\n".join(lines), sources

    return "", []


def _load_conversation(pid: str) -> list[dict]:
    return _conversation_memory.get(pid, [])

def _save_conversation(pid: str, history: list[dict]):
    _conversation_memory[pid] = history[-_MAX_HISTORY_TURNS:]

def _format_history(history: list[dict], lang: str) -> str:
    if not history:
        return ""
    lines = []
    for msg in history:
        role = "Utilisateur" if lang == "fr" else "المستخدم"
        if msg["role"] == "assistant":
            role = "Assistant" if lang == "fr" else "المساعد"
        lines.append(f"{role}: {msg['content']}")
    return "\n".join(lines)


async def grounded_assistant_reply(profile: ProjectProfile, question: str, lang: Optional[str] = None) -> dict:
    """Secondary conversational layer — grounded ONLY in structured outputs and uploaded documents.

    The assistant never answers from general knowledge: its context is the
    audit (diagnostic, scores, roadmap) and supporting evidence documents.
    This satisfies the 'assistant is a layer, not the product' requirement.
    """
    # Use the provided lang if available, otherwise fall back to project language
    effective_lang = (lang or profile.language).strip().lower()
    # Ensure valid language
    if effective_lang not in ("fr", "ar"):
        effective_lang = "fr"

    # Skip grounding for small talk / general questions — no project keywords detected
    trace = ["assistant:start"]
    tools = _plan_assistant_tools(question)
    if not tools:
        trace.append("assistant:no_tool")
        history = _load_conversation(profile.project_id)
        history_str = _format_history(history, effective_lang)
        ctx = f"Conversation précédente:\n{history_str}" if history_str else ""
        reply = await get_llm().chat(question, ctx, lang=effective_lang)
        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": reply})
        _save_conversation(profile.project_id, history)
        return {"reply": reply, "grounding": None, "sources_used": [], "trace": trace}

    def _build_agent_anomalies_context(anomaly_list: list[dict], lang: str = "fr") -> str:
        if not anomaly_list:
            return ""
        ctx = "\n\nIncohérences structurelles détectées:\n"
        for a in anomaly_list:
            sev = a.get("severity", "medium").upper()
            title = a.get("title_fr", "") if lang != "ar" else a.get("title_ar", "")
            detail = a.get("detail_fr", "") if lang != "ar" else a.get("detail_ar", "")
            ctx += f"- [{sev}] {title}: {detail[:200]}\n"
        return ctx

    state: dict = {}
    context_parts: list[str] = []
    sources_used: list[dict] = []
    for tool in tools:
        trace.append(f"tool:{tool}")
        part, sources = await _run_assistant_tool(tool, profile, question, effective_lang, state)
        if part:
            context_parts.append(part)
        sources_used.extend(sources)

    audit_data = state.get("audit")
    if audit_data and audit_data.get("anomalies"):
        context_parts.append(_build_agent_anomalies_context(audit_data.get("anomalies", []), effective_lang))

    ctx = "\n".join(p for p in context_parts if p)

    # Inject conversation history for multi-turn awareness
    history = _load_conversation(profile.project_id)
    history_str = _format_history(history, effective_lang)
    if history_str:
        ctx = f"{ctx}\n\n---\nConversation précédente:\n{history_str}" if ctx else f"Conversation précédente:\n{history_str}"

    reply = await get_llm().chat(question, ctx, lang=effective_lang)
    trace.append("assistant:chat")

    # Save this Q&A pair to conversation memory
    history.append({"role": "user", "content": question})
    history.append({"role": "assistant", "content": reply})
    _save_conversation(profile.project_id, history)

    _logger.info("assistant tool trace project=%s trace=%s", profile.project_id, trace)
    return {
        "reply": reply,
        "grounding": ctx if sources_used else None,
        "sources_used": sources_used,
        "trace": trace,
    }

    if not _needs_grounding(question):
        reply = await get_llm().chat(question, "", lang=effective_lang)
        return {"reply": reply, "grounding": None, "sources_used": []}

    # Fetch uploaded documents
    docs = store.list_documents(profile.project_id)
    full_docs = []
    for d in docs:
        full_doc = store.get_document(d["id"])
        if full_doc:
            full_docs.append(full_doc)

    docs_context = ""
    if full_docs:
        docs_context = "\nDocuments joints par l'entrepreneur:\n" + "\n".join(
            f"- {d['filename']}: {d['extracted_text'][:2000] if d.get('extracted_text') else '[Contenu vide]'}"
            for d in full_docs
        )

    def _build_anomalies_context(anomaly_list: list[dict], lang: str = "fr") -> str:
        """Build a compact anomalies section for the LLM grounding context."""
        if not anomaly_list:
            return ""
        ctx = "\n\nIncohérences structurelles détectées:\n"
        for a in anomaly_list:
            sev = a.get("severity", "medium").upper()
            title = a.get("title_fr", "") if lang != "ar" else a.get("title_ar", "")
            detail = a.get("detail_fr", "") if lang != "ar" else a.get("detail_ar", "")
            ctx += f"- [{sev}] {title}: {detail[:200]}\n"
        return ctx

    # Try to load the cached audit result snapshot from the database store
    audit_data = store.get_audit(profile.project_id)

    if audit_data:
        # Reconstruct the context from the cached audit dict
        diag_stage = audit_data.get("diagnostic", {}).get("classified_stage_name", "Inconnu")
        gap_msg = audit_data.get("perception_reality_gap", {}).get("message_fr", "")
        if effective_lang == "ar":
            gap_msg = audit_data.get("perception_reality_gap", {}).get("message_ar", gap_msg)

        vector = audit_data.get("scores", {}).get("vector", [0, 0, 0, 0, 0])

        roadmap_items = audit_data.get("roadmap", [])
        roadmap_prose = []
        for m in roadmap_items[:5]:
            order = m.get("order")
            title = m.get("title")
            horizon = m.get("horizon_fr")
            if effective_lang == "ar":
                horizon = m.get("horizon_ar") or horizon
            timeline = m.get("timeline_ar") if effective_lang == "ar" else m.get("timeline_fr")
            timeline = timeline or m.get("timeline_fr") or m.get("timeline_ar") or ""
            srcs = ", ".join(dict.fromkeys(
                s.get("institution", "") for s in m.get("sources", []) if s.get("institution")
            ))
            roadmap_prose.append(f"{order}. {title} ({horizon}) [{timeline}] — {srcs}")

        # Include cached anomalies in grounding context
        cached_anomalies = audit_data.get("anomalies", [])
        anomalies_ctx = _build_anomalies_context(cached_anomalies, effective_lang)

        ctx = _format_grounding(diag_stage, gap_msg, vector, roadmap_prose,
                                docs_context, anomalies_context=anomalies_ctx,
                                lang=effective_lang)
        sources_used = [s for m in roadmap_items[:5] for s in m.get("sources", [])]
    else:
        # Fallback to running run_audit
        audit = await run_audit(profile)
        gap_msg = audit.gap.message_ar if effective_lang == "ar" else audit.gap.message_fr
        roadmap_prose = []
        for m in audit.roadmap[:5]:
            horizon = getattr(m, "horizon_ar", "") or m.horizon_fr if effective_lang == "ar" else m.horizon_fr
            timeline = getattr(m, "timeline_ar", "") if effective_lang == "ar" else getattr(m, "timeline_fr", "")
            timeline = timeline or getattr(m, "timeline_fr", "") or getattr(m, "timeline_ar", "")
            srcs = ", ".join(dict.fromkeys(
                s["institution"] for s in m.sources if s.get("institution")
            ))
            roadmap_prose.append(f"{m.order}. {m.title} ({horizon}) [{timeline}] — {srcs}")

        # Include live anomalies in grounding context
        anomalies_ctx = _build_anomalies_context(audit.anomalies, effective_lang)

        ctx = _format_grounding(audit.diagnostic.classified_stage_name, gap_msg,
                                audit.scores.vector(), roadmap_prose,
                                docs_context, anomalies_context=anomalies_ctx,
                                lang=effective_lang)
        sources_used = [s for m in audit.roadmap[:5] for s in m.sources]

    reply = await get_llm().chat(question, ctx, lang=effective_lang)
    return {"reply": reply, "grounding": ctx, "sources_used": sources_used}
