# video_module.py
import json
from moviepy.editor import VideoFileClip, concatenate_videoclips

def create_highlight_video(selected_segments, video_path, output_video):
    """
    선택된 세그먼트를 기반으로 하이라이트 영상 생성

    Args:
        selected_segments (list): 선택된 세그먼트 목록 (예: 냅색 알고리즘 결과)
        video_path (str): 원본 영상 경로
        output_video (str): 출력할 하이라이트 영상 경로
    """
    if not selected_segments:
        print("⚠️ 선택된 세그먼트가 없습니다.")
        return []

    # 원본 순서대로 정렬
    sorted_segments = sorted(selected_segments, key=lambda x: x["segment_id"])

    # 비디오 로드 및 클립 추출
    video = VideoFileClip(video_path)
    clips = []
    for seg in sorted_segments:
        start = seg["start_time"]
        end = min(seg["end_time"], video.duration)
        print(f"▶️ 세그먼트 ID {seg['segment_id']}: {start:.2f}초 ~ {end:.2f}초 추출")
        clips.append(video.subclip(start, end))

    if not clips:
        print("⚠️ 추출된 클립이 없습니다.")
        return []

    # 클립 이어붙이기 + 저장
    final_clip = concatenate_videoclips(clips)
    final_clip.write_videofile(output_video, codec="libx264", audio_codec="aac")
    final_clip.close()
    video.close()
    print(f"✅ 하이라이트 영상 저장 완료: {output_video}")

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