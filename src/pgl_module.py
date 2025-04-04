# pgl_module.py
import torch
import json
import numpy as np
import h5py
from networks.pgl_sum.pgl_sum import PGL_SUM

def load_h5_features(h5_path):
    with h5py.File(h5_path, "r") as hf:
        return np.array(hf["features"])

def predict_scores(model, features, device="cpu"):
    x = torch.from_numpy(features).float().to(device)
    if x.ndim == 2:
        x = x.unsqueeze(0)
    mask = torch.ones((x.shape[0], x.shape[1]), dtype=torch.bool).to(device)
    with torch.no_grad():
        scores, _ = model(x, mask)
    return scores.cpu().numpy().squeeze()

def load_model_checkpoint(model, ckpt_path, device):
    checkpoint = torch.load(ckpt_path, map_location=device)
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"], strict=False)
    else:
        model.load_state_dict(checkpoint, strict=False)
    return model

def load_scene_segments(scene_json, fps):
    with open(scene_json, "r") as f:
        segments = json.load(f)
    for seg in segments:
        seg["start_frame"] = int(seg["start_time"] * fps)
        seg["end_frame"] = int(seg["end_time"] * fps)
    return segments

def save_segment_frame_scores_json(scores, scene_segments, output_json):
    segment_scores = []
    for seg in scene_segments:
        start_frame = seg["start_frame"]
        end_frame = min(seg["end_frame"], len(scores) - 1)
        frame_scores = scores[start_frame:end_frame + 1]
        avg_score = float(np.mean(frame_scores))
        max_score = float(np.max(frame_scores))
        std_score = float(np.std(frame_scores))
        segment_scores.append({
            "segment_id": seg["segment_id"],
            "start_time": seg["start_time"],
            "end_time": seg["end_time"],
            "frame_scores": frame_scores.tolist(),
            "avg_score": avg_score,
            "max_score": max_score,
            "std_score": std_score
        })
    with open(output_json, "w") as f:
        json.dump({"segments": segment_scores}, f, indent=2, ensure_ascii=False)
    print(f"📄 Segment scores JSON saved: {output_json}")
    return segment_scores

def save_sorted_segments_with_combined_score_json(segment_scores, alpha, std_weight, output_json):
    if output_json is None:
        return 
    for seg in segment_scores:
        seg["combined_score"] = (
            seg["avg_score"] * alpha +
            seg["max_score"] * (1 - alpha) -
            seg["std_score"] * std_weight
        )
    sorted_segments = sorted(segment_scores, key=lambda x: x["combined_score"], reverse=True)
    with open(output_json, "w") as f:
        json.dump({"segments": sorted_segments}, f, indent=2, ensure_ascii=False)
    print(f"📄 Sorted segments JSON saved (combined_score): {output_json}")
    return sorted_segments

def knapsack_segment_selection(segment_scores, max_length):
    n = len(segment_scores)
    
    # ✅ frame_scores 길이를 weight로 사용
    weights = [len(seg["frame_scores"]) for seg in segment_scores]
    values = [seg.get("combined_score", 0.0) for seg in segment_scores]

    dp = [[0] * (max_length + 1) for _ in range(n + 1)]
    keep = [[0] * (max_length + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        for w in range(max_length + 1):
            if weights[i - 1] <= w:
                if dp[i - 1][w] < dp[i - 1][w - weights[i - 1]] + values[i - 1]:
                    dp[i][w] = dp[i - 1][w - weights[i - 1]] + values[i - 1]
                    keep[i][w] = 1
                else:
                    dp[i][w] = dp[i - 1][w]
            else:
                dp[i][w] = dp[i - 1][w]

    selected_segments = []
    w = max_length
    for i in range(n, 0, -1):
        if keep[i][w]:
            selected_segments.append(segment_scores[i - 1])
            w -= weights[i - 1]

    return selected_segments[::-1]

def run_pgl_module(
    ckpt_path,
    feature_h5,
    scene_json,
    output_json,
    output_sorted_combined_json,
    fps=1.0,
    device="cpu",
    alpha=0.7,
    std_weight=0.3,
    top_ratio=0.2
):
    print(f"🚀 Running PGL Module | Device: {device}")

    # 1. 모델 로딩
    model = PGL_SUM(input_size=1024, output_size=1024, num_segments=4, heads=8, fusion="add", pos_enc="absolute")
    model = load_model_checkpoint(model, ckpt_path, device)
    model.to(device).eval()

    # 2. 특징 로드 및 중요도 예측
    features = load_h5_features(feature_h5)
    scores = predict_scores(model, features, device=device)

    # 3. 장면 세그먼트 로드
    scene_segments = load_scene_segments(scene_json, fps)

    # 4. 세그먼트별 점수 계산
    segment_scores = save_segment_frame_scores_json(scores, scene_segments, output_json)

    # 5. combined_score 계산 및 저장
    for seg in segment_scores:
        seg["combined_score"] = (
            seg["avg_score"] * alpha +
            seg["max_score"] * (1 - alpha) -
            seg["std_score"] * std_weight
        )
    sorted_segments = sorted(segment_scores, key=lambda x: x["combined_score"], reverse=True)

    if output_sorted_combined_json:
        with open(output_sorted_combined_json, "w") as f:
            json.dump({"segments": sorted_segments}, f, indent=2, ensure_ascii=False)
        print(f"📄 Sorted segments JSON saved (combined_score): {output_sorted_combined_json}")
        
    max_total_len = int(len(scores) * top_ratio)
    selected_segments = knapsack_segment_selection(segment_scores, max_total_len)
    
    return selected_segments
