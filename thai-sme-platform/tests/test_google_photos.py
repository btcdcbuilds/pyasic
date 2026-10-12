from webapp.google_photos import live_photos


class FakeResp:
    def __init__(self, data, status=200):
        self._data, self.status_code = data, status

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.HTTPError(str(self.status_code))


class FakeSession:
    def __init__(self):
        self.calls = []

    def get(self, url, **kw):
        self.calls.append(url)
        if url.endswith("/places/abc"):
            return FakeResp({"photos": [
                {"name": "places/abc/photos/p1", "authorAttributions": [{"displayName": "Nok", "uri": "https://maps.google.com/u/1"}]},
                {"name": "places/abc/photos/p2", "authorAttributions": []},
            ]})
        return FakeResp({"photoUri": url.replace("https://places.googleapis.com/v1/", "https://lh3.example/")})


def test_live_photos_returns_uris_and_attributions():
    s = FakeSession()
    out = live_photos("abc", "KEY", session=s)
    assert [p["src"] for p in out] == ["https://lh3.example/places/abc/photos/p1/media",
                                       "https://lh3.example/places/abc/photos/p2/media"]
    assert out[0]["authors"] == [{"name": "Nok", "uri": "https://maps.google.com/u/1"}]
    assert out[1]["authors"] == []


def test_live_photos_errors_return_empty():
    class Broken(FakeSession):
        def get(self, url, **kw):
            return FakeResp({}, 403)
    assert live_photos("abc", "KEY", session=Broken()) == []
