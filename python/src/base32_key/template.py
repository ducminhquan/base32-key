"""Key templates: keys that carry typed fields, signed and optionally
encrypted. Same definitions, layout and keys as ``base32-key/template`` in
the npm package (see SPEC.md, "Key templates")."""

from __future__ import annotations

import datetime as _dt
import hashlib
import hmac
import math
import re
from typing import Any, Callable, Dict, Mapping, Optional, Sequence, Tuple, Union

from . import Base32KeyError, _check_prefix, _padded_hex, from_hex

__all__ = ["KeyTemplate", "define_key_template", "verify_key_templates", "presets"]

Value = Union[int, str, bool, _dt.date]

_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_EPOCH = _dt.date(2020, 1, 1)
_ROUNDS = 10
_LABEL = b"B32K"
_MAX_FIELD_BITS = 256


def _check_int(name: str, value: Any, lo: int, hi: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not lo <= value <= hi:
        raise ValueError(f"{name} must be an integer from {lo} to {hi}, got {value!r}")
    return value


def _days(name: str, value: Any) -> int:
    """Days since 2020-01-01 of a ``date`` or a ``'YYYY-MM-DD'`` string."""
    if isinstance(value, _dt.datetime):
        value = value.date()
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            value = _dt.date.fromisoformat(value)
        except ValueError:
            pass
    if not isinstance(value, _dt.date):
        raise ValueError(f'{name} must be a date "YYYY-MM-DD", got {value!r}')
    return (value - _EPOCH).days


class _Field:
    def __init__(self, name: str, bits: int, encode: Callable[[Any], int],
                 decode: Callable[[int], Optional[Value]]):
        self.name = name
        self.bits = bits
        self.encode = encode
        self.decode = decode


def _field(spec: Mapping[str, Any], index: int) -> _Field:
    where = f"fields[{index}]"
    if not isinstance(spec, Mapping):
        raise TypeError(f"{where} must be an object")
    name = spec.get("name")
    if not isinstance(name, str) or not _NAME.match(name):
        raise TypeError(f"{where}.name must be an identifier, got {name!r}")
    kind = spec.get("type")
    if kind == "uint":
        bits = _check_int(f"{name}.bits", spec.get("bits"), 1, 48)
        unit = _check_int(f"{name}.unit", spec.get("unit", 1), 1, 2**53 - 1)
        limit = min((2**bits - 1) * unit, 2**53 - 1)

        def enc_uint(value: Any) -> int:
            _check_int(name, value, 0, limit)
            if value % unit:
                raise ValueError(f"{name} must be a multiple of {unit}, got {value!r}")
            return int(value // unit)

        return _Field(name, bits, enc_uint, lambda stored: stored * unit)
    if kind == "date":
        bits = _check_int(f"{name}.bits", spec.get("bits", 16), 8, 24)
        last = _EPOCH + _dt.timedelta(days=2**bits - 1)

        def enc_date(value: Any) -> int:
            days = _days(name, value)
            if not 0 <= days < 2**bits:
                raise ValueError(f"{name} must be from 2020-01-01 to {last}, got {value!r}")
            return days

        return _Field(name, bits, enc_date,
                      lambda stored: _EPOCH + _dt.timedelta(days=stored))
    if kind == "enum":
        values = spec.get("values")
        if (not isinstance(values, (list, tuple)) or not 2 <= len(values) <= 256
                or len(set(values)) != len(values)
                or any(not isinstance(v, str) or not v for v in values)):
            raise TypeError(f"{name}.values must be 2 to 256 distinct non-empty strings")
        options = list(values)

        def enc_enum(value: Any) -> int:
            if value not in options:
                raise ValueError(f"{name} must be one of {', '.join(options)}, got {value!r}")
            return options.index(value)

        return _Field(name, max(1, math.ceil(math.log2(len(options)))), enc_enum,
                      lambda stored: options[stored] if stored < len(options) else None)
    if kind == "bool":
        def enc_bool(value: Any) -> int:
            if not isinstance(value, bool):
                raise TypeError(f"{name} must be true or false, got {value!r}")
            return int(value)

        return _Field(name, 1, enc_bool, lambda stored: stored == 1)
    raise TypeError(f"{where}.type must be uint, date, enum or bool, got {kind!r}")


def _mask(bits: int) -> int:
    return (1 << bits) - 1


def _round(key: bytes, r: int, x: int, x_bits: int, width: int) -> int:
    data = _LABEL + bytes([r]) + x.to_bytes((x_bits + 7) // 8, "big")
    mac = hmac.new(key, data, hashlib.sha256).digest()
    return int.from_bytes(mac[:(width + 7) // 8], "big") & _mask(width)


def _feistel(key: bytes, value: int, bits: int, decrypt: bool) -> int:
    right_bits = bits // 2
    left_bits = bits - right_bits
    left, right = value >> right_bits, value & _mask(right_bits)
    for step in range(_ROUNDS):
        r = _ROUNDS - 1 - step if decrypt else step
        if r % 2 == 0:
            left ^= _round(key, r, right, right_bits, left_bits)
        else:
            right ^= _round(key, r, left, left_bits, right_bits)
    return (left << right_bits) | right


def _secret(secret: Union[str, bytes]) -> bytes:
    raw = secret.encode() if isinstance(secret, str) else bytes(secret)
    if not raw:
        raise TypeError("The signing secret must not be empty")
    return raw


def _unknown(detail: str) -> Base32KeyError:
    return Base32KeyError("UNKNOWN_TEMPLATE", f"Invalid key: {detail}")


class KeyTemplate:
    """A key layout made by :func:`define_key_template`."""

    def __init__(self, definition: Mapping[str, Any]):
        if not isinstance(definition, Mapping):
            raise TypeError("The template definition must be an object")
        self.definition = dict(definition)
        self.id = _check_int("id", definition.get("id"), 0, 255)
        encrypt = definition.get("encrypt", False)
        if not isinstance(encrypt, bool):
            raise TypeError("encrypt must be true or false")
        self.encrypt = encrypt
        tag = definition.get("tagBytes", 5)
        if not (tag == 0 and encrypt):
            if not isinstance(tag, int) or isinstance(tag, bool) or not 4 <= tag <= 32:
                raise ValueError(f"tagBytes must be an integer from 4 to 32, got {tag!r}")
        self.tag_bytes: int = tag
        self.case = definition.get("case", "upper")
        if self.case not in ("upper", "lower"):
            raise ValueError(f"Invalid case option: {self.case}")
        self.prefix = _check_prefix(definition.get("prefix"))
        specs = definition.get("fields")
        if not isinstance(specs, (list, tuple)) or not specs:
            raise TypeError("fields must be a non-empty array")
        self._fields = [_field(spec, i) for i, spec in enumerate(specs)]
        names = [f.name for f in self._fields]
        if len(set(names)) != len(names):
            raise TypeError("Field names must be unique")
        self._names = set(names)
        self.expires: Optional[str] = definition.get("expires")
        if self.expires is not None and not any(
                s.get("name") == self.expires and s.get("type") == "date" for s in specs):
            raise TypeError(f"expires must name a date field, got {self.expires}")
        field_bits = sum(f.bits for f in self._fields)
        if field_bits > _MAX_FIELD_BITS:
            raise ValueError(f"The fields need {field_bits} bits, more than {_MAX_FIELD_BITS}")
        self._field_bits = field_bits
        self._tag_bits = self.tag_bytes * 8
        self.groups = math.ceil((8 + field_bits + self._tag_bits) / 20)
        self._body_bits = self.groups * 20 - self._tag_bits
        self._pad_bits = self._body_bits - 8 - field_bits

    def _tag(self, key: bytes, body: int) -> int:
        if not self.tag_bytes:
            return 0
        data = body.to_bytes((self._body_bits + 7) // 8, "big")
        return int.from_bytes(hmac.new(key, data, hashlib.sha256).digest()[:self.tag_bytes], "big")

    def _unpack(self, body: int) -> Dict[str, Value]:
        if body >> (self._body_bits - 8) != self.id or body & _mask(self._pad_bits):
            raise _unknown(f"it was not made with template {self.id}")
        bits = body >> self._pad_bits
        out: Dict[str, Value] = {}
        for field in reversed(self._fields):
            value = field.decode(bits & _mask(field.bits))
            if value is None:
                raise _unknown(f"{field.name} is out of range")
            out[field.name] = value
            bits >>= field.bits
        return {f.name: out[f.name] for f in self._fields}

    def sign(self, values: Mapping[str, Any], secret: Union[str, bytes]) -> str:
        """Make a key that carries ``values``, signed with ``secret``."""
        if not isinstance(values, Mapping):
            raise TypeError("values must be an object")
        for name in values:
            if name not in self._names:
                raise TypeError(f"Unknown field {name}")
        body = self.id
        for field in self._fields:
            if field.name not in values:
                raise TypeError(f"Missing field {field.name}")
            body = (body << field.bits) | field.encode(values[field.name])
        body <<= self._pad_bits
        key = _secret(secret)
        if self.encrypt:
            body = _feistel(key, body, self._body_bits, False)
        value = (body << self._tag_bits) | self._tag(key, body)
        return from_hex(f"{value:0{self.groups * 5}x}", case=self.case, prefix=self.prefix)

    def verify(self, key: str, secret: Union[str, bytes], *,
               today: Union[str, _dt.date, None] = None,
               normalize: bool = True) -> Dict[str, Value]:
        """Check a key and return its values (dates as ``datetime.date``).

        Raises :class:`Base32KeyError`: the usual codes for a mistyped key,
        ``UNKNOWN_TEMPLATE`` for a key of another template,
        ``INVALID_SIGNATURE`` for a key not signed with ``secret`` and
        ``EXPIRED`` after the ``expires`` date. ``today`` defaults to the
        current UTC date: pass the local date where the key is redeemed.
        """
        value = int(_padded_hex(key, True, True, "auto", normalize, self.prefix,
                                self.groups), 16)
        body = value >> self._tag_bits
        if not self.encrypt:
            self._unpack(body)
        raw = _secret(secret)
        tag = value & _mask(self._tag_bits)
        if self.tag_bytes and not hmac.compare_digest(
                tag.to_bytes(self.tag_bytes, "big"),
                self._tag(raw, body).to_bytes(self.tag_bytes, "big")):
            raise Base32KeyError("INVALID_SIGNATURE", "Invalid key: the signature does not match")
        if self.encrypt:
            body = _feistel(raw, body, self._body_bits, True)
        values = self._unpack(body)
        if self.expires is not None:
            now = (_dt.datetime.now(_dt.timezone.utc).date() if today is None
                   else _EPOCH + _dt.timedelta(days=_days("today", today)))
            expires = values[self.expires]
            assert isinstance(expires, _dt.date)
            if now > expires:
                raise Base32KeyError("EXPIRED", f"Invalid key: it expired on {expires}")
        return values


def define_key_template(definition: Mapping[str, Any]) -> KeyTemplate:
    """Define a kind of key that carries typed fields, e.g. a voucher.

    ``definition`` is the same JSON as ``defineKeyTemplate`` in the npm
    package: ``id`` (0 to 255), ``fields`` (``uint``, ``date``, ``enum``,
    ``bool``), and optionally ``expires``, ``tagBytes``, ``encrypt``,
    ``prefix`` and ``case``.

    >>> voucher = define_key_template(presets.voucher(prefix="LC"))
    >>> voucher.sign({"campaign": 12, "expires": "2026-12-31",
    ...               "amount": 50000, "serial": 1}, "s3cret")
    'LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ'
    """
    return KeyTemplate(definition)


def verify_key_templates(templates: Sequence[KeyTemplate], key: str,
                         secret: Union[str, bytes], *,
                         today: Union[str, _dt.date, None] = None,
                         normalize: bool = True) -> Tuple[KeyTemplate, Dict[str, Value]]:
    """Verify ``key`` against several templates and return
    ``(template, values)`` for the one that fits."""
    signature_error: Optional[Base32KeyError] = None
    for template in templates:
        try:
            return template, template.verify(key, secret, today=today, normalize=normalize)
        except Base32KeyError as error:
            if error.code == "INVALID_SIGNATURE":
                signature_error = error
            elif not (error.code in ("UNKNOWN_TEMPLATE", "INVALID_PREFIX")
                      or (error.code == "INVALID_LENGTH" and " groups, got " in str(error))):
                raise
    raise signature_error or _unknown("it matches none of the templates")


class _Presets:
    """Ready-made definitions; each takes overrides, e.g.
    ``presets.voucher(prefix="LC", encrypt=True)``."""

    @staticmethod
    def voucher(**overrides: Any) -> Dict[str, Any]:
        """Id 1: campaign, expires, amount (multiples of 1000), serial."""
        return {"id": 1, "fields": [
            {"name": "campaign", "type": "uint", "bits": 12},
            {"name": "expires", "type": "date"},
            {"name": "amount", "type": "uint", "bits": 16, "unit": 1000},
            {"name": "serial", "type": "uint", "bits": 20},
        ], "expires": "expires", **_camel(overrides)}

    @staticmethod
    def activation(**overrides: Any) -> Dict[str, Any]:
        """Id 2: product, expires, serial."""
        return {"id": 2, "fields": [
            {"name": "product", "type": "uint", "bits": 16},
            {"name": "expires", "type": "date"},
            {"name": "serial", "type": "uint", "bits": 24},
        ], "expires": "expires", **_camel(overrides)}

    @staticmethod
    def member(**overrides: Any) -> Dict[str, Any]:
        """Id 3: member (32 bits) and tier (standard, silver, gold, platinum)."""
        return {"id": 3, "fields": [
            {"name": "member", "type": "uint", "bits": 32},
            {"name": "tier", "type": "enum",
             "values": ["standard", "silver", "gold", "platinum"]},
        ], **_camel(overrides)}


def _camel(overrides: Mapping[str, Any]) -> Dict[str, Any]:
    """Accept tag_bytes as well as tagBytes."""
    return {("tagBytes" if k == "tag_bytes" else k): v for k, v in overrides.items()}


presets = _Presets()

