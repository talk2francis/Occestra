"""Direct-mode test harness fixes.

gltest 0.29.2's direct VM answers `gl.nondet.web.render(..., mode="screenshot")` with a
hardcoded empty image (`{"ok": {"image": b""}}`), and the SDK then hands those zero bytes to
PIL, which raises `UnidentifiedImageError`. The effect is that the screenshot path — the one
Occestra actually depends on for visual adjudication — cannot be exercised in direct mode at
all as shipped.

So the harness is patched here to return a real, minimal PNG instead. This changes only the
mock's return value; the contract runs its genuine visual branch, renders, and passes the
image to the (mocked) validator model exactly as it would on-chain.

Worth revisiting when gltest gains first-class screenshot mocking, at which point this file
should shrink to nothing.
"""

import io

import pytest

# A real 1x1 PNG, built once so PIL can actually decode it.
def _tiny_png() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (1, 1), (255, 255, 255)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _renderable_screenshots(monkeypatch):
    from gltest.direct import wasi_mock

    original = wasi_mock._handle_web_render
    png = _tiny_png()

    def patched(vm, data):
        result = original(vm, data)
        if data.get("mode") == "screenshot":
            ok = result.get("ok")
            if isinstance(ok, dict) and ok.get("image") == b"":
                return {"ok": {"image": png}}
        return result

    monkeypatch.setattr(wasi_mock, "_handle_web_render", patched)
    yield
