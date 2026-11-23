import json
import pathlib
import unittest

from base32_key import (Base32KeyError, from_bytes, from_hex, generate_key,
                        sign_key, to_bytes, to_hex, validate, verify_key)

VECTORS = json.loads(
    (pathlib.Path(__file__).resolve().parents[2] / "test-vectors.json").read_text()
)
MODES = {
    "grouped": dict(grouped=True, checked=True),
    "ungrouped": dict(grouped=False, checked=True),
    "groupedUnchecked": dict(grouped=True, checked=False),
    "ungroupedUnchecked": dict(grouped=False, checked=False),
}


class VectorTest(unittest.TestCase):
    def test_valid(self):
        for v in VECTORS["valid"]:
            for case in ("upper", "lower"):
                for mode, opts in MODES.items():
                    key = v[case][mode]
                    with self.subTest(hex=v["hex"], case=case, mode=mode):
                        self.assertEqual(from_hex(v["hex"], case=case, **opts), key)
                        self.assertEqual(to_hex(key, case=case, **opts), v["hex"])
                        self.assertEqual(validate(key, case=case, **opts), (True, [], None))

    def test_invalid(self):
        for v in VECTORS["invalid"]:
            with self.subTest(key=v["key"]):
                with self.assertRaises(Base32KeyError) as ctx:
                    to_hex(v["key"])
                self.assertEqual(ctx.exception.code, v["code"])
                self.assertEqual(ctx.exception.invalid_groups, v["invalidGroups"])
                self.assertEqual(validate(v["key"]), (False, v["invalidGroups"], v["code"]))

    def test_bytes(self):
        for v in VECTORS["bytes"]:
            data = bytes.fromhex(v["hex"])
            with self.subTest(hex=v["hex"]):
                self.assertEqual(from_bytes(data, with_length=True), v["withLength"])
                self.assertEqual(to_bytes(v["withLength"], with_length=True), data)

    def test_prefixed(self):
        for v in VECTORS["prefixed"]:
            with self.subTest(key=v["key"]):
                self.assertEqual(from_hex(v["hex"], prefix=v["prefix"]), v["key"])
                self.assertEqual(to_hex(v["key"], prefix=v["prefix"]), v["hex"])
        for v in VECTORS["invalidPrefixed"]:
            with self.subTest(key=v["key"]):
                self.assertEqual(validate(v["key"], prefix=v["prefix"]), (False, [], v["code"]))
                with self.assertRaises(Base32KeyError) as ctx:
                    to_hex(v["key"], prefix=v["prefix"])
                self.assertEqual(ctx.exception.code, v["code"])

    def test_normalized(self):
        for v in VECTORS["normalized"]:
            opts = {k: v[k] for k in ("grouped", "case", "prefix") if k in v}
            with self.subTest(input=v["input"]):
                self.assertEqual(to_hex(v["input"], normalize=True, **opts), v["hex"])

    def test_signed(self):
        for v in VECTORS["signed"]:
            opts = {k: v[k] for k in ("case", "prefix") if k in v}
            payload = bytes.fromhex(v["payloadHex"])
            with self.subTest(key=v["key"]):
                self.assertEqual(sign_key(payload, v["secret"], tag_bytes=v["tagBytes"], **opts), v["key"])
                self.assertEqual(verify_key(v["key"], v["secret"], tag_bytes=v["tagBytes"], **opts), payload)
        for v in VECTORS["invalidSigned"]:
            with self.assertRaises(Base32KeyError) as ctx:
                verify_key(v["key"], v["secret"], tag_bytes=v["tagBytes"])
            self.assertEqual(ctx.exception.code, v["code"])


