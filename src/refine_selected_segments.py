import json

def load_json(path):
    """JSON 파일 로드."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def refine_selected_segments(selected_json, whisper_json, output_json):
    """
    ▶ Whisper 기반 후처리 없이
       1) 선택 세그먼트 불러오기
       2) start_time 기준으로 정렬
       3) 그대로 저장 (segments 키 없이 리스트 형태로)
    """
    selected_segments = load_json(selected_json)

    print(f"📌 선택된 세그먼트 개수: {len(selected_segments)}")

    sorted_segments = sorted(
        selected_segments, key=lambda s: s["start_time"]
    )

    total_duration = sum(
        seg["end_time"] - seg["start_time"] for seg in sorted_segments
    )
    print(f"⏱️ 총 길이(정렬 후): {round(total_duration, 2)} sec\n")

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(sorted_segments, f, indent=2, ensure_ascii=False) 

    print(f"✅ 세그먼트 정렬 완료 → 저장: {output_json}")
