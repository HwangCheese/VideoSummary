import json
import numpy as np
import matplotlib.pyplot as plt
import os

def visualize_all_segments_frame_scores(segments_path, save_path=None):
    with open(segments_path, 'r', encoding='utf-8') as f:
        segments = json.load(f)
    
    segments_sorted = sorted(segments, key=lambda s: s["start_time"])
    times, widths, scores = [], [], []

    for seg in segments_sorted:
        fs = seg.get("frame_scores", [])
        n = len(fs)
        if n == 0:
            continue
        start, end = seg["start_time"], seg["end_time"]
        dt = (end - start) / n
        for i, sc in enumerate(fs):
            t_i = start + i * dt
            times.append(t_i)
            widths.append(dt)
            scores.append(sc)

    if not times:
        print("❗ 프레임 점수 데이터가 없습니다.")
        return

    times = np.array(times)
    widths = np.array(widths)
    scores = np.array(scores)

    fig, ax = plt.subplots(figsize=(14, 2))

    # 막대 그래프만 남김 (white + 투명)
    ax.bar(
        times, scores,
        width=widths,
        color="white", alpha=0.6,
        align="edge"
    )

    # ❌ 모든 시각적 요소 제거
    ax.set_axis_off()
    for spine in ax.spines.values():
        spine.set_visible(False)

    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)  # 패딩도 제거
    fig.patch.set_alpha(0.0)  # 배경 투명

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, bbox_inches="tight", transparent=True, pad_inches=0)
        print(f"✅ 미니멀 시각화 저장 완료: {save_path}")
    else:
        plt.show()
