"""Sub-weights for the five composite scores.

Initialised from expert judgement (Firasa concept, Section 6). The calibration
methodology re-fits these against the labelled test set using a constrained
linear regression that preserves the unit-sum constraint (sum w_i = 1) per
score. Keeping the weights in one place makes that re-fit a config change, not
a code change, and keeps the weighting methodology auditable.
"""

WEIGHTS: dict[str, dict[str, float]] = {
    # Market Score S_M  (Eq. 1): TAM (log-normalised) + competitor penalty
    #   + revenue-model viability (3rd sub-dimension, rubric MUST: >=3 visible
    #   sub-criteria). Weights rebalanced to sum 1.0.
    "market": {"tam": 0.40, "competition": 0.30, "revenue_viability": 0.30},
    # Commercial Offer S_C (Eq. 4): VP coherence + MVP readiness + pricing
    "commercial": {"vp_coherence": 0.30, "mvp_readiness": 0.40, "pricing": 0.30},
    # Innovation S_I (Eq. 7): geo novelty + tech-stack depth + IP status
    "innovation": {"geo_novelty": 0.40, "tech_stack": 0.30, "ip_status": 0.30},
    # Scalability S_S (Eq. 8): operating-cost decoupling + cross-border reach
    #   + frictionless deployment (3rd sub-dimension = low human dependency).
    #   Weights rebalanced to sum 1.0. See SCORING_METHODOLOGY.md for the
    #   deliberate deviation from concept-note Eq. 8 (low opex => high scale).
    "scalability": {"cost_decoupling": 0.40, "geo_reach": 0.30, "deployment": 0.30},
    # Green S_G (Eq. 11): footprint + circularity + SDG coverage
    "green": {"footprint": 0.30, "circularity": 0.40, "sdg": 0.30},
}

# Gate thresholds (non-linear overrides applied AFTER the linear base score).
GATES = {
    "market_validation_cap": 30.0,   # Eq. 2: hard cap when V_e = 0
    "scalability_penalty": 0.5,      # Eq. 9: multiplier when D_man > 7
    "human_dependency_threshold": 7,  # Eq. 9
}

# Categorical -> numeric