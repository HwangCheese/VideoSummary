import os
import json
import cv2
import numpy as np
from transnetv2 import TransNetV2

# 비디오 파일에서 FPS(초당 프레임 수)를 자동으로 계산
def get_video_fps(video_path):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"비디오를 열 수 없습니다: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    if fps <= 0:
        raise ValueError("FPS를 읽을 수 없습니다.")
    return fps

# TransNetV2를 이용한 장면 전환 감지
def detect_scenes_transnetv2(video_path, threshold=0.5):
    model = TransNetV2()
    video_frames, single_frame_predictions, _ = model.predict_video(video_path)
    scene_changes = np.where(single_frame_predictions > threshold)[0]
    print(f"{len(scene_changes)}개의 장면 전환점 검출 완료")
    return scene_changes.tolist(), video_frames.shape[0]

# 장면 구간 JSON으로 저장
def save_segments_to_json(scene_changes, output_json, total_frames, fps):
    """
    Args:
        video_path (str): 분석할 비디오 파일 경로
        output_json (str): 장면(segment) 정보를 저장할 JSON 파일 경로
        fps (float): 비디오의 실제 초당 프레임 수.
                     detect_scenes_transnetv2에서 반환된 frame index를 
                     초 단위 시간으로 변환할 때 사용
    """
    segment_data = []
    scene_changes = [0] + scene_changes + [total_frames - 1]
    for idx in range(len(scene_changes)-1):
        start_frame = scene_changes[idx]
        end_frame = scene_changes[idx+1]
        segment_data.append({
            "segment_id": idx,
            "start_time": round(start_frame / fps, 2),
            "end_time": round(end_frame / fps, 2)
        })

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(segment_data, f, ensure_ascii=False, indent=4)
    print("장면 구간 JSON 저장 완료")

def run_scene_detect_pipeline(video_path, output_json):    
    os.makedirs(os.path.dirname(output_json), exist_ok=True)

    # FPS 자동 계산
    fps = get_video_fps(video_path)
    print(f"자동 계산된 FPS: {fps:.2f}")

    # 장면 전환 감지
    scene_changes, total_frames = detect_scenes_transnetv2(video_path)

    # JSON 저장
    save_segments_to_json(scene_changes, output_json, total_frames, fps)