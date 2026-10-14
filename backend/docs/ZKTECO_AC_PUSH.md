# ZKTeco AC Push — protocol reference

Everything below is derived from `C# ZKTeco AC PUSH dotnet/` in the project
root, read end to end: the C# source, the 48-page manual, the demo's SQLite
database (`Access/bin/Debug/pushdb.db` — 696 real card reads, 82 real
commands), and 163 full protocol traces in `Access/bin/Debug/ServerLog/`
(55 MB) captured against live devices in 2020.

Where a claim comes from a **capture** rather than from source, it is marked
*(observed)*. That distinction matters: the demo declares many commands it
never sends, and the values it does send in practice sometimes differ from the
format strings.

Our implementation lives in `rfid/` — see [Mapping to our code](#mapping-to-our-code).

---

## 1. Two device classes, one transport

| | Attendance terminal | Access controller |
|---|---|---|
| `DeviceType` | `att` or absent | **`acc`** |
| `MachineType` | 101 (all-in-one) | **9, 10** (controller) |
| Punch table | `ATTLOG` | **`transaction`** |
| Real-time push | `table=ATTLOG` | **`table=rtlog`** |
| Upload list key | **`TransFlag`** | **`TransTables`** |
| Counters | `INFO=` on every poll | **never sent — must be queried** |
| Users held | on the device | on the device |

Both poll the same `/iclock/*` endpoints. Almost every incompatibility we hit
came from sending a controller something written for a terminal.

`is_access_control(device)` in `rfid/services/Commands.py` is the switch.

---

## 2. Endpoints

The vendor's dispatcher is `ListenClient.Analysis`.

| Method + path | Purpose |
|---|---|
| `GET /iclock/cdata?...&options=all` | first contact; server replies with the options block |
| `POST /iclock/registry` | device registers **and describes itself in the body** |
| `GET /iclock/getrequest` | device polls for queued commands |
| `POST /iclock/devicecmd` | device reports a command's return code |
| `POST /iclock/cdata?table=…` | device uploads data (`rtlog`, `rtstate`, `ATTLOG`, `OPERLOG`, `options`) |
| `POST /iclock/querydata?...` | **device answers a `DATA QUERY` / `Get OPTIONS`** |
| `GET /iclock/rtdata?type=time` | device asks for the clock |
| `GET/POST /iclock/push` | config pull — vendor answers `401 Unknown DATA` and devices carry on |
| `GET /iclock/file` | firmware upgrade |

`/iclock/querydata` is the one most easily missed. Without it a panel's query
answers 404 and it **retries the same upload every ~5 s indefinitely**.

---

## 3. The handshake

The vendor sends **exactly thirteen lines** to a registered device
(`GetDeviceInitInfo`), in this order — *(observed, `ServerLog/2020-06-30`)*:

```
registry=ok
RegistryCode=knQ1Hd7Fdd
ServerVersion=1.0.0.0
ServerName=AccessPushDemo
PushProtVer=2.4.1
ErrorDelay=120
RequestDelay=30
TransTimes=
TransInterval=2
TransTables=User	Transaction
Realtime=1
SessionID=j5876fstt9
TimeoutSec=10
```

Two things that cost us a day:

1. **`TransTables`, not `TransFlag`.** `DeviceModel._transTables = "User\tTransaction"`,
   commented *"data to check for new records and upload — needed to
   automatically upload users and access-control records"*. All 9 devices in
   `pushdb.db` carry this value. **Without it a panel never uploads its events
   at all.**

2. **`InitDeviceConnect` does not check `PushOptionsFlag`.** It hands this block
   to any registered device. Gating on that flag means a panel that doesn't set
   it (ours doesn't) silently receives the legacy `GET OPTION FROM` block
   instead — the one carrying `TransFlag` and an attendance terminal's table
   list.

`Realtime=1` means send new records immediately; `0` means batch per
`TransTimes`/`TransInterval`.

---

## 4. The device describes itself at registry

The body of `POST /iclock/registry` is comma/tab separated `key=value`, some
keys prefixed `~`. The vendor reflects it straight onto its device record
(`Tools.InitModel`). We capture it — `DeviceRegistry.record_self_report`.

Fields that decide behaviour:

| Field | Meaning |
|---|---|
| `LockCount` | doors on the controller — **caps the valid `AuthorizeDoorId` bitmask** |
| `ReaderCount` | reader ports |
| `MachineType` | 9/10 controller, 101 all-in-one |
| `~CardFormatFunOn` | **1 ⇒ a Wiegand format must be defined or cards cannot be decoded** |
| `~ReaderCFGFunOn` | reader configuration accepted |
| `~Ext485ReaderFunOn` | external RS-485 readers supported |
| `SupportReaderType` | bitmask of reader types |
| `~MaxUserCount` | user capacity |
| `EventTypes` | 256-bit mask of event codes the device supports |
| `NewNormalEventTypes`,<br>`NewErrorEventTypes`,<br>`NewWarningEventTypes` | **report-enable masks. All-zero ⇒ that class is never reported.** |

The three `New*EventTypes` masks appear **nowhere in the 2020 folder** — zero
occurrences across all 163 traces. They exist on newer firmware
(`AC Ver 19.0.18`, push `2.0.34.ACCS-20250410`) and are only discoverable from
a device's own self-report.

---

## 5. Commands

Queued by us, collected on `getrequest` as `C:<id>:<content>`, answered on
`/iclock/devicecmd` as `ID=<id>&Return=<code>&CMD=<verb>`.

`Return=0` is success. **`Return=-629` means the command is not understood by
this device class** — that is what a controller answers to `DATA QUERY ATTLOG`.

For `DATA COUNT` and `DATA QUERY`, `Return` carries **the row count**, not a
status.

### Users (controller)

```
DATA UPDATE user CardNo={card}	Pin={pin}	Password={pw}	Group={grp}
                 StartTime={st}	EndTime={et}	Name={name}
                 SuperAuthorize={sa}	Disable={dis}

DATA UPDATE userauthorize Pin={pin}	AuthorizeTimezoneId={tz}	AuthorizeDoorId={mask}	DevID={dev}

DATA DELETE user Pin={pin}
```

**`DevID` is not in the SDK's format string but every `userauthorize` sent to a
controller in the traces carries it** *(observed)*. Terminals omit it.

**`AuthorizeDoorId` is a bitmask**, not a door number — `UCAcessLevel` builds it
as door1 `+1`, door2 `+2`, door3 `+4`, door4 `+8` and reads it back through
`Convert.ToString(DoorID, 2)`. Observed values: `3` (doors 1+2), `15` (all
four), `16`. **A 2-door controller must not be sent 15.**

### Time zones

```
DATA UPDATE timezone TimezoneId={id}	SunTime1={v}	SunTime2={v}	SunTime3={v}
                     MonTime1={v} … SatTime3={v}	Hol1Time1={v} … Hol3Time3={v}
```

Each slot is `(start_hhmm << 16) + end_hhmm` (`Tools.TimezoneCovertInterger`).
So **`2359` = 00:00–23:59 = all day**, and `0` = closed.

`UCUser.UploadAccessLevel` comments *"timezoneID 2-50, default 1 is 24-hour
access"* and issues `model.TimeZoneID + 1`. But the working capture **defines
its timezone explicitly and authorizes against it** — relying on an undefined
timezone 1 is not what the reference software does.

A door also needs `SET OPTIONS Door1ValidTZ={id}` — the manual is explicit:
*"the reader remains active during valid time periods of certain doors and
inactive otherwise."*

### Wiegand card format

```
DATA UPDATE DefaultWGFormat ID={id}	CardBit={bits}	SiteCode={sc}	FormatName={n}	CardFormat={fmt}
DATA UPDATE WGFormat        ID={id}	CardBit={bits}	SiteCode={sc}	FormatName={n}	CardFormat={fmt}
DATA UPDATE ReaderWGFormat  ReaderID={r}	DevID={d}	WGFormatID={f}	ParityVerifyDisable={p}	ReversalType={rt}
```

Format notation: `e` even parity, `s` site code, `c` card number, `o` odd
parity. Wiegand 26 = `e` + 8×`s` + 16×`c` + `o`.

The demo **never sends these** — its device reports `~CardFormatFunOn=0`. A
device reporting `1` needs them.

### Queries and counts

```
DATA QUERY tablename={t},fielddesc=*,filter=*     answered on /iclock/querydata
DATA COUNT user | transaction | template10 | biophoto | biodata
```

Queryable tables confirmed on firmware 19: `user`, `transaction`,
`doorproperty`, `readerproperty`, `wgformat`, `defaultwgformat`,
`readerwgformat`, `userauthorize`, `options`. An unknown name returns `-629`,
which is how to distinguish "empty" from "unsupported".

### Options and control

```
SET OPTIONS <Name>=<Value>        Get OPTIONS <Name>[,<Name>…]
CONTROL DEVICE 03000000           reboot
CONTROL DEVICE 02000000           cancel all alarms
CONTROL DEVICE 01010105           open door 1 for 5s
```

Confirmed option names: `TransTables`, `Realtime`, `TransInterval`,
`Door1ValidTZ`/`Door2ValidTZ`, `Door1Drivertime`, `MachineTZ`, `DateTime`,
`AntiPassback`, `MulCardUserFunOn`, `WebServerIP`, `WebServerPort`,
`NewNormalEventTypes`, `NewErrorEventTypes`, `NewWarningEventTypes`.

**An unknown option name returns `0` rather than an error**, so a `0` is
ambiguous unless a known-long field in the same request comes back populated.

---

## 6. Uploads

### `/iclock/querydata`

```
POST /iclock/querydata?SN=..&type=tabledata&tablename=user&count=31&packcnt=1&packidx=1
```

**The acknowledgement must echo `<tablename>=<count>`** (e.g. `user=31`).
A plain `OK` is not recognised and the device re-uploads every ~5 s forever
(`ListenClient.DevSendData`, tabledata branch). Multi-packet tables are
complete when `packidx >= packcnt`.

`type=count` puts the answer in the body (`transaction=69`); `type=options`
puts `Get OPTIONS` values there.

### Real-time events — `table=rtlog`

Tab-separated `key=value`, one event per line. Two dialects:

```
time=2020-07-03 13:10:29	pin=1	cardno=0	eventaddr=1	event=0	inoutstatus=0	verifytype=1	index=15	sitecode=0	linkid=0

transaction cardno=	pin=0	verified=0	doorid=0	eventtype=206	inoutstate=2	time_second=841298389	index=2	sitecode=0	devid=1	sn=…
```

Read by key name, not position — the field sets differ.

> **`time_second` is NOT a Unix epoch.** It is ZK packed time: seconds from
> 2000 with every month counted as exactly 31 days (`Tools.GetDateTimeBySeconds`,
> inverse of `Tools.OldEncodeTime`). Misreading it is decades wrong — a 2026
> punch packs to ~8.5×10⁸, which as an epoch lands in **1997**.

A successful controller read is `pin=<n> cardno=0 event=0 verifytype=1`
*(observed, 321 of them)* — the **PIN** identifies the person, not the card.

Identical rows at the same second are normal: a reader re-reads while a tag is
in field. The demo's own data has five in one second. Dedupe on
`(user, punch_time, status, verify)`.

---

## 7. Event codes

From `AccType` in `pushdb.db` — 80 named codes.

**0–48 — verification and door**

| | | | |
|---|---|---|---|
| 0 Success | 1 Normal open Verify | 2 First Personnel Open | 3 Multi Personnel Open |
| 4 Super password Open | 5 Normal Open | 6 Link event | 7 Cancel alarm |
| 8 Remote open door | 9 Remote close door | 10 Cancel NO | 11 Start NO |
| 12 Remote open auxiliary | 13 Remote close auxiliary | 14 Open with finger | 15 Open with multi finger |
| 16 Door keep open fp | 17 Card and FP | 18 First FP | 19 First Card and FP |
| 20 Interval error | 21 Sleep door error | **22 Illege time** | **23 Access Denied** |
| 24 Antipassback | 25 Multi lock lingate | 26 Multi card wait | **27 Verified Failed** |
| 28 Door contact overtime | 29 Card overtime | 30 Password error | 31 Fp interval error |
| 32 Multi fp wait | 33 Fp overtime | 34 Unknown Finger | 35 FP Overtime |
| 36 Button overtime | 37 Keep open error | 38 Loss card | 39 Blacklist |
| 40 Multi finger failed | 41 verify type failed | **42 wiegand error** | 44 Remote verify failed |
| 45 Remote verify timeout | 47 Open door failed | 48 Multi personnel failed | 68 Temperature error |
| 69 Mask error | | | |

**100+ — device and door state**

| | | | |
|---|---|---|---|
| 100 Antistrip alarm | 101 Emergency password alarm | 102 Unexcept door open | 103 Emergency fp alarm |
| 104 Five failed card punch | **105 Device offline** | 200 Door open | 201 Door close |
| 202 Button open door | 203 Multi card and fp | 204 Keep open end | 205 Remote keep open |
| **206 Device Start** | 207 Password open door | 208 Super user open door | 209 Door locked |
| 210 Fire event | 211 Super user closed | 212 Multi card OK | 213 First card open |
| **214 Device online** | 220 Auxin open | 221 Auxin close | 222 Remote verify success |
| 223 Remote verify | 225 Auxin normal | 226 Auxin trigger | 227 Double open |
| 228 Double close | | | |

**Diagnostic value:** a controller logs *failures* as readily as successes. If a
card reaches it in any state you get 22, 23, 27 or 42 **with the card number**.
A log containing only 105/206/214 means no card data is arriving at the
controller at all — the reader input is electrically silent.

---

## 8. Verification modes (`verifytype`)

`0` automatic · `1` finger · `2` pin · `3` password · **`4` card number** ·
`5`–`14` combinations · `15` face · `16`–`20` face combinations ·
`21` finger-vein · `22`–`24` fv combinations · `200` other.

There is **no UHF / long-range mode**. A UHF reader can only present as a card
reader (`4`) via Wiegand, and only if the tag id fits the configured format.

---

## 9. What this folder does NOT contain

Verified by exhaustive search — `\bUHF\b`, `\bEPC\b`, `\bGen2\b` all return
**zero** real occurrences (apparent hits are base64 photo data in the logs).
Also absent: reader models, wiring or terminal diagrams, RS-232/RS-485 pinouts,
cable specs, antenna or power guidance.

It is a **server-side SDK for the push protocol**. It assumes the reader is
already wired and commissioned. No amount of reading it will explain why a
reader's output is not reaching a controller's input — that is an electrical
question, not a protocol one.

---

## 10. Mapping to our code

| Concern | Where |
|---|---|
| Endpoints | `rfid/views/device_calls.py` |
| Handshake blocks | `rfid/views/builders.py` |
| Command formats | `rfid/services/Commands.py` |
| Command queue, return codes | `rfid/services/DeviceCommandQueueReg.py` |
| Registry self-report, counters | `rfid/services/DeviceReg.py` |
| rtlog / transaction parsing, ZK packed time | `rfid/services/parsers.py` |
| Punch → attendance | `rfid/services/AttendanceReg.py` |
| User sync, re-push | `rfid/services/UsersSyncReg.py`, `rfid/views/SyncUsersViews.py` |
| Readback / reconciliation | `rfid/services/DeviceReadback.py` |
| UHF reader bridge (not ZK) | `rfid/tools/uhf_bridge.py` |
