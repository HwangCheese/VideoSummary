import os
import json
import subprocess

def generate_thumbnails(video_path: str, refined_segments_path: str, output_dir: str, base_name: str) -> None:
    """
    보정된 세그먼트의 시작 시간을 기준으로 썸네일을 생성

    Args:
        video_path (str): 원본 비디오 파일 경로
        refined_segments_path (str): 보정된 세그먼트 JSON 파일 경로
        output_dir (str): 썸네일을 저장할 디렉토리
        base_name (str): 썸네일 파일의 기본 이름
    """
    print("\n썸네일 생성 중...", flush=True)
    try:
        with open(refined_segments_path, 'r', encoding='utf-8') as f:
            refined_segments = json.load(f)
    except FileNotFoundError:
        print(f"썸네일 생성을 위한 세그먼트 파일({refined_segments_path})을 찾을 수 없습니다.")
        return
        
    # ffmpeg으로 각 세그먼트의 시작 프레임 저장
    thumb_meta = []
    for seg in refined_segments:
        start_sec = int(seg.get("start_time", 0))
        thumb_path = os.path.join(output_dir, f"{base_name}_thumb_{start_sec}.jpg")
        
        cmd = ["ffmpeg", "-ss", str(start_sec), "-i", video_path, "-vframes", "1", "-q:v", "2", "-y", thumb_path]

        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # print(f"  - 썸네일 생성 완료: {thumb_path}")
            thumb_meta.append({
                "start_time": start_sec,
                "score": seg.get("combined_score", 0),
                "segment_id": seg.get("segment_id", None)
            })
        except subprocess.CalledProcessError:
            print(f"썸네일 생성 실패: {thumb_path}")

    meta_path = os.path.join(output_dir, f"{base_name}_thumbs.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(thumb_meta, f, indent=2, ensure_ascii=False)
    print(f"썸네일 메타 정보 저장 완료: {meta_path}")