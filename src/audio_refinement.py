
from pydub import AudioSegment

def get_db_levels(audio_path, frame_ms=100):
    sound = AudioSegment.from_file(audio_path)
    db_levels = [sound[i:i+frame_ms].dBFS for i in range(0, len(sound), frame_ms)]
    return db_levels

def refine_boundaries(db_levels, index, direction="start", search_range=20, threshold=-35):
    if direction == "start":
        for i in range(index, max(0, index - search_range), -1):
            if db_levels[i] < threshold:
                return i
        return index
    elif direction == "end":
        for i in range(index, min(len(db_levels), index + search_range)):
            if db_levels[i] < threshold:
                return i
        return index

def adjust_segments_with_audio(segments, db_levels, fps=1.0, frame_ms=100, threshold=-50):
    ms_per_frame = 1000 / fps
    db_frame_ratio = frame_ms / ms_per_frame
    adjusted = []

    for seg in segments:
        start_idx = int(seg["start_time"] * fps / db_frame_ratio)
        end_idx = int(seg["end_time"] * fps / db_frame_ratio)

        new_start_idx = refine_boundaries(db_levels, start_idx, direction="start", threshold=threshold)
        new_end_idx = refine_boundaries(db_levels, end_idx, direction="end", threshold=threshold)

        new_start_time = round(new_start_idx * frame_ms / 1000, 2)
        new_end_time = round(new_end_idx * frame_ms / 1000, 2)

        # 최소 길이 보장 (0.5초 이상)
        if new_end_time - new_start_time < 0.5:
            new_end_time = new_start_time + 0.5

        seg["start_time"] = max(0.0, new_start_time)
        seg["end_time"] = new_end_time
        adjusted.append(seg)

    return adjusted
