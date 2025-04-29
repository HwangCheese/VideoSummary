"""pgl_module_clip.py
-------------------------------------------------
클립 전용 PGL 모듈
 - 기존 pgl_module 의 유틸리티를 재사용하되, Top‑N 세그먼트를 바로
   추출해 반환한다.
 - 하나의 하이라이트 영상이 아니라 **개별 클립**(Top‑N) 생성을 목표로 함.
"""
from __future__ import annotations

import json
import os
from typing import List

import numpy as np
import torch

# 기존 모듈에서 공통 유틸 가져오기
from pgl_module import (
    load_h5_features,
    predict_scores,
    load_model_checkpoint,
    load_scene_segments,
)
from networks.pgl_sum.pgl_sum import PGL_SUM

# -----------------------------
# 내부 헬퍼
# -----------------------------

def _calc_segment_stats(scores: np.ndarray, segs: list[dict]) -> list[dict]:
    """avg/max/std 를 계산해 세그먼트 점수 정보를 붙인다."""
    enriched = []
    for seg in segs:
        start_f, end_f = seg["start_frame"], seg["end_frame"]
        frame_scores = scores[start_f : end_f + 1]
        enriched.append(
            {
                **seg,
                "frame_scores": frame_scores.tolist(),
                "avg_score": float(np.mean(frame_scores)),
                "max_score": float(np.max(frame_scores)),
                "std_score": float(np.std(frame_scores)),
            }
        )
    return enriched


def _apply_combined_score(
    segs: list[dict], *, alpha: float = 0.7, std_weight: float = 0.3
) -> None:
    """combined_score = avg*alpha + max*(1-alpha) - std*std_weight"""
    for seg in segs:
        seg["combined_score"] = (
            seg["avg_score"] * alpha
            + seg["max_score"] * (1 - alpha)
            - seg["std_score"] * std_weight
        )


# -----------------------------
# 메인 엔트리
# -----------------------------

def run_pgl_module_clip(
    ckpt_path: str,
    feature_h5: str,
    scene_json: str,
    output_sorted_json: str | None, #
    *,
    device: str = "cpu",
    fps: float = 1.0,
    alpha: float = 0.7,
    std_weight: float = 0.3,
    top_n: int = 10,
    min_sec: float = 3.0,
) -> List[dict]:
    """Top‑N 세그먼트를 반환한다.

    Returns
    -------
    selected_segments : list[dict]
        combined_score 기준 내림차순으로 정렬된 Top‑N.
    """

    print(f"🚀 [PGL‑CLIP] device={device}, top_n={top_n}, min_sec={min_sec}")

    # 1) 모델 로드
    model = PGL_SUM(
        input_size=1024,
        output_size=1024,
        num_segments=4,
        heads=8,
        fusion="add",
        pos_enc="absolute",
    )
    model = load_model_checkpoint(model, ckpt_path, device).to(device).eval()

    # 2) 특징 + 스코어 예측
    feats = load_h5_features(feature_h5)
    scores = predict_scores(model, feats, device=device)

    # 3) 세그먼트 로드 + 점수 계산
    scene_segments = load_scene_segments(scene_json, fps)
    seg_stats = _calc_segment_stats(scores, scene_segments)
    _apply_combined_score(seg_stats, alpha=alpha, std_weight=std_weight)

    # 4) 길이 / Top‑N 필터링
    seg_stats = [
        s for s in seg_stats if (s["end_time"] - s["start_time"]) >= min_sec
    ]
    seg_stats.sort(key=lambda s: s["combined_score"], reverse=True)
    selected = seg_stats[:top_n]

    # 5) 출력 JSON(옵션)
    if output_sorted_json:
        os.makedirs(os.path.dirname(output_sorted_json), exist_ok=True)
        with open(output_sorted_json, "w", encoding="utf-8") as f:
            json.dump({"segments": seg_stats}, f, ensure_ascii=False, indent=2)
        print(f"📄 Sorted segments JSON saved: {output_sorted_json}")

    return selected
