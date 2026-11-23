"""Feature and label definitions. Must match NEED_FEATURES / NEED_LEVELS in packages/shared/src/assessment.ts."""

FEATURES = [
    "annual_family_income",
    "income_per_member",
    "family_members",
    "earning_members",
    "dependents_studying",
    "total_expenses",
    "existing_aid",
    "requested_amount",
    "uncovered_cost_ratio",
    "circumstance_count",
    "orphan",
    "single_parent",
    "first_generation",
    "disability_in_family",
    "major_medical_expenses",
    "loss_of_income",
]

LABELS = ["HIGH", "MEDIUM", "LOW"]

MIN_SAMPLES = 30
MIN_PER_CLASS = 5
