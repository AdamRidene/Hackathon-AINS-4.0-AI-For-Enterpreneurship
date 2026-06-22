"""Shared Project Profile state.

This module is the single source of truth for the venture state that every
module (intake, diagnostic, scoring, RAG) reads from and writes to. It encodes
the mandated technical data ingestion schema (Firasa concept, Table 2) as typed
tokens. The typing is what makes downstream scoring auditable: a missing Boolean
flag is not a soft penalty, it is a hard gate trigger.

Design principle: every field is Optional so the system handles missing, dirty
or incomplete data without crashing (NFR: Reliability). Completeness is tracked
explicitly via `evidence_tokens` and `missing_fields` rather than by assuming
presence.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


# --------------------------------------------------------------------------- #
# Controlled vocabularies (ENUM codes from Table 2 of the Firasa concept)      #
# --------------------------------------------------------------------------- #
class MaturityStage(int, Enum):
    IDEATION = 1
    MARKET_VALIDATION = 2
    STRUCTURATION = 3
    FUNDRAISING = 4
    LAUNCH_PLANNING = 5
    GROWTH = 6


class MVPStage(str, Enum):
    CONCEPT = "Concept"
    MOCKUP = "Mockup"
    PROTOTYPE = "Prototype"
    PRODUCTION = "Production"


class PricingFramework(str, Enum):
    FREEMIUM = "Freemium"
    B2B_SAAS = "B2B SaaS"
    TRANSACTIONAL = "Transactional"


class GeoNovelty(str, Enum):
    REPRODUCTION = "Reproduction"
    LOCAL_OPT = "Local-Opt"
    TUNISIAN_FIRST_MOVER = "Tunisian First-Mover"
    GLOBAL = "Global"


class IPStatus(str, Enum):
    NONE = "None"
    COPYRIGHT = "Copyright"
    PATENT_PENDING = "Patent Pending"
    REGISTERED = "Registered"


class FootprintCategory(str, Enum):
    DIGITAL_NATIVE = "Digital Native"
    PAPER_USE = "Paper Use"
    COMPUTE_INTENSIVE = "Compute Intensive"
    AGRI_WASTE = "Agri Waste"


class LegalForm(str, Enum):
    NONE = "None"
    SUARL = "SUARL"
    SARL = "SARL"
    SA = "SA"
    STARTUP_ACT_PRELABEL = "Startup Act Pre-label"
    STARTUP_ACT_LABEL = "Startup Act Label"


class Sector(str, Enum):
    AGRI_FOOD = "agri-food"
    DIGITAL_SAAS = "digital-saas"
    INDUSTRY = "industry"
    HEALTH = "health"
    GREENTECH = "greentech"
    SERVICES = "services"
    OTHER = "other"


# --------------------------------------------------------------------------- #
# Dimension blocks (mirror the five scoring dimensions)                        #
# --------------------------------------------------------------------------- #
class MarketMetrics(BaseModel):
    estimated_tam_tnd: Optional[float] = None          # T
    competitor_headcount: Optional[int] = None         # C
    customer_validation_evidence: Optional[bool] = None  # V_e (Boolean token)


class CommercialOffer(BaseModel):
    value_proposition_narrative: Optional[str] = None   # feeds P_coh (LLM judge)
    mvp_stage: Optional[MVPStage] = None                # R_mvp
    pricing_framework: Optional[PricingFramework] = None  # A_price proxy
    pricing_coherence: Optional[float] = None           # A_price [0,100] if known


class InnovationScope(BaseModel):
    geo_novelty: Optional[GeoNovelty] = None            # N_geo
    tech_stack: list[str] = Field(default_factory=list)  # |T_stack|
    ip_status: Optional[IPStatus] = None                # P_ip

    @model_validator(mode="before")
    @classmethod
    def normalize_lists(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("tech_stack") is None:
                data["tech_stack"] = []
        return data


class ScalabilityIndex(BaseModel):
    human_dependency: Optional[int] = None              # D_man [1,10]
    equipment_cost: Optional[float] = None              # C_up
    monthly_overhead: Optional[float] = None            # C_month
    cross_border_zones: list[str] = Field(default_factory=list)  # |E_zones|

    @model_validator(mode="before")
    @classmethod
    def normalize_lists(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("cross_border_zones") is None:
                data["cross_border_zones"] = []
        return data


class GreenMatrices(BaseModel):
    footprint_category: Optional[FootprintCategory] = None  # W_ops
    circular_recycling: Optional[bool] = None           # C_env
    sdg_targets: list[int] = Field(default_factory=list)  # |N_sdg| (1..17)

    @model_validator(mode="before")
    @classmethod
    def normalize_lists(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("sdg_targets") is None:
                data["sdg_targets"] = []
        return data


# --------------------------------------------------------------------------- #
# Self-assessment (drives perception-reality gap detection)                   #
# --------------------------------------------------------------------------- #
class SelfAssessment(BaseModel):
    declared_stage: Optional[MaturityStage] = None
    declared_revenue: Optional[bool] = None
    declared_legal_form: Optional[LegalForm] = None


# --------------------------------------------------------------------------- #
# The shared state object                                                     #
# --------------------------------------------------------------------------- #
class ProjectProfile(BaseModel):
    """Single shared state read/written by all three modules."""

    project_id: str = Field(default_factory=lambda: uuid4().hex[:12])
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Identity / context
    name: Optional[str] = None
    sector: Optional[Sector] = None
    language: str = "fr"  # fr | ar | en
    owner_user_id: Optional[str] = None

    # Self-assessment (what the founder claims)
    self_assessment: SelfAssessment = Field(default_factory=SelfAssessment)

    # Typed evidence dimensions (what the system can verify)
    market: MarketMetrics = Field(default_factory=MarketMetrics)
    commercial: CommercialOffer = Field(default_factory=CommercialOffer)
    innovation: InnovationScope = Field(default_factory=InnovationScope)
    scalability: ScalabilityIndex = Field(default_factory=ScalabilityIndex)
    green: GreenMatrices = Field(default_factory=GreenMatrices)

    # Verified facts collected by intake (evidence tokens)
    legal_form: Optional[LegalForm] = None
    has_problem_statement: Optional[bool] = None
    user_segment_identified: Optional[bool] = None
    months_unit_economics: Optional[int] = None
    has_revenue_model: Optional[bool] = None
    repeatable_sales: Optional[bool] = None

    # Deep-dive entrepreneurial data (optional, conditional on stage)
    team_size: Optional[int] = None
    monthly_revenue_tnd: Optional[float] = None
    burn_rate_tnd: Optional[float] = None
    runway_months: Optional[int] = None
    user_count: Optional[int] = None
    growth_rate_pct: Optional[float] = None
    cac_tnd: Optional[float] = None
    ltv_tnd: Optional[float] = None
    competitor_names: list[str] = Field(default_factory=list)
    differentiation_narrative: Optional[str] = None
    incorporation_date: Optional[str] = None
    fiscal_regime: Optional[str] = None
    key_hires: list[str] = Field(default_factory=list)
    validation_evidence_narrative: Optional[str] = None

    # Bookkeeping
    answered_questions: list[str] = Field(default_factory=list)
    # Content-aware follow-up probes injected by the LangGraph intake layer.
    # Each entry: {"id", "trigger_qid", "prompt_fr"/"prompt_ar", "answer"}.
    # answer is None while pending; a pending probe blocks intake_complete.
    dynamic_probes: list[dict] = Field(default_factory=list)
    intake_complete: bool = False
    # Score vector (M,C,I,S,G) of the last persisted audit, for score-evolution
    # deltas across successive audits of the same project.
    last_score_vector: Optional[list[float]] = None

    # Cached value-proposition evaluations to prevent redundant LLM-as-a-Judge API calls
    last_pcoh: Optional[float] = None
    last_pcoh_rationale: Optional[str] = None
    last_pcoh_narrative: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_lists(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for f in ("competitor_names", "key_hires", "answered_questions",
                      "dynamic_probes"):
                if data.get(f) is None:
                    data[f] = []
        return data

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc)
