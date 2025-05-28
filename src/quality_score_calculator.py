# quality_score_calculator.py
import json
import numpy as np
import h5py
from sklearn.metrics.pairwise import cosine_similarity
import math

def load_file(json_filename, stringify_segment_id=True):
    """
    JSON 파일을 로드하고 선택적으로 segment_id를 문자열로 변환합니다.
    """
    with open(json_filename, 'r') as f:
        data = json.load(f)
    if stringify_segment_id and isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and 'segment_id' in item:
                item['segment_id'] = str(item['segment_id'])
    return data

def get_segment_average_vectors(h5_filename, segments_metadata_list, verbose=True):
    """
    H5 파일에서 프레임 feature를 불러와 각 세그먼트별 평균 벡터를 계산합니다.
    """
    features = None
    try:
        with h5py.File(h5_filename, 'r') as f:
            if 'features' not in f:
                if verbose: print(f"Error: 'features' key not found in H5 file {h5_filename}")
                return {}
            features = f['features'][:]
    except FileNotFoundError:
        if verbose: print(f"Error: H5 file not found at {h5_filename}")
        return {}
    except Exception as e:
        if verbose: print(f"Error loading H5 file {h5_filename}: {e}")
        return {}
    
    if features is None or features.size == 0:
        if verbose: print(f"Error: Features loaded from {h5_filename} are empty or could not be loaded.")
        return {}
        
    segment_avg_dict = {}
    for seg_meta in segments_metadata_list:
        seg_id = str(seg_meta['segment_id']) 
        start_time = seg_meta['start_time']
        end_time = seg_meta['end_time']
        
        start_frame = int(start_time)
        end_frame = int(end_time)
        
        if start_frame >= features.shape[0] or end_frame >= features.shape[0] :
            if verbose: print(f"Warning: Frame range for segment ID '{seg_id}' ({start_frame}-{end_frame}) is out of bounds for features shape {features.shape[0]}. Skipping.")
            continue
        
        if start_frame > end_frame :
            if verbose: print(f"Warning: start_frame ({start_frame}) > end_frame ({end_frame}) for segment ID '{seg_id}'. Skipping.")
            continue

        seg_frames = features[start_frame : end_frame + 1]

        if seg_frames.shape[0] == 0:
            if verbose: print(f"Warning: No frames selected for segment ID '{seg_id}' (start_frame: {start_frame}, end_frame: {end_frame}). Skipping.")
            continue
            
        seg_vector = np.mean(seg_frames, axis=0)
        segment_avg_dict[seg_id] = seg_vector
    return segment_avg_dict

def calculate_representativeness_score(all_original_vectors_np, selected_vectors_np, verbose=True):
    """
    원본 전체 세그먼트 벡터들과 선택된 요약 세그먼트 벡터들 간의 대표성 점수를 계산합니다.
    결과는 0과 1 사이로 클리핑됩니다.
    """
    num_original_segments = all_original_vectors_np.shape[0]
    num_selected_segments = selected_vectors_np.shape[0]

    if num_original_segments == 0 or num_selected_segments == 0:
        return 0.0
    
    if all_original_vectors_np.ndim < 2 or selected_vectors_np.ndim < 2 or \
       all_original_vectors_np.shape[1] == 0 or selected_vectors_np.shape[1] == 0:
        if verbose:
            print("Warning (Representativeness): One or both vector arrays have 0 feature dimension or are not 2D. Score is 0.")
        return 0.0

    try:
        similarity_matrix = cosine_similarity(all_original_vectors_np, selected_vectors_np)
    except ValueError as e:
        if verbose: print(f"Error (Representativeness) during cosine_similarity: {e}")
        return 0.0

    max_similarity_for_each_original = np.max(similarity_matrix, axis=1)
    representativeness = np.mean(max_similarity_for_each_original)
    return max(0.0, min(representativeness, 1.0)) # 0~1 범위 보장

def calculate_total_score_per_second(segments_metadata_list, verbose=True):
    """
    세그먼트 리스트에서 각 세그먼트의 (combined_score / duration)의 총합을 계산합니다.
    (RCI_SPS 계산에 사용됨)
    """
    total_score_per_second = 0.0
    if not segments_metadata_list: return 0.0
    for seg_meta in segments_metadata_list:
        combined_score = seg_meta.get('combined_score', 0.0)
        start_time = seg_meta.get('start_time', 0.0)
        end_time = seg_meta.get('end_time', 0.0)
        duration = end_time - start_time
        if duration > 0:
            total_score_per_second += combined_score / duration
    return total_score_per_second

