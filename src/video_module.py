# video_module.py
import json
from moviepy.editor import VideoFileClip, concatenate_videoclips

def create_highlight_video(sorted_segments_json, video_path, output_video, top_ratio=0.2):
    """
    상위 점수 기준 세그먼트를 이어붙여 하이라이트 영상 생성

    Args:
        sorted_segments_json (str): 정렬된 세그먼트 JSON 경로 (e.g., max, avg, combined 기준 정렬)
        video_path (str): 원본 영상 경로
        output_video (str): 출력할 하이라이트 영상 경로
        top_ratio (float): 상위 선택 비율 (기본값: 0.2, 즉 상위 20%)
    """
    # JSON 로드
    with open(sorted_segments_json, 'r') as f:
        data = json.load(f)
        segments = data.get("segments", [])
    
    if not segments:
        print("⚠️ JSON 파일에 세그먼트 정보가 없습니다.")
        return

    # 상위 n% 세그먼트 선택
    num_segments = len(segments)
    top_count = max(1, int(num_segments * top_ratio))
    top_segments = segments[:top_count]
    print(f"📊 전체 세그먼트 수: {num_segments}, 상위 {int(top_ratio*100)}% 선택: {top_count}")

    # 원본 순서 유지 (segment_id 기준 정렬)
    sorted_top_segments = sorted(top_segments, key=lambda x: x["segment_id"])
    
    # 비디오 로드 및 클립 추출
    video = VideoFileClip(video_path)
    clips = []
    for seg in sorted_top_segments:
        start = seg["start_time"]
        end = min(seg["end_time"], video.duration)
        print(f"▶️ 세그먼트 ID {seg['segment_id']}: {start:.2f}초 ~ {end:.2f}초 추출")
        clips.append(video.subclip(start, end))

    if not clips:
        print("⚠️ 추출된 클립이 없습니다.")
        return

    # 이어붙이기 + 저장
    final_clip = concatenate_videoclips(clips)
    final_clip.write_videofile(output_video, codec="libx264", audio_codec="aac")
    final_clip.close()
    video.close()
    print(f"✅ 하이라이트 영상 저장 완료: {output_video}")

    # ✅ original_duration 포함된 JSON 저장
    segments_with_duration = {
        "original_duration": round(video.duration, 2),
        "segments": sorted_top_segments
    }
    output_json_path = output_video.replace(".mp4", ".json")  # 예: highlight_xxx.json
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(segments_with_duration, f, ensure_ascii=False, indent=2)
    print(f"📝 하이라이트 세그먼트 JSON 저장: {output_json_path}")

    return sorted_top_segments
