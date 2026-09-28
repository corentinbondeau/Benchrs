# ============================================================
# validate.py — Validation des vidéos AVANT tout décodage.
#
# Répond à la faille F1/F5 de l'audit : le bucket accepte n'importe
# quel octet avec un MIME `video/*` fourni par le client ; un fichier
# malicieux (conteneur malformé, playlist HLS/MPD) atteindrait
# cv2.VideoCapture (backend libav/FFmpeg) → RCE / SSRF potentiels.
#
# On exige ici la présence de MAGIC BYTES de vrais conteneurs vidéo :
#   - MP4 / MOV / M4V : box ISO-BMFF `ftyp....` aux octets 4..8
#   - WebM / MKV      : Headers d'EBML `1A45DFA3` (offset 0)
# Tout ce qui n'est pas un conteneur vidéo réel est REJETÉ (409).
# ============================================================
from __future__ import annotations

import re

# Offset 4 : "ftyp" (ISO Base Media File Format — mp4/mov/m4v).
_ISO_BMFF_RE = re.compile(rb"^.{4}ftyp(.{4})", re.DOTALL)
_EBML = b"\x1a\x45\xdf\xa3"

# Playlists/descripteurs de flux : refus absolu (ce ne sont pas des
# conteneurs vidéo, et leur décodage peut déclencher des fetch réseau
# dans le décodeur — vecteur SSRF).
_FORBIDDEN_TEXT_SIGNATURES = (
    b"#EXTM3U",        # HLS
    b'<?xml',          # MPD/DASH
    b"#EXT-X-",        # variante HLS
    b"http://",        # fausse playlist avec URL réseau
    b"https://",
)

# Brands ISO-BMFF considérés comme de vraies vidéos (mp4/mov/m4v/webm
# via le récipient Matroska). On tolère les majors connues.
_KNOWN_BRANDS = {
    b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42",
    b"avc1", b"avc2", b"hvc1", b"hev1", b"dash", b"qt  ",
}


def sniff_video(path: str) -> str:
    """Valide qu'un fichier contient un vrai conteneur vidéo.

    Lève ValueError si le fichier n'est pas une vidéo reconnue.
    Retourne un libellé de type ('mp4'|'mov'|'m4v'|'webm') sinon.
    """
    with open(path, "rb") as f:
        head = f.read(64)

    if not head:
        raise ValueError("Fichier vide")

    # Refus explicite des playlists / textes réseau
    lowered = head.lstrip()[:32].lower()
    for sig in _FORBIDDEN_TEXT_SIGNATURES:
        if head.lstrip().startswith(sig) or lowered.startswith(sig):
            raise ValueError("Format de média réseau interdit (playlists non supportées)")

    # ISO-BMFF
    m = _ISO_BMFF_RE.match(head)
    if m:
        brand = m.group(1)
        if brand in _KNOWN_BRANDS:
            return "mp4"
        raise ValueError(f"Conteneur ISO-BMFF avec un brand non supporté : {brand!r}")

    # QuickTime 'moov' en tête (anciens MOV)
    if head[:4] == b"moov" or b"moov" in head[:32]:
        return "mov"

    # EBML (WebM/Matroska)
    if head.startswith(_EBML):
        return "webm"

    raise ValueError(f"Les octets du fichier ne correspondent à aucun conteneur vidéo ({head[:8]!r})")