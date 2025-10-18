import json

def load_json(path):
    """JSON 파일 로드."""
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def find_covering_whisper(seg, whisper_segments, threshold=0.3):
    """세그먼트와 겹치는 Whisper 문장 중 overlap >= threshold인 것만 반환."""
    relevant = []
    for w in whisper_segments:
        overlap = min(w.get('end', 0), seg.get('end_time', 0)) - \
                  max(w.get('start', 0), seg.get('start_time', 0))
        if overlap >= threshold:
            relevant.append(w)
    return relevant


def refine_boundaries(seg, whisper_segments, margin_before=0.2, margin_after=0.35):
    """Whisper 문장을 기준으로 세그먼트 경계를 보정."""
    relevant = find_covering_whisper(seg, whisper_segments)
    if not relevant:
        return seg

    new_start = min(w.get('start', float('inf')) for w in relevant) - margin_before
    new_end = max(w.get('end', float('-inf')) for w in relevant) + margin_after

    if new_end < new_start:
        new_end = new_start

    refined_start_time = round(max(0.0, new_start), 2)
    refined_end_time = round(new_end, 2)

    if refined_end_time < refined_start_time:
        refined_end_time = refined_start_time
    
    return {
        **seg,
        "start_time": refined_start_time,
        "end_time": refined_end_time
    }


