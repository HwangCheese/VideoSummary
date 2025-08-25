import torch
import json
import numpy as np
import h5py
import os
from networks.pgl_sum.pgl_sum import PGL_SUM
from knapsack_module import run_sub_knapsack_pipeline

def load_h5_features(h5_path):
    # H5 파일에서 프레임 특징(feature)을 로드
    with h5py.File(h5_path, "r") as hf:
        return np.array(hf["features"])

def predict_scores(model, features, device="cpu"):
    # 모델을 통해 하이라이트 점수를 예측
    x = torch.from_numpy(features).float().to(device)
    if x.ndim == 2:
        x = x.unsqueeze(0)
    mask = torch.ones((x.shape[0], x.shape[1]), dtype=torch.bool).to(device)
    with torch.no_grad():
        scores, _ = model(x, mask)
    scores = scores.cpu().numpy().squeeze()
    print(f"요약 점수 리스트: {scores} 길이: {len(scores)}")
    return scores

def load_model_checkpoint(model, ckpt_path, device):
    # 체크포인트에서 모델 파라미터 로드
    checkpoint = torch.load(ckpt_path, map_location=device)
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"], strict=False)
    else:
        model.load_state_dict(checkpoint, strict=False)
    return model


def load_scene_segments(scene_json, fps, thr=0.5):
    # 중복 없는 세그먼트 로드 (비정상 세그먼트는 invalid로 처리)
    with open(scene_json, "r") as f:
        segments = json.load(f)

    for seg in segments:
        seg["start_frame"] = int(seg["start_time"] * fps)

    for i, seg in enumerate(segments):
        if i < len(segments) - 1:
            next_seg = segments[i + 1]
            boundary_frame = next_seg["start_frame"]

            frac = seg["end_time"] - int(seg["end_time"])
            
            if frac < thr:
                seg["end_frame"] = boundary_frame - 1
            else:
                seg["end_frame"] = boundary_frame
                next_seg["start_frame"] = boundary_frame + 1
        else:
            seg["end_frame"] = int(seg["end_time"] * fps) - 1

        # 보정 대신 비정상 세그먼트는 제거 대상(invalid) 마킹
        seg["invalid"] = seg["end_frame"] < seg["start_frame"]

    return segments


def save_segment_frame_scores_json(scores, scene_segments, output_json, fps):
    # 프레임 점수 JSON 저장 (invalid 세그먼트 제외)
    segment_scores = []

    for seg in scene_segments:
        if seg.get("invalid", False):
            print(f"비정상 세그먼트 id={seg['segment_id']} (start_frame={seg['start_frame']} end_frame={seg['end_frame']}) 건너뜀.")
            continue  # invalid 세그먼트 제외

        start_frame = seg["start_frame"]
        end_frame = min(seg["end_frame"], len(scores) - 1)

        if start_frame >= len(scores):
            continue

        frame_scores = scores[start_frame: end_frame + 1]
        if len(frame_scores) == 0:
            continue

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

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(segment_scores, f, indent=2, ensure_ascii=False)

    print(f"Segment scores JSON saved: {output_json}")
    return segment_scores

def save_sorted_segments_with_combined_score_json(segment_scores, alpha, std_weight, output_json):
    # 각 세그먼트에 가중합(combined_score)을 계산한 후 내림차순으로 정렬하여 저장
    for seg in segment_scores:
        seg["combined_score"] = (seg["avg_score"] * alpha) + (seg["max_score"] * (1 - alpha)) - (std_weight * seg["std_score"])
    sorted_segments = sorted(segment_scores, key=lambda x: x["combined_score"], reverse=True)
    with open(output_json, "w") as f:
        json.dump(sorted_segments, f, indent=2, ensure_ascii=False)
    print(f"📄 Sorted segments JSON saved (combined_score): {output_json}")
    return sorted_segments

