#!/usr/bin/env python3
"""Landed-cost and pricing calculator for one import shipment.

Fill in the two input files with REAL quotes (supplier PI, freight forwarder,
customs broker), then run:

    python3 landed_cost.py shipment.csv lines.csv
    python3 landed_cost.py shipment.csv lines.csv --duty-override 0.80

shipment.csv  key,value rows (see shipment_template.csv)
lines.csv     one row per SKU in the container (see lines_template.csv)

Shared costs (freight, insurance, port, broker, haulage, unloading,
inspection, local fit-out) are allocated to lines in proportion to FOB value.
Import VAT is charged on CIF + duty. If the company is VAT-registered it is
reported but excluded from cost, because it can be claimed as input tax.

Uses only the Python standard library. No values are built in: a blank input
stops the script instead of guessing.
"""
import argparse
import csv
import sys

SHIPMENT_KEYS = [
    "fx_thb_per_usd",
    "ocean_freight_usd",
    "insurance_usd",
    "inspection_usd",
    "port_and_do_charges_thb",
    "customs_broker_fee_thb",
    "haulage_to_warehouse_thb",
    "unloading_thb",
    "local_fitout_thb",
    "import_vat_rate",
    "vat_registered",
]
LINE_KEYS = ["sku", "qty", "fob_usd_each", "duty_rate", "target_margin"]


def read_shipment(path):
    values = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            values[row["key"].strip()] = row["value"].strip()
    missing = [k for k in SHIPMENT_KEYS if values.get(k, "") == ""]
    if missing:
        sys.exit(f"shipment file: fill in {', '.join(missing)}")
    out = {k: float(values[k]) for k in SHIPMENT_KEYS if k != "vat_registered"}
    out["vat_registered"] = values["vat_registered"].lower() in ("1", "yes", "true", "y")
    return out


def read_lines(path):
    lines = []
    with open(path, newline="", encoding="utf-8") as f:
        for n, row in enumerate(csv.DictReader(f), start=2):
            missing = [k for k in LINE_KEYS if row.get(k, "").strip() == ""]
            if missing:
                sys.exit(f"lines file row {n}: fill in {', '.join(missing)}")
            lines.append(
                {
                    "sku": row["sku"].strip(),
                    "qty": int(row["qty"]),
                    "fob_usd_each": float(row["fob_usd_each"]),
                    "duty_rate": float(row["duty_rate"]),
                    "target_margin": float(row["target_margin"]),
                }
            )
    if not lines:
        sys.exit("lines file: no rows")
    return lines


def calculate(shipment, lines, duty_override=None):
    fx = shipment["fx_thb_per_usd"]
    total_fob_usd = sum(l["qty"] * l["fob_usd_each"] for l in lines)
    if total_fob_usd <= 0:
        raise ValueError("total FOB must be greater than zero")

    to_cif_usd = shipment["ocean_freight_usd"] + shipment["insurance_usd"]
    post_customs_thb = (
        shipment["inspection_usd"] * fx
        + shipment["port_and_do_charges_thb"]
        + shipment["customs_broker_fee_thb"]
        + shipment["haulage_to_warehouse_thb"]
        + shipment["unloading_thb"]
        + shipment["local_fitout_thb"]
    )

    results = []
    for l in lines:
        line_fob_usd = l["qty"] * l["fob_usd_each"]
        share = line_fob_usd / total_fob_usd
        duty_rate = l["duty_rate"] if duty_override is None else duty_override

        cif_thb = (line_fob_usd + to_cif_usd * share) * fx
        duty_thb = cif_thb * duty_rate
        import_vat_thb = (cif_thb + duty_thb) * shipment["import_vat_rate"]
        other_thb = post_customs_thb * share

        cost_thb = cif_thb + duty_thb + other_thb
        if not shipment["vat_registered"]:
            cost_thb += import_vat_thb

        unit_cost = cost_thb / l["qty"]
        margin = l["target_margin"]
        if not 0 <= margin < 1:
            raise ValueError(f"{l['sku']}: target_margin must be between 0 and 1")
        price_ex_vat = unit_cost / (1 - margin)
        results.append(
            {
                "sku": l["sku"],
                "qty": l["qty"],
                "duty_rate": duty_rate,
                "cif_thb_each": cif_thb / l["qty"],
                "duty_thb_each": duty_thb / l["qty"],
                "import_vat_thb_each": import_vat_thb / l["qty"],
                "other_thb_each": other_thb / l["qty"],
                "landed_cost_thb_each": unit_cost,
                "price_ex_vat_thb": price_ex_vat,
                "price_inc_vat_thb": price_ex_vat * (1 + shipment["import_vat_rate"]),
            }
        )
    return results


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("shipment")
    p.add_argument("lines")
    p.add_argument("--duty-override", type=float, help="apply one duty rate to every line, e.g. 0.80")
    args = p.parse_args(argv)

    results = calculate(read_shipment(args.shipment), read_lines(args.lines), args.duty_override)

    cols = [
        ("sku", "SKU"),
        ("qty", "Qty"),
        ("duty_rate", "Duty"),
        ("cif_thb_each", "CIF/unit"),
        ("duty_thb_each", "Duty/unit"),
        ("import_vat_thb_each", "ImpVAT/unit"),
        ("other_thb_each", "Other/unit"),
        ("landed_cost_thb_each", "Landed/unit"),
        ("price_ex_vat_thb", "Price exVAT"),
        ("price_inc_vat_thb", "Price incVAT"),
    ]
    print("| " + " | ".join(h for _, h in cols) + " |")
    print("|" + "|".join("---" for _ in cols) + "|")
    for r in results:
        cells = []
        for key, _ in cols:
            v = r[key]
            if key == "duty_rate":
                cells.append(f"{v:.1%}")
            elif isinstance(v, float):
                cells.append(f"{v:,.0f}")
            else:
                cells.append(str(v))
        print("| " + " | ".join(cells) + " |")
    print("\nAll amounts in THB. Import VAT is shown for cash-flow planning; "
          "it is excluded from landed cost when vat_registered = yes.")


if __name__ == "__main__":
    main()
