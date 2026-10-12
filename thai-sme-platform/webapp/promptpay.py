"""PromptPay QR payloads (Thai QR Payment, EMVCo merchant-presented QR).

Lets a guest pay a deposit straight to the business's own PromptPay (mobile
number or 13-digit ID) - no payment gateway needed for the pilot. The owner
confirms receipt in the owner app. Spec: Bank of Thailand Thai QR guideline
(2019, based on EMVCo MPM v1.1). Verify a generated code with a Thai banking app
before using it with real customers.
"""

from __future__ import annotations

import segno

PROMPTPAY_AID = "A000000677010111"


def _tlv(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def crc16_ccitt(data: bytes) -> int:
    """CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo QR requires."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return crc


def payload(promptpay_id: str, amount: float | None = None) -> str:
    target = "".join(ch for ch in promptpay_id if ch.isdigit())
    if len(target) == 10 and target.startswith("0"):      # mobile number
        account = _tlv("01", "0066" + target[1:])
    elif len(target) == 13:                                # national ID / tax ID
        account = _tlv("02", target)
    else:
        raise ValueError("PromptPay ID must be a 10-digit mobile number or 13-digit ID")
    data = (
        _tlv("00", "01")
        + _tlv("01", "12" if amount else "11")             # 12 = one-time (with amount)
        + _tlv("29", _tlv("00", PROMPTPAY_AID) + account)
        + _tlv("58", "TH")
        + _tlv("53", "764")                                 # THB
        + (_tlv("54", f"{amount:.2f}") if amount else "")
        + "6304"
    )
    return data + f"{crc16_ccitt(data.encode('ascii')):04X}"


def qr_svg_data_uri(promptpay_id: str, amount: float | None = None) -> str:
    return segno.make(payload(promptpay_id, amount), error="m").svg_data_uri(scale=6, border=2)
