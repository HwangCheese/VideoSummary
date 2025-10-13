# segment_importance.py
# 장면 세그먼트별 중요도 점수를 계산하고 정렬하는 파이프라인 모듈
 
import json
import numpy as np

def load_scene_segments(scene_json, fps, thr=0.5):
    """
    장면 구간 JSON을 불러와 각 세그먼트의 시작/끝 프레임을 계산하고,
    비정상적인(구간이 겹치거나 역전된) 세그먼트를 invalid로 표시하는 함수.

    Args:
        scene_json (str): 장면 구간 정보(JSON 파일 경로)
        fps (float): 비디오의 초당 프레임 수
        thr (float): 경계 보정 기준값 (소수점 이하 경계가 thr보다 작을 경우 보정 적용)

    Returns:
        List[dict]: start_frame, end_frame, invalid 등이 포함된 세그먼트 리스트
    """

    # JSON 파일 로드
    with open(scene_json, "r") as f:
        segments = json.load(f)

    # 각 세그먼트에 start_time(초)을 기반으로 start_frame 계산
    for seg in segments:
        seg["start_frame"] = int(seg["start_time"] * fps)

    # 세그먼트 간 경계 프레임 계산 및 유효성 검사
    for i, seg in enumerate(segments):
        if i < len(segments) - 1:
            next_seg = segments[i + 1]
            boundary_frame = next_seg["start_frame"]

            # end_time의 소수점 부분 (장면 경계가 애매할 때 처리하기 위함)
            frac = seg["end_time"] - int(seg["end_time"])
            
            # 소수점 이하가 threshold보다 작으면 바로 이전 프레임까지
            if frac < thr:
                seg["end_frame"] = boundary_frame - 1
            else:
                # 경계 포함 처리
                seg["end_frame"] = boundary_frame
                next_seg["start_frame"] = boundary_frame + 1
        else:
            # 마지막 세그먼트는 end_time 기준으로 계산
            seg["end_frame"] = int(seg["end_time"] * fps) - 1

        # end_frame이 start_frame보다 작으면 비정상 세그먼트로 마킹
        seg["invalid"] = seg["end_frame"] < seg["start_frame"]

    return segments


def save_segment_frame_scores_json(scores, scene_segments, output_json, fps):
    """
    각 세그먼트에 해당하는 프레임 구간의 점수를 추출하고,
    평균, 최대, 표준편차 점수를 계산하여 JSON으로 저장하는 함수.

    Args:
        scores (List[float]): 프레임별 중요도 점수
        scene_segments (List[dict]): 장면 세그먼트 리스트
        output_json (str): 결과 JSON 파일 경로
        fps (float): 초당 프레임 수

    Returns:
        List[dict]: 각 세그먼트의 점수 정보 리스트
    """
    segment_scores = []

    for seg in scene_segments:
        # invalid 세그먼트는 계산에서 제외
        if seg.get("invalid", False):
            print(f"비정상 세그먼트 id={seg['segment_id']} (start_frame={seg['start_frame']} end_frame={seg['end_frame']}) 건너뜀.")
            continue

        # 세그먼트 구간의 프레임 인덱스 계산
        start_frame = seg["start_frame"]
        end_frame = min(seg["end_frame"], len(scores) - 1)

        # 세그먼트 시작이 전체 프레임 범위 밖이면 무시
        if start_frame >= len(scores):
            continue

        # 프레임 구간별 점수 슬라이싱
        frame_scores = scores[start_frame: end_frame + 1]
        if len(frame_scores) == 0:
            continue

        # 평균, 최대, 표준편차 계산
        avg_score = float(np.mean(frame_scores))
        max_score = float(np.max(frame_scores))
        std_score = float(np.std(frame_scores))

        # 결과 구조화
        segment_scores.append({
            "segment_id": seg["segment_id"],
            "start_time": seg["start_time"],
            "end_time": seg["end_time"],
            "frame_scores": frame_scores.tolist(),
            "avg_score": avg_score,
            "max_score": max_score,
            "std_score": std_score
        })

    # JSON 파일로 저장
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(segment_scores, f, indent=2, ensure_ascii=False)

    print(f"Segment scores JSON saved: {output_json}")
    return segment_scores


def save_sorted_segments_with_combined_score_json(segment_scores, alpha, std_weight, output_json):
    """
    평균, 최대, 표준편차를 이용해 각 세그먼트의 중요도(combined_score)를 계산하고,
    내림차순 정렬하여 저장하는 함수.

    Args:
        segment_scores (List[dict]): 세그먼트별 점수 정보
        alpha (float): 평균 점수 가중치 (0~1)
        std_weight (float): 표준편차 패널티 가중치
        output_json (str): 정렬 결과 저장 파일 경로

    Returns:
        List[dict]: combined_score 기준으로 정렬된 세그먼트 리스트
    """
    for seg in segment_scores:
        # combined_score = α*평균 + (1-α)*최대 - (표준편차 가중치 * std)
        seg["combined_score"] = (seg["avg_score"] * alpha) + (seg["max_score"] * (1 - alpha)) - (std_weight * seg["std_score"])
    
    # 중요도 내림차순 정렬
    sorted_segments = sorted(segment_scores, key=lambda x: x["combined_score"], reverse=True)
    
    # JSON 파일로 저장
    with open(output_json, "w") as f:
        json.dump(sorted_segments, f, indent=2, ensure_ascii=False)
    print(f"Sorted segments JSON saved (combined_score): {output_json}")
    return sorted_segments


def run_segment_importance_pipeline(scene_json, frame_scores, output_json, output_sorted_combined_json, alpha, std_weight, fps):
    """
    장면 세그먼트 및 프레임 점수를 기반으로 중요한 세그먼트를 추출하는 전체 파이프라인 함수

    Args:
        scene_json (str): 장면 시간 정보가 담긴 JSON 파일 경로
        frame_scores (List[float]): 프레임별 중요도 점수 리스트
        output_json (str): 모든 세그먼트의 계산된 점수를 저장할 JSON 파일 경로
        output_sorted_combined_json (str): 정렬된 세그먼트를 저장할 JSON 파일 경로
        alpha (float): 평균 점수에 대한 가중치 (0~1 사이)
        std_weight (float): 표준 편차에 대한 패널티 가중치
        fps (float): 비디오의 초당 (대표)프레임 수
    """

    # 세그먼트 리스트 로드 및 시간(초)을 프레임 번호(start_frame, end_frame)로 변환
    scene_segments = load_scene_segments(scene_json, fps, thr=0.5)

    # 세그먼트 별 점수 계산 및 저장
    segment_scores = save_segment_frame_scores_json(frame_scores, scene_segments, output_json, fps)
    
    # combined score 기준으로 정렬 및 저장
    save_sorted_segments_with_combined_score_json(segment_scores, alpha, std_weight, output_sorted_combined_json)
 