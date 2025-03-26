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

def save_sorted_segments_json(segment_scores, sort_key, output_json):
    if output_json is None:
        return
    sorted_segments = sorted(segment_scores, key=lambda x: x[sort_key], reverse=True)
    with open(output_json, "w") as f:
        json.dump({"segments": sorted_segments}, f, indent=2, ensure_ascii=False)
    print(f"📄 Sorted segments JSON saved ({sort_key}): {output_json}")

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

def run_pgl_module(
    ckpt_path,
    feature_h5,
    scene_json,
    output_json,
    output_sorted_max_json,
    output_sorted_avg_json,
    output_sorted_combined_json,
    fps=1.0,
    device="cpu",
    alpha=0.7,
    std_weight=0.3
):
    print(f"🚀 Running PGL Module | Device: {device}")

    model = PGL_SUM(input_size=1024, output_size=1024, num_segments=4, heads=8, fusion="add", pos_enc="absolute")
    model = load_model_checkpoint(model, ckpt_path, device)
    model.to(device).eval()

    features = load_h5_features(feature_h5)
    scores = predict_scores(model, features, device=device)

    scene_segments = load_scene_segments(scene_json, fps)
    segment_scores = save_segment_frame_scores_json(scores, scene_segments, output_json)

    save_sorted_segments_json(segment_scores, "max_score", output_sorted_max_json)
    save_sorted_segments_json(segment_scores, "avg_score", output_sorted_avg_json)
    save_sorted_segments_with_combined_score_json(segment_scores, alpha, std_weight, output_sorted_combined_json)

    return segment_scores 
