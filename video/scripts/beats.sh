#!/usr/bin/env bash
# Prints the song's strongest hits and its beat grid, so src/timeline.ts can put
# cuts on the music. Needs ffmpeg and python3 (stdlib only).
#   bash scripts/beats.sh public/music/song.mp3
set -euo pipefail
SONG="${1:-public/music/song.mp3}"

# Loudness every 10 ms (mono, 44.1 kHz → 441-sample windows).
ffmpeg -hide_banner -nostats -i "$SONG" -ac 1 -ar 44100 \
  -af "asetnsamples=441,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level" \
  -f null - 2>&1 | sed -n 's/.*RMS_level=//p' | python3 -I -c '
import sys, math
db = [float(x) if x.strip() not in ("-inf", "inf", "nan") else -90.0 for x in sys.stdin]
hop = 0.01
amp = [10 ** (max(v, -90) / 20) for v in db]
# Onset strength: positive change in amplitude, lightly smoothed.
flux = [0.0] + [max(0.0, amp[i] - amp[i - 1]) for i in range(1, len(amp))]
sm = [sum(flux[max(0, i - 1):i + 2]) / 3 for i in range(len(flux))]

# Tempo by autocorrelation between 70 and 180 BPM.
def ac(lag):
    return sum(sm[i] * sm[i - lag] for i in range(lag, len(sm)))
lags = range(int(60 / 180 / hop), int(60 / 70 / hop) + 1)
best = max(lags, key=ac)
period = best * hop
bpm = 60 / period

# Phase: the offset whose grid collects the most onset energy.
def score(off):
    total, t = 0.0, off
    while t < len(sm) * hop:
        total += max(sm[int(t / hop) - 2:int(t / hop) + 3] or [0])
        t += period
    return total
phase = max((i * hop for i in range(best)), key=score)

dur = len(db) * hop
print(f"duration  {dur:.2f}s")
print(f"tempo     {bpm:.1f} BPM  (beat {period:.3f}s, first beat {phase:.2f}s)")

# Strongest hits: local maxima well above the running median.
peaks = []
for i in range(5, len(sm) - 5):
    win = sm[i - 5:i + 6]
    if sm[i] == max(win) and sm[i] > 0:
        peaks.append((sm[i], i * hop))
peaks.sort(reverse=True)
top = sorted(t for _, t in peaks[:24])
print("hits      " + " ".join(f"{t:.2f}" for t in top))

# Loudness per second, to find the drop and the quiet parts.
print("loudness  (dB RMS per second)")
for s in range(int(dur) + 1):
    seg = db[s * 100:(s + 1) * 100]
    if seg:
        m = sum(seg) / len(seg)
        print(f"  {s:>2}s {m:6.1f} " + "#" * max(0, int((m + 40) / 1.5)))
'