class ApiTest(unittest.TestCase):
    def test_hex_prefix_and_errors(self):
        self.assertEqual(from_hex("0xC0FFEE"), "222ET-3ZZGN")
        for bad in ("", "0x", "xyz"):
            with self.assertRaises(Base32KeyError) as ctx:
                from_hex(bad)
            self.assertEqual(ctx.exception.code, "INVALID_HEX")
        with self.assertRaises(TypeError):
            from_hex(None)
        with self.assertRaises(TypeError):
            to_hex(None)
        with self.assertRaises(ValueError):
            from_hex("ab", case="title")

    def test_zero_round_trips(self):
        for opts in MODES.values():
            for case in ("upper", "lower"):
                self.assertEqual(to_hex(from_hex("0", case=case, **opts), case=case, **opts), "0")

    def test_bytes_options(self):
        self.assertEqual(to_bytes("222ET-3ZZGN"), b"\xc0\xff\xee")
        self.assertEqual(to_bytes("222ET-3ZZGN", length=4), b"\x00\xc0\xff\xee")
        self.assertEqual(to_bytes(from_hex("0"), length=0), b"")
        with self.assertRaises(Base32KeyError):
            to_bytes("222ET-3ZZGN", length=2)
        with self.assertRaises(ValueError):
            to_bytes("222ET-3ZZGN", length=-1)
        with self.assertRaises(ValueError):
            from_bytes(b"")
        with self.assertRaises(TypeError):
            from_bytes(b"a", with_length=True, grouped=False)
        with self.assertRaises(TypeError):
            to_bytes("22222", with_length=True, grouped=False)
        key = from_bytes(b"\x00\x01\x02", with_length=True)
        with self.assertRaises(Base32KeyError) as ctx:
            to_bytes(key.rsplit("-", 1)[0], with_length=True)
        self.assertEqual(ctx.exception.code, "INVALID_LENGTH")


    def test_prefix_options(self):
        with self.assertRaises(TypeError):
            from_hex("c0ffee", prefix="L-C")
        self.assertEqual(from_hex("c0ffee", prefix=""), "222ET-3ZZGN")
        self.assertEqual(to_bytes("lc 222et 3zzgn", prefix="LC", normalize=True), b"\xc0\xff\xee")
        self.assertEqual(from_bytes(b"\xc0\xff\xee", prefix="LC"), "LC-222ET-3ZZGN")
        self.assertEqual(validate("222et-3zzgn", normalize=True), (True, [], None))
        with self.assertRaises(Base32KeyError):
            to_hex("   ", normalize=True)

    def test_generate_key(self):
        key = generate_key()
        self.assertRegex(key, r"^([2-9A-Z]{5}-){3}[2-9A-Z]{5}$")
        self.assertTrue(validate(key)[0])
        self.assertEqual(len(generate_key(groups=2, grouped=False, checked=False)), 8)
        self.assertRegex(generate_key(groups=1, case="lower", prefix="LC"), r"^LC-[a-z2-9]{5}$")
        self.assertEqual(generate_key(groups=1, random=lambda n: bytes(n)), "22222")
        self.assertEqual(generate_key(groups=1, grouped=False, random=lambda n: bytes(n)), "22222")
        seen = []
        self.assertTrue(generate_key(filter=lambda k: seen.append(k) or len(seen) > 2))
        self.assertEqual(len(seen), 3)
        with self.assertRaises(Base32KeyError) as ctx:
            generate_key(filter=lambda k: False, max_attempts=3)
        self.assertEqual(ctx.exception.code, "GENERATION_FAILED")
        for bad in (dict(groups=0), dict(max_attempts=0), dict(random=lambda n: b"")):
            with self.assertRaises(ValueError):
                generate_key(**bad)

    def test_sign_key(self):
        payload = b"\x00\x00\x01\x2a"
        key = sign_key(payload, b"bytes secret")
        self.assertEqual(verify_key(key, "bytes secret"), payload)
        self.assertEqual(verify_key(key.lower().replace("-", " "), "bytes secret", normalize=True), payload)
        with self.assertRaises(Base32KeyError) as ctx:
            verify_key(key, "bytes secret", tag_bytes=6)
        self.assertEqual(ctx.exception.code, "INVALID_SIGNATURE")
        with self.assertRaises(Base32KeyError) as ctx:
            verify_key(from_bytes(b"\x01", with_length=True), "s")
        self.assertEqual(ctx.exception.code, "INVALID_SIGNATURE")
        typo = key[:6] + ("B" if key[6] == "A" else "A") + key[7:]
        with self.assertRaises(Base32KeyError) as ctx:
            verify_key(typo, "bytes secret")
        self.assertEqual((ctx.exception.code, ctx.exception.invalid_groups), ("CHECKSUM_MISMATCH", [1]))
        for bad in (3, 33):
            with self.assertRaises(ValueError):
                sign_key(payload, "s", tag_bytes=bad)
        with self.assertRaises(TypeError):
            sign_key(payload, "")


if __name__ == "__main__":
    unittest.main()
