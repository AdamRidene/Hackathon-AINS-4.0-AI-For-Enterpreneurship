"""Verifies the GWLC engine against the Firasa concept worked example (Sec 6.6).

Agri-tech venture:
  T=4e6, C=6, Ve=1, Pcoh=72, Rmvp=0.75 (Prototype), Aprice=65,
  Ngeo=80 (Tunisian First-Mover), |Tstack|=4, Pip=40 (Copyright),
  Dman=8, Cup=45000, Cmonth=15000, |Ezones|=1,
  Wops=70 (Agri Waste), Cenv=1, |Nsdg|=5.

Concept note reports S = (79.8, 71.1, 68.0, 29.2, 69.8).

Two scores deliberately deviate from the note (both documented in
SCORING_METHODOLOGY.md), because the rubric requires every score to decompose
into >=3 visible sub-dimensions and because the note's Scalability formula
rewards the wrong direction:

  * Market (S_M): a 3rd sub-dimension (revenue-model viability, weight 0.30)
    joins TAM (0.40) and competition (0.30). The agri-tech venture declares no
    revenue model, so S_M = 58.7 here. (Aside: even the note's two-term value
    79.8 was itself inconsistent with its own Eq. 1, which yields 84.6.)
  * Scalability (S_S): the decoupling term is rewritten so LOW operating cost
    scores HIGH (marginal-cost decoupling), and a 3rd sub-dimension
    (frictionless deployment = inverse human dependency) is added. S_S base =
    26.0, gated to 13.0.

Commercial (71.1), Innovation (68.0) and Green (69.8) reproduce the note
exactly and are asserted unchanged.
"""
import math
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.schema import (  # noqa: E402
    ProjectProfile, MarketMetrics, CommercialOffer, InnovationScope,
    ScalabilityIndex, GreenMatrices, MVPStage, GeoNovelty, IPStatus,
    FootprintCategory, PricingFramework,
)
from app.scoring.gwlc import score_all  # noqa: E402


def _agritech() -> ProjectProfile:
    return ProjectProfile(
        name="AgriTech Demo",
        market=MarketMetrics(estimated_tam_tnd=4_000_000, competitor_headcount=6,
                             customer_validation_evidence=True),
        commercial=CommercialOffer(mvp_stage=MVPStage.PROTOTYPE, pricing_coherence=65,
                                   pricing_framework=PricingFramework.TRANSACTIONAL),
        innovation=InnovationScope(geo_novelty=GeoNovelty.TUNISIAN_FIRST_MOVER,
                                   tech_stack=["iot", "ml", "mobile", "cloud"],
                                   ip_status=IPStatus.COPYRIGHT),
        scalability=ScalabilityIndex(human_dependency=8, equipment_cost=45_000,
                                     monthly_overhead=15_000, cross_border_zones=["DZ"]),
        green=GreenMatrices(footprint_category=FootprintCategory.AGRI_WASTE,
                            circular_recycling=True, sdg_targets=[2, 8, 9, 12, 13]),
    )


def test_commercial_matches_note():
    s = score_all(_agritech(), pcoh=72)
    assert round(s.commercial.final_score, 1) == 71.1


def test_innovation_matches_note():
    s = score_all(_agritech(), pcoh=72)
    assert round(s.innovation.final_score, 1) == 68.0


def test_scalability_three_subdims_and_gate():
    """S_S rewritten (see SCORING_METHODOLOGY.md): low operating cost => high
    decoupling, plus a 3rd sub-dimension (frictionless deployment = inverse of
    human dependency). Agri-tech: C_month 15k vs 20k baseline -> decoupling 25;
    1 zone -> reach 33.3; D_man 8 -> deployment 20. Base = 0.40*25 + 0.30*33.3 +
    0.30*20 = 26.0. Gate (D_man>7) halves it -> 13.0."""
    s = score_all(_agritech(), pcoh=72)
    assert len(s.scalability.contributions) == 3
    assert {c.criterion for c in s.scalability.contributions} == {
        "cost_decoupling", "geo_reach", "deployment"}
    assert round(s.scalabi