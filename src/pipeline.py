# pipeline.py
import sys
import os
import glob
import re
import argparse
from moviepy.editor import VideoFileClip, concatenate_videoclips
from extract_features_module import extract_features_chunk
from pgl_module import run_pgl_chunk  # 또는 run_sl_chunk 등으로 교체 가능

# pipeline.py가 있는 폴더 경로를 sys.path에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 🎬 영상 청크 분할
def split_video(video_path, chunk_duration=300, output_dir="."):
    video = VideoFileClip(video_path)
    duration = video.duration
    chunk_paths = []
    for start in range(0, int(duration), chunk_duration):
        end = min(start + chunk_duration, duration)
        chunk_path = os.path.join(output_dir, f"chunk_{start}_{end}.mp4")
        video.subclip(start, end).write_videofile(chunk_path, codec="libx264")
        chunk_paths.append(chunk_path)
    return chunk_paths

# 🔢 청크 폴더 정렬
def extract_chunk_start(folder_name):
    match = re.search(r"chunk_(\d+)_", folder_name)
    return int(match.group(1)) if match else 0

# 🎞️ 하이라이트 클립 수집
def collect_highlight_clips(base_folder="."):
    highlight_paths = []
    chunk_folders = glob.glob(os.path.join(base_folder, "chunk_*_highlights"))
    chunk_folders = sorted(chunk_folders, key=extract_chunk_start)

    for chunk_folder in chunk_folders:
        clips = sorted(glob.glob(os.path.join(chunk_folder, "highlight_*.mp4")))
        highlight_paths.extend(clips)

    return highlight_paths

# 🎥 하이라이트 병합
def concatenate_highlight_clips(highlight_paths, output_path="final_highlight.mp4"):
    if not highlight_paths:
        print("❌ 병합할 하이라이트 클립이 없습니다.")
        return
    print(f"🎬 총 {len(highlight_paths)}개의 하이라이트 클립을 병합 중...")
    clips = [VideoFileClip(path) for path in highlight_paths]
    final_clip = concatenate_videoclips(clips)
    final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac", fps=30)
    print(f"✅ 최종 요약 영상 저장 완료: {output_path}")

# 🚀 메인 실행
def main(args):
    os.makedirs(args.output_dir, exist_ok=True)
    chunks = split_video(args.video_path, output_dir=args.output_dir)

    for chunk_path in chunks:
        base_name = os.path.splitext(os.path.basename(chunk_path))[0]
        chunk_dir = os.path.dirname(chunk_path)
        output_h5 = os.path.join(chunk_dir, f"{base_name}.h5")
        output_json_scene = os.path.join(chunk_dir, f"{base_name}_scenes.json")
        output_json_highlight = os.path.join(chunk_dir, f"{base_name}_highlight.json")
        output_dir_highlights = os.path.join(chunk_dir, f"{base_name}_highlights")

        print(f"\n📌 처리중인 청크: {chunk_path}")
        extract_features_chunk(chunk_path, output_h5, output_json_scene, device=args.device)
        run_pgl_chunk(
            video_path=chunk_path,
            feature_h5=output_h5,
            output_json=output_json_highlight,
            output_dir=output_dir_highlights,
            ckpt_path=args.fine_ckpt,
            device=args.device,
            fps=args.fps,
            top_k=args.clip_top_k
        )

    print("\n✅ 모든 청크 처리 완료")
    highlight_paths = collect_highlight_clips(base_folder=args.output_dir)
    final_output = os.path.join(args.output_dir, "final_highlight.mp4")
    concatenate_highlight_clips(highlight_paths, output_path=final_output)

# 🧩 CLI 인자 처리
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video_path", required=True, help="입력 영상(mp4)")
    parser.add_argument("--fine_ckpt", required=True, help="모델 체크포인트 경로 (.pkl)")
    parser.add_argument("--output_dir", required=True, help="출력 디렉토리")
    parser.add_argument("--clip_top_k", type=int, default=3, help="top-k 하이라이트 추출")
    parser.add_argument("--fps", type=float, default=1.0, help="초당 프레임 수 (기본 1.0)")
    parser.add_argument("--device", default="cpu", help="cpu 또는 cuda")
    args = parser.parse_args()

    main(args)