def calculate_total_importance(segments_metadata_list, verbose=True):
    """세그먼트 리스트에서 'combined_score'의 총합을 계산합니다."""
    total_importance = 0.0
    if not segments_metadata_list: return 0.0
    for seg_meta in segments_metadata_list:
        total_importance += seg_meta.get('combined_score', 0.0)
    return total_importance

def calculate_ratio_of_covered_sps(all_original_segments_metadata, selected_segments_metadata, verbose=True):
    """
    선택된 세그먼트의 (score_per_second 합) / 원본 전체 세그먼트의 (score_per_second 합) 비율(RCI_SPS)을 계산합니다.
    결과는 0과 1 사이로 클리핑될 수 있도록 사용처에서 관리 (get_power_transformed_score에서 처리).
    """
    total_original_sps = calculate_total_score_per_second(all_original_segments_metadata, verbose=verbose)
    if total_original_sps == 0:
        if verbose: print("Warning (RCI_SPS): Total original score_per_second is 0. Ratio will be 0.")
        return 0.0 
    total_selected_sps = calculate_total_score_per_second(selected_segments_metadata, verbose=verbose)
    # 비율은 1을 넘을 수도, 음수가 될 수도 있음 (점수 설계에 따라). 보통은 0 이상.
    ratio = total_selected_sps / total_original_sps
    return ratio # 클리핑은 get_power_transformed_score에서 수행

def get_power_transformed_score(score, exponent=0.5):
    """
    0-1 범위의 점수를 거듭제곱 변환합니다 (주로 압축 목적).
    exponent=0.5 이면 제곱근 변환입니다.
    """
    # 입력 점수를 0~1로 클리핑 (음수나 1 초과 방지)
    clamped_score = max(0.0, min(score, 1.0))
    
    if exponent <= 0:
        if exponent == 0 and clamped_score == 0: return 0.0 # 0^0은 정의 논란, 여기선 0으로 처리
        if exponent == 0 and clamped_score > 0: return 1.0 # x^0 = 1 (x!=0)
        # 음수 지수는 발산 가능성, 여기서는 변환 안 함 또는 오류
        # print("Warning: Exponent should be positive for this transformation.")
        return clamped_score 
        
    if clamped_score == 0: # 0의 양수 거듭제곱은 0
        return 0.0
        
    return math.pow(clamped_score, exponent)

