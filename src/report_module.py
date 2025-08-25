import json
import os

def generate_summary_report(
    output_dir: str,
    base_name: str,
    scene_json_path: str,
    refined_json_path: str,
    importance_weight: float
) -> None:
    """
    파이프라인 실행 결과를 바탕으로 요약 리포트를 생성하고 저장

    Args:
        output_dir (str): 출력을 저장할 디렉토리
        base_name (str): 파일의 기본 이름
        scene_json_path (str): 전체 장면 정보 JSON 파일 경로
        refined_json_path (str): 선택된 세그먼트 JSON 파일 경로
        importance_weight (float): 파이프라인에서 사용된 중요도 가중치
    """
    print("\n요약 리포트 정보 계산 중...", flush=True)

    try:
        with open(scene_json_path, encoding="utf-8") as f:
            all_scenes_data = json.load(f)
        total_scene_count = len(all_scenes_data)
        full_duration = max(seg.get("end_time", 0) for seg in all_scenes_data) if all_scenes_data else 0
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"경고: 전체 장면 정보({scene_json_path}) 로드 실패: {e}")
        total_scene_count, full_duration = 0, 0

    try:
        with open(refined_json_path, encoding="utf-8") as f:
            selected_segments_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"경고: 선택된 세그먼트 정보({refined_json_path}) 로드 실패: {e}")
        selected_segments_data = []

    summary_duration = sum(seg.get("end_time", 0) - seg.get("start_time", 0) for seg in selected_segments_data)
    selected_segment_count = len(selected_segments_data) 
    compression_ratio = round((1 - summary_duration / full_duration) * 100, 1) if full_duration > 0 else 0

    report = {
        "full_duration": round(full_duration, 2),
        "summary_duration": round(summary_duration, 2),
        "compression_ratio": compression_ratio,
        "selected_segment_count": selected_segment_count, 
        "total_scene_count": total_scene_count,
        "importance_weight_used_by_pipeline": importance_weight
    }

    report_path = os.path.join(output_dir, f"{base_name}_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"요약 리포트 저장 완료: {report_path}")
    print(f"  - 전체 영상 길이: {report['full_duration']:.2f}초")
    print(f"  - 요약 영상 길이: {report['summary_duration']:.2f}초")
    print(f"  - 압축률: {report['compression_ratio']}%")
    print(f"  - 전체 탐지 장면 수: {report['total_scene_count']}")
    print(f"  - 추출된 핵심 장면 수: {report['selected_segment_count']}")