# def save_segment_frame_ranges_json(scene_segments, segment_scores, fps, output_path):
#     """
#     세그먼트의 프레임 범위, 시간 및 가중합 점수를 저장
#     """
#     combined_score_dict = {seg["segment_id"]: seg.get("combined_score", None) for seg in segment_scores}
#     frame_ranges = []
#     for seg in scene_segments:
#         start_frame = int(seg["start_time"] * fps)
#         end_frame = int(seg["end_time"] * fps)
#         combined_score = combined_score_dict.get(seg["segment_id"])
#         frame_ranges.append({
#             "segment_id": seg["segment_id"],
#             "start_frame": start_frame,
#             "end_frame": end_frame,
#             "combined_score": round(combined_score, 5) if combined_score is not None else None,
#             "start_time": seg["start_time"],
#             "end_time": seg["end_time"]
#         })
#     with open(output_path, "w") as f:
#         json.dump(frame_ranges, f, indent=2, ensure_ascii=False)
#     print(f"세그먼트 프레임 + 시간 범위 JSON 저장 완료: {output_path}")
#     return frame_ranges

# def run_pgl_pipeline(

def run_pgl_module(ckpt_path, feature_h5, scene_json, output_json, output_sorted_combined_json, fps=1.0, device="cpu", 
                   alpha=0.7, std_weight=0.3, top_ratio=0.2, importance_weight=0.8, budget_time=None):

    """
    PGL-SUM 모델을 사용하여 각 세그먼트의 중요도 점수를 계산하고, Knapsack 알고리즘으로 최종 세그먼트를 선택한다.

    Args:
        ckpt_path (str): 사전 학습된 PGL-SUM 모델의 체크포인트(.pkl) 파일 경로
        feature_h5 (str): 특징 벡터가 저장된 .h5 파일 경로
        scene_json (str): 장면 시간 정보가 담긴 .json 파일 경로
        output_json (str): 모든 세그먼트의 계산된 점수를 저장할 .json 파일 경로
        output_sorted_combined_json (str): 점수 기준으로 정렬된 세그먼트를 저장할 .json 파일 경로
        fps (float, optional): 비디오의 초당 프레임 수. 기본값: 1.0
        device (str, optional): 연산에 사용할 장치. 기본값: cpu
        alpha (float, optional): 평균 점수와 최대 점수의 가중 평균 계산 시 사용될 가중치. 기본값: 0.7
        std_weight (float, optional): 점수 계산 시 표준 편차에 적용될 패널티 가중치. 기본값: 0.3
        top_ratio (float, optional): 최종 요약의 목표 비율. 기본값: 0.2
        importance_weight (float, optional): Knapsack 선택 시 사용될 중요도 가중치. 기본값: 0.8
        budget_time (float, optional): 최종 요약의 목표 시간을 직접 지정. 기본값: None

    Returns:
        list: 최종적으로 선택된 세그먼트 객체(dict)들의 리스트
    """

    print(f"🚀 디바이스: {device}")

# video_path로부터 base_filename (예: "shortbox") 결정
    # base_filename = os.path.splitext(os.path.basename(args.video_path))[0]
    # os.makedirs(f"./{base_filename}", exist_ok=True)

    # 파일 경로 설정
    # output_json_path = f"./{base_filename}/{base_filename}_segment_scores.json"
    # output_sorted_combined_json_path = f"./{base_filename}/{base_filename}_sorted_combined.json"
    # segment_frame_json_path = f"./{base_filename}/{base_filename}_segment_frame.json"
    # pgl 파트에서 필요한 scene 세그먼트 JSON 파일 (미리 준비되어 있어야 함)
    # scene_json_path = f"./{base_filename}/{base_filename}_scenes.json"

    # 모델 초기화 및 체크포인트 로드
    
    model = PGL_SUM(input_size=1024, output_size=1024, num_segments=4, heads=8, fusion="add", pos_enc="absolute")
    model = load_model_checkpoint(model, ckpt_path, device)
    model.to(device).eval()

    features = load_h5_features(feature_h5)
    scores = predict_scores(model, features, device=device)

    scene_segments = load_scene_segments(scene_json, fps, thr=0.5)
    segment_scores = save_segment_frame_scores_json(scores, scene_segments, output_json, fps)
    save_sorted_segments_with_combined_score_json(segment_scores, alpha, std_weight, output_sorted_combined_json)

    selected_segments = run_sub_knapsack_pipeline(feature_h5, scene_json, fps, output_sorted_combined_json, importance_weight, top_ratio, budget_time)
    return selected_segments
