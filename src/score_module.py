import json
import os
from quality_score_calculator import run_evaluation

def manage_quality_score(
    score_path: str,
    importance_weight: float,
    feature_h5_path: str,
    sorted_json_path: str,
    selected_json_path: str
) -> float:
    """
    품질 점수 파일을 확인하고, 없으면 새로 계산하여 저장한 뒤 최종 점수를 반환

    Args:
        score_path (str): 점수 JSON 파일 경로
        importance_weight (float): 품질 점수 계산에 사용될 가중치
        feature_h5_path (str): 특징 h5 파일 경로
        sorted_json_path (str): 정렬된 세그먼트 JSON 파일 경로
        selected_json_path (str): 선택된 세그먼트 JSON 파일 경로

    Returns:
        float: 최종 품질 점수
    """
    final_quality_score = 0.0
    score_loaded = False

    # 품질 점수 파일 존재
    if os.path.exists(score_path):
        print(f"\n품질 점수 - 기존 점수 파일 확인 중...", flush=True)
        try:
            with open(score_path, "r", encoding="utf-8") as f:
                score_data = json.load(f)
            if "summary_score" in score_data and isinstance(score_data["summary_score"], (float, int)):
                final_quality_score = float(score_data["summary_score"])
                score_loaded = True
                print(f"기존 품질 점수 로드됨: {final_quality_score:.1f}/100", flush=True)
            else:
                print(f"경고: 기존 점수 파일에 유효한 'summary_score'가 없습니다. 새로 계산합니다.", flush=True)
        except (json.JSONDecodeError, TypeError) as e:
            print(f"경고: 기존 점수 파일 로드 실패 ({e}). 새로 계산합니다.", flush=True)

    # 저장된 품질 점수가 없을 경우
    if not score_loaded:
        print("품질 점수 계산 로직 실행 중...", flush=True)
        try:
            calculated_score = run_evaluation(
                weight=importance_weight,
                feature_h5_path=feature_h5_path,
                all_segments_json_path=sorted_json_path,
                selected_segments_info_path=selected_json_path,
            )
            final_quality_score = float(calculated_score) if isinstance(calculated_score, (float, int)) else 0.0
            
            with open(score_path, "w", encoding="utf-8") as f:
                json.dump({"summary_score": final_quality_score}, f, indent=2)
            print(f"  [SCORE PATH] 신규 점수 ({final_quality_score:.1f}/100) 저장 완료: {score_path}")

        except Exception as e:
            print(f"오류: 품질 점수 계산(run_evaluation) 중 예외 발생 - {e}")
            final_quality_score = 0.0
            with open(score_path, "w", encoding="utf-8") as f:
                json.dump({"summary_score": final_quality_score}, f, indent=2)
            print(f"  [SCORE PATH] 점수 (계산 실패로 {final_quality_score:.1f}/100) 저장 완료: {score_path}")

    print(f"최종 품질 점수: {final_quality_score:.1f}/100", flush=True)
    return final_quality_score