"""Human-friendly Base32 keys with a check digit per group.

A Python port of the base32-key npm package: hex and bytes encoding,
decoding with per-group errors, input normalization, prefixes, random and
HMAC-signed keys, checked against the same test vectors.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from typing import Callable, Optional

__all__ = [
    "Base32KeyError",
    "from_hex",
    "to_hex",
    "validate",
    "from_bytes",
    "to_bytes",
    "generate_key",
    "sign_key",
    "verify_key",
    "MAX_LENGTH_PREFIXED_BYTES",
]

UPPER = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
LOWER = "abcdefghijkmnpqrstuvwxyz23456789"
_CRC5 = [
    0, 5, 10, 15, 20, 17, 30, 27, 13, 8, 7, 2, 25, 28, 19, 22,
    26, 31, 16, 21, 14, 11, 4, 1, 23, 18, 29, 24, 3, 6, 9, 12,
]
_HEX = "0123456789abcdef"

MAX_LENGTH_PREFIXED_BYTES = 0xFFFFF
"""Largest byte length a ``with_length`` key can store (20 bits)."""


class Base32KeyError(ValueError):
    """Invalid input. ``code`` matches the JavaScript error codes and
    ``invalid_groups`` lists the 0-based indexes of the groups that failed."""

    def __init__(self, code: str, message: str, invalid_groups: list[int] | None = None):
        super().__init__(message)
        self.code = code
        self.invalid_groups = list(invalid_groups or [])


def _crc5(digits: list[int]) -> int:
    crc = 0
    for d in digits:
        crc = _CRC5[d ^ crc]
    return crc


def _alphabet(case: str) -> str:
    if case == "upper":
        return UPPER
    if case == "lower":
        return LOWER
    raise ValueError(f'case must be "upper" or "lower", got {case!r}')


_PREFIX_RE = re.compile(r"^[A-Za-z0-9]+$")


def _check_prefix(prefix: str | None) -> str | None:
    if prefix is None or prefix == "":
        return None
    if not isinstance(prefix, str) or not _PREFIX_RE.match(prefix):
        raise TypeError(f"prefix must contain only letters and digits, got {prefix!r}")
    return prefix


def _add_prefix(key: str, prefix: str | None) -> str:
    return f"{prefix}-{key}" if prefix else key


def _strip_prefix(key: str, prefix: str | None, normalize: bool) -> str | None:
    """Remove ``prefix`` from the front of a key, or return None."""
    if not prefix:
        return key
    if not normalize:
        return key[len(prefix) + 1:] if key.startswith(prefix + "-") else None
    cleaned = re.sub(r"^[\s-]+", "", key)
    if cleaned[:len(prefix)].upper() == prefix.upper():
        return cleaned[len(prefix):]
    return None


def _encode_digits(digits: list[int], alphabet: str, grouped: bool, checked: bool,
                   keep_leading_zeros: bool = False) -> str:
    if grouped:
        groups = []
        for i in range(0, len(digits), 4):
            group = digits[i:i + 4]
            if checked:
                group = group + [_crc5(group)]
            groups.append("".join(alphabet[d] for d in group))
        return "-".join(groups)
    if checked:
        digits = digits + [_crc5(digits)]
    i = 0
    while not keep_leading_zeros and i + 1 < len(digits) and digits[i] == 0:
        i += 1
    return "".join(alphabet[d] for d in digits[i:])


def from_hex(hex_string: str, *, grouped: bool = True, checked: bool = True,
             case: str = "upper", prefix: str | None = None) -> str:
    """Encode a hex string (an optional ``0x`` prefix is allowed) as a key.

    ``prefix`` (letters and digits) is put in front, e.g. ``LC-222ET-3ZZGN``.
    """
    prefix = _check_prefix(prefix)
    alphabet = _alphabet(case)
    if not isinstance(hex_string, str):
        raise TypeError("Invalid hex string: expected a string")
    h = hex_string[2:] if hex_string[:2].lower() == "0x" else hex_string
    h = h.lower()
    if not h or any(c not in _HEX for c in h):
        raise Base32KeyError("INVALID_HEX", f'Invalid hex string: "{hex_string}"')
    h = h.zfill(-(-len(h) // 5) * 5)
    digits: list[int] = []
    for i in range(0, len(h), 5):
        word = int(h[i:i + 5], 16)
        digits += [(word >> 15) & 31, (word >> 10) & 31, (word >> 5) & 31, word & 31]
    return _add_prefix(_encode_digits(digits, alphabet, grouped, checked), prefix)


def _decode_group(group: str, alphabet: str, grouped: bool,
                  checked: bool) -> tuple[str | None, str | None]:
    digits: list[int] = []
    for c in group:
        d = alphabet.find(c)
        if d < 0:
            return None, "INVALID_CHARACTER"
        digits.append(d)
    if not digits or (grouped and len(digits) != 4 + (1 if checked else 0)):
        return None, "INVALID_LENGTH"
    if checked:
        check = digits.pop()
        if _crc5(digits) != check:
            return None, "CHECKSUM_MISMATCH"
    while len(digits) % 4:
        digits.insert(0, 0)
    out = ""
    for i in range(0, len(digits), 4):
        word = (digits[i] << 15) | (digits[i + 1] << 10) | (digits[i + 2] << 5) | digits[i + 3]
        out += f"{word:05x}"
    return out, None


_MESSAGES = {
    "INVALID_CHARACTER": "a character outside the alphabet",
    "INVALID_LENGTH": "the wrong length",
    "CHECKSUM_MISMATCH": "a check digit that does not match",
}


def _split(key: str, grouped: bool, checked: bool, case: str, normalize: bool) -> list[str]:
    if not normalize:
        return key.split("-")
    cleaned = re.sub(r"[\s-]+", "", key)
    folded = cleaned.upper() if case == "upper" else cleaned.lower()
    if not grouped:
        return [folded]
    size = 5 if checked else 4
    return [folded[i:i + size] for i in range(0, len(folded), size)] or [""]


def _analyze(key: str, grouped: bool, checked: bool, case: str,
             normalize: bool = False,
             prefix: str | None = None) -> tuple[str, list[int], str | None]:
    if not isinstance(key, str):
        raise TypeError("Invalid: expected a string")
    alphabet = _alphabet(case)
    prefix = _check_prefix(prefix)
    body = _strip_prefix(key, prefix, normalize)
    if body is None:
        return "", [], "INVALID_PREFIX"
    groups = _split(body, grouped, checked, case, normalize)
    hex_out = ""
    invalid: list[int] = []
    code: str | None = None
    for index, group in enumerate(groups):
        h, err = _decode_group(group, alphabet, grouped, checked)
        if err is not None or h is None:
            invalid.append(index)
            code = code or err
        else:
            hex_out += h
    return hex_out, invalid, code


def validate(key: str, *, grouped: bool = True, checked: bool = True,
             case: str = "upper", normalize: bool = False,
             prefix: str | None = None) -> tuple[bool, list[int], str | None]:
    """Return ``(valid, invalid_groups, code)`` without raising."""
    _, invalid, code = _analyze(key, grouped, checked, case, normalize, prefix)
    return code is None, invalid, code


def _padded_hex(key: str, grouped: bool, checked: bool, case: str,
                normalize: bool = False, prefix: str | None = None) -> str:
    hex_out, invalid, code = _analyze(key, grouped, checked, case, normalize, prefix)
    if code == "INVALID_PREFIX":
        raise Base32KeyError(code, f'Invalid key: expected the prefix "{prefix}"')
    if code:
        where = (f"group {invalid[0] + 1}" if len(invalid) == 1
                 else "groups " + ", ".join(str(i + 1) for i in invalid))
        verb = "has" if len(invalid) == 1 else "have"
        raise Base32KeyError(code, f"Invalid key: {where} {verb} {_MESSAGES[code]}", invalid)
    return hex_out


def to_hex(key: str, *, grouped: bool = True, checked: bool = True,
           case: str = "upper", normalize: bool = False,
           prefix: str | None = None) -> str:
    """Decode a key to a hex string without leading zeros.

    With ``normalize`` spaces and hyphens are ignored and letters are folded
    to ``case``, so ``"222et 3zzgn"`` reads as ``"222ET-3ZZGN"``. With
    ``prefix`` the key must start with it (case-insensitive when
    normalizing). Raises :class:`Base32KeyError` naming every group that
    failed.
    """
    return _padded_hex(key, grouped, checked, case, normalize, prefix).lstrip("0") or "0"


def from_bytes(data: bytes, *, with_length: bool = False, grouped: bool = True,
               checked: bool = True, case: str = "upper",
               prefix: str | None = None) -> str:
    """Encode bytes. With ``with_length`` the first group stores the byte
    count, so leading zero bytes survive and cut keys are detected."""
    data = bytes(data)
    if not with_length:
        if not data:
            raise ValueError("Cannot encode empty bytes without with_length")
        return from_hex(data.hex(), grouped=grouped, checked=checked, case=case,
                        prefix=prefix)
    if not grouped:
        raise TypeError("with_length requires grouped keys")
    if len(data) > MAX_LENGTH_PREFIXED_BYTES:
        raise ValueError(f"with_length supports at most {MAX_LENGTH_PREFIXED_BYTES} bytes")
    h = data.hex()
    return from_hex(f"{len(data):05x}" + h.zfill(-(-len(h) // 5) * 5),
                    grouped=True, checked=checked, case=case, prefix=prefix)


def to_bytes(key: str, *, with_length: bool = False, length: int | None = None,
             grouped: bool = True, checked: bool = True, case: str = "upper",
             normalize: bool = False, prefix: str | None = None) -> bytes:
    """Decode a key to bytes. See :func:`from_bytes`."""
    if with_length:
        if not grouped:
            raise TypeError("with_length requires grouped keys")
        h = _padded_hex(key, True, checked, case, normalize, prefix)
        n = int(h[:5], 16)
        data = h[5:]
        expected = -(-n * 2 // 5) * 5
        padding = data[:expected - n * 2]
        if len(data) != expected or padding.strip("0"):
            raise Base32KeyError(
                "INVALID_LENGTH",
                f"Invalid key: a {n}-byte value needs {expected // 5 + 1} groups, got {len(h) // 5}",
            )
        return bytes.fromhex(data[len(padding):])
    h = to_hex(key, grouped=grouped, checked=checked, case=case,
               normalize=normalize, prefix=prefix)
    out = bytes.fromhex(h.zfill(len(h) + len(h) % 2))
    if length is None:
        return out
    if not isinstance(length, int) or length < 0:
        raise ValueError(f"length must be a non-negative integer, got {length}")
    if out == b"\x00":
        out = b""
    if len(out) > length:
        raise Base32KeyError(
            "INVALID_LENGTH",
            f"Invalid key: the value needs {len(out)} bytes, more than {length}",
        )
    return out.rjust(length, b"\x00")


def generate_key(*, groups: int = 4, grouped: bool = True, checked: bool = True,
                 case: str = "upper", prefix: str | None = None,
                 filter: Optional[Callable[[str], bool]] = None,
                 max_attempts: int = 100,
                 random: Callable[[int], bytes] = secrets.token_bytes) -> str:
    """Generate a random key: ``groups`` groups of 20 random bits each.

    ``filter`` can reject candidates (a blocklist, keys already in use).
    Raises :class:`Base32KeyError` ``GENERATION_FAILED`` when it rejects
    ``max_attempts`` candidates in a row.
    """
    if not isinstance(groups, int) or groups < 1:
        raise ValueError(f"groups must be a positive integer, got {groups}")
    if not isinstance(max_attempts, int) or max_attempts < 1:
        raise ValueError(f"max_attempts must be a positive integer, got {max_attempts}")
    alphabet = _alphabet(case)
    prefix = _check_prefix(prefix)
    count = groups * 4
    for _ in range(max_attempts):
        data = random(count)
        if len(data) < count:
            raise ValueError(f"random must return {count} bytes")
        # 256 is a multiple of 32, so masking keeps the digits uniform.
        digits = [b & 31 for b in data[:count]]
        key = _add_prefix(_encode_digits(digits, alphabet, grouped, checked, True), prefix)
        if filter is None or filter(key):
            return key
    raise Base32KeyError("GENERATION_FAILED",
                         f"No key accepted by filter after {max_attempts} attempts")


def _tag_bytes(tag_bytes: int) -> int:
    if not isinstance(tag_bytes, int) or not 4 <= tag_bytes <= 32:
        raise ValueError(f"tag_bytes must be an integer from 4 to 32, got {tag_bytes}")
    return tag_bytes


def _secret(secret: str | bytes) -> bytes:
    raw = secret.encode() if isinstance(secret, str) else bytes(secret)
    if not raw:
        raise TypeError("The signing secret must not be empty")
    return raw


def sign_key(payload: bytes, secret: str | bytes, *, tag_bytes: int = 5,
             checked: bool = True, case: str = "upper",
             prefix: str | None = None) -> str:
    """Make a key that carries ``payload`` and an HMAC-SHA256 tag, so only
    someone with ``secret`` can create valid keys. Same keys as ``signKey``
    in the npm package."""
    tag_bytes = _tag_bytes(tag_bytes)
    payload = bytes(payload)
    tag = hmac.new(_secret(secret), payload, hashlib.sha256).digest()[:tag_bytes]
    return from_bytes(payload + tag, with_length=True, checked=checked, case=case,
                      prefix=prefix)


def verify_key(key: str, secret: str | bytes, *, tag_bytes: int = 5,
               checked: bool = True, case: str = "upper", normalize: bool = False,
               prefix: str | None = None) -> bytes:
    """Check a key made by :func:`sign_key` and return its payload.

    Raises :class:`Base32KeyError` like :func:`to_bytes` for a mistyped key,
    or ``INVALID_SIGNATURE`` when the key was not signed with ``secret``.
    """
    tag_bytes = _tag_bytes(tag_bytes)
    signed = to_bytes(key, with_length=True, checked=checked, case=case,
                      normalize=normalize, prefix=prefix)
    if len(signed) < tag_bytes:
        raise Base32KeyError("INVALID_SIGNATURE", "Invalid key: too short to carry a signature")
    payload, tag = signed[:-tag_bytes], signed[-tag_bytes:]
    expected = hmac.new(_secret(secret), payload, hashlib.sha256).digest()[:tag_bytes]
    if not hmac.compare_digest(tag, expected):
        raise Base32KeyError("INVALID_SIGNATURE", "Invalid key: the signature does not match")
    return payload
