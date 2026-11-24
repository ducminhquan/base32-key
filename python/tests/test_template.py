import contextlib
import datetime
import io
import json
import tempfile
import pathlib
import unittest

from base32_key import Base32KeyError
from base32_key.__main__ import main
from base32_key.template import define_key_template, presets, verify_key_templates

VECTORS = json.loads(
    (pathlib.Path(__file__).resolve().parents[2] / "test-vectors.json").read_text()
)
VALUES = {"campaign": 12, "expires": "2026-12-31", "amount": 50000, "serial": 1}


def _plain(values):
    return {k: str(v) if isinstance(v, datetime.date) else v for k, v in values.items()}


class TemplateVectorTest(unittest.TestCase):
    def test_vectors(self):
        for v in VECTORS["templates"]:
            with self.subTest(key=v["key"]):
                template = define_key_template(v["definition"])
                self.assertEqual(template.sign(v["values"], v["secret"]), v["key"])
                self.assertEqual(
                    _plain(template.verify(v["key"], v["secret"], today="2020-01-01")),
                    v["values"])

    def test_invalid_vectors(self):
        for v in VECTORS["invalidTemplates"]:
            with self.subTest(key=v["key"], code=v["code"]):
                template = define_key_template(v["definition"])
                with self.assertRaises(Base32KeyError) as ctx:
                    template.verify(v["key"], v["secret"], today=v.get("today"))
                self.assertEqual(ctx.exception.code, v["code"])


