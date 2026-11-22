"""Build the caption audio sprite with FFmpeg's Flite filter (rms and slt voices).

Run from the repo root with Python 3 and an FFmpeg build that includes libflite.
Each slot is 125 ms of original synthesized speech, selected from a carrier word.
"""
from array import array
from pathlib import Path
import subprocess
import sys
import wave

RATE = 12000
SLOT = RATE // 8
# Matches CAPTION_SOUNDS. Carrier words start with the sound we want to keep.
CARRIERS = """
ah bah kah dah eh fah gah hah ee jah kuh lah mah nah oh pah kwa rah sah tah
oo vah wah ex yah zah zero one two three four five six seven eight nine shah
thaw chaw sing
""".split()


def sample(voice, carrier):
    raw = subprocess.check_output([
        "ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i",
        f"flite=voice={voice}:text={carrier}", "-ar", str(RATE), "-f", "s16le", "-"
    ])
    pcm = array("h", raw)
    if sys.byteorder == "big":
        pcm.byteswap()
    if carrier == "sing":
        # 'ng' occurs at the end of this carrier; isolate the tail.
        end = max(i for i, value in enumerate(pcm) if abs(value) > 500)
        start = max(0, end - SLOT + 1)
    else:
        start = next(i for i, value in enumerate(pcm) if abs(value) > 360)
        start = max(0, start - RATE // 500)
    clip = pcm[start:start + SLOT]
    clip.extend([0] * (SLOT - len(clip)))
    loudest = max(abs(value) for value in clip)
    for i, value in enumerate(clip):
        fade = min(1, i / 42, (SLOT - 1 - i) / 120)
        clip[i] = round(value * (23500 / loudest) * fade)
    if sys.byteorder == "big":
        clip.byteswap()
    return clip.tobytes()


if __name__ == "__main__":
    path = Path("assets/audio/soldier-voices.wav")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as bank:
        bank.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        for voice in ("rms", "slt"):
            for carrier in CARRIERS:
                bank.writeframesraw(sample(voice, carrier))
