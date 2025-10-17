import argparse
import os
import json
import platform

# KMP_DUPLICATE_LIB_OK 환경 변수 설정
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from extract_features_module import extract_features_pipe
from VideoSummary.src.scene_detection_module_tf import run_scene_detect_pipeline
from pgl_module import run_pgl_module
from segment_importance import run_segment_importance_pipeline
from video_module import create_highlight_video
from whisper_segmentor import process as whisper_process
from refine_selected_segments import refine_selected_segments
from visualize_module import run_visualize_pipeline
from frame_score_plotter import visualize_all_segments_frame_scores
from knapsack_module import run_sub_knapsack_pipeline

from audio_module import extract_audio
from transcript_module import reconstruct_highlight_transcripts
from score_module import manage_quality_score
from report_module import generate_summary_report
from thumbnail_module import generate_thumbnails

def get_video_fps(video_path):
    IS_MACOS = platform.system() == 'Darwin'
    if IS_MACOS:
        import cv2
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
    else:
        from decord import VideoReader, cpu
        vr = VideoReader(video_path, ctx=cpu(0))
        fps = vr.get_avg_fps()
    return fps

def run_pipeline(video_path, ckpt_path, output_dir, device, fps=1.0,
                alpha=0.7, std_weight=0.3, top_ratio=0.2,
                model_size="base", importance_weight=0.8, budget_time=None):

    os.makedirs(output_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(video_path))[0]
    output_dir = os.path.join(output_dir, base)
    os.makedirs(output_dir, exist_ok=True)

    # 파이프라인 단계별 파일 경로 정의
    h5_path = os.path.join(output_dir, f"{base}.h5")
    scene_json = os.path.join(output_dir, f"{base}_scenes.json")
    segment_json = os.path.join(output_dir, f"{base}_segment_scores.json")
    sorted_json = os.path.join(output_dir, f"{base}_sorted_combined.json")
    selected_json = os.path.join(output_dir, f"{base}_selected_segments.json")
    vad_json = os.path.join(output_dir, f"{base}_vad_segments.json")
    whisper_json  = os.path.join(output_dir, f"{base}_whisper_segments.json")
    vad_whisper_json  = os.path.join(output_dir, f"{base}_vad_whisper_segments.json")
    refined_json = os.path.join(output_dir, f"{base}_refined_segments.json")
    highlight_video = os.path.join(output_dir, f"highlight_{base}.mp4")
    visualize_png = os.path.join(output_dir, f"{base}_w{importance_weight}.png")
    score_path = os.path.join(output_dir, f"{base}_score.json")
    highlight_transcript_json = os.path.join(output_dir, f"{base}_reScript.json")
    
    # 1. 특징 추출
    if os.path.exists(h5_path):
        print("\n[1/6] 특징 추출 - 기존 파일 발견, 스킵", flush=True)
        video_fps = get_video_fps(video_path)
    else:
        print("\n[1/6] 특징 추출", flush=True)
        video_fps = extract_features_pipe(video_path, h5_path, device)

    # 2. 중요도 기반 세그먼트 선택
    print("\n[2/6] 대표 프레임별 중요도 점수 산출 (PGL‑SUM)", flush=True)
    frame_scores = run_pgl_module(ckpt_path=ckpt_path, feature_h5=h5_path,device=device)

    # 3. 장면 분할
    if os.path.exists(scene_json):
        print("\n[3/6] 장면 분할 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n[3/6]TransNetV2로 장면 전환 감지 중...")
        run_scene_detect_pipeline(video_path, device, scene_json, video_fps)

    print("\n[4/6]세그먼트 중요도 산출 및 세그먼트 선택")
    run_segment_importance_pipeline(
        scene_json=scene_json, frame_scores=frame_scores, 
        output_json=segment_json, output_sorted_combined_json=sorted_json, 
        alpha=alpha, std_weight=std_weight, fps=fps)

    run_sub_knapsack_pipeline(
        feature_h5=h5_path, scene_json=scene_json, fps=fps,
        output_sorted_combined_json=sorted_json, importance_weight=importance_weight,
        selected_json=selected_json, top_ratio=top_ratio, budget_time=None)


    print("\n[5/6] VAD + Whisper 기반으로 경계 보정", flush=True)

    # 2. 오디오 추출
    audio_wav = extract_audio(video_path, output_dir, base)

    # 3. Whisper 세그먼트 생성
    if os.path.exists(vad_whisper_json):
        print("\nWhisper 자막 기반 문장 세그먼트 생성 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\nWhisper 자막 기반 문장 세그먼트 생성", flush=True)
        whisper_process(audio_wav, vad_json, whisper_json, vad_whisper_json, model_size=model_size)

    # 5. 세그먼트 경계 보정
    refine_selected_segments(selected_json, vad_whisper_json, refined_json)
    
    # 6. 요약 영상 생성
    print("\n[6/6] 요약 영상 생성", flush=True)
    with open(refined_json, encoding="utf-8") as f:
        refined_segments_data = json.load(f)
    create_highlight_video(
        selected_segments=refined_segments_data,
        video_path=video_path,
        output_video=highlight_video
    )

    # 7. 썸네일 생성
    generate_thumbnails(video_path, refined_json, output_dir, base)

    # 8. 요약 영상 자막 재구성
    reconstruct_highlight_transcripts(refined_json, vad_whisper_json, highlight_transcript_json)

    # 9. 품질 점수 계산
    manage_quality_score(
        score_path=score_path, importance_weight=importance_weight, feature_h5_path=h5_path,
        sorted_json_path=sorted_json, selected_json_path=selected_json
    )

    # 10. 요약 메타 정보 저장
    generate_summary_report(
        output_dir=output_dir, base_name=base, scene_json_path=scene_json,
        refined_json_path=refined_json, importance_weight=importance_weight
    )

    # 시각화
    print("\n[시각화] 파이프라인 결과 시각화", flush=True)
    try:
        run_visualize_pipeline(segment_json, selected_json, visualize_png)
        visualize_all_segments_frame_scores(segment_json)
    except Exception as e:
        print(f"시각화 실패: {e}")

    # 11. 최종 결과 출력
    print(f"\n파이프라인 완료! 최종 요약 영상: {highlight_video}", flush=True)
    if os.path.exists(highlight_transcript_json):
        print(f"요약 영상 자막 (재구성됨): {highlight_transcript_json}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="비디오 요약 파이프라인을 실행합니다.")
    parser.add_argument("--video_path", required=True, help="입력 영상 파일 경로 (.mp4)")
    parser.add_argument("--fine_ckpt", required=True, help="사전 학습된 모델 체크포인트 파일 경로 (.pkl)")
    parser.add_argument("--output_dir", required=True, help="결과물을 저장할 디렉토리 경로")
    parser.add_argument("--fps", type=float, default=1.0, help="특징 추출 시 사용할 초당 프레임 수")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="연산에 사용할 장치 (cpu 또는 cuda)")
    parser.add_argument("--alpha", type=float, default=0.7, help="점수 계산 시 평균 점수에 대한 가중치")
    parser.add_argument("--std_weight", type=float, default=0.3, help="점수 계산 시 표준편차에 대한 가중치")
    parser.add_argument("--top_ratio", type=float, default=0.2, help="상위 n% 세그먼트를 선택할 비율")
    parser.add_argument("--model_size", default="base", help="Whisper 모델 크기 (e.g., tiny, base, small, medium)")

    parser.add_argument("--importance_weight", default=0.1, type=float, help="중요도 가중치 (0.0 ~ 1.0). 0에 가까울수록 전반적인 요약, 1에 가까울수록 핵심적인 요약")
    parser.add_argument("--budget_time", type=float, default=None, help="요약 영상의 목표 시간(초). 지정하지 않으면 top_ratio에 따라 결정됨")

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