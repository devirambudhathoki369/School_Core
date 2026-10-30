#!/usr/bin/env python3
"""
uhf_bridge — put a UHF reader's tag reads into SchoolCore attendance.

A UHF reader (860–960 MHz, EPC Gen2) is not an access-control card reader and
does not speak the ZKTeco push protocol. It emits tag IDs over a serial port or
a TCP socket and expects something to be listening. This is that something: it
listens, and POSTs each tag to /rfid/scan, where the server resolves it to a
student or staff member and writes the attendance row.

Run it on any always-on machine that can reach both the reader and the server —
the school's office PC, or a Raspberry Pi at the gate.

    # 1. See what the reader actually emits (no server, no config needed)
    python uhf_bridge.py listen --serial COM3
    python uhf_bridge.py listen --tcp 192.168.1.210:6000

    # 2. Don't know where it is? Find it.
    python uhf_bridge.py discover

    # 3. Forward reads to the server
    python uhf_bridge.py run --serial COM3 \
        --server https://backend.nirsabi.com \
        --reader-id UHF10E-GATE-01 --reader-key <key>

`listen` is deliberately the first command. Every UHF reader formats its output
differently and the manual is rarely right, so guessing the frame layout before
seeing one is how you spend a day debugging the wrong thing.

Dependencies: none for TCP. Serial needs `pyserial` (pip install pyserial).
"""

import argparse
import binascii
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

# --------------------------------------------------------------------------
# A reader in "read always" mode emits the same tag many times a second. The
# server debounces per (device, epc) so attendance can't be flooded, but there
# is no reason to send a hundred identical POSTs a second to find that out.
# This is the local half of the same idea, deliberately much shorter than the
# server's window so a genuine re-entry is never swallowed here.
LOCAL_DEDUPE_SECONDS = 3.0

# Anything shorter is noise — a fragment of a frame, or a length byte that
# happened to look like hex. Real EPCs are 64/96/128 bits.
MIN_EPC_HEX = 8

RECONNECT_BACKOFF = (1, 2, 5, 10, 15, 30)


def log(msg, *, err=False):
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {msg}", file=sys.stderr if err else sys.stdout, flush=True)


# --------------------------------------------------------------------------
# Sources: where bytes come from


class SerialSource:
    def __init__(self, port, baud):
        self.port, self.baud, self._s = port, baud, None

    def __str__(self):
        return f"serial {self.port} @ {self.baud}"

    def open(self):
        try:
            import serial  # noqa: PLC0415
        except ImportError:
            raise SystemExit(
                "Serial support needs pyserial.  Install it with:\n"
                "    pip install pyserial"
            )
        self._s = serial.Serial(self.port, self.baud, timeout=1)

    def read(self):
        return self._s.read(4096) or b""

    def close(self):
        try:
            if self._s:
                self._s.close()
        except Exception:
            pass


class TcpSource:
    def __init__(self, host, port):
        self.host, self.port, self._s = host, port, None

    def __str__(self):
        return f"tcp {self.host}:{self.port}"

    def open(self):
        self._s = socket.create_connection((self.host, self.port), timeout=10)
        self._s.settimeout(1)

    def read(self):
        try:
            return self._s.recv(4096)
        except socket.timeout:
            return b""

    def close(self):
        try:
            if self._s:
                self._s.close()
        except Exception:
            pass


# --------------------------------------------------------------------------
# Extraction: bytes -> tag ids


def extract_epcs(chunk):
    """
    Pull plausible tag ids out of whatever the reader sent.

    Two shapes cover nearly every reader on the market:

      · ASCII — one hex string per line, sometimes with a prefix or spaces.
      · Binary frames — header, length, EPC, CRC. We don't try to parse the
        framing (it differs per vendor and per firmware); we take the longest
        runs of bytes and hex them, which recovers the EPC intact because it is
        the only long field in the frame.

    Returning a list rather than one value is deliberate: a single read of the
    port can carry several frames when tags are moving through the field.
    """
    out = []

    # ASCII first — if the chunk decodes cleanly and looks like hex, trust it.
    try:
        text = chunk.decode("ascii")
        if text.strip():
            for line in re.split(r"[\r\n,;]+", text):
                for token in re.findall(r"[0-9A-Fa-f]{%d,}" % MIN_EPC_HEX, line):
                    out.append(token.upper())
            if out:
                return out
    except UnicodeDecodeError:
        pass

    # Binary: hex the whole chunk and take the long runs. Strips the framing
    # bytes as a side effect, because they are short and the EPC is not.
    hexed = binascii.hexlify(chunk).decode().upper()
    # Frames are usually delimited by runs of 00 or FF; split on those.
    for part in re.split(r"(?:00){2,}|(?:FF){3,}", hexed):
        if len(part) >= MIN_EPC_HEX * 2:
            out.append(part)
    return out


# --------------------------------------------------------------------------
# Sink: tag id -> server