class TemplateTest(unittest.TestCase):
    def setUp(self):
        self.voucher = define_key_template(presets.voucher(prefix="LC"))

    def test_round_trip_and_dates(self):
        key = self.voucher.sign({**VALUES, "expires": datetime.date(2026, 12, 31)}, b"s3cret")
        self.assertEqual(key, "LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ")
        values = self.voucher.verify(key.lower().replace("-", " "), "s3cret",
                                     today=datetime.date(2026, 12, 31))
        self.assertEqual(values["expires"], datetime.date(2026, 12, 31))
        self.assertEqual(self.voucher.groups, 6)
        with self.assertRaises(Base32KeyError) as ctx:
            self.voucher.verify(key, "s3cret", today="2027-01-01")
        self.assertEqual(ctx.exception.code, "EXPIRED")
        self.voucher.verify(key, "s3cret", today=datetime.datetime(2026, 1, 1, 12))

    def test_default_today(self):
        far = define_key_template(presets.activation())
        key = far.sign({"product": 1, "expires": "2199-01-01", "serial": 2}, "k")
        self.assertEqual(far.verify(key, "k")["serial"], 2)
        old = far.sign({"product": 1, "expires": "2020-01-02", "serial": 2}, "k")
        with self.assertRaises(Base32KeyError) as ctx:
            far.verify(old, "k")
        self.assertEqual(ctx.exception.code, "EXPIRED")

    def test_encrypted_serials_look_unrelated(self):
        order = define_key_template({"id": 9, "fields": [
            {"name": "order", "type": "uint", "bits": 40}], "encrypt": True, "tagBytes": 0})
        keys = [order.sign({"order": n}, "s") for n in range(200)]
        self.assertEqual(len({k[:5] for k in keys}) > 150, True)
        for n, key in enumerate(keys):
            self.assertEqual(order.verify(key, "s"), {"order": n})

    def test_verify_errors(self):
        key = self.voucher.sign(VALUES, "s3cret")
        for bad, code in [("XX-262EC", "INVALID_PREFIX"), ("LC-262EC", "INVALID_LENGTH")]:
            with self.assertRaises(Base32KeyError) as ctx:
                self.voucher.verify(bad, "s3cret")
            self.assertEqual(ctx.exception.code, code)
        with self.assertRaises(ValueError):
            self.voucher.verify(key, "s3cret", today="nope")
        with self.assertRaises(TypeError):
            self.voucher.verify(key, "")
        member = define_key_template({"id": 3, "fields": [
            {"name": "tier", "type": "enum", "values": ["a", "b", "c"]}], "tagBytes": 4})
        # An enum index past the list: sign the raw index with a 2-bit uint.
        raw = define_key_template({"id": 3, "fields": [
            {"name": "tier", "type": "uint", "bits": 2}], "tagBytes": 4})
        with self.assertRaises(Base32KeyError) as ctx:
            member.verify(raw.sign({"tier": 3}, "s"), "s")
        self.assertEqual(ctx.exception.code, "UNKNOWN_TEMPLATE")

    def test_verify_key_templates(self):
        templates = [define_key_template(presets.member()),
                     define_key_template(presets.activation(prefix="LC")),
                     self.voucher]
        key = self.voucher.sign(VALUES, "s3cret")
        template, values = verify_key_templates(templates, key, "s3cret", today="2026-01-01")
        self.assertIs(template, self.voucher)
        self.assertEqual(values["amount"], 50000)
        with self.assertRaises(Base32KeyError) as ctx:
            verify_key_templates(templates, key, "wrong", today="2026-01-01")
        self.assertEqual(ctx.exception.code, "INVALID_SIGNATURE")
        with self.assertRaises(Base32KeyError) as ctx:
            verify_key_templates(templates[:1], key, "s3cret")
        self.assertEqual(ctx.exception.code, "UNKNOWN_TEMPLATE")
        with self.assertRaises(Base32KeyError) as ctx:
            verify_key_templates(templates, "LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURH!", "s")
        self.assertEqual(ctx.exception.code, "INVALID_CHARACTER")

    def test_sign_errors(self):
        cases = [
            ({**VALUES, "extra": 1}, TypeError),
            ({k: v for k, v in VALUES.items() if k != "serial"}, TypeError),
            ({**VALUES, "amount": 50001}, ValueError),
            ({**VALUES, "amount": -1000}, ValueError),
            ({**VALUES, "amount": True}, ValueError),
            ({**VALUES, "expires": "2019-12-31"}, ValueError),
            ({**VALUES, "expires": "2026-02-30"}, ValueError),
            ({**VALUES, "expires": 5}, ValueError),
        ]
        for values, error in cases:
            with self.subTest(values=values), self.assertRaises(error):
                self.voucher.sign(values, "s3cret")
        with self.assertRaises(TypeError):
            self.voucher.sign([], "s3cret")  # type: ignore[arg-type]
        flags = define_key_template({"id": 4, "fields": [
            {"name": "on", "type": "bool"},
            {"name": "color", "type": "enum", "values": ["red", "blue"]}]})
        for values in ({"on": 1, "color": "red"}, {"on": True, "color": "green"}):
            with self.subTest(values=values), self.assertRaises((TypeError, ValueError)):
                flags.sign(values, "s")
        self.assertEqual(flags.verify(flags.sign({"on": True, "color": "blue"}, "s"), "s"),
                         {"on": True, "color": "blue"})

    def test_definition_errors(self):
        base = {"id": 1, "fields": [{"name": "n", "type": "uint", "bits": 8}]}
        bad = [
            [],
            {**base, "id": 256},
            {**base, "id": True},
            {**base, "encrypt": "yes"},
            {**base, "tagBytes": 0},
            {**base, "tagBytes": 3},
            {**base, "tagBytes": 33},
            {**base, "case": "auto"},
            {**base, "prefix": "a-b"},
            {**base, "fields": []},
            {**base, "fields": ["n"]},
            {**base, "fields": [{"name": "1n", "type": "uint", "bits": 8}]},
            {**base, "fields": [{"name": "n", "type": "float"}]},
            {**base, "fields": [{"name": "n", "type": "uint", "bits": 49}]},
            {**base, "fields": [{"name": "n", "type": "uint", "bits": 8, "unit": 0}]},
            {**base, "fields": [{"name": "n", "type": "date", "bits": 7}]},
            {**base, "fields": [{"name": "n", "type": "enum", "values": ["a"]}]},
            {**base, "fields": [{"name": "n", "type": "enum", "values": ["a", "a"]}]},
            {**base, "fields": [{"name": "n", "type": "enum", "values": ["a", ""]}]},
            {**base, "fields": [{"name": "n", "type": "bool"}, {"name": "n", "type": "bool"}]},
            {**base, "expires": "n"},
            {**base, "fields": [{"name": f"n{i}", "type": "uint", "bits": 48}
                                for i in range(6)]},
        ]
        for definition in bad:
            with self.subTest(definition=definition):
                with self.assertRaises((TypeError, ValueError)):
                    define_key_template(definition)  # type: ignore[arg-type]

    def test_presets(self):
        self.assertEqual(define_key_template(presets.activation()).groups, 6)
        member = define_key_template(presets.member(tag_bytes=8, encrypt=True))
        self.assertEqual(member.groups, 6)
        key = member.sign({"member": 42, "tier": "platinum"}, "s")
        self.assertEqual(member.verify(key, "s"), {"member": 42, "tier": "platinum"})


