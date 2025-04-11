
def resolve_overlap(segments, margin=0.01):
    """
    오디오 후처리로 인해 발생한 세그먼트 간 겹침을 조정
    겹치면 이전 세그먼트의 end_time을 자름

    Args:
        segments (list): 조정된 세그먼트 리스트
        margin (float): 최소 여유 시간 (초)
    """
    segments = sorted(segments, key=lambda x: x["start_time"])
    for i in range(len(segments) - 1):
        if segments[i]["end_time"] > segments[i + 1]["start_time"]:
            segments[i]["end_time"] = max(0.0, round(segments[i + 1]["start_time"] - margin, 2))
    return segments
