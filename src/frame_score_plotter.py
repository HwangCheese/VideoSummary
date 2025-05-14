import os
import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path


def visualize_all_segments_frame_scores(segments_path):
    """
    세그먼트 JSON 파일로부터 프레임 점수를 시간 축에 따라 시각화하고,
    CreateShorts/server/public/images/frameScore/{baseName}_frameScoreGraph.png 에 저장합니다.
    """

    # ─────── 1. JSON 파일 로드 ───────
    with open(segments_path, 'r', encoding='utf-8') as f:
        segments = json.load(f)

    # ─────── 2. 각 프레임별 시간 및 점수 추출 ───────
    segments_sorted = sorted(segments, key=lambda s: s["start_time"])
    times, widths, scores = [], [], []

    for seg in segments_sorted:
        fs = seg.get("frame_scores", [])
        n = len(fs)
        if n == 0:
            continue
        start, end = seg["start_time"], seg["end_time"]
        dt = (end - start) / n  # 프레임당 시간 간격
        for i, sc in enumerate(fs):
            t_i = start + i * dt
            times.append(t_i)
            widths.append(dt)
            scores.append(sc)

    if not times:
        print("❗ 프레임 점수 데이터가 없습니다.")
        return

    # ─────── 3. 그래프 그리기 ───────
    times = np.array(times)
    widths = np.array(widths)
    scores = np.array(scores)

    fig, ax = plt.subplots(figsize=(14, 2))

    # 반투명 흰색 막대 그래프
    ax.bar(times, scores, width=widths, color="white", alpha=0.6, align="edge")

    # X/Y축 범위 지정 (데이터에 딱 맞게)
    ax.set_xlim(times[0], times[-1])
    ax.set_ylim(0, max(scores) * 1.1)

    # 축, 눈금, 라벨 제거 (순수 그래프만 보이게)
    ax.axis('off')
    ax.set_facecolor("none")
    fig.patch.set_alpha(0.0)

    # subplot 내부 여백 제거
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

    # ─────── 4. 저장 경로 설정 및 이미지 저장 ───────
    # 현재 파일 기준으로 상대 경로 계산
    output_dir = os.path.join(os.path.dirname(__file__), "../server/public/images/frameScore")
    os.makedirs(output_dir, exist_ok=True)

    # uploadedFileName 기반으로 순수 이름 추출
    base = Path(segments_path).stem.replace("_segment_scores", "")
    # 원하는 형태: baby_frameScoreGraph.png
    file_name = f"{base}_frameScoreGraph.png" 

    # 동적 이름으로 저장
    save_path = os.path.join(output_dir, file_name)

    plt.savefig(save_path, dpi=150, bbox_inches="tight", pad_inches=0, transparent=True)
    print(f"✅ 시각화 저장 완료: {save_path}")