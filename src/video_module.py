import os
import sys
import json
from moviepy.editor import VideoFileClip, concatenate_videoclips

def create_highlight_video(selected_segments, video_path, output_video):
    """
    선택된 세그먼트를 기반으로 요약 영상 생성

    Args:
        selected_segments (list): 선택된 세그먼트 목록 (예: 냅색 알고리즘 결과)
        video_path (str): 원본 영상 경로
        output_video (str): 출력할 요약 영상 경로
    """
    if not selected_segments:
        print("⚠️ 선택된 세그먼트가 없습니다.")
        return []

    # 원본 순서대로 정렬
    sorted_segments = sorted(selected_segments, key=lambda x: x["start_time"])

    # 비디오 로드 및 클립 추출
    video = VideoFileClip(video_path)
    clips = []
    for seg in sorted_segments:
        start = seg["start_time"]
        end = min(seg["end_time"], video.duration)
        clips.append(video.subclip(start, end))

    if not clips:
        print("⚠️ 추출된 클립이 없습니다.")
        return []

    # 클립 이어붙이기 + 저장
    final_clip = concatenate_videoclips(clips)
    final_clip.write_videofile(output_video, codec="libx264", audio_codec="aac", verbose=False, logger=None)
    final_clip.close()
    video.close()
    print(f"✅ 요약 영상 저장 완료: {output_video}")

    # 하이라이트 세그먼트 정보 저장
    segments_with_duration = {
        "original_duration": round(video.duration, 2),
        "segments": sorted_segments
    }
    output_json_path = output_video.replace(".mp4", ".json")  # 예: highlight_xxx.json
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(segments_with_duration, f, ensure_ascii=False, indent=2)
    print(f"📝 하이라이트 세그먼트 JSON 저장: {output_json_path}")

    return sorted_segments

def update_highlight_from_json(video_path, json_path):
    """
    편집된 JSON 파일을 기반으로 요약 영상 업데이트
    
    Args:
        video_path (str): 원본 영상 경로
        json_path (str): 편집된 세그먼트 정보가 담긴 JSON 파일 경로
    """
    try:
        # JSON 파일 로드
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        segments = data.get('segments', [])
        
        if not segments:
            print("⚠️ JSON 파일에 세그먼트 정보가 없습니다.")
            return False
            
        # JSON 파일명에서 출력 파일명 추출
        base_name = json_path.replace('.json', '')
        if not base_name.endswith('.mp4'):
            base_name += '.mp4'
            
        # 요약 영상 생성
        create_highlight_video(segments, video_path, base_name)
        return True
    except Exception as e:
        print(f"❌ 요약 업데이트 중 오류 발생: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("사용법: python video_module.py [원본_영상_경로] [세그먼트_JSON_경로]")
        sys.exit(1)
        
    video_path = sys.argv[1]
    json_path = sys.argv[2]
    
    # 파일 존재 여부 확인
    if not os.path.exists(video_path):
        print(f"❌ 원본 영상 파일이 존재하지 않습니다: {video_path}")
        sys.exit(1)
        
    if not os.path.exists(json_path):
        print(f"❌ JSON 파일이 존재하지 않습니다: {json_path}")
        sys.exit(1)
    
    # 요약 업데이트
    success = update_highlight_from_json(video_path, json_path)
    if success:
        print("✅ 요약 영상 업데이트 완료")
        sys.exit(0)
    else:
        print("❌ 요약 영상 업데이트 실패")
        sys.exit(1)