def refine_selected_segments(selected_json, whisper_json, output_json, min_duration=0.01):
    """
    선택된 세그먼트의 경계를 Whisper 자막 기준으로 보정하고, 겹치는 구간을 정리합니다.

    VideoSummary의 장면 선택 모듈이 선택한 세그먼트의 문장이 중간에 잘리는 것을 방지하고, 최종 영상에 사용될
    자연스러운 세그먼트 리스트를 생성하는 후처리 과정입니다.

    Args:
        selected_json (str): 요약영상으로 선택한 세그먼트 리스트 .json 파일 경로
        whisper_json (str): Whisper가 생성한 자막 세그먼트 리스트 .json 파일 경로
        output_json (str): 최종 보정된 세그먼트 리스트를 저장할 .json 파일 경로
        min_duration (float, optional): 유효한 세그먼트로 간주할 최소 길이(초). 기본값: 0.01

    Returns:
        None: 이 함수는 값을 반환하는 대신 지정된 경로에 보정된 세그먼트 .json 파일을 생성한다.
    """

    selected_segments = load_json(selected_json)
    whisper_segments = load_json(whisper_json)

    print(f"선택된 세그먼트 개수 (원본): {len(selected_segments)}")

    segments_after_boundaries_refinement = []
    total_duration_original = 0.0
    total_duration_after_boundaries_refinement = 0.0

    for seg_data in selected_segments:
        original_start = seg_data.get('start_time', 0)
        original_end = seg_data.get('end_time', 0)
        
        if original_end < original_start:
            original_end = original_start 
        
        duration_original = original_end - original_start
        total_duration_original += duration_original

        refined_seg_after_boundaries = refine_boundaries(seg_data, whisper_segments)

        duration_after_boundaries = refined_seg_after_boundaries.get('end_time',0) - refined_seg_after_boundaries.get('start_time',0)
        total_duration_after_boundaries_refinement += duration_after_boundaries
        
        segments_after_boundaries_refinement.append(refined_seg_after_boundaries)

    sorted_segments_for_overlap_processing = sorted(
        segments_after_boundaries_refinement, 
        key=lambda x: (x.get("start_time", float('inf')), x.get("segment_id", float('inf')))
    )

    if not sorted_segments_for_overlap_processing:
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump([], f, indent=2, ensure_ascii=False)
        print("처리할 세그먼트가 없습니다.")
        return

    merged_and_non_overlapping_segments = []

    first_seg = sorted_segments_for_overlap_processing[0]
    if (first_seg.get("end_time", 0) - first_seg.get("start_time", 0)) >= min_duration:
        merged_and_non_overlapping_segments.append(first_seg)
    else:
        print(f"첫 세그먼트 ID {first_seg.get('segment_id','N/A')} 제거됨 (길이 미달: {first_seg.get('end_time', 0) - first_seg.get('start_time', 0):.2f}s)")


    for i in range(1, len(sorted_segments_for_overlap_processing)):
        if not merged_and_non_overlapping_segments:
            current_seg_initial = sorted_segments_for_overlap_processing[i]
            if (current_seg_initial.get("end_time", 0) - current_seg_initial.get("start_time", 0)) >= min_duration:
                merged_and_non_overlapping_segments.append(current_seg_initial)
            else:
                print(f"세그먼트 ID {current_seg_initial.get('segment_id','N/A')} 제거됨 (길이 미달: {current_seg_initial.get('end_time', 0) - current_seg_initial.get('start_time', 0):.2f}s)")
            continue


        last_added_segment = merged_and_non_overlapping_segments[-1]
        current_processing_segment = sorted_segments_for_overlap_processing[i]

        current_segment_duration = current_processing_segment.get("end_time", 0) - current_processing_segment.get("start_time", 0)
        if current_segment_duration < min_duration:
            print(f"세그먼트 ID {current_processing_segment.get('segment_id','N/A')} 제거됨 (길이 미달: {current_segment_duration:.2f}s)")
            continue

        if current_processing_segment.get("start_time", 0) >= last_added_segment.get("end_time", 0):
            merged_and_non_overlapping_segments.append(current_processing_segment)
        else:
            adjusted_end_time_for_last = round(current_processing_segment.get("start_time", 0) - 0.01, 2)
            
            if adjusted_end_time_for_last < last_added_segment.get("start_time", 0):
                last_added_segment["end_time"] = last_added_segment.get("start_time", 0)
            else:
                last_added_segment["end_time"] = adjusted_end_time_for_last
  
            merged_and_non_overlapping_segments.append(current_processing_segment)

    final_refined_segments = []
    if merged_and_non_overlapping_segments: 
        seg_to_check = merged_and_non_overlapping_segments[0]
        start_t = seg_to_check.get("start_time", 0)
        end_t = seg_to_check.get("end_time", 0)
        if end_t < start_t: end_t = start_t 
        if (end_t - start_t) >= min_duration:
            final_refined_segments.append({**seg_to_check, "start_time": start_t, "end_time": end_t}) 
        else:
            print(f"최종 필터: 세그먼트 ID {seg_to_check.get('segment_id','N/A')} 제거됨 (길이: {end_t - start_t:.2f}s)")

        for i in range(1, len(merged_and_non_overlapping_segments)):
            prev_final_seg = final_refined_segments[-1] if final_refined_segments else None
            current_seg_to_add = merged_and_non_overlapping_segments[i]
            
            cs_start = current_seg_to_add.get("start_time", 0)
            cs_end = current_seg_to_add.get("end_time", 0)

            if cs_end < cs_start: 
                cs_end = cs_start
                current_seg_to_add["end_time"] = cs_end 

            if (cs_end - cs_start) < min_duration:
                print(f"최종 필터: 세그먼트 ID {current_seg_to_add.get('segment_id','N/A')} 제거됨 (길이: {cs_end - cs_start:.2f}s)")
                continue 

            if prev_final_seg and cs_start < prev_final_seg.get("end_time", 0):
                adjusted_cs_start = round(prev_final_seg.get("end_time", 0) + 0.01, 2)
       
                if adjusted_cs_start >= cs_end:
                    print(f"최종 필터 (조정 후 무효): 세그먼트 ID {current_seg_to_add.get('segment_id','N/A')} 제거됨 (조정된 start {adjusted_cs_start:.2f} >= end {cs_end:.2f})")
                    continue
                
                current_seg_to_add["start_time"] = adjusted_cs_start

            final_refined_segments.append(current_seg_to_add)


    total_duration_final = sum(
        s.get("end_time",0) - s.get("start_time",0) for s in final_refined_segments
    )

    print("\n총 길이 변화 요약:")
    print(f" - 보정 전 (원본): {round(total_duration_original, 2)} sec")
    print(f" - 보정 후 (Overlap 조정 및 짧은 세그먼트 제거 완료): {round(total_duration_final, 2)} sec")
    print(f"최종 세그먼트 개수: {len(final_refined_segments)}")

    final_refined_segments.sort(key=lambda x: (x.get("start_time", float('inf')), x.get("segment_id", float('inf'))))

    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(final_refined_segments, f, indent=2, ensure_ascii=False)

    print(f"Whisper 자막 기준 경계 보정 완료 → 저장: {output_json}")