"""Command line interface, the same commands as the npm package's CLI.

Run ``python -m base32_key --help`` or the ``base32-key`` script.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence, TextIO

from . import (
    Base32KeyError,
    __version__,
    from_bytes,
    from_hex,
    generate_key,
    to_bytes,
    to_hex,
    validate,
)

_EPILOG = "Values are read from standard input, one per line, when none are given."
SECRET_ENV = "BASE32_KEY_SECRET"
_SECRET_EPILOG = f"The signing secret is read from the {SECRET_ENV} environment variable."


class _UsageError(Exception):
    pass


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="base32-key",
        description="Encode, decode, validate and generate Base32 keys.",
        epilog=_EPILOG,
    )
    parser.add_argument("-v", "--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--case", choices=["upper", "lower", "auto"],
                        help="alphabet: upper (default), lower, or auto when decoding")
    common.add_argument("--lower", action="store_true", help="same as --case lower")
    common.add_argument("--ungrouped", action="store_true",
                        help="keys are not split into groups")
    common.add_argument("--unchecked", action="store_true", help="keys have no check digits")
    common.add_argument("--json", action="store_true", help="print one JSON object per value")
    groups_help = "the key must have exactly N groups"

    encode = sub.add_parser("encode", parents=[common], help="encode hex strings as keys",
                            epilog=_EPILOG)
    encode.add_argument("--file", help="encode the bytes of a file, keeping its length")
    encode.add_argument("values", nargs="*", metavar="hex")

    decode = sub.add_parser("decode", parents=[common], help="decode keys to hex strings",
                            epilog=_EPILOG)
    decode.add_argument("--groups", type=_positive, metavar="N", help=groups_help)
    decode.add_argument("--normalize", action="store_true",
                        help="ignore whitespace, case and hyphen placement")
    decode.add_argument("--upper-hex", action="store_true", help="print uppercase hex")
    decode.add_argument("--file", help="write the bytes of one --file key to this path")
    decode.add_argument("values", nargs="*", metavar="key")

    check = sub.add_parser("validate", parents=[common],
                           help="check keys; exit code 1 if any is invalid", epilog=_EPILOG)
    check.add_argument("--groups", type=_positive, metavar="N", help=groups_help)
    check.add_argument("--strict", action="store_true",
                       help="check the key exactly as typed")
    check.add_argument("values", nargs="*", metavar="key")

    generate = sub.add_parser("generate", parents=[common], help="generate random keys")
    generate.add_argument("--groups", type=_positive, default=4, metavar="N",
                          help="groups per key (default 4)")
    generate.add_argument("--count", type=_positive, default=1, metavar="N",
                          help="number of keys (default 1)")

    source = argparse.ArgumentParser(add_help=False)
    source.add_argument("--template", metavar="FILE", help="key template definition (JSON)")
    source.add_argument("--preset", choices=["voucher", "activation", "member"],
                        help="a ready-made template")
    source.add_argument("--prefix", help="override the template's prefix")
    source.add_argument("--json", action="store_true", help="print one JSON object per key")

    sign = sub.add_parser("sign", parents=[source], epilog=_SECRET_EPILOG,
                          help="make keys from a key template (vouchers, ...)")
    sign.add_argument("--set", action="append", default=[], metavar="NAME=VALUE",
                      help="a field value (repeat for each field)")
    sign.add_argument("--count", type=_positive, default=1, metavar="N",
                      help="number of keys (default 1)")
    sign.add_argument("--serial-from", type=int, metavar="N",
                      help="number the keys from N in --serial-field")
    sign.add_argument("--serial-field", default="serial", metavar="NAME",
                      help="field that --serial-from fills (default serial)")
    sign.add_argument("--csv", action="store_true",
                      help="print CSV with a header: key and fields")

    verify = sub.add_parser("verify", parents=[source],
                            epilog=f"{_EPILOG} {_SECRET_EPILOG}",
                            help="check template keys and print their values")
    verify.add_argument("--today", metavar="YYYY-MM-DD",
                        help="date for the expiry check (default: UTC today)")
    verify.add_argument("values", nargs="*", metavar="key")
    return parser


def _positive(value: str) -> int:
    try:
        number = int(value)
    except ValueError:
        number = 0
    if number < 1:
        raise argparse.ArgumentTypeError(f"must be a positive integer, got {value!r}")
    return number


def _values(given: list[str], stdin: TextIO) -> list[str]:
    if given:
        return given
    if stdin.isatty():
        raise _UsageError("No values given")
    return [line.strip() for line in stdin.read().splitlines() if line.strip()]


def _load_template(args: argparse.Namespace) -> Any:
    from .template import define_key_template, presets

    if args.template is not None and args.preset is not None:
        raise _UsageError("Use --template or --preset, not both")
    if args.template is not None:
        definition = json.loads(Path(args.template).read_text(encoding="utf-8"))
    elif args.preset is not None:
        definition = getattr(presets, args.preset)()
    else:
        raise _UsageError("sign and verify need --template or --preset")
    if args.prefix is not None:
        definition = {**definition, "prefix": args.prefix}
    return define_key_template(definition)


def _secret(env: Mapping[str, str]) -> str:
    secret = env.get(SECRET_ENV)
    if not secret:
        raise _UsageError(f"Set the signing secret in the {SECRET_ENV} environment variable")
    return secret


def _parse_values(template: Any, assignments: Sequence[str]) -> dict[str, Any]:
    """Turn ``--set name=value`` into typed values for the template's fields."""
    kinds = {f["name"]: f["type"] for f in template.definition["fields"]}
    values: dict[str, Any] = {}
    for assignment in assignments:
        name, eq, raw = assignment.partition("=")
        if not name or not eq:
            raise _UsageError(f"--set takes name=value, got {assignment}")
        if name not in kinds:
            raise _UsageError(f"Unknown field {name}")
        value: Any = raw
        if kinds[name] == "uint":
            try:
                value = int(raw)
            except ValueError:
                pass
        elif kinds[name] == "bool" and raw in ("true", "false"):
            value = raw == "true"
        values[name] = value
    return values


