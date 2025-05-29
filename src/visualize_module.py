# visualize_module.py
import json
import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

# 구간을 선택했는지/아닌지를 보이는 함수
def visualize_selected_segments0(segments, selected_ids, save_path=None):
    """
    전체 세그먼트 정보(segments) 중 선택된 segment_id에 해당하는 구간만 시각화합니다.
    
    매개변수:
      - segments: 전체 세그먼트 정보 (각 세그먼트는 딕셔너리 형태로, "segment_id", "start_time", "end_time" 등을 포함)
      - selected_ids: 선택된 segment_id들이 담긴 집합 또는 리스트
      - save_path: 이미지 파일로 저장할 경로 (None인 경우 화면에 출력)
    """
    # 선택된 세그먼트 추출: (시작 시간, 기간)
    bars_sel = [(s["start_time"], s["end_time"] - s["start_time"]) 
                for s in segments if s["segment_id"] in selected_ids]

    fig, ax = plt.subplots(figsize=(14, 1.5))

    # 선택된 세그먼트 주황색 막대 그리기
    for (start, duration) in bars_sel:
        ax.barh(0, duration, left=start, color="orange", height=0.5)

    ax.set_yticks([])
    ax.set_xlabel("Time (seconds)")
    ax.set_title("Selected Segments Only")
    ax.set_xlim(0, max(s["end_time"] for s in segments))

    if save_path:
        plt.savefig(save_path, bbox_inches="tight")
        print(f"✅ 시각화 저장 완료: {save_path}")
    else:
        plt.show()

def visualize_selected_segments(segments, selected_ids, save_path=None):
    """
    전체 세그먼트의 frame_scores를 “실제 시간” 축 위에 막대그래프로 그리고,
    선택된 세그먼트 구간은 겹치는 부분 없이 반투명 crimson 배경으로 강조합니다.

    - x축: 실제 시간(sec), 각 세그먼트의 start_time~end_time 구간을 frame_scores 길이만큼 균등 분할
    - y축: frame_score 값
    - 기본 막대: lightgray
    - 선택된 세그먼트 구간 전체: crimson, alpha=0.3

    세그먼트가 겹치더라도 병합하여 한 번만 강조합니다.
    """
    import numpy as np
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    import os

    # --- 1) 세그먼트를 시간 순으로 정렬하고 frame_times, widths, scores flatten ---
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

    # --- 2) 선택된 세그먼트 구간을 병합해서 하나의 리스트로 만들기 ---
    sel_intervals = [
        (s["start_time"], s["end_time"])
        for s in segments_sorted
        if s["segment_id"] in selected_ids
    ]
    sel_intervals.sort(key=lambda x: x[0])
    merged = []
    for s, e in sel_intervals:
        if not merged or s > merged[-1][1]:
            merged.append([s, e])
        else:
            merged[-1][1] = max(merged[-1][1], e)

    # --- 3) 플롯 그리기 (세로를 짧게) ---
    fig, ax = plt.subplots(figsize=(14, 2))

    # 기본 프레임 점수 (lightgray)
    ax.bar(times, scores,
           width=widths,
           color="gray",
           align="edge")

    # 선택된 세그먼트 구간 배경 (crimson, alpha=0.3)
    for s, e in merged:
        ax.axvspan(s, e, ymin=0, ymax=1, color="crimson", alpha=0.3)

    # --- 4) 축 설정 및 레이블 ---
    ax.set_xlim(segments_sorted[0]["start_time"], segments_sorted[-1]["end_time"])
    ax.set_ylim(0, scores.max())

    ax.set_xlabel("Time (seconds)")
    ax.set_ylabel("Frame Score")
    ax.set_title("Per-Frame Scores (selected segments highlighted)")

    ax.grid(axis="y", linestyle="--", alpha=0.4)

    # --- 5) 범례 ---
    frame_patch = mpatches.Patch(color="lightgray", label="Frame scores")
    sel_patch   = mpatches.Patch(color="crimson", alpha=0.3, label="Selected segments")
    ax.legend(handles=[frame_patch, sel_patch],
              loc="upper left", 
              bbox_to_anchor=(1.01, 1),  
              borderaxespad=0.)

    # --- 6) 저장 또는 표시 ---
    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, bbox_inches="tight")
        print(f"✅ 시각화 저장 완료: {save_path}")
    else:
        plt.show()

def load_segments(path):
    with open(path, 'r') as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and "segments" in data:
        return data["segments"]
    else:
        raise ValueError("JSON 형식이 예상과 다릅니다.")

def load_selected_segments(json_path):
    """
    선택된 segment_id들을 파일에서 읽어와 set으로 반환.
    JSON은 [{ "segment_id": ... }, ...] 형태라고 가정함.
    """
    with open(json_path, "r") as f:
        data = json.load(f)
    return {s["segment_id"] for s in data}

def run_visualize_pipeline(segments_path, selected_segments_path, save_path=None):
    """
    전체 시각화 파이프라인 (모든 입력을 경로로 받음)
    """
    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)

    segments = load_segments(segments_path)
    selected_segments = load_selected_segments(selected_segments_path)

    visualize_selected_segments(segments, selected_segments, save_path)
