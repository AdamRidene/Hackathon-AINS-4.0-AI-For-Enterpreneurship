"""Three distinct seed ventures demonstrating adaptive branching + gap detection.

Used by the evaluation protocol and the demo. Each profile is engineered to
exercise a different path:

    1. agritech_overclaimer   — declares Growth, evidence says Market Validation
                                                            (SEVERE overestimation -> override + capped scores)
    2. saas_validated         — aligned Fundraising-stage SaaS, clean scores
    3. services_underclaimer  — declares Ideation, evidence justifies Structuration
                                                            (underestimation)
    4. greentech_prelabel     — aligned Launch-Planning greentech, exercises the
                                                            Startup Act pre-label + green scoring path
"""
from __future__ import annotations

from .schema import (
    ProjectProfile, SelfAssessment, MarketMetrics, CommercialOffer,
    InnovationScope, ScalabilityIndex, GreenMatrices, MaturityStage, MVPStage,
    PricingFramework, GeoNovelty, IPStatus, FootprintCategory, LegalForm, Sector,
)


def agritech_overclaimer() -> ProjectProfile:
    return ProjectProfile(
        name="GreenHarvest", sector=Sector.AGRI_FOOD,
        self_assessment=SelfAssessment(declared_stage=MaturityStage.GROWTH,
                                       declared_revenue=True),
        has_problem_statement=True, user_segment_identified=True,
        market=MarketMetrics(estimated_tam_tnd=4_000_000, competitor_headcount=6,
                             customer_validation_evidence=False),  # no validation
        commercial=CommercialOffer(
            value_proposition_narrative="Plateforme pour aider les agriculteurs.",
            mvp_stage=MVPStage.PROTOTYPE, pricing_framework=PricingFramework.TRANSACTIONAL,
            pricing_coherence=65),
        innovation=InnovationScope(geo_novelty=GeoNovelty.TUNISIAN_FIRST_MOVER,
                                   tech_stack=["iot", "ml", "mobile", "cloud"],
                                   ip_status=IPStatus.COPYRIGHT),
        scalability=ScalabilityIndex(human_dependency=8, equipment_cost=45_000,
                                     monthly_overhead=15_000, cross_border_zones=["DZ"]),
        green=GreenMatrices(footprint_category=FootprintCategory.AGRI_WASTE,
                            circular_recycling=True, sdg_targets=[2, 8, 9, 12, 13]),
        legal_form=LegalForm.NONE, has_revenue_model=False, months_unit_economics=0,
        repeatable_sales=False, intake_complete=True,
        answered_questions=["name", "sector", "declared_stage", "problem_statement",
                            "user_segment", "tam", "competitors", "validation"],
    )


def saas_validated() -> ProjectProfile:
    return ProjectProfile(
        name="FlowDesk", sector=Sector.DIGITAL_SAAS,
        self_assessment=SelfAssessment(declared_stage=MaturityStage.FUNDRAISING,
                                       declared_revenue=True),
        has_problem_statement=True, user_segment_identified=True,
        market=MarketMetrics(estimated_tam_tnd=8_000_000, competitor_headcount=3,
                             customer_validation_evidence=True),
        commercial=CommercialOffer(
            value_proposition_narrative=(
                "Notre problème: les PME tunisiennes perdent du temps sur la facturation. "
                "Pour le segment des cabinets comptables, contrairement aux tableurs, notre "
                "solution SaaS automatise via une enquête validée auprès de 40 clients."),
            mvp_stage=MVPStage.PRODUCTION, pricing_framework=PricingFramework.B2B_SAAS,
            pricing_coherence=80),
        innovation=InnovationScope(geo_novelty=GeoNovelty.LOCAL_OPT,
                                   tech_stack=["react", "fastapi", "postgres"],
                                   ip_status=IPStatus.PATENT_PENDING),
        scalability=ScalabilityIndex(human_dependency=3, equipment_cost=10_000,
                                     monthly_overhead=4_000, cross_border_zones=["DZ", "MA", "LY"]),
        green=GreenMatrices(footprint_category=FootprintCategory.DIGITAL_NATIVE,
                            circular_recycling=False, sdg_targets=[8, 9]),
        legal_form=LegalForm.SARL, has_revenue_model=True, months_unit_economics=8,
        repeatable_sales=False, intake_complete=True,
        answered_questions=["name", "sector", "declared_stage", "problem_statement",
                            "user_segment", "tam", "competitors", "validation"],
    )


def services_underclaimer() -> ProjectProfile:
    return ProjectProfile(
        name="MentorLink", sector=Sector.SERVICES,
        self_assessment=SelfAssessment(declared_stage=MaturityStage.IDEATION),
        has_problem_statement=True, user_segment_identified=True,
        market=MarketMetrics(estimated_tam_tnd=1_500_000, competitor_headcount=10,
                             customer_validation_evidence=True),
        commercial=CommercialOffer(
            value_proposition_narrative=(
                "Problème: les jeunes diplômés manquent de mentors. Segment: étudiants. "
                "Validé par enquête terrain."),
            mvp_stage=MVPStage.MOCKUP, pricing_framework=PricingFramework.FREEMIUM,
            pricing_coherence=50),
        innovation=InnovationScope(geo_novelty=GeoNovelty.REPRODUCTION,
                                   tech_stack=["web"], ip_status=IPStatus.NONE),
        scalability=ScalabilityIndex(human_dependency=5, equipment_cost=2_000,
                                     monthly_overhead=3_000, cross_border_zones=[]),
        green=GreenMatrices(footprint_category=FootprintCategory.DIGITAL_NATIVE,
                            circular_recycling=False, sdg_targets=[4, 8]),
        legal_form=LegalForm.SUARL, has_revenue_model=False, months_unit_economics=1,
        repeatable_sales=False