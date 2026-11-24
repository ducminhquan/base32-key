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
from typing import Callable, NamedTuple, Optional

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
    "format_input",
    "suggest",
    "MAX_LENGTH_PREFIXED_BYTES",
]

__version__ = "1.3.0"

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


def _decode_case(case: str) -> str:
    """Decoding also accepts ``"auto"``: try both alphabets."""
    if case == "auto":
        return case
    _alphabet(case)
    return case


def _check_groups(groups: int | None, grouped: bool) -> int | None:
    if groups is None:
        return None
    if not isinstance(groups, int) or isinstance(groups, bool) or groups < 1:
        raise ValueError(f"groups must be a positive integer, got {groups!r}")
    if not grouped:
        raise TypeError("The groups option requires grouped keys")
    return groups


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


class _Analysis(NamedTuple):
    hex: str
    invalid: list[int]
    code: str | None
    # (expected, actual) when ``groups`` is given and the key has another count.
    group_count: tuple[int, int] | None = None


def _analyze_with(key: str, grouped: bool, checked: bool, case: str, normalize: bool,
                  prefix: str | None, groups: int | None) -> _Analysis:
    alphabet = _alphabet(case)
    body = _strip_prefix(key, prefix, normalize)
    if body is None:
        return _Analysis("", [], "INVALID_PREFIX")
    parts = _split(body, grouped, checked, case, normalize)
    hex_out = ""
    invalid: list[int] = []
    code: str | None = None
    for index, group in enumerate(parts):
        h, err = _decode_group(group, alphabet, grouped, checked)
        if err is not None or h is None:
            invalid.append(index)
            code = code or err
        else:
            hex_out += h
    if groups is None or len(parts) == groups:
        return _Analysis(hex_out, invalid, code)
    # Flag the missing groups, or the extra ones.
    lo, hi = sorted((len(parts), groups))
    flagged = sorted(set(invalid) | set(range(lo, hi)))
    return _Analysis(hex_out, flagged, code or "INVALID_LENGTH", (groups, len(parts)))


def _analyze(key: str, grouped: bool, checked: bool, case: str,
             normalize: bool = False, prefix: str | None = None,
             groups: int | None = None) -> _Analysis:
    if not isinstance(key, str):
        raise TypeError("Invalid: expected a string")
    case = _decode_case(case)
    prefix = _check_prefix(prefix)
    groups = _check_groups(groups, grouped)
    first = _analyze_with(key, grouped, checked, "upper" if case == "auto" else case,
                          normalize, prefix, groups)
    if case != "auto" or first.code is None:
        return first
    other = _analyze_with(key, grouped, checked, "lower", normalize, prefix, groups)
    if other.code is None or len(other.invalid) < len(first.invalid):
        return other
    return first


def validate(key: str, *, grouped: bool = True, checked: bool = True,
             case: str = "upper", normalize: bool = False,
             prefix: str | None = None,
             groups: int | None = None) -> tuple[bool, list[int], str | None]:
    """Return ``(valid, invalid_groups, code)`` without raising.

    ``case="auto"`` tries both alphabets and keeps the one whose check
    digits match. ``groups`` requires exactly that many groups; missing or
    extra ones are listed in ``invalid_groups`` with ``INVALID_LENGTH``.
    """
    _, invalid, code, _count = _analyze(key, grouped, checked, case, normalize, prefix, groups)
    return code is None, invalid, code


def _padded_hex(key: str, grouped: bool, checked: bool, case: str,
                normalize: bool = False, prefix: str | None = None,
                groups: int | None = None) -> str:
    hex_out, invalid, code, count = _analyze(key, grouped, checked, case, normalize,
                                             prefix, groups)
    if code == "INVALID_PREFIX":
        raise Base32KeyError(code, f'Invalid key: expected the prefix "{prefix}"')
    if count is not None:
        raise Base32KeyError("INVALID_LENGTH",
                             f"Invalid key: expected {count[0]} groups, got {count[1]}",
                             invalid)
    if code:
        where = (f"group {invalid[0] + 1}" if len(invalid) == 1
                 else "groups " + ", ".join(str(i + 1) for i in invalid))
        verb = "has" if len(invalid) == 1 else "have"
        raise Base32KeyError(code, f"Invalid key: {where} {verb} {_MESSAGES[code]}", invalid)
    return hex_out


def to_hex(key: str, *, grouped: bool = True, checked: bool = True,
           case: str = "upper", normalize: bool = False,
           prefix: str | None = None, groups: int | None = None) -> str:
    """Decode a key to a hex string without leading zeros.

    With ``normalize`` spaces and hyphens are ignored and letters are folded
    to ``case``, so ``"222et 3zzgn"`` reads as ``"222ET-3ZZGN"``. With
    ``prefix`` the key must start with it (case-insensitive when
    normalizing). Raises :class:`Base32KeyError` naming every group that
    failed. ``case`` and ``groups`` work as in :func:`validate`.
    """
    return (_padded_hex(key, grouped, checked, case, normalize, prefix, groups)
            .lstrip("0") or "0")


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
             normalize: bool = False, prefix: str | None = None,
             groups: int | None = None) -> bytes:
    """Decode a key to bytes. See :func:`from_bytes`.

    ``length`` left-pads the result with zero bytes to that size."""
    if with_length:
        if not grouped:
            raise TypeError("with_length requires grouped keys")
        h = _padded_hex(key, True, checked, case, normalize, prefix, groups)
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
               normalize=normalize, prefix=prefix, groups=groups)
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


