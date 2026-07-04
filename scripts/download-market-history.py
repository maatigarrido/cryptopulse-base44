import csv
import json
import re
import urllib.request
import zipfile
from bisect import bisect_right
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"

KRAKEN_DRIVE_FILE_ID = "1ptNqWYidLkhb2VAKuLCxmp2OXEfGO-AP"
KRAKEN_ENTRIES = {
    "ethusd": "master_q4/ETHUSD_60.csv",
    "xmrusd": "master_q4/XMRUSD_60.csv",
}

POLONIEX_XMRBTC_URL = "https://www.cryptodatadownload.com/cdd/Poloniex_XMRBTC_1h.csv"
POLONIEX_XMRUSDT_URL = "https://www.cryptodatadownload.com/cdd/Poloniex_XMRUSDT_1h.csv"

USER_AGENT = "cryptopulse-history-loader/1.0"
MAX_CHUNK_BYTES = 3_800_000


def request_bytes(url, headers=None, timeout=60):
    merged_headers = {"User-Agent": USER_AGENT}
    if headers:
        merged_headers.update(headers)
    req = urllib.request.Request(url, headers=merged_headers)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read(), res.headers


def get_kraken_download_url():
    html, _ = request_bytes(
        f"https://drive.google.com/uc?export=download&id={KRAKEN_DRIVE_FILE_ID}"
    )
    match = re.search(r'name="uuid" value="([^"]+)"', html.decode("utf-8", errors="replace"))
    if not match:
        raise RuntimeError("Could not find Google Drive download UUID")
    params = urlencode(
        {
            "id": KRAKEN_DRIVE_FILE_ID,
            "export": "download",
            "confirm": "t",
            "uuid": match.group(1),
        }
    )
    return f"https://drive.usercontent.google.com/download?{params}"


class RemoteRangeFile:
    def __init__(self, url, size):
        self.url = url
        self.size = size
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        if whence == 0:
            self.pos = offset
        elif whence == 1:
            self.pos += offset
        elif whence == 2:
            self.pos = self.size + offset
        else:
            raise ValueError(f"Unsupported whence: {whence}")
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n <= 0 or self.pos >= self.size:
            return b""

        start = self.pos
        end = min(self.size - 1, self.pos + n - 1)
        data, _ = request_bytes(self.url, {"Range": f"bytes={start}-{end}"})
        self.pos += len(data)
        return data

    def close(self):
        pass


def open_kraken_zip():
    url = get_kraken_download_url()
    _, headers = request_bytes(url, {"Range": "bytes=0-0"})
    content_range = headers.get("Content-Range")
    if not content_range:
        raise RuntimeError("Google Drive response did not include Content-Range")
    size = int(content_range.split("/")[-1])
    return zipfile.ZipFile(RemoteRangeFile(url, size))


def number_text(value):
    number = float(value)
    if number <= 0:
        return None
    return f"{number:.15g}"


def parse_kraken_csv(text):
    rows = []
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        parts = raw.split(",")
        if len(parts) < 6:
            continue
        try:
            timestamp = int(float(parts[0]))
            open_price = number_text(parts[1])
            high = number_text(parts[2])
            low = number_text(parts[3])
            close = number_text(parts[4])
            volume = number_text(parts[5]) or ""
        except ValueError:
            continue
        if not all([open_price, high, low, close]):
            continue
        rows.append(
            {
                "timestamp": timestamp,
                "open": open_price,
                "high": high,
                "low": low,
                "volume": volume,
                "close": close,
            }
        )
    return rows


def parse_poloniex_csv(text):
    rows = []
    reader = csv.reader(text.splitlines())
    for parts in reader:
        if not parts or not parts[0].isdigit() or len(parts) < 7:
            continue
        timestamp = int(parts[0])
        if timestamp > 10_000_000_000:
            timestamp //= 1000
        try:
            open_price = number_text(parts[3])
            high = number_text(parts[4])
            low = number_text(parts[5])
            close = number_text(parts[6])
            volume = number_text(parts[7]) if len(parts) > 7 else ""
        except ValueError:
            continue
        if not all([open_price, high, low, close]):
            continue
        rows.append(
            {
                "timestamp": timestamp,
                "open": open_price,
                "high": high,
                "low": low,
                "volume": volume or "",
                "close": close,
            }
        )
    return rows


def load_btc_close_series():
    manifest = json.loads((DATA_DIR / "btcusd_bitstamp_1h_manifest.json").read_text("utf-8"))
    values = {}
    for chunk in manifest["chunks"]:
        file_name = chunk["file"].replace("/data/", "", 1)
        path = DATA_DIR / file_name
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                try:
                    timestamp = int(row["timestamp"])
                    close = float(row["close"])
                except (KeyError, TypeError, ValueError):
                    continue
                if close > 0:
                    values[timestamp] = close
    timestamps = sorted(values)
    return timestamps, values


def nearest_btc_close(timestamp, timestamps, values):
    exact = values.get(timestamp)
    if exact:
        return exact
    idx = bisect_right(timestamps, timestamp) - 1
    if idx < 0:
        return None
    nearest_ts = timestamps[idx]
    if timestamp - nearest_ts > 7200:
        return None
    return values[nearest_ts]


def scale_row(row, factor):
    def scaled(field):
        return f"{float(row[field]) * factor:.15g}"

    return {
        "timestamp": row["timestamp"],
        "open": scaled("open"),
        "high": scaled("high"),
        "low": scaled("low"),
        "volume": row["volume"],
        "close": scaled("close"),
    }


