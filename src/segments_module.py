# segments_module.py
import math
import json

def save_top_ratio_segments(input_json, output_json, top_ratio=0.2):
    """
    sample_sorted_combined.json에서 상위 top_ratio %의 세그먼트만 추출해 output_json으로 저장.
    - input_json : 기존 combined_score로 정렬된 세그먼트 JSON
    - output_json : 상위 top_ratio% 세그먼트만 담을 JSON
    - top_ratio : 0.2라면 (20%)만 추출
    """
    with open(input_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    segments = data.get("segments", [])
    if not segments:
        print("⚠️ No segments found in", input_json)
        return

    # (선택) 원본 길이 추정: 가장 큰 end_time
    max_end = max(seg.get("end_time", 0) for seg in segments)

    # 상위 top_ratio%만 추출 (내림차순 정렬 가정)
    topN = math.ceil(len(segments) * top_ratio)
    top_segments = segments[:topN]

    # 새로 저장할 내용 구성
    new_data = {
        # 혹은 data의 다른 필드 복사할 수도 있음
        "original_duration": max_end,  # ✔ 여기서 original_duration 추가
        "segments": top_segments
    }

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)

    print(f"✅ Saved top {top_ratio*100}% segments -> {output_json}")
    print(f"   original_duration = {max_end}")
