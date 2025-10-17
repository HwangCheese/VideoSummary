import os
import json
import time
from transnetv2_pytorch import TransNetV2

def detect_scenes_transnetv2_pytorch(video_path, device, threshold=0.5):
    """
    TransNetV2 PyTorch 구현체를 사용하여 장면 전환을 감지.
    
   Args:
        video_path (str): 분석할 비디오 파일 경로
        device (str): 사용할 디바이스 ('cuda' 또는 'cpu')
        threshold (float): 장면 전환 임계값(모델의 defalut 임계값 : 0.5)

    Returns:
        list: 장면 구간 딕셔너리 리스트
    """

    # ------------------ 타이머 시작 ------------------
    start_time = time.time()
    # ------------------------------------------------

    # TransNetV2 모델 초기화
    model = TransNetV2(device=device)
    
    # GPU 사용 확인
    if next(model.parameters()).is_cuda:
        print("모델이 CUDA (GPU)에 로드되었습니다.")
    else:
        print("모델이 CPU에 로드되었습니다.")
    
    # 비디오 분석 및 장면 감지
    results = model.analyze_video(video_path, threshold=threshold)
    scenes = results['scenes']
 
    # ------------------ 타이머 종료 ------------------
    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"{len(scenes)}개의 장면 전환점 검출 완료")
    print(f"장면 전환 감지 소요 시간: {elapsed_time:.2f} 초")
    # ------------------------------------------------
    
    return scenes


def save_segments_to_json(scenes, output_json):
    """
    장면 구간을 JSON 파일로 저장합니다.
    
    Args:
        scenes (list): TransNetV2에서 반환된 장면 딕셔너리 리스트
        output_json (str): 출력 JSON 파일 경로
    """
    segment_data = []
    
    for idx, scene in enumerate(scenes):
        start_frame = int(scene.get('start_frame'))
        end_frame = int(scene.get('end_frame'))
        start_time = float(scene.get('start_time'))
        end_time = float(scene.get('end_time'))

        segment_data.append({
            "segment_id": idx,
            "start_frame": start_frame,
            "end_frame": end_frame,
            "start_time": round(start_time, 2),
            "end_time": round(end_time, 2),
            "duration": round(end_time - start_time, 2)
        })
    
    # JSON 저장
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(segment_data, f, ensure_ascii=False, indent=4)
    
    print(f"장면 구간 JSON 저장 완료: {output_json}")


def run_scene_detect_pipeline(video_path, device, output_json):
    """
    장면 감지 파이프라인 실행
    
    Args:
        video_path (str): 비디오 파일 경로
        device (str): 사용할 디바이스 ('cuda' 또는 'cpu')
        output_json (str): 출력 JSON 파일 경로
    """
    # 출력 디렉토리 생성
    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    
    # 장면 감지 실행
    scenes = detect_scenes_transnetv2_pytorch(video_path, device)
    
    # JSON 저장
    save_segments_to_json(scenes, output_json)