class Poster:
    def __init__(self, server, reader_id, reader_key, direction=None, dry=False):
        self.url = server.rstrip("/") + "/rfid/scan"
        self.reader_id, self.reader_key = reader_id, reader_key
        self.direction, self.dry = direction, dry
        self._recent = {}

    def _deduped(self, epc):
        now = time.monotonic()
        # opportunistic prune so a long run of unique tags can't grow this
        # without bound
        if len(self._recent) > 4096:
            self._recent = {
                k: v for k, v in self._recent.items()
                if now - v < LOCAL_DEDUPE_SECONDS
            }
        last = self._recent.get(epc)
        if last is not None and now - last < LOCAL_DEDUPE_SECONDS:
            return True
        self._recent[epc] = now
        return False

    def send(self, epc):
        if self._deduped(epc):
            return
        if self.dry:
            log(f"  would POST  epc={epc}")
            return

        body = {"reader_id": self.reader_id, "epc": epc, "bits": len(epc) * 4}
        if self.direction:
            body["direction"] = self.direction
        req = urllib.request.Request(
            self.url,
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "X-Reader-Key": self.reader_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                answer = json.loads(r.read().decode() or "{}")
            status = answer.get("status", "?")
            who = answer.get("pin", "")
            log(f"  {epc}  ->  {status}{(' pin ' + who) if who else ''}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:200]
            log(f"  {epc}  ->  HTTP {e.code}: {detail}", err=True)
        except Exception as e:
            # Never die on a network blip. The reader keeps reading; we keep
            # trying. A dropped tag is better than a dead bridge.
            log(f"  {epc}  ->  not sent ({e})", err=True)


# --------------------------------------------------------------------------
# Commands


def build_source(args):
    if args.serial:
        return SerialSource(args.serial, args.baud)
    if args.tcp:
        host, _, port = args.tcp.partition(":")
        if not port:
            raise SystemExit("--tcp needs HOST:PORT, e.g. 192.168.1.210:6000")
        return TcpSource(host, int(port))
    raise SystemExit("Give either --serial PORT or --tcp HOST:PORT")


def pump(source, on_chunk):
    """Read forever, reconnecting with backoff. Ctrl-C to stop."""
    attempt = 0
    while True:
        try:
            log(f"opening {source} ...")
            source.open()
            log("connected — waiting for tags (Ctrl-C to stop)")
            attempt = 0
            while True:
                chunk = source.read()
                if chunk:
                    on_chunk(chunk)
        except KeyboardInterrupt:
            log("stopped")
            return
        except Exception as e:
            source.close()
            wait = RECONNECT_BACKOFF[min(attempt, len(RECONNECT_BACKOFF) - 1)]
            attempt += 1
            log(f"{source} unavailable ({e}) — retrying in {wait}s", err=True)
            try:
                time.sleep(wait)
            except KeyboardInterrupt:
                log("stopped")
                return


def cmd_listen(args):
    """Show what the reader emits. No server involved."""
    source = build_source(args)
    log("LISTEN mode — nothing is sent anywhere. Present a tag to the reader.")

    def on_chunk(chunk):
        printable = chunk.decode("ascii", errors="replace").strip()
        log(f"raw {len(chunk):4d} bytes | hex {binascii.hexlify(chunk).decode()[:120]}")
        if printable:
            log(f"           ascii: {printable[:120]!r}")
        found = extract_epcs(chunk)
        if found:
            log(f"           -> tag id(s): {', '.join(found)}")

    pump(source, on_chunk)


def cmd_run(args):
    if not (args.server and args.reader_id and args.reader_key) and not args.dry_run:
        raise SystemExit(
            "run needs --server, --reader-id and --reader-key "
            "(or --dry-run to test extraction only)"
        )
    source = build_source(args)
    poster = Poster(
        args.server or "", args.reader_id or "", args.reader_key or "",
        direction=args.direction, dry=args.dry_run,
    )
    log(f"forwarding {source} -> {poster.url if not args.dry_run else '(dry run)'}")

    def on_chunk(chunk):
        for epc in extract_epcs(chunk):
            poster.send(epc)

    pump(source, on_chunk)


def cmd_discover(args):
    """List serial ports, and optionally sweep a host for an open reader port."""
    log("serial ports on this machine:")
    try:
        from serial.tools import list_ports  # noqa: PLC0415

        ports = list(list_ports.comports())
        if not ports:
            log("  (none found)")
        for p in ports:
            log(f"  {p.device:12} {p.description}")
    except ImportError:
        log("  pyserial not installed — pip install pyserial to list serial ports")

    if args.host:
        log(f"scanning {args.host} for open TCP ports commonly used by readers:")
        for port in (23, 100, 2022, 4001, 5000, 6000, 8000, 9090, 27011):
            s = socket.socket()
            s.settimeout(0.6)
            if s.connect_ex((args.host, port)) == 0:
                log(f"  {args.host}:{port}  OPEN  <- try: listen --tcp {args.host}:{port}")
            s.close()
        log("scan complete")


def main():
    p = argparse.ArgumentParser(
        prog="uhf_bridge",
        description="Forward UHF tag reads into SchoolCore attendance.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_source_args(sp):
        sp.add_argument("--serial", help="serial port, e.g. COM3 or /dev/ttyUSB0")
        sp.add_argument("--baud", type=int, default=115200, help="default 115200")
        sp.add_argument("--tcp", help="HOST:PORT of a networked reader")

    sp = sub.add_parser("listen", help="print what the reader emits (start here)")
    add_source_args(sp)
    sp.set_defaults(func=cmd_listen)

    sp = sub.add_parser("run", help="forward reads to the server")
    add_source_args(sp)
    sp.add_argument("--server", default=os.environ.get("CENTIT_SERVER"))
    sp.add_argument("--reader-id", default=os.environ.get("CENTIT_READER_ID"))
    sp.add_argument("--reader-key", default=os.environ.get("CENTIT_READER_KEY"))
    sp.add_argument("--direction", choices=("in", "out"))
    sp.add_argument("--dry-run", action="store_true",
                    help="extract tags and print, but send nothing")
    sp.set_defaults(func=cmd_run)

    sp = sub.add_parser("discover", help="find the reader")
    sp.add_argument("--host", help="also sweep this IP for open reader ports")
    sp.set_defaults(func=cmd_discover)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
