"""Unit-economics model for a ~US$100 website sale.

Every input is either a SOURCED figure (see docs/COSTS.md for the URL and confidence
grade) or an ASSUMPTION that must be replaced with our own measured data once the
pilot runs. Run:  python -m research.cost_model
"""

from __future__ import annotations

from dataclasses import dataclass

USD_THB = 33.3  # approx. Sep 2026 (grade C) - re-check bot.or.th before quoting customers

# --- Sourced unit prices --------------------------------------------------------
CLAUDE = {  # USD per million tokens (Anthropic API price list, 2026-10)
    "opus-5-5": (4.00, 20.00),
    "sonnet-5-5": (2.00, 10.00),
    "haiku-5-5": (0.10, 0.50),
}
PLACES_TEXT_SEARCH_ENTERPRISE_PER_CALL = 35.00 / 1000  # up to 20 places per call (grade B)
PROMPTPAY_FEE = 0.0165 * 1.07  # Opn/Stripe 1.65% + 7% VAT on the fee (grade B)
CARD_FEE = 0.0365 * 1.07  # Opn domestic card 3.65% + VAT (grade B)
DOMAIN_COM_USD = 11.25  # Vercel registrar API (grade A)
FIXED_MONTHLY_USD = {
    "supabase_pro": 25.00,  # grade A; $10 compute credit covers Small instance
    "vercel_pro_1_seat": 20.00,  # grade B; or Cloudflare Pages free tier
    "line_oa_basic": 1280 * 1.07 / USD_THB,  # grade C (third-party price lists)
}

# --- Assumptions (replace with pilot measurements) ------------------------------
# Token budgets per task are estimates, not measurements.
TASKS = {
    # task: (model, input_tokens, output_tokens)
    "qualify_and_draft_pitch": ("haiku-5-5", 20_000, 2_000),
    "preview_site_from_template": ("haiku-5-5", 40_000, 8_000),
    "full_site_build_after_sale": ("sonnet-5-5", 200_000, 30_000),
    "qa_review_after_sale": ("opus-5-5", 50_000, 5_000),
    "onboarding_chat_after_sale": ("sonnet-5-5", 60_000, 6_000),
}

# Reply-rate anchors: Instantly 2026 avg 3.43%, Belkins 2025 avg 5.8%,
# Instantly top-10% 10.7%. These are English B2B email figures - NOT Thai SMEs.
# Close rate of replies is a pure assumption: no published data found.
SCENARIOS = {
    "pessimistic": {"reply_rate": 0.0343, "close_of_replies": 0.15},
    "base": {"reply_rate": 0.058, "close_of_replies": 0.25},
    "optimistic": {"reply_rate": 0.107, "close_of_replies": 0.35},
}


def task_cost(task: str) -> float:
    model, tin, tout = TASKS[task]
    pin, pout = CLAUDE[model]
    return tin / 1e6 * pin + tout / 1e6 * pout


@dataclass
class Result:
    scenario: str
    prospects_per_sale: float
    acquisition_cost_usd: float
    delivery_cost_usd: float
    payment_fee_usd: float
    total_cost_usd: float
    margin_usd: float


def per_sale(price_usd: float, scenario: str, pay_fee: float = PROMPTPAY_FEE) -> Result:
    s = SCENARIOS[scenario]
    prospects = 1 / (s["reply_rate"] * s["close_of_replies"])
    per_prospect = (
        PLACES_TEXT_SEARCH_ENTERPRISE_PER_CALL / 20
        + task_cost("qualify_and_draft_pitch")
        + task_cost("preview_site_from_template")
    )
    acquisition = prospects * per_prospect
    delivery = (
        task_cost("full_site_build_after_sale")
        + task_cost("qa_review_after_sale")
        + task_cost("onboarding_chat_after_sale")
        + DOMAIN_COM_USD
    )
    fee = price_usd * pay_fee
    total = acquisition + delivery + fee
    return Result(scenario, prospects, acquisition, delivery, fee, total, price_usd - total)


def main() -> None:
    print(f"USD/THB used: {USD_THB}")
    print("\nAI cost per task (USD):")
    for t in TASKS:
        print(f"  {t:32s} {task_cost(t):.4f}")
    fixed = sum(FIXED_MONTHLY_USD.values())
    print(f"\nFixed platform cost per month (USD): {fixed:.2f}")
    for price in (99.0,):
        print(f"\nSetup price US${price:.0f} (~{price * USD_THB:,.0f} THB), paid by PromptPay:")
        print(f"  {'scenario':12s} {'prospects/sale':>14s} {'acquire':>8s} {'deliver':>8s} "
              f"{'fee':>6s} {'total':>7s} {'margin':>7s}")
        for sc in SCENARIOS:
            r = per_sale(price, sc)
            print(f"  {r.scenario:12s} {r.prospects_per_sale:14.0f} {r.acquisition_cost_usd:8.2f} "
                  f"{r.delivery_cost_usd:8.2f} {r.payment_fee_usd:6.2f} {r.total_cost_usd:7.2f} "
                  f"{r.margin_usd:7.2f}")
        base = per_sale(price, "base")
        print(f"  Sales/month to cover fixed costs (base): {fixed / base.margin_usd:.1f}")


if __name__ == "__main__":
    main()
