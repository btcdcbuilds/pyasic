from webapp import notify
from webapp.promptpay import crc16_ccitt, payload, qr_svg_data_uri


def test_crc_matches_ccitt_false_check_value():
    assert crc16_ccitt(b"123456789") == 0x29B1  # standard CRC-16/CCITT-FALSE check value


def test_promptpay_payload_structure_for_mobile_with_amount():
    p = payload("081-234-5678", 1470)
    assert p.startswith("000201" "010212" "2937" "0016A000000677010111" "01130066812345678")
    assert "5802TH" in p and "5303764" in p and "54071470.00" in p
    assert p[-8:-4] == "6304" and int(p[-4:], 16) == crc16_ccitt(p[:-4].encode())


def test_promptpay_static_and_id_and_bad_input():
    p = payload("1234567890123")
    assert "010211" in p and "02131234567890123" in p and "54" not in p[p.index("5303764") + 7:-8]
    try:
        payload("12345")
        assert False
    except ValueError:
        pass
    assert qr_svg_data_uri("0812345678", 100).startswith("data:image/svg+xml")


def test_line_push_sends_and_skips(monkeypatch):
    sent = []

    class S:
        def post(self, url, **kw):
            sent.append((url, kw))

            class R:
                def raise_for_status(self): pass
            return R()

    assert notify.push_line("U1", "hi", session=S()) is False  # no token -> skipped
    monkeypatch.setenv("LINE_CHANNEL_ACCESS_TOKEN", "tok")
    assert notify.push_line("U1", "hi", session=S()) is True
    assert sent[0][1]["headers"]["Authorization"] == "Bearer tok"
    assert sent[0][1]["json"] == {"to": "U1", "messages": [{"type": "text", "text": "hi"}]}
