import json

def load_json(path):
    """JSON 파일 로드."""
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def find_covering_whisper(seg, whisper_segments, threshold=0.3):
    """세그먼트와 겹치는 Whisper 문장 중 overlap >= threshold인 것만 반환."""
    relevant = []
    for w in whisper_segments:
        overlap = min(w['end'], seg['end_time']) - max(w['start'], seg['start_time'])
        if overlap > 0 and overlap >= threshold:
            relevant.append(w)
    return relevant


def refine_boundaries(seg, whisper_segments, margin_before=0.2, margin_after=0.35):
    """Whisper 문장을 기준으로 세그먼트 경계를 보정."""
    relevant = find_covering_whisper(seg, whisper_segments)
    if not relevant:
        return seg

    new_start = min(w['start'] for w in relevant) - margin_before
    new_end = max(w['end'] for w in relevant) + margin_after

    return {
        **seg,
        "start_time": round(max(0.0, new_start), 2),
        "end_time": round(new_end, 2)
    }


def refine_selected_segments(selected_json, whisper_json, output_json):
    """
    selected_json: run_pgl_module에서 출력한 segments 리스트 파일 (list of dict)
    whisper_json: whisper_process가 생성한 Whisper 문장 구간 리스트 파일 (list of dict)
    output_json: 보정된 세그먼트를 리스트 형태로 저장할 파일 경로
    """
    selected_segments = load_json(selected_json)
    whisper_segments = load_json(whisper_json)

    print(f"📌 선택된 세그먼트 개수: {len(selected_segments)}")

    refined = []
    print("\n🔍 세그먼트별 보정 전후 비교:")
    total_before = total_after_raw = 0.0
    for seg in selected_segments:
        before_dur = seg["end_time"] - seg["start_time"]
        new_seg = refine_boundaries(seg, whisper_segments)
        after_dur = new_seg["end_time"] - new_seg["start_time"]
        total_before += before_dur
        total_after_raw += after_dur
        print(f"🟡 seg_id={seg['segment_id']:>3} | "
              f"{seg['start_time']:.2f}~{seg['end_time']:.2f} ({before_dur:.2f}s) → "
              f"{new_seg['start_time']:.2f}~{new_seg['end_time']:.2f} ({after_dur:.2f}s)")
        refined.append(new_seg)

    # 정렬 및 overlap 제거
    refined = sorted(refined, key=lambda x: x["start_time"])
    for i in range(len(refined) - 1):
        if refined[i]["end_time"] > refined[i+1]["start_time"]:
            refined[i]["end_time"] = round(refined[i+1]["start_time"] - 0.01, 2)

    total_after_final = sum(s["end_time"] - s["start_time"] for s in refined)
    print("\n⏱️ 총 길이 변화 요약:")
    print(f" - 보정 전: {round(total_before, 2)} sec")
    print(f" - 보정 후: {round(total_after_final, 2)} sec")
    print(f" - 실제 증가량: {round(total_after_final - total_before, 2)} sec\n")

    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(refined, f, indent=2, ensure_ascii=False)

    print(f"✅ Whisper 자막 기준 경계 보정 완료 → 저장: {output_json}")
