import json
import os

def reconstruct_highlight_transcripts(
    refined_json_path: str, 
    whisper_json_path: str, 
    output_json_path: str
) -> None:
    """
    요약 영상에 맞게 원본 자막을 재구성하여 저장

    Args:
        refined_json_path (str): 경계가 보정된 선택 세그먼트 JSON 파일 경로
        whisper_json_path (str): 원본 Whisper 자막 JSON 파일 경로
        output_json_path (str): 재구성된 자막을 저장할 JSON 파일 경로
    """

    print("\n요약 영상 자막 재구성 중...", flush=True)
    try:
        with open(refined_json_path, "r", encoding="utf-8") as f:
            selected_video_segments = json.load(f) 
        with open(whisper_json_path, "r", encoding="utf-8") as f:
            original_transcripts = json.load(f) 

        highlight_transcripts = []
        current_highlight_time = 0.0  

        for video_segment in selected_video_segments:
            segment_original_start = video_segment["start_time"]
            segment_original_end = video_segment["end_time"]
            segment_duration_in_highlight = segment_original_end - segment_original_start 

            for transcript_segment in original_transcripts:
                original_transcript_start = transcript_segment["start"]
                original_transcript_end = transcript_segment["end"]
                text = transcript_segment["text"]
                
                # 원본 자막이 선택된 영상 세그먼트 시간 내에 있는지 확인
                if segment_original_start <= original_transcript_start < segment_original_end:
                    relative_start = original_transcript_start - segment_original_start
                    new_start_time = current_highlight_time + relative_start

                    relative_end = min(original_transcript_end, segment_original_end) - segment_original_start
                    new_end_time = current_highlight_time + relative_end
                
                    if new_end_time > new_start_time and text.strip():
                        highlight_transcripts.append({
                            "start": round(new_start_time, 2),
                            "end": round(new_end_time, 2),
                            "text": text
                        })

            current_highlight_time += segment_duration_in_highlight 

        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(highlight_transcripts, f, indent=2, ensure_ascii=False)
        print(f"  - 요약 영상 자막 재구성 완료: {output_json_path}", flush=True)

    except FileNotFoundError as e:
        print(f"  - 오류: 자막 재구성에 필요한 파일({e.filename})을 찾을 수 없습니다.", flush=True)
    except Exception as e:
        print(f"  - 오류: 요약 영상 자막 재구성 중 예외 발생 - {e}", flush=True)