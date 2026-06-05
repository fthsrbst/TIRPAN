"""One-off: recompute cost_usd for llm_usage rows recorded with cost_usd=0.

Older rows were stored before the model's price was known (the model id wasn't in
the price table), so their cost is 0 even though tokens were tracked. This walks
those rows, prices each distinct (provider, model) via core.pricing (which now
pulls live OpenRouter prices), and updates the cost_usd in place.

Re-runnable: only touches rows where cost_usd = 0 and prompt+completion > 0, and
overwrites (never increments) cost_usd, so re-running is safe. Note: a row whose
true cost rounds to $0.000000 (sub-micro-dollar, ~a single low-priced token) stays
at 0 and is indistinguishable from an unpriced row, so it will be re-selected on
every run — harmless, but the reported "Backfilled N rows" count includes them.

    python -m scripts.backfill_llm_costs            # apply
    python -m scripts.backfill_llm_costs --dry-run  # preview only
"""

from __future__ import annotations

import asyncio
import sys

from core import pricing
from database.db import DB_PATH
from database.sqlite_conn import connect as connect_db


async def main(dry_run: bool = False) -> None:
    async with connect_db(DB_PATH) as db:
        async with db.execute(
            """SELECT provider, model,
                      COUNT(*)               AS n,
                      SUM(prompt_tokens)     AS pin,
                      SUM(completion_tokens) AS pout
               FROM llm_usage
               WHERE cost_usd = 0 AND (prompt_tokens + completion_tokens) > 0
               GROUP BY provider, model"""
        ) as cur:
            groups = [tuple(r) for r in await cur.fetchall()]

        if not groups:
            print("Nothing to backfill — no zero-cost rows with tokens.")
            return

        total_rows = 0
        total_cost = 0.0
        for provider, model, n, pin, pout in groups:
            # Per-1M unit price for this model (0 for local/unknown models).
            unit = await pricing.price_for(provider, model, 1_000_000, 0)
            unit_out = await pricing.price_for(provider, model, 0, 1_000_000)
            grp_cost = (pin / 1_000_000) * unit + (pout / 1_000_000) * unit_out
            print(
                f"{provider}/{model}: {n} rows, "
                f"in={pin} out={pout} → ${grp_cost:.4f} "
                f"(in ${unit:.3f}/1M, out ${unit_out:.3f}/1M)"
            )
            total_rows += n
            total_cost += grp_cost

            if unit == 0 and unit_out == 0:
                print(f"  ↳ skipped (no price for {model})")
                continue

            if not dry_run:
                # Recompute per row so each row's exact token split is priced.
                await db.execute(
                    """UPDATE llm_usage
                       SET cost_usd = ROUND(
                             (prompt_tokens / 1000000.0) * ?
                           + (completion_tokens / 1000000.0) * ?, 6)
                       WHERE provider = ? AND model = ?
                         AND cost_usd = 0 AND (prompt_tokens + completion_tokens) > 0""",
                    (unit, unit_out, provider, model),
                )

        if not dry_run:
            await db.commit()
            print(f"\n✅ Backfilled {total_rows} rows, total ≈ ${total_cost:.4f}")
        else:
            print(f"\n(dry-run) Would backfill {total_rows} rows, total ≈ ${total_cost:.4f}")


if __name__ == "__main__":
    asyncio.run(main(dry_run="--dry-run" in sys.argv))
