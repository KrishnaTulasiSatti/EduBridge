"""Synthetic demonstration data.

Used only to demonstrate and test the training pipeline. A model trained on this data is always labelled
SYNTHETIC_DEMO, and EduBridge marks its predictions as demonstration output, never as a genuine assessment.
The labels come from a hidden scoring process with random noise that is deliberately different from
EduBridge's rule-based score, so the model is not simply relearning those rules.
"""

from __future__ import annotations

import numpy as np

from .features import LABELS


def generate(n: int = 600, seed: int = 42) -> list[dict]:
    rng = np.random.default_rng(seed)
    rows, latent = [], []
    for _ in range(n):
        members = int(rng.integers(2, 9))
        earning = 0 if rng.random() < 0.04 else int(rng.integers(1, min(3, members) + 1))
        income = float(np.clip(rng.lognormal(np.log(150_000), 0.65) * (0.7 + 0.3 * max(earning, 1)), 15_000, 2_000_000))
        studying = int(rng.integers(1, min(members, 4) + 1))
        tuition = float(np.clip(rng.lognormal(np.log(55_000), 0.55), 5_000, 400_000))
        hostel = 0.0 if rng.random() < 0.45 else float(rng.uniform(20_000, 70_000))
        expenses = round(tuition + hostel + rng.uniform(3_000, 15_000))
        aid = 0.0 if rng.random() < 0.55 else round(float(rng.uniform(0, 0.6)) * expenses)
        requested = max(1_000, round((expenses - aid) * float(rng.uniform(0.5, 1.0))))
        flags = {
            "orphan": int(rng.random() < 0.05),
            "single_parent": int(rng.random() < 0.12),
            "first_generation": int(rng.random() < 0.35),
            "disability_in_family": int(rng.random() < 0.06),
            "major_medical_expenses": int(rng.random() < 0.08),
            "loss_of_income": int(rng.random() < 0.07),
        }
        per_member = income / members
        uncovered = max(0.0, expenses - aid)
        features = {
            "annual_family_income": round(income),
            "income_per_member": round(per_member),
            "family_members": members,
            "earning_members": earning,
            "dependents_studying": studying,
            "total_expenses": expenses,
            "existing_aid": aid,
            "requested_amount": requested,
            "uncovered_cost_ratio": round(uncovered / max(income, 1), 2),
            "circumstance_count": sum(flags.values()),
            **flags,
        }
        score = (
            -1.5 * np.log(per_member / 40_000)
            + 1.1 * min(uncovered / income, 2.0)
            + 0.8 * (members - earning) / members
            + 0.15 * (studying - 1)
            + 0.9 * flags["orphan"]
            + 0.5 * flags["single_parent"]
            + 0.5 * flags["disability_in_family"]
            + 0.6 * flags["major_medical_expenses"]
            + 0.6 * flags["loss_of_income"]
            + 0.25 * flags["first_generation"]
            + rng.normal(0, 0.45)
        )
        gender = str(rng.choice(["Female", "Male", "Not stated"], p=[0.47, 0.49, 0.04]))
        rows.append({"features": features, "group": gender})
        latent.append(score)

    # Top 35% high need, next 40% medium, bottom 25% low.
    hi, mid = np.quantile(latent, [0.65, 0.25])
    for row, s in zip(rows, latent):
        row["label"] = LABELS[0] if s >= hi else LABELS[1] if s >= mid else LABELS[2]
    return rows
