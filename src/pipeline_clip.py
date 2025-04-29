"""pipeline_clip.py
-------------------------------------------------
Top‑K 하이라이트 클립 파이프라인
 1. 프레임 특징 + 장면 분할 (extract_features_module)
 2. 중요도 예측 & 상위 세그먼트 선정 (pgl_module_clip)
 3. 개별 클립 추출 (video_clips_module)
"""
from __future__ import annotations

import argparse
import os
from typing import List

from extract_features_module import extract_features_pipe
from pgl_module_clip import run_pgl_module_clip
from video_module_clip import export_top_clips


def run_clip_pipeline(
    video_path: str,
    ckpt_path: str,
    clips_root_dir: str,
    device: str = "cpu",
    fps: float = 1.0,
    alpha: float = 0.7,
    std_weight: float = 0.3,
    top_n: int = 10,
    min_duration: float = 3.0,
) -> List[str]:
    """톱‑N 클립 추출 전체 파이프라인"""

    # 0. 경로 세팅
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    video_dir = os.path.join(clips_root_dir, base_name)
    os.makedirs(video_dir, exist_ok=True)

    # 1. 특징 + 장면 분할
    print("\n🎬 [1/3] 특징 추출 및 장면 분할", flush=True)
    output_h5 = os.path.join(video_dir, f"{base_name}.h5")
    output_scene_json = os.path.join(video_dir, f"{base_name}_scenes.json")

    extract_features_pipe(video_path, output_h5, output_scene_json, device=device)

    # 2. 중요도 예측 & 세그먼트 선정
    print("\n🧠 [2/3] Top 세그먼트 선정", flush=True)
    selected_segments = run_pgl_module_clip(
        ckpt_path=ckpt_path,
        feature_h5=output_h5,
        scene_json=output_scene_json,
        output_sorted_json=None,  # 추가!! (또는 경로 지정할 수도 있음)
        device=device,
        fps=fps,
        alpha=alpha,
        std_weight=std_weight,
        top_n=top_n,
        min_sec=min_duration,  # 이름 맞춰줘야 해
    )


    # 3. 개별 클립 추출
    print("\n✂️  [3/3] 클립 추출", flush=True)
    created = export_top_clips(
        selected_segments,
        video_path=video_path,
        clip_output_dir=video_dir,
        max_clips=top_n,
    )

    print(f"\n✅ 파이프라인 완료! {len(created)}개 클립 생성", flush=True)
    return created


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video_path", required=True)
    parser.add_argument("--fine_ckpt", required=True)
    parser.add_argument("--clips_dir", required=True, help="/absolute/path/to/clips root")
    parser.add_argument("--fps", type=float, default=1.0)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--alpha", type=float, default=0.7)
    parser.add_argument("--std_weight", type=float, default=0.3)
    parser.add_argument("--top_n", type=int, default=10)
    parser.add_argument("--min_duration", type=float, default=3.0)
    args = parser.parse_args()

    run_clip_pipeline(
        video_path=args.video_path,
        ckpt_path=args.fine_ckpt,
        clips_root_dir=args.clips_dir,
        device=args.device,
        fps=args.fps,
        alpha=args.alpha,
        std_weight=args.std_weight,
        top_n=args.top_n,
        min_duration=args.min_duration,
    )
