import json
import numpy as np
import h5py
from sklearn.metrics.pairwise import cosine_similarity
import math

def load_file(json_filename, stringify_segment_id=True):
    """
    JSON 파일을 로드하고 선택적으로 segment_id를 문자열로 변환한다.
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
    H5 파일에서 프레임 feature를 불러와 각 세그먼트별 평균 벡터를 계산한다.
    """
    features = None
    try:
        with h5py.File(h5_filename, 'r') as f:
            if 'features' not in f:
                if verbose: print(f"오류: H5 파일 '{h5_filename}'에서 'features' 키를 찾을 수 없습니다.")
                return {}
            features = f['features'][:]
    except FileNotFoundError:
        if verbose: print(f"오류: H5 파일을 '{h5_filename}'에서 찾을 수 없습니다.")
        return {}
    except Exception as e:
        if verbose: print(f"오류: H5 파일 '{h5_filename}' 로딩 중 오류 발생: {e}")
        return {}
    
    if features is None or features.size == 0:
        if verbose: print(f"오류: '{h5_filename}'에서 로드한 특징(feature) 데이터가 비어 있거나 로드할 수 없습니다.")
        return {}
        
    segment_avg_dict = {}
    for seg_meta in segments_metadata_list:
        seg_id = str(seg_meta['segment_id']) 
        start_time = seg_meta['start_time']
        end_time = seg_meta['end_time']
        
        start_frame = int(start_time)
        end_frame = int(end_time)
        
        if start_frame >= features.shape[0] or end_frame >= features.shape[0] :
            if verbose: print(f"경고: 세그먼트 ID '{seg_id}'의 프레임 범위({start_frame}-{end_frame})가 전체 특징 데이터 크기({features.shape[0]})를 벗어납니다. 건너뜁니다.")
            continue
        
        if start_frame > end_frame :
            if verbose: print(f"경고: 세그먼트 ID '{seg_id}'의 시작 프레임({start_frame})이 종료 프레임({end_frame})보다 큽니다. 건너뜁니다.")
            continue

        seg_frames = features[start_frame : end_frame + 1]

        if seg_frames.shape[0] == 0:
            if verbose: print(f"경고: 세그먼트 ID '{seg_id}'에 해당하는 프레임이 없습니다 (시작: {start_frame}, 종료: {end_frame}). 건너뜁니다.")
            continue
            
        seg_vector = np.mean(seg_frames, axis=0)
        segment_avg_dict[seg_id] = seg_vector
    return segment_avg_dict

def calculate_representativeness_score(all_original_vectors_np, selected_vectors_np, verbose=True):
    """
    원본 전체 세그먼트 벡터들과 선택된 요약 세그먼트 벡터들 간의 대표성 점수를 계산한다.
    결과는 0과 1 사이로 클리핑된다.
    """
    num_original_segments = all_original_vectors_np.shape[0]
    num_selected_segments = selected_vectors_np.shape[0]

    if num_original_segments == 0 or num_selected_segments == 0:
        return 0.0
    
    if all_original_vectors_np.ndim < 2 or selected_vectors_np.ndim < 2 or \
       all_original_vectors_np.shape[1] == 0 or selected_vectors_np.shape[1] == 0:
        if verbose:
            print("경고 (대표성): 하나 또는 두 벡터 배열의 차원이 0이거나 2D가 아닙니다. 점수는 0점입니다.")
        return 0.0

    try:
        similarity_matrix = cosine_similarity(all_original_vectors_np, selected_vectors_np)
    except ValueError as e:
        if verbose: print(f"오류 (대표성): 코사인 유사도 계산 중 오류 발생: {e}")
        return 0.0

    max_similarity_for_each_original = np.max(similarity_matrix, axis=1)
    representativeness = np.mean(max_similarity_for_each_original)
    return max(0.0, min(representativeness, 1.0))

