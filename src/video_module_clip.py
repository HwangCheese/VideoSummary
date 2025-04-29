"""video_clips_module.py
-------------------------------------------------
Top‑K 하이라이트 세그먼트를 **개별 클립**으로 추출한다.
"""
from __future__ import annotations

import os
import json
from typing import List

from moviepy.editor import VideoFileClip


def export_top_clips(
    selected_segments: List[dict],
    video_path: str,
    clip_output_dir: str,
    max_clips: int = 10,
    codec: str = "libx264",
    audio_codec: str = "aac",
):
    """선택된 세그먼트를 추출해 <clip_output_dir>/clip_01.mp4 식으로 저장.

    Returns
    -------
    List[str]
        생성된 클립 파일 경로 리스트 (순위순)
    """
    os.makedirs(clip_output_dir, exist_ok=True)

    video = VideoFileClip(video_path)
    created = []

    for rank, seg in enumerate(selected_segments[:max_clips], start=1):
        start, end = seg["start_time"], min(seg["end_time"], video.duration)
        if end - start <= 0:
            continue  # skip invalid

        clip = video.subclip(start, end)
        out_name = f"clip_{rank:02d}.mp4"
        out_path = os.path.join(clip_output_dir, out_name)

        try:
            # 일반적으로 저장 시도
            clip.write_videofile(out_path, codec=codec, audio_codec=audio_codec, verbose=False, logger=None)
        except AttributeError:
            # 오디오 없으면 audio=False로 다시 저장
            clip.write_videofile(out_path, codec=codec, audio=False, verbose=False, logger=None)

        clip.close()
        created.append(out_path)
        print(f"✅ TOP{rank} 클립 저장: {out_path}")

    # 메타 JSON 저장
    meta = {
        "original": os.path.basename(video_path),
        "total_duration": round(video.duration, 2),
        "clips": [
            {
                "rank": idx + 1,
                "start_time": seg["start_time"],
                "end_time": seg["end_time"],
                "score": seg["combined_score"],
                "file": os.path.basename(path),
            }
            for idx, (seg, path) in enumerate(zip(selected_segments[:max_clips], created))
        ],
    }
    with open(os.path.join(clip_output_dir, "clips_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"📝 클립 메타 JSON 저장: {os.path.join(clip_output_dir, 'clips_meta.json')}")

    video.close()
    return created
