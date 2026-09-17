import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

FULL_MAX_PX = 2400
THUMB_MAX_PX = 480


class InvalidImage(ValueError):
    pass


@dataclass
class ProcessedImage:
    full_jpeg: bytes
    thumb_jpeg: bytes
    width: int
    height: int


def _jpeg(image: Image.Image, max_px: int, quality: int) -> tuple[Image.Image, bytes]:
    copy = image.copy()
    copy.thumbnail((max_px, max_px))
    buf = io.BytesIO()
    copy.save(buf, "JPEG", quality=quality, optimize=True)
    return copy, buf.getvalue()


def process_image(data: bytes) -> ProcessedImage:
    """Validate an upload and produce a display JPEG and a thumbnail."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(data))
        # Phones store rotation in EXIF; bake it in so every viewer shows it upright.
        image = ImageOps.exif_transpose(image)
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise InvalidImage("File is not a supported image (JPEG, PNG, WebP)") from exc

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    # Re-encoding also strips EXIF (GPS etc.) from stored patient photos.
    full, full_bytes = _jpeg(image, FULL_MAX_PX, 85)
    _, thumb_bytes = _jpeg(image, THUMB_MAX_PX, 78)
    return ProcessedImage(full_jpeg=full_bytes, thumb_jpeg=thumb_bytes, width=full.width, height=full.height)