# --- 실행 함수 ---
def run_evaluation(
    weight: float, # 대표성 점수에 대한 가중치
    feature_h5_path: str,
    all_segments_json_path: str,
    selected_segments_info_path: str,
    verbose: bool = True
) -> float: # 최종 점수(float)를 반환함을 명시
    """
    대표성 점수와 RCI_SPS 점수를 계산하고, 각각을 제곱근 변환 및 100점 만점 스케일링 후
    가중 합하여 최종 요약 품질 점수를 반환합니다.
    """

    # 가중치 유효성 검사
    if not (0 <= weight <= 1):
        if verbose: print(f"Warning: weight ({weight}) is not between 0 and 1. Clamping.")
        weight = max(0.0, min(weight, 1.0))

    # 메타데이터 로드
    all_original_segments_metadata = []
    try:
        all_original_segments_metadata = load_file(all_segments_json_path, stringify_segment_id=True)
        if not all_original_segments_metadata and verbose:
            print(f"Warning: Loaded all_original_segments_metadata from '{all_segments_json_path}' is empty. Scores might be 0.")
    except FileNotFoundError:
        if verbose: print(f"Error: All segments JSON file not found at {all_segments_json_path}. Returning 0.")
        return 0.0 
    except (json.JSONDecodeError, ValueError) as e:
        if verbose: print(f"Error processing {all_segments_json_path}: {e}. Returning 0.")
        return 0.0

    selected_segments_metadata = []
    try:
        selected_segments_metadata = load_file(selected_segments_info_path, stringify_segment_id=True)
        if not selected_segments_metadata and verbose:
            print(f"Warning: Loaded selected_segments_metadata from '{selected_segments_info_path}' is empty. Scores might be 0.")
    except FileNotFoundError:
        # 선택된 세그먼트 파일이 없는 것은 오류가 아닐 수 있음 (예: 요약 결과 없음)
        if verbose: print(f"Info: Selected segments info JSON file not found at {selected_segments_info_path}. Assuming no segments selected.")
    except (json.JSONDecodeError, ValueError) as e:
        if verbose: print(f"Error processing {selected_segments_info_path}: {e}. Assuming no segments selected.")

    # Feature Vector 계산
    current_feature_dim = 0 # 기본 피쳐 차원
    all_original_segment_vectors_dict = {}
    if all_original_segments_metadata:
        all_original_segment_vectors_dict = get_segment_average_vectors(
            feature_h5_path, all_original_segments_metadata, verbose=verbose
        )
        if all_original_segment_vectors_dict:
            try: 
                # 첫 번째 벡터의 차원을 가져옴
                current_feature_dim = next(iter(all_original_segment_vectors_dict.values())).shape[0]
            except (StopIteration, AttributeError, IndexError): 
                if verbose: print("Warning: Could not determine feature dimension from segment vectors.")
                pass 

    original_vectors_list = []
    if all_original_segments_metadata:
        for seg_meta in all_original_segments_metadata:
            seg_id = str(seg_meta['segment_id'])
            if seg_id in all_original_segment_vectors_dict:
                original_vectors_list.append(all_original_segment_vectors_dict[seg_id])

    # NumPy 배열로 변환. 리스트가 비어있으면 (0, current_feature_dim) 형태의 배열 생성
    all_original_vectors_np = np.array(original_vectors_list) if original_vectors_list else np.empty((0, current_feature_dim))
    # 1D 배열인 경우 (세그먼트가 하나) 2D로 변환
    if all_original_vectors_np.ndim == 1 and all_original_vectors_np.size > 0: 
        all_original_vectors_np = all_original_vectors_np.reshape(1, -1)
    # 만약 original_vectors_list가 비어 current_feature_dim이 0이었는데, 이후 벡터가 생성되면 차원 업데이트
    if current_feature_dim == 0 and all_original_vectors_np.size > 0 : 
        current_feature_dim = all_original_vectors_np.shape[1]


    selected_vectors_list = []
    if selected_segments_metadata:
        for seg_meta in selected_segments_metadata:
            seg_id = str(seg_meta['segment_id'])
            if seg_id in all_original_segment_vectors_dict:
                selected_vectors_list.append(all_original_segment_vectors_dict[seg_id])
            elif verbose and all_original_segment_vectors_dict:
                 print(f"Warning: Vector for selected segment ID '{seg_id}' not found in pre-calculated dict. Excluded.")
    
    selected_vectors_np = np.array(selected_vectors_list) if selected_vectors_list else np.empty((0, current_feature_dim))
    if selected_vectors_np.ndim == 1 and selected_vectors_np.size > 0: 
        selected_vectors_np = selected_vectors_np.reshape(1, -1)

    # --- 점수 계산 ---
    
    # 1. 대표성 점수 (Representativeness Score)
    raw_representativeness_score = 0.0 # 0~1 범위
    if all_original_vectors_np.size > 0 and selected_vectors_np.size > 0 :
        # 벡터 차원이 일치하는지 확인 (선택 사항, cosine_similarity에서 오류 발생 가능)
        if all_original_vectors_np.shape[1] == selected_vectors_np.shape[1]:
            raw_representativeness_score = calculate_representativeness_score(
                all_original_vectors_np, selected_vectors_np, verbose
            )
        elif verbose:
            print(f"Warning (Representativeness): Feature dimension mismatch. Originals: {all_original_vectors_np.shape}, Selected: {selected_vectors_np.shape}. Score is 0.")
    
    # 제곱근 변환 후 100점 만점 스케일링
    power_transformed_representativeness_100 = get_power_transformed_score(raw_representativeness_score, exponent=0.5) * 100

    # 2. RCI_SPS (Ratio of Covered Score per Second)
    raw_rci_sps_score = 0.0 # 보통 0~1 범위, 이론적으로 1 초과 가능
    if all_original_segments_metadata: # 원본 메타데이터가 있어야 의미 있음
        raw_rci_sps_score = calculate_ratio_of_covered_sps(
            all_original_segments_metadata, selected_segments_metadata, verbose
        )
    
    # 제곱근 변환 후 100점 만점 스케일링
    # get_power_transformed_score 내부에서 0~1로 클리핑되므로, raw_rci_sps_score가 1을 넘어도 처리됨
    power_transformed_rci_sps_100 = get_power_transformed_score(raw_rci_sps_score, exponent=0.5) * 100
 
    # 최종 가중 합계 점수 계산
    final_score_raw = (power_transformed_representativeness_100 * (1 - weight)) + \
                  (power_transformed_rci_sps_100 * weight)
                  
    final_score = round(final_score_raw, 1)
    
    if verbose:
        print(f"\n--- Intermediate Scores for Final Calculation ---")
        print(f"Raw Representativeness (0-1): {raw_representativeness_score:.4f}")
        print(f"Transformed Representativeness (0-100): {power_transformed_representativeness_100:.2f}")
        print(f"Raw RCI_SPS: {raw_rci_sps_score:.4f}")
        print(f"Transformed RCI_SPS (0-100): {power_transformed_rci_sps_100:.2f}")
        print(f"Weight for Representativeness: {weight:.2f}")
        print(f"Final Weighted Score: {final_score}")

    return final_score