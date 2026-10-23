"""Helpers that keep heavy borrower images (base64 photo/signature) out of the loan documents.

Full images live in the `loan_media` collection (one doc per loan); the loan itself keeps a tiny
`photo_thumb` so the borrower list and the dashboard stay fast.
"""

import base64
import io
from typing import Any, Dict, Tuple

THUMB_SIZE = 160
_SMALL_ENOUGH = 40_000  # without Pillow, an image this small can serve as its own thumbnail


def is_data_url(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("data:")


def make_thumb(data_url: str) -> str:
    """A ~160px JPEG data URL of the image, or "" when it can't be decoded."""
    if not isinstance(data_url, str) or not data_url.startswith("data:image/"):
        return ""
    try:
        from PIL import Image, ImageOps

        raw = base64.b64decode(data_url.split(",", 1)[1])
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
        img = ImageOps.fit(img.convert("RGB"), (THUMB_SIZE, THUMB_SIZE))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=70, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        return data_url if len(data_url) <= _SMALL_ENOUGH else ""
    except Exception:
        return ""


def split_media(fields: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Split `photo_url`/`signature_url` out of loan fields.

    Returns (loan_fields, media): `loan_fields` is what belongs on the loan doc (data URLs blanked,
    thumbnail and has_* flags added); `media` holds the full images to store in `loan_media`.
    Keys not present in `fields` are left alone, so this works for partial updates too.
    """
    out, media = dict(fields), {}
    if "photo_url" in fields:
        photo = fields["photo_url"] or ""
        if is_data_url(photo):
            media["photo_url"] = photo
            out.update(photo_url="", photo_thumb=make_thumb(photo), has_photo=True)
        else:
            out.update(photo_thumb="", has_photo=bool(photo))
            media["photo_url"] = ""
    if "signature_url" in fields:
        sig = fields["signature_url"] or ""
        if is_data_url(sig):
            media["signature_url"] = sig
            out.update(signature_url="", has_signature=True)
        else:
            out.update(has_signature=bool(sig))
            media["signature_url"] = ""
    return out, media