def format_input(raw: str, *, grouped: bool = True, checked: bool = True,
                 case: str = "upper", prefix: str | None = None,
                 groups: int | None = None) -> str:
    """Format raw user input as a key: drop whitespace, apply the letter case
    and put hyphens between groups. Partial input is fine, and characters
    outside the alphabet are kept so :func:`validate` can flag them. With
    ``groups``, input beyond that many groups is dropped.

    >>> format_input("222et3zz")
    '222ET-3ZZ'
    """
    if not isinstance(raw, str):
        raise TypeError("Invalid: expected a string")
    case = _decode_case(case)
    fold = "lower" if case == "lower" else "upper"
    prefix = _check_prefix(prefix)
    groups = _check_groups(groups, grouped)
    rest = raw
    if prefix:
        cleaned = re.sub(r"[\s-]+", "", raw).upper()
        if prefix.upper().startswith(cleaned):
            return cleaned  # still typing the prefix
        stripped = _strip_prefix(raw, prefix, True)
        rest = raw if stripped is None else stripped
    parts = _split(rest, grouped, checked, fold, True)
    if groups is not None:
        parts = parts[:groups]
    return _add_prefix(("-" if grouped else "").join(parts), prefix)


# Characters people confuse when reading or typing a key: each one maps to
# what it may have been meant as. Same table as the npm package.
_LOOKALIKES = {
    "2": "Zz", "Z": "2", "5": "Ss", "S": "5", "8": "B", "B": "8",
    "6": "Gb", "G": "6C", "C": "G", "U": "VY", "V": "UY", "Y": "VU",
    "M": "N", "N": "M", "0": "DQdq", "O": "DQ", "1": "LJ7ij", "I": "LJ",
    "z": "2", "s": "5", "b": "6", "g": "9q", "q": "g9", "9": "gq",
    "u": "vy", "v": "uy", "y": "vu", "m": "n", "n": "m", "o": "dq",
    "l": "ij7", "i": "j", "j": "i",
}


def _group_candidates(group: str, alphabet: str) -> list[str]:
    out: list[str] = []

    def add(candidate: str) -> None:
        if candidate != group and candidate not in out:
            out.append(candidate)

    # Two neighbouring characters typed in the wrong order.
    for i in range(len(group) - 1):
        add(group[:i] + group[i + 1] + group[i] + group[i + 2:])
    # A character misread as a look-alike.
    for i, ch in enumerate(group):
        for c in _LOOKALIKES.get(ch, ""):
            if c in alphabet:
                add(group[:i] + c + group[i + 1:])
    return out


def suggest(key: str, *, grouped: bool = True, checked: bool = True,
            case: str = "upper", normalize: bool = True,
            prefix: str | None = None, groups: int | None = None,
            limit: int = 5) -> list[str]:
    """Suggest valid keys close to a mistyped one, for a "Did you mean"
    hint. Each invalid group is repaired by swapping two neighbouring
    characters or replacing a look-alike (2/Z, 5/S, 8/B, U/V/Y, 0/O/D/Q …).
    Returns ``[]`` for a valid key or when nothing close is found. Gives the
    same suggestions as ``suggest`` in the npm package.

    >>> suggest("222TE-3ZZGN")
    ['222ET-3ZZGN']
    """
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
        raise ValueError(f"limit must be a positive integer, got {limit!r}")
    case = _decode_case(case)
    prefix = _check_prefix(prefix)
    groups = _check_groups(groups, grouped)
    results: list[str] = []
    for key_case in (["upper", "lower"] if case == "auto" else [case]):
        valid, invalid, code = validate(key, grouped=grouped, checked=checked,
                                        case=key_case, normalize=normalize,
                                        prefix=prefix, groups=groups)
        if valid:
            return []
        if code == "INVALID_PREFIX":
            continue
        formatted = format_input(key, grouped=grouped, checked=checked,
                                 case=key_case, prefix=prefix)
        head = f"{prefix}-" if prefix else ""
        body = formatted[len(head):]
        parts = body.split("-") if grouped else [body]
        # Changing characters cannot add or remove groups.
        if groups is not None and len(parts) != groups:
            continue
        # With normalize=False a strict check may flag groups formatting drops.
        if any(i >= len(parts) for i in invalid):
            continue
        alphabet = _alphabet(key_case)
        choices = [
            [c for c in _group_candidates(parts[i], alphabet)
             if validate(c, grouped=grouped, checked=checked, case=key_case)[0]]
            for i in invalid
        ]
        if any(not c for c in choices):
            continue

        def combine(depth: int, picked: list[str]) -> None:
            if len(results) >= limit:
                return
            if depth == len(choices):
                fixed = list(parts)
                for index, part in zip(invalid, picked):
                    fixed[index] = part
                results.append(head + ("-" if grouped else "").join(fixed))
                return
            for candidate in choices[depth]:
                combine(depth + 1, picked + [candidate])

        combine(0, [])
    return results[:limit]
