from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import cv2
import imagehash
import numpy as np
from PIL import Image


@dataclass
class Keyframe:
    index: int
    timestamp: float
    phash: str
    image_bgr: np.ndarray


@dataclass
class VideoMeta:
    fps: float
    frame_count: int
    duration_seconds: float
    sample_fps: float
    phash_threshold: int


def probe_video(video_path: Path) -> VideoMeta:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    return VideoMeta(
        fps=fps,
        frame_count=total,
        duration_seconds=total / fps if fps else 0.0,
        sample_fps=0.0,
        phash_threshold=0,
    )


def iter_keyframes(
    video_path: Path,
    sample_fps: float = 2.0,
    phash_threshold: int = 6,
) -> Iterator[Keyframe]:
    """Stream keyframes from the video. Compares each sampled frame's perceptual
    hash against the last kept one; yields only when the Hamming distance
    crosses `phash_threshold`.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    try:
        sample_interval = 1.0 / sample_fps
        prev_hash: imagehash.ImageHash | None = None
        next_sample_ts = 0.0
        idx = 0
        while True:
            # CAP_PROP_POS_MSEC *before* read() gives the PTS of the frame
            # about to be decoded — matches what browsers use for currentTime.
            ts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
            ok, frame = cap.read()
            if not ok:
                break
            if ts >= next_sample_ts:
                next_sample_ts = ts + sample_interval
                pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                h = imagehash.phash(pil)
                if prev_hash is None or (h - prev_hash) >= phash_threshold:
                    yield Keyframe(
                        index=idx,
                        timestamp=ts,
                        phash=str(h),
                        image_bgr=frame,
                    )
                    prev_hash = h
            idx += 1
    finally:
        cap.release()
