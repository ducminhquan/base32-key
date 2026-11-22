"""Human-friendly Base32 keys with a check digit per group.

A Python port of the core of the base32-key npm package: hex and bytes
encoding, decoding with per-group errors, and the same test vectors.
"""

from __future__ import annotations

__all__ = [
    "Base32KeyError",
    "from_hex",
    "to_hex",
    "validate",
    "from_bytes",
    "to_bytes",
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


def from_hex(hex_string: str, *, grouped: bool = True, checked: bool = True,
             case: str = "upper") -> str:
    """Encode a hex string (an optional ``0x`` prefix is allowed) as a key."""
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
    if grouped:
        groups = []
        for i in range(0, len(digits), 4):
            group = digits[i:i + 4]
            if checked:
                group.append(_crc5(group))
            groups.append("".join(alphabet[d] for d in group))
        return "-".join(groups)
    if checked:
        digits.append(_crc5(digits))
    i = 0
    while i + 1 < len(digits) and digits[i] == 0:
        i += 1
    return "".join(alphabet[d] for d in digits[i:])


def _decode_group(group: str, alphabet: str, grouped: bool, checked: bool):
    digits = []
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


def _analyze(key: str, grouped: bool, checked: bool, case: str):
    if not isinstance(key, str):
        raise TypeError("Invalid: expected a string")
    alphabet = _alphabet(case)
    groups = key.split("-")
    hex_out, invalid, code = "", [], None
    for index, group in enumerate(groups):
        h, err = _decode_group(group, alphabet, grouped, checked)
        if err:
            invalid.append(index)
            code = code or err
        else:
            hex_out += h
    return hex_out, invalid, code


def validate(key: str, *, grouped: bool = True, checked: bool = True,
             case: str = "upper") -> tuple[bool, list[int], str | None]:
    """Return ``(valid, invalid_groups, code)`` without raising."""
    _, invalid, code = _analyze(key, grouped, checked, case)
    return code is None, invalid, code


def _padded_hex(key: str, grouped: bool, checked: bool, case: str) -> str:
    hex_out, invalid, code = _analyze(key, grouped, checked, case)
    if code:
        where = (f"group {invalid[0] + 1}" if len(invalid) == 1
                 else "groups " + ", ".join(str(i + 1) for i in invalid))
        verb = "has" if len(invalid) == 1 else "have"
        raise Base32KeyError(code, f"Invalid key: {where} {verb} {_MESSAGES[code]}", invalid)
    return hex_out


def to_hex(key: str, *, grouped: bool = True, checked: bool = True,
           case: str = "upper") -> str:
    """Decode a key to a hex string without leading zeros.

    Raises :class:`Base32KeyError` naming every group that failed.
    """
    return _padded_hex(key, grouped, checked, case).lstrip("0") or "0"


def from_bytes(data: bytes, *, with_length: bool = False, grouped: bool = True,
               checked: bool = True, case: str = "upper") -> str:
    """Encode bytes. With ``with_length`` the first group stores the byte
    count, so leading zero bytes survive and cut keys are detected."""
    data = bytes(data)
    if not with_length:
        if not data:
            raise ValueError("Cannot encode empty bytes without with_length")
        return from_hex(data.hex(), grouped=grouped, checked=checked, case=case)
    if not grouped:
        raise TypeError("with_length requires grouped keys")
    if len(data) > MAX_LENGTH_PREFIXED_BYTES:
        raise ValueError(f"with_length supports at most {MAX_LENGTH_PREFIXED_BYTES} bytes")
    h = data.hex()
    return from_hex(f"{len(data):05x}" + h.zfill(-(-len(h) // 5) * 5),
                    grouped=True, checked=checked, case=case)


def to_bytes(key: str, *, with_length: bool = False, length: int | None = None,
             grouped: bool = True, checked: bool = True, case: str = "upper") -> bytes:
    """Decode a key to bytes. See :func:`from_bytes`."""
    if with_length:
        if not grouped:
            raise TypeError("with_length requires grouped keys")
        h = _padded_hex(key, True, checked, case)
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
    h = to_hex(key, grouped=grouped, checked=checked, case=case)
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