def calculate_total_score_per_second(segments_metadata_list, verbose=True):
    """
    세그먼트 리스트에서 각 세그먼트의 (combined_score / duration)의 총합을 계산한다.
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
    """세그먼트 리스트에서 'combined_score'의 총합을 계산한다."""
    total_importance = 0.0
    if not segments_metadata_list: return 0.0
    for seg_meta in segments_metadata_list:
        total_importance += seg_meta.get('combined_score', 0.0)
    return total_importance

def calculate_ratio_of_covered_sps(all_original_segments_metadata, selected_segments_metadata, verbose=True):
    """
    선택된 세그먼트의 (score_per_second 합) / 원본 전체 세그먼트의 (score_per_second 합) 비율(RCI_SPS)을 계산한다.
    """
    total_original_sps = calculate_total_score_per_second(all_original_segments_metadata, verbose=verbose)
    if total_original_sps == 0:
        if verbose: print("경고 (RCI_SPS): 원본 영상의 초당 총 점수가 0입니다. 비율은 0이 됩니다.")
        return 0.0 
    total_selected_sps = calculate_total_score_per_second(selected_segments_metadata, verbose=verbose)
    ratio = total_selected_sps / total_original_sps
    return ratio

def get_power_transformed_score(score, exponent=0.5):
    """
    0-1 범위의 점수를 거듭제곱 변환한다.
    """
    clamped_score = max(0.0, min(score, 1.0))
    if exponent <= 0:
        if exponent == 0 and clamped_score == 0: return 0.0
        if exponent == 0 and clamped_score > 0: return 1.0
        return clamped_score
    if clamped_score == 0:
        return 0.0
    return math.pow(clamped_score, exponent)

# --- 실행 함수 ---
def run_evaluation(
    weight: float,
    feature_h5_path: str,
    all_segments_json_path: str,
    selected_segments_info_path: str,
    verbose: bool = True
) -> float:
    
    """
    생성된 요약의 품질을 '대표성'과 '중요도' 측면에서 평가하여 정량적인 점수를 계산한다.

    Args:
        weight (float): 최종 점수 계산 시 중요도(RCI_SPS)에 부여할 가중치 (0.0 ~ 1.0).
                        (1 - weight)는 대표성 점수에 대한 가중치가 된다.
        feature_h5_path (str): 대표성 계산을 위한 특징 벡터 .h5 파일 경로
        all_segments_json_path (str): 원본 영상의 모든 세그먼트 정보 .json 파일 경로
        selected_segments_info_path (str): 요약에 포함된 세그먼트 정보 .json 파일 경로
        verbose (bool, optional): 계산 과정의 상세 로그 출력 여부. 기본값: True

    Returns:
        float: 0점에서 100점 사이로 계산된 최종 요약 품질 점수
    """
    if not (0 <= weight <= 1):
        if verbose: print(f"경고: 가중치({weight})가 0과 1 사이가 아닙니다. 값을 조정합니다.")
        weight = max(0.0, min(weight, 1.0))

    all_original_segments_metadata = []
    try:
        all_original_segments_metadata = load_file(all_segments_json_path, stringify_segment_id=True)
        if not all_original_segments_metadata and verbose:
            print(f"경고: '{all_segments_json_path}'에서 로드한 원본 세그먼트 메타데이터가 비어 있습니다. 점수가 0이 될 수 있습니다.")
    except FileNotFoundError:
        if verbose: print(f"오류: 전체 세그먼트 JSON 파일을 '{all_segments_json_path}'에서 찾을 수 없습니다. 0점을 반환합니다.")
        return 0.0 
    except (json.JSONDecodeError, ValueError) as e:
        if verbose: print(f"오류: '{all_segments_json_path}' 처리 중 오류 발생: {e}. 0점을 반환합니다.")
        return 0.0

    selected_segments_metadata = []
    try:
        selected_segments_metadata = load_file(selected_segments_info_path, stringify_segment_id=True)
        if not selected_segments_metadata and verbose:
            print(f"경고: '{selected_segments_info_path}'에서 로드한 선택된 세그먼트 메타데이터가 비어 있습니다. 점수가 0이 될 수 있습니다.")
    except FileNotFoundError:
        if verbose: print(f"정보: 선택된 세그먼트 정보 JSON 파일을 '{selected_segments_info_path}'에서 찾을 수 없습니다. 선택된 세그먼트가 없는 것으로 간주합니다.")
    except (json.JSONDecodeError, ValueError) as e:
        if verbose: print(f"오류: '{selected_segments_info_path}' 처리 중 오류 발생: {e}. 선택된 세그먼트가 없는 것으로 간주합니다.")

    current_feature_dim = 0
    all_original_segment_vectors_dict = {}
    if all_original_segments_metadata:
        all_original_segment_vectors_dict = get_segment_average_vectors(
            feature_h5_path, all_original_segments_metadata, verbose=verbose
        )
        if all_original_segment_vectors_dict:
            try: 
                current_feature_dim = next(iter(all_original_segment_vectors_dict.values())).shape[0]
            except (StopIteration, AttributeError, IndexError): 
                if verbose: print("경고: 세그먼트 벡터에서 특징(feature) 차원을 확인할 수 없습니다.")
                pass 

    original_vectors_list = []
    if all_original_segments_metadata:
        for seg_meta in all_original_segments_metadata:
            seg_id = str(seg_meta['segment_id'])
            if seg_id in all_original_segment_vectors_dict:
                original_vectors_list.append(all_original_segment_vectors_dict[seg_id])

    all_original_vectors_np = np.array(original_vectors_list) if original_vectors_list else np.empty((0, current_feature_dim))
    if all_original_vectors_np.ndim == 1 and all_original_vectors_np.size > 0: 
        all_original_vectors_np = all_original_vectors_np.reshape(1, -1)
    if current_feature_dim == 0 and all_original_vectors_np.size > 0 : 
        current_feature_dim = all_original_vectors_np.shape[1]

    selected_vectors_list = []
    if selected_segments_metadata:
        for seg_meta in selected_segments_metadata:
            seg_id = str(seg_meta['segment_id'])
            if seg_id in all_original_segment_vectors_dict:
                selected_vectors_list.append(all_original_segment_vectors_dict[seg_id])
            elif verbose and all_original_segment_vectors_dict:
                 print(f"경고: 미리 계산된 벡터 목록에 선택된 세그먼트 ID '{seg_id}'가 없습니다. 제외됩니다.")
    
    selected_vectors_np = np.array(selected_vectors_list) if selected_vectors_list else np.empty((0, current_feature_dim))
    if selected_vectors_np.ndim == 1 and selected_vectors_np.size > 0: 
        selected_vectors_np = selected_vectors_np.reshape(1, -1)

    # --- 점수 계산 ---
    
    raw_representativeness_score = 0.0
    if all_original_vectors_np.size > 0 and selected_vectors_np.size > 0 :
        if all_original_vectors_np.shape[1] == selected_vectors_np.shape[1]:
            raw_representativeness_score = calculate_representativeness_score(
                all_original_vectors_np, selected_vectors_np, verbose
            )
        elif verbose:
            print(f"경고 (대표성): 특징(feature) 차원이 일치하지 않습니다. 원본: {all_original_vectors_np.shape}, 선택: {selected_vectors_np.shape}. 점수는 0점입니다.")
    
    power_transformed_representativeness_100 = get_power_transformed_score(raw_representativeness_score, exponent=0.5) * 100

    raw_rci_sps_score = 0.0
    if all_original_segments_metadata:
        raw_rci_sps_score = calculate_ratio_of_covered_sps(
            all_original_segments_metadata, selected_segments_metadata, verbose
        )
    
    power_transformed_rci_sps_100 = get_power_transformed_score(raw_rci_sps_score, exponent=0.5) * 100
 
    final_score_raw = (power_transformed_representativeness_100 * (1 - weight)) + \
                  (power_transformed_rci_sps_100 * weight)
                  
    final_score = round(final_score_raw, 1)
    
    if verbose:
        print(f"\n--- 최종 점수 계산을 위한 중간 점수 ---")
        print(f"대표성 원점수 (0-1): {raw_representativeness_score:.4f}")
        print(f"변환된 대표성 점수 (0-100): {power_transformed_representativeness_100:.2f}")
        print(f"중요도(RCI_SPS) 원점수: {raw_rci_sps_score:.4f}")
        print(f"변환된 중요도(RCI_SPS) 점수 (0-100): {power_transformed_rci_sps_100:.2f}")
        print(f"가중치 (대표성: {(1 - weight):.2f}, 중요도: {weight:.2f})")
        print(f"최종 가중 합산 점수: {final_score}")

    return final_score