# knapsack_module.py
import json
import numpy as np
import h5py
from sklearn.metrics.pairwise import cosine_similarity

def load_file(json_filename):
    """JSON 파일을 로드"""
    with open(json_filename, 'r') as f:
        segments = json.load(f)
    return segments

def get_segment_average_vectors(h5_filename, segments, fps):
    """
    H5 파일에서 프레임 feature를 불러와서 각 세그먼트별 평균 벡터를 계산
    """
    with h5py.File(h5_filename, 'r') as f:
        features = f['features'][:]  # shape: (num_frames, feature_dim)
    segment_avg_dict = {}
    for seg in segments:
        start_time = seg['start_time']
        end_time = seg['end_time']
        start_frame = int(start_time * fps)
        end_frame = int(end_time * fps)
        seg_vector = np.mean(features[start_frame:end_frame+1], axis=0)
        segment_avg_dict[seg['segment_id']] = seg_vector
    return segment_avg_dict

def greedy_submodular_knapsack_selection(segment_ids, segment_vectors, importance, sorted_combined, budget_time, weight=1.0):
    """
    그리디 방식의 서브모듈러 + Knapsack 기반 세그먼트 선택 알고리즘.
    각 세그먼트의 시간(비용)과 중요도(combined_score)를 고려하여 선택.
    """
    N = segment_vectors.shape[0]
    # 각 세그먼트의 지속 시간(초)
    cost = np.array([seg["end_time"] - seg["start_time"] for seg in sorted_combined])
    sim_matrix = cosine_similarity(segment_vectors)
    current_coverage = np.zeros(N)
    selected = []
    total_time = 0.0

    while True:
        best_gain = -np.inf
        best_candidate = None
        best_candidate_cost = None

        for j in range(N):
            if j in selected:
                continue

            candidate_cost = cost[j]
            if total_time + candidate_cost > budget_time:
                continue

            if weight == 1.0:
                candidate_gain = importance[j] / candidate_cost
                # print(f"  - ID: {j}, 점수: {candidate_gain:.4f}")

            else:
                # 중요도와 다양성을 결합한 gain 계산
                score_gain = importance[j]
                diversity_gain_sum = 0.0
                for i in range(N):
                    prev_cov = current_coverage[i]
                    new_cov = max(prev_cov, sim_matrix[i, j])
                    delta = new_cov - prev_cov
                    diversity_gain_sum += importance[i] * delta
                diversity_gain = diversity_gain_sum / candidate_cost if candidate_cost > 0 else 0.0
                candidate_gain = weight * (score_gain / candidate_cost) + (1 - weight) * diversity_gain

            if candidate_gain > best_gain:
                best_gain = candidate_gain
                best_candidate = j
                best_candidate_cost = candidate_cost

        if best_candidate is None:
            break

        selected.append(best_candidate)
        total_time += best_candidate_cost
        print(f"  - segment ID: {segment_ids[best_candidate]}, 점수: {best_gain:.4f}")
        if weight != 1.0:
            for i in range(N):
                current_coverage[i] = max(current_coverage[i], sim_matrix[i, best_candidate])

    selected_ids = [segment_ids[j] for j in selected]
    return selected_ids, total_time

def run_sub_knapsack_pipeline(feature_h5, scene_json, fps, output_sorted_combined_json, importance_weight, top_ratio=None, budget_time=None):
    """
    pgl_module에서 생성한 세그먼트 프레임 범위 JSON 파일과 feature 파일을 이용해
    Submodular + Knapsack 기반 세그먼트 선택을 실행하는 파이프라인 함수.
    
    선택된 세그먼트 ID들을 JSON 파일로 저장하고, 메모리 내 리스트로 반환합니다.
    """

    # h5_file = args.feature_h5  # pgl_module에서 사용한 feature 파일과 동일
    # output_h5_path = f"./features/{base_filename}.h5"
    # output_id_path = f"./{base_filename}/{base_filename}_selected_segmentID.json"
    
    # scenes_file = f'./{base_filename}/{base_filename}_scenes.json'
    scenes = load_file(scene_json)
    segment_avg_dict = get_segment_average_vectors(feature_h5, scenes,fps)

    segment_ids = []
    segment_vectors = []
    importance = []
    
    # sorted_combined_file = f'./{base_filename}/{base_filename}_sorted_combined.json'
    sorted_combined = load_file(output_sorted_combined_json)

    for seg in sorted_combined:
        seg_id = seg['segment_id']
        segment_ids.append(seg_id)
        segment_vectors.append(segment_avg_dict[seg_id])
        importance.append(seg.get("combined_score", 0.0))
    segment_vectors = np.array(segment_vectors)
    importance = np.array(importance)

    # video_length = max(seg["end_time"] for seg in scenes)
    # budget_time = video_length * 0.2
    # print("전체 영상 길이 (초):", video_length)
    # print("요약 예산 (20%):", budget_time)

    if budget_time is None and top_ratio is None:
        raise ValueError("top_ratio 또는 budget_time 중 하나는 반드시 지정해야 합니다.")

    video_length = max(seg['end_time'] for seg in scenes)

    if budget_time is None:
        budget_time = video_length * top_ratio
        print(f"전체 영상 길이 (초): {video_length:.2f}")
        print(f"top_ratio 기반 예산 (초): {budget_time:.2f}")
    else:
        print(f"사용자 지정 예산 시간 (초): {budget_time:.2f}")
    
    selected_ids, used_time = greedy_submodular_knapsack_selection(
        segment_ids, segment_vectors, importance, sorted_combined, budget_time, weight=importance_weight
    )

    print("선택된 세그먼트:", selected_ids)
    print("선택된 세그먼트 총 시간 (초):", used_time)

    # with open(output_id_path, "w") as f:
    #     json.dump(selected_ids, f, indent=2)
    # print(f"💾 선택된 세그먼트 ID 저장됨 (JSON): {output_id_path}")
    
    # selected_ids → 실제 segment 객체들로 변환
    selected_segments = [seg for seg in sorted_combined if seg["segment_id"] in selected_ids]
    return selected_segments
