# pipeline.py
import argparse
import os
import json
from extract_features_module import extract_features_pipe
from pgl_module import run_pgl_module
from video_module import create_highlight_video

def run_pipeline(video_path, ckpt_path, output_dir, device="cpu", fps=1.0, alpha=0.7, std_weight=0.3, top_ratio=0.2):
    os.makedirs(output_dir, exist_ok=True)

    base_name = os.path.splitext(os.path.basename(video_path))[0]
    output_h5 = os.path.join(output_dir, f"{base_name}.h5")
    output_scene_json = os.path.join(output_dir, f"{base_name}_scenes.json")
    output_segment_json = os.path.join(output_dir, f"{base_name}_segment_scores.json")
    output_sorted_combined_json = os.path.join(output_dir, f"{base_name}_sorted_combined.json")
    output_highlight_video = os.path.join(output_dir, f"highlight_{base_name}.mp4")

    print("\n🎬 [1/3] 특징 추출 및 장면 분할")
    extract_features_pipe(video_path, output_h5, output_scene_json, device=device)

    print("\n🧠 [2/3] 하이라이트 점수 예측")
    selected_segments = run_pgl_module(
        ckpt_path=ckpt_path,
        feature_h5=output_h5,
        scene_json=output_scene_json,
        output_json=output_segment_json,
        output_sorted_combined_json=output_sorted_combined_json,
        fps=fps,
        device=device,
        alpha=alpha,
        std_weight=std_weight,
        top_ratio=top_ratio
    )

    print("\n🎞️ [3/3] 하이라이트 영상 생성")
    create_highlight_video(
        selected_segments=selected_segments,
        video_path=video_path,
        output_video=output_highlight_video
    )
    print(f"\n✅ 파이프라인 완료! 하이라이트 영상: {output_highlight_video}")

    # 📁 clips 디렉토리에 segments.json 저장 (프론트에서 사용)
    clips_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "clips"))
    os.makedirs(clips_dir, exist_ok=True)

    top_segments_json = os.path.join(clips_dir, "segments.json")
    with open(top_segments_json, "w", encoding="utf-8") as f:
        json.dump({"segments": selected_segments}, f, ensure_ascii=False, indent=2)
    print(f"✅ highlight 세그먼트 저장 완료 → {top_segments_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video_path", required=True, help="입력 영상(mp4)")
    parser.add_argument("--fine_ckpt", required=True, help="모델 체크포인트 경로 (.pkl)")
    parser.add_argument("--output_dir", required=True, help="출력 디렉토리")
    parser.add_argument("--fps", type=float, default=1.0, help="초당 프레임 수 (기본 1.0)")
    parser.add_argument("--device", default="cpu", help="cpu 또는 cuda")
    parser.add_argument("--alpha", type=float, default=0.7, help="avg 점수 가중치")
    parser.add_argument("--std_weight", type=float, default=0.3, help="표준편차 가중치")
    parser.add_argument("--top_ratio", type=float, default=0.2, help="상위 n% 하이라이트 추출")
    args = parser.parse_args()

    run_pipeline(
        video_path=args.video_path,
        ckpt_path=args.fine_ckpt,
        output_dir=args.output_dir,
        device=args.device,
        fps=args.fps,
        alpha=args.alpha,
        std_weight=args.std_weight,
        top_ratio=args.top_ratio
    )