def _plain(value: Any) -> Any:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value) if isinstance(value, datetime.date) else value


def main(argv: Sequence[str] | None = None, *, stdin: TextIO | None = None,
         stdout: TextIO | None = None, stderr: TextIO | None = None,
         env: Mapping[str, str] | None = None) -> int:
    """Run the CLI and return the exit code."""
    env = os.environ if env is None else env
    stdin = stdin or sys.stdin
    out = stdout or sys.stdout
    err = stderr or sys.stderr
    parser = _parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exit_:
        return int(exit_.code or 0)
    if args.command is None:
        parser.print_usage(err)
        print("base32-key: error: missing command", file=err)
        return 2

    templated = args.command in ("sign", "verify")
    case: str = "upper" if templated else args.case or ("lower" if args.lower else "upper")
    shape: dict[str, Any] = ({} if templated else
                             {"grouped": not args.ungrouped, "checked": not args.unchecked})
    json_out = args.json

    def emit(text: str, data: dict[str, Any]) -> None:
        print(json.dumps(data) if json_out else text, file=out)

    failed = False

    def each(fn: Callable[[str], tuple[str, dict[str, Any]]]) -> None:
        nonlocal failed
        for value in _values(args.values, stdin):
            try:
                text, data = fn(value)
                emit(text, {"input": value, **data})
            except (Base32KeyError, ValueError, TypeError) as error:
                failed = True
                code = error.code if isinstance(error, Base32KeyError) else None
                if json_out:
                    print(json.dumps({"input": value, "error": str(error), "code": code}),
                          file=out)
                else:
                    print(f"{value}: {error}", file=err)

    def encode_case() -> str:
        if case == "auto":
            raise _UsageError("--case auto only applies when decoding")
        return case

    try:
        if args.command == "encode":
            options = {**shape, "case": encode_case()}
            if args.file is not None:
                data = Path(args.file).read_bytes()
                key = from_bytes(data, with_length=True, **options)
                emit(key, {"file": args.file, "bytes": len(data), "key": key})
            else:
                def encode_one(value: str) -> tuple[str, dict[str, Any]]:
                    key = from_hex(value, **options)
                    return key, {"key": key}
                each(encode_one)
        elif args.command == "decode":
            options = {**shape, "case": case, "normalize": args.normalize,
                       "groups": args.groups}
            if args.file is not None:
                values = _values(args.values, stdin)
                if len(values) != 1:
                    raise _UsageError("--file takes exactly one key")
                data = to_bytes(values[0], with_length=True, **options)
                Path(args.file).write_bytes(data)
                emit(f"{len(data)} bytes written to {args.file}",
                     {"input": values[0], "file": args.file, "bytes": len(data)})
            else:
                def decode_one(key: str) -> tuple[str, dict[str, Any]]:
                    h = to_hex(key, **options)
                    h = h.upper() if args.upper_hex else h
                    return h, {"hex": h}
                each(decode_one)
        elif args.command == "validate":
            def check_one(key: str) -> tuple[str, dict[str, Any]]:
                nonlocal failed
                valid, invalid, code = validate(key, **shape, case=case,
                                                normalize=not args.strict,
                                                groups=args.groups)
                result: dict[str, Any] = {"valid": valid, "invalidGroups": invalid}
                if valid:
                    return f"{key}: valid", result
                failed = True
                result["code"] = code
                noun = "group" if len(invalid) == 1 else "groups"
                where = ", ".join(str(i + 1) for i in invalid)
                return f"{key}: invalid ({code}) in {noun} {where}", result
            each(check_one)
        elif args.command == "generate":
            options = {**shape, "case": encode_case()}
            for _ in range(args.count):
                key = generate_key(groups=args.groups, **options)
                emit(key, {"key": key})
        elif args.command == "sign":
            template = _load_template(args)
            secret = _secret(env)
            fields = [f["name"] for f in template.definition["fields"]]
            base = _parse_values(template, args.set)
            if args.count > 1 and args.serial_from is None:
                raise _UsageError("--count needs --serial-from, so that every key is different")
            writer = csv.writer(out, lineterminator="\n")
            if args.csv:
                writer.writerow(["key", *fields])
            for i in range(args.count):
                row = (base if args.serial_from is None
                       else {**base, args.serial_field: args.serial_from + i})
                key = template.sign(row, secret)
                if args.csv:
                    writer.writerow([key, *(_plain(row.get(f, "")) for f in fields)])
                else:
                    emit(key, {"key": key, "values": row})
        else:  # verify
            from .template import _days, verify_key_templates

            template = _load_template(args)
            secret = _secret(env)
            if args.today is not None:
                _days("--today", args.today)  # check it once, up front

            def verify_one(key: str) -> tuple[str, dict[str, Any]]:
                _, values = verify_key_templates([template], key, secret, today=args.today)
                plain = {name: _plain(v) if isinstance(v, datetime.date) else v
                         for name, v in values.items()}
                text = " ".join(f"{name}={_plain(v)}" for name, v in values.items())
                return f"{key}: valid {text}", {"values": plain}
            each(verify_one)
    except Base32KeyError as error:
        print(error, file=err)
        return 1
    except (_UsageError, OSError, ValueError, TypeError) as error:
        print(f"base32-key: error: {error}", file=err)
        return 2
    return 1 if failed else 0


def main_entry() -> None:
    """Entry point of the ``base32-key`` script."""
    sys.exit(main())


if __name__ == "__main__":  # pragma: no cover
    main_entry()
