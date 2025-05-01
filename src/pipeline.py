
import argparse
import os
import subprocess
from extract_features_module import extract_features_pipe
from pgl_module import run_pgl_module
from video_module import create_highlight_video
from whisper_segmentor import process as whisper_process
from refine_selected_segments import refine_selected_segments

def run_pipeline(video_path, ckpt_path, output_dir, device="cpu", fps=1.0,
                 alpha=0.7, std_weight=0.3, top_ratio=0.2, model_size="base", importance_weight=0.8, budget_time=None):
    os.makedirs(output_dir, exist_ok=True)

    base = os.path.splitext(os.path.basename(video_path))[0]
    h5_path = os.path.join(output_dir, f"{base}.h5")
    scene_json = os.path.join(output_dir, f"{base}_scenes.json")
    segment_json = os.path.join(output_dir, f"{base}_segment_scores.json")
    sorted_json = os.path.join(output_dir, f"{base}_sorted_combined.json")
    selected_json = os.path.join(output_dir, f"{base}_selected_segments.json")
    whisper_json = os.path.join(output_dir, f"{base}_whisper_segments.json")
    refined_json = os.path.join(output_dir, f"{base}_refined_segments.json")
    audio_wav = os.path.join(output_dir, f"{base}.wav")
    highlight_video = os.path.join(output_dir, f"highlight_{base}.mp4")

    print("\n🎬 [1/6] 특징 추출", flush=True)
    extract_features_pipe(video_path, h5_path, scene_json, device=device)

    print("\n🔊 [2/6] Whisper용 오디오 추출", flush=True)
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        audio_wav
    ])

    print("\n🧠 [3/6] Whisper 자막 기반 문장 세그먼트 생성", flush=True)
    whisper_process(audio_wav, scene_json, whisper_json, model_size=model_size)

    print("\n🎯 [4/6] 중요도 기반 상위 세그먼트 선택 (PGL-SUM)", flush=True)
    selected_segments = run_pgl_module(
        ckpt_path=ckpt_path,
        feature_h5=h5_path,
        scene_json=scene_json,
        output_json=segment_json,
        output_sorted_combined_json=sorted_json,
        fps=fps,
        device=device,
        alpha=alpha,
        std_weight=std_weight,
        top_ratio=top_ratio,
        importance_weight=importance_weight,
        budget_time=None # 예산 지정.
    )

    # 저장해두기
    with open(selected_json, 'w', encoding='utf-8') as f:
        import json
        json.dump({"segments": selected_segments}, f, indent=2, ensure_ascii=False)

    print("\n✂️ [5/6] Whisper 기반으로 경계 보정", flush=True)
    refine_selected_segments(selected_json, whisper_json, refined_json)

    print("\n🎞️ [6/6] 하이라이트 영상 생성", flush=True)
    create_highlight_video(
        selected_segments=json.load(open(refined_json, encoding='utf-8'))["segments"],
        video_path=video_path,
        output_video=highlight_video
    )
    print(f"\n✅ 파이프라인 완료! 최종 하이라이트 영상: {highlight_video}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video_path", required=True, help="입력 영상(mp4)")
    parser.add_argument("--fine_ckpt", required=True, help="모델 체크포인트 경로 (.pkl)")
    parser.add_argument("--output_dir", required=True, help="출력 디렉토리")
    parser.add_argument("--fps", type=float, default=1.0, help="초당 프레임 수")
    parser.add_argument("--device", default="cpu", help="cpu 또는 cuda")
    parser.add_argument("--alpha", type=float, default=0.7)
    parser.add_argument("--std_weight", type=float, default=0.3)
    parser.add_argument("--top_ratio", type=float, default=0.2)
    parser.add_argument("--model_size", default="base", help="Whisper 모델 크기")

    # Knapsack 선택 관련 인자 
    parser.add_argument("--importance_weight", default=1.0, type=float, help="중요도 가중치 (0.0 ~ 1.0) for knapsack selection 0에 가까울 수록 전반적인 요약")  
    parser.add_argument("--budget_time", type=float, default=None, help="요약에 사용할 총 예산 시간(초). 지정하지 않으면 전체 길이의 20% 사용")   

    args = parser.parse_args()

    run_pipeline(
        video_path=args.video_path,
        ckpt_path=args.fine_ckpt,
        output_dir=args.output_dir,
        device=args.device,
        fps=args.fps,
        alpha=args.alpha,
        std_weight=args.std_weight,
        top_ratio=args.top_ratio,
        model_size=args.model_size,
        importance_weight=args.importance_weight,
        budget_time=args.budget_time
    )
