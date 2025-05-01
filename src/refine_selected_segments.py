import json

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def find_covering_whisper(seg, whisper_segments):
    return [w for w in whisper_segments
            if not (w['end'] <= seg['start_time'] or w['start'] >= seg['end_time'])]

def refine_boundaries(seg, whisper_segments, smart_margin=0.35, threshold=0.3):
    relevant = find_covering_whisper(seg, whisper_segments)
    if not relevant:
        return seg  # Whisper 문장 없으면 그대로 반환

    new_start = min(w['start'] for w in relevant)
    new_end = max(w['end'] for w in relevant)

    new_end += smart_margin
    new_start += 0.2

    return {
        "segment_id": seg["segment_id"],
        "start_time": round(max(0.0, new_start), 2),
        "end_time": round(new_end, 2)
    }

def refine_selected_segments(selected_json, whisper_json, output_json):
    selected_segments = load_json(selected_json)["segments"]
    whisper_segments = load_json(whisper_json)

    print(f"📌 선택된 세그먼트 개수: {len(selected_segments)}")

    total_before = 0.0
    total_after_raw = 0.0

    refined_segments = []
    print("\n🔍 세그먼트별 보정 전후 비교:")
    for seg in selected_segments:
        before_duration = seg["end_time"] - seg["start_time"]
        refined = refine_boundaries(seg, whisper_segments)
        after_duration = refined["end_time"] - refined["start_time"]

        total_before += before_duration
        total_after_raw += after_duration

        print(f"🟡 seg_id={seg['segment_id']:>3} | "
              f"{seg['start_time']:.2f}~{seg['end_time']:.2f} ({before_duration:.2f}s) → "
              f"{refined['start_time']:.2f}~{refined['end_time']:.2f} ({after_duration:.2f}s)")

        refined_segments.append(refined)

    # ✅ 정렬 + 중복 제거
    refined_segments = sorted(refined_segments, key=lambda x: x["start_time"])
    for i in range(len(refined_segments) - 1):
        if refined_segments[i]["end_time"] > refined_segments[i + 1]["start_time"]:
            refined_segments[i]["end_time"] = round(refined_segments[i + 1]["start_time"] - 0.01, 2)

    # ✅ 중복 제거 후 총 길이 재계산
    total_after_final = sum(seg["end_time"] - seg["start_time"] for seg in refined_segments)

    print("\n⏱️ 총 길이 변화 요약:")
    print(f" - 보정 전:            {round(total_before, 2)} sec")
    print(f" - 보정 후: {round(total_after_final, 2)} sec")
    print(f" - 실제 증가량:       {round(total_after_final - total_before, 2)} sec\n")

    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump({"segments": refined_segments}, f, indent=2, ensure_ascii=False)

    print(f"✅ Whisper 자막 기준 경계 보정 완료 → 저장: {output_json}")