def cli(*argv, stdin="", secret="s3cret"):
    out, err = io.StringIO(), io.StringIO()
    env = {} if secret is None else {"BASE32_KEY_SECRET": secret}
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = main(list(argv), stdin=io.StringIO(stdin), env=env)
    return code, out.getvalue(), err.getvalue()


SET = ["--set", "campaign=12", "--set", "expires=2026-12-31", "--set", "amount=50000"]
KEY = "LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ"


class TemplateCliTest(unittest.TestCase):
    def test_sign(self):
        self.assertEqual(cli("sign", "--preset", "voucher", "--prefix", "LC", *SET,
                             "--set", "serial=1"), (0, KEY + "\n", ""))
        code, out, _ = cli("sign", "--preset", "voucher", *SET, "--serial-from", "1",
                           "--count", "3", "--csv")
        self.assertEqual(out.splitlines(), [
            "key,campaign,expires,amount,serial",
            "262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ,12,2026-12-31,50000,1",
            "262EC-39Y2M-2EJ2F-22J2X-WSEZZ-SZ2BD,12,2026-12-31,50000,2",
            "262EC-39Y2M-2EJ2F-22S23-EQST9-CCSB8,12,2026-12-31,50000,3",
        ])
        code, out, _ = cli("sign", "--preset", "member", "--set", "member=1",
                           "--set", "tier=gold", "--json")
        self.assertEqual(json.loads(out)["values"], {"member": 1, "tier": "gold"})

    def test_template_file_and_bool(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp, "t.json")
            path.write_text(json.dumps({"id": 5, "fields": [
                {"name": "on", "type": "bool"}, {"name": "n", "type": "uint", "bits": 8}]}))
            code, out, _ = cli("sign", "--template", str(path), "--set", "on=true",
                               "--set", "n=3", "--csv")
            self.assertEqual(code, 0)
            key = out.splitlines()[1].split(",")[0]
            self.assertEqual(out.splitlines()[1], f"{key},true,3")
            self.assertEqual(cli("verify", "--template", str(path), key),
                             (0, f"{key}: valid on=true n=3\n", ""))
            code, _, err = cli("sign", "--template", str(path), "--set", "on=yes",
                               "--set", "n=x")
            self.assertEqual(code, 2)

    def test_verify(self):
        self.assertEqual(
            cli("verify", "--preset", "voucher", "--prefix", "LC", "--today", "2026-01-01",
                stdin=KEY + "\n"),
            (0, f"{KEY}: valid campaign=12 expires=2026-12-31 amount=50000 serial=1\n", ""))
        code, out, _ = cli("verify", "--preset", "voucher", "--prefix", "LC", "--json",
                           "--today", "2027-01-01", KEY)
        self.assertEqual((code, json.loads(out)["code"]), (1, "EXPIRED"))
        code, _, err = cli("verify", "--preset", "voucher", "--prefix", "LC", KEY,
                           secret="wrong")
        self.assertEqual(code, 1)
        self.assertIn("signature", err)

    def test_usage_errors(self):
        for argv, secret in [
            (["sign", *SET], "s"),
            (["sign", "--preset", "voucher", "--template", "x.json"], "s"),
            (["sign", "--preset", "voucher", *SET], None),
            (["sign", "--preset", "voucher", "--set", "nope"], "s"),
            (["sign", "--preset", "voucher", "--set", "color=red"], "s"),
            (["sign", "--preset", "voucher", *SET, "--count", "2"], "s"),
            (["sign", "--preset", "voucher", *SET], "s"),  # missing serial
            (["verify", "--preset", "voucher", "--today", "soon", KEY], "s"),
            (["verify", "--template", "/nonexistent.json", KEY], "s"),
        ]:
            with self.subTest(argv=argv):
                code, _, err = cli(*argv, secret=secret)
                self.assertEqual(code, 2)
                self.assertTrue(err)


if __name__ == "__main__":
    unittest.main()
