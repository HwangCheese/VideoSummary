
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

    # 조건부 smart-padding: 자막 end와 segment end가 거의 일치하면 자막 기준 확장
    # if abs(seg['end_time'] - new_end) < threshold:
    #     print(f"[DEBUG] 확장됨: seg_id={seg['segment_id']} → end: {seg['end_time']} → {new_end + smart_margin}")
    new_end += smart_margin # 시간 여유를 주어 Whisper의 end_time 조정정
    new_start += 0.2 #시작 시간을 뒤로 밀어 앞의 문장 끝 일부가 섞이는 것을 방지


    return {
        "segment_id": seg["segment_id"],
        "start_time": round(max(0.0, new_start), 2),
        "end_time": round(new_end, 2)
    }

def refine_selected_segments(selected_json, whisper_json, output_json):
    selected_segments = load_json(selected_json)["segments"]
    whisper_segments = load_json(whisper_json)

    refined_segments = []
    for seg in selected_segments:
        refined = refine_boundaries(seg, whisper_segments)
        refined_segments.append(refined)

    # 정렬 + 중복 제거
    refined_segments = sorted(refined_segments, key=lambda x: x["start_time"])
    for i in range(len(refined_segments) - 1):
        if refined_segments[i]["end_time"] > refined_segments[i + 1]["start_time"]:
            refined_segments[i]["end_time"] = round(refined_segments[i + 1]["start_time"] - 0.01, 2)

    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump({"segments": refined_segments}, f, indent=2, ensure_ascii=False)

    print(f"✅ Whisper 자막 end 기준으로 경계 보정 완료: {output_json}")
