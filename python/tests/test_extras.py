import contextlib
import io
import json
import pathlib
import re
import tempfile
import unittest

import base32_key
from base32_key import (Base32KeyError, format_input, suggest, to_bytes, to_hex,
                        validate, verify_key, sign_key)
from base32_key.__main__ import main

ROOT = pathlib.Path(__file__).resolve().parents[2]
VECTORS = json.loads((ROOT / "test-vectors.json").read_text())


def _kwargs(options):
    return {k: v for k, v in options.items() if k != "limit"}


class ExtraVectorTest(unittest.TestCase):
    def test_group_count(self):
        for v in VECTORS["groupCount"]:
            with self.subTest(key=v["key"]):
                self.assertEqual(validate(v["key"], groups=v["groups"]),
                                 (v["valid"], v["invalidGroups"], v.get("code")))

    def test_auto_case(self):
        for v in VECTORS["autoCase"]:
            with self.subTest(key=v["key"]):
                if "hex" in v:
                    self.assertEqual(to_hex(v["key"], case="auto"), v["hex"])
                else:
                    with self.assertRaises(Base32KeyError) as ctx:
                        to_hex(v["key"], case="auto")
                    self.assertEqual(ctx.exception.code, v["code"])
                    self.assertEqual(ctx.exception.invalid_groups, v["invalidGroups"])

    def test_formatted(self):
        for v in VECTORS["formatted"]:
            with self.subTest(input=v["input"], options=v["options"]):
                self.assertEqual(format_input(v["input"], **v["options"]), v["output"])

    def test_suggestions(self):
        for v in VECTORS["suggestions"]:
            with self.subTest(input=v["input"], options=v["options"]):
                self.assertEqual(suggest(v["input"], **v["options"]), v["suggestions"])


class ExtraApiTest(unittest.TestCase):
    def test_groups_errors(self):
        with self.assertRaises(Base32KeyError) as ctx:
            to_hex("222ET", groups=2)
        self.assertEqual(ctx.exception.code, "INVALID_LENGTH")
        self.assertEqual(str(ctx.exception), "Invalid key: expected 2 groups, got 1")
        self.assertEqual(ctx.exception.invalid_groups, [1])
        self.assertEqual(to_hex("222ET-3ZZGN", groups=2), "c0ffee")
        for bad in (0, -1, True, "2"):
            with self.assertRaises(ValueError):
                validate("222ET", groups=bad)
        with self.assertRaises(TypeError):
            validate("222ET", grouped=False, groups=1)

    def test_auto_case_elsewhere(self):
        key = sign_key(b"\x00\x2a", "s3cret", case="lower")
        self.assertEqual(verify_key(key, "s3cret", case="auto"), b"\x00\x2a")
        self.assertEqual(to_bytes("aaan3-b99qw", case="auto"), bytes.fromhex("c0ffee"))
        with self.assertRaises(ValueError):
            base32_key.from_hex("c0ffee", case="auto")
        with self.assertRaises(ValueError):
            validate("222ET", case="title")

    def test_format_and_suggest_errors(self):
        with self.assertRaises(TypeError):
            format_input(None)  # type: ignore[arg-type]
        for bad in (0, True, 1.5):
            with self.assertRaises(ValueError):
                suggest("222TE", limit=bad)  # type: ignore[arg-type]
        self.assertEqual(suggest("XX-222TE-3ZZGN", prefix="LC"), [])
        self.assertEqual(suggest("222TE", groups=2), [])

    def test_version_matches_pyproject(self):
        text = (ROOT / "python" / "pyproject.toml").read_text()
        match = re.search(r'^version = "([^"]+)"', text, re.M)
        assert match is not None
        self.assertEqual(base32_key.__version__, match.group(1))


class FakeStdin(io.StringIO):
    def __init__(self, text="", tty=False):
        super().__init__(text)
        self.tty = tty

    def isatty(self):
        return self.tty


def run(*argv, stdin=""):
    out, err = io.StringIO(), io.StringIO()
    tty = stdin is None
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = main(list(argv), stdin=FakeStdin(stdin or "", tty))
    return code, out.getvalue(), err.getvalue()


class CliTest(unittest.TestCase):
    def test_encode_decode(self):
        self.assertEqual(run("encode", "c0ffee"), (0, "222ET-3ZZGN\n", ""))
        self.assertEqual(run("encode", "--lower", "c0ffee")[1], "aaan3-b99qw\n")
        self.assertEqual(run("decode", "222ET-3ZZGN"), (0, "c0ffee\n", ""))
        self.assertEqual(run("decode", "--upper-hex", "--case", "auto", "aaan3-b99qw")[1],
                         "C0FFEE\n")
        self.assertEqual(run("decode", "--normalize", stdin="222et 3zzgn\n\n")[1], "c0ffee\n")
        code, out, err = run("decode", "222ET-3ZZGX")
        self.assertEqual(code, 1)
        self.assertIn("group 2", err)

    def test_json(self):
        code, out, _ = run("decode", "--json", "222ET-3ZZGN", "222ET-3ZZGX")
        lines = [json.loads(line) for line in out.splitlines()]
        self.assertEqual(code, 1)
        self.assertEqual(lines[0], {"input": "222ET-3ZZGN", "hex": "c0ffee"})
        self.assertEqual(lines[1]["code"], "CHECKSUM_MISMATCH")
        code, out, _ = run("encode", "--json", "zz")
        self.assertEqual((code, json.loads(out)["code"]), (1, "INVALID_HEX"))

    def test_validate(self):
        self.assertEqual(run("validate", "222et3zzgn"), (0, "222et3zzgn: valid\n", ""))
        code, out, _ = run("validate", "--strict", "222et3zzgn")
        self.assertEqual(code, 1)
        self.assertIn("invalid (INVALID_CHARACTER) in group 1", out)
        code, out, _ = run("validate", "--groups", "2", "222ET")
        self.assertEqual(out, "222ET: invalid (INVALID_LENGTH) in group 2\n")
        code, out, _ = run("validate", "--json", "222ET-3ZZGX")
        self.assertEqual(json.loads(out)["invalidGroups"], [1])

    def test_generate(self):
        code, out, _ = run("generate", "--count", "3", "--groups", "2")
        keys = out.split()
        self.assertEqual((code, len(keys)), (0, 3))
        for key in keys:
            self.assertEqual(validate(key, groups=2)[0], True)
        self.assertEqual(run("generate", "--case", "auto")[0], 2)
        self.assertEqual(run("generate", "--count", "0")[0], 2)

    def test_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp, "in.bin")
            dst = pathlib.Path(tmp, "out.bin")
            src.write_bytes(b"\x00\x01\xff")
            code, out, _ = run("encode", "--file", str(src))
            key = out.strip()
            self.assertEqual(code, 0)
            code, out, _ = run("decode", "--file", str(dst), key)
            self.assertEqual((code, out), (0, f"3 bytes written to {dst}\n"))
            self.assertEqual(dst.read_bytes(), b"\x00\x01\xff")
            self.assertEqual(run("decode", "--file", str(dst), key, key)[0], 2)
            self.assertEqual(run("decode", "--file", str(dst), "222ET")[0], 1)
            self.assertEqual(run("encode", "--file", str(pathlib.Path(tmp, "nope")))[0], 2)

    def test_usage(self):
        self.assertEqual(run()[0], 2)
        self.assertEqual(run("bogus")[0], 2)
        self.assertEqual(run("decode", stdin=None)[0], 2)
        self.assertEqual(run("--help")[0], 0)


if __name__ == "__main__":
    unittest.main()