def merge_rows(*row_sets):
    by_timestamp = {}
    for rows in row_sets:
        for row in rows:
            by_timestamp[row["timestamp"]] = row
    return [by_timestamp[key] for key in sorted(by_timestamp)]


def write_dataset(prefix, rows, source, meta):
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    chunks = []
    current_lines = ["timestamp,open,high,low,volume,close"]
    current_bytes = len(current_lines[0]) + 1
    part = 1

    def flush():
        nonlocal part, current_lines, current_bytes
        if len(current_lines) == 1:
            return
        file_name = f"{prefix}_part{part:02d}.csv"
        path = DATA_DIR / file_name
        path.write_text("\n".join(current_lines) + "\n", encoding="utf-8")
        chunks.append(
            {
                "file": f"/data/{file_name}",
                "rows": len(current_lines) - 1,
                "bytes": path.stat().st_size,
            }
        )
        part += 1
        current_lines = ["timestamp,open,high,low,volume,close"]
        current_bytes = len(current_lines[0]) + 1

    for row in rows:
        line = ",".join(
            [
                str(row["timestamp"]),
                row["open"],
                row["high"],
                row["low"],
                row["volume"],
                row["close"],
            ]
        )
        line_bytes = len(line.encode("utf-8")) + 1
        if len(current_lines) > 1 and current_bytes + line_bytes > MAX_CHUNK_BYTES:
            flush()
        current_lines.append(line)
        current_bytes += line_bytes

    flush()

    manifest = {
        "granularity": "1h",
        "timezone": "UTC",
        "source": source,
        "rows": len(rows),
        "first_timestamp": rows[0]["timestamp"],
        "last_timestamp": rows[-1]["timestamp"],
        "chunks": chunks,
    }

    generated = {
        "source": source,
        "granularity": "1h OHLCV",
        "timezone": "UTC",
        "rows": len(rows),
        "first_hour_utc": datetime.fromtimestamp(rows[0]["timestamp"], timezone.utc).isoformat(),
        "last_hour_utc": datetime.fromtimestamp(rows[-1]["timestamp"], timezone.utc).isoformat(),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        **meta,
    }

    (DATA_DIR / f"{prefix}_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    (DATA_DIR / f"{prefix}.meta.json").write_text(
        json.dumps(generated, indent=2) + "\n", encoding="utf-8"
    )


def main():
    with open_kraken_zip() as kraken_zip:
        eth_rows = parse_kraken_csv(kraken_zip.read(KRAKEN_ENTRIES["ethusd"]).decode("utf-8"))
        kraken_xmr_rows = parse_kraken_csv(kraken_zip.read(KRAKEN_ENTRIES["xmrusd"]).decode("utf-8"))

    write_dataset(
        "ethusd_kraken_1h",
        eth_rows,
        "Kraken OHLCVT ETH/USD 60-minute CSV",
        {
            "historical_url": "https://support.kraken.com/articles/360047124832-downloadable-historical-ohlcvt-open-high-low-close-volume-trades-data",
            "generated_from": [KRAKEN_ENTRIES["ethusd"]],
        },
    )

    xmrbtc_text = request_bytes(POLONIEX_XMRBTC_URL)[0].decode("utf-8", errors="replace")
    xmrusdt_text = request_bytes(POLONIEX_XMRUSDT_URL)[0].decode("utf-8", errors="replace")
    xmrbtc_rows = parse_poloniex_csv(xmrbtc_text)
    xmrusdt_rows = parse_poloniex_csv(xmrusdt_text)
    xmrusdt_by_ts = {row["timestamp"]: row for row in xmrusdt_rows}
    btc_timestamps, btc_values = load_btc_close_series()

    first_kraken_xmr_ts = min(row["timestamp"] for row in kraken_xmr_rows)
    early_xmr_rows = []
    for row in xmrbtc_rows:
        if row["timestamp"] >= first_kraken_xmr_ts:
            continue
        direct_usdt = xmrusdt_by_ts.get(row["timestamp"])
        if direct_usdt:
            early_xmr_rows.append(direct_usdt)
            continue
        btc_close = nearest_btc_close(row["timestamp"], btc_timestamps, btc_values)
        if btc_close:
            early_xmr_rows.append(scale_row(row, btc_close))

    xmr_rows = merge_rows(early_xmr_rows, kraken_xmr_rows)
    write_dataset(
        "xmrusd_composite_1h",
        xmr_rows,
        "Composite XMR/USD hourly: Poloniex XMR/BTC with Bitstamp BTC/USD, Poloniex XMR/USDT, then Kraken XMR/USD",
        {
            "historical_url": "https://www.cryptodatadownload.com/data/poloniex/",
            "generated_from": [
                POLONIEX_XMRBTC_URL,
                POLONIEX_XMRUSDT_URL,
                "public/data/btcusd_bitstamp_1h_manifest.json",
                KRAKEN_ENTRIES["xmrusd"],
            ],
            "kraken_reference_url": "https://support.kraken.com/articles/360047124832-downloadable-historical-ohlcvt-open-high-low-close-volume-trades-data",
            "kraken_xmrusd_first_hour_utc": datetime.fromtimestamp(first_kraken_xmr_ts, timezone.utc).isoformat(),
        },
    )

    for prefix, rows in [("ETH", eth_rows), ("XMR", xmr_rows)]:
        first = datetime.fromtimestamp(rows[0]["timestamp"], timezone.utc).isoformat()
        last = datetime.fromtimestamp(rows[-1]["timestamp"], timezone.utc).isoformat()
        print(f"{prefix}: {len(rows)} rows from {first} to {last}")


if __name__ == "__main__":
    main()
