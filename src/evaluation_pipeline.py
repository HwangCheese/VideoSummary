# evaluaton_module.py
'''
실행하기 위한 기본 명령어
 python evaluation_pipeline.py \     
  --video_path "video.mp4" \
  --fine_ckpt "../dataset/pgl_sum1_best_f1.pkl" \
  --output_dir "./evaluation"\
  --top_ratio "0.2"
'''
import argparse
import os
import json

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from extract_features_module import extract_features_pipe
from scene_detection_module import run_scene_detect_pipeline
from pgl_module import run_pgl_module
from segment_importance import run_segment_importance_pipeline
from knapsack_module import run_sub_knapsack_pipeline
from evaluation_module import run_evaluation

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

    # 파일 경로 정의
    h5_path = os.path.join(output_dir, f"{base}.h5")
    scene_json = os.path.join(output_dir, f"{base}_scenes.json")
    segment_json = os.path.join(output_dir, f"{base}_segment_scores.json")
    sorted_json = os.path.join(output_dir, f"{base}_sorted_combined.json")
    selected_json = os.path.join(output_dir, f"{base}_selected_segments.json")
    all_selected_json = os.path.join(output_dir, f"{base}_all_selected_segments.json")
    evaluation_json = os.path.join(output_dir, f"{base}_evaluation.json")

    # ========== 1. 특징 추출 ==========
    if os.path.exists(h5_path):
        print("\n[1/5] 특징 추출 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n[1/5] 특징 추출", flush=True)
        video_fps = extract_features_pipe(video_path, h5_path, device)

    # ========== 2. 프레임 중요도 산출 ==========
    print("\n[2/5] 대표 프레임별 중요도 점수 산출 (PGL-SUM)", flush=True)
    frame_scores = run_pgl_module(ckpt_path=ckpt_path, feature_h5=h5_path, device=device)

    # ========== 3. 장면 분할 ==========
    if os.path.exists(scene_json):
        print("\n[3/5] 장면 분할 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n[3/5]TransNetV2로 장면 전환 감지 중...")
        if video_fps is None:
            video_fps = get_video_fps(video_path)
        run_scene_detect_pipeline(video_path, scene_json, video_fps)

    # ========== 4. 세그먼트 중요도 산출 ==========
    print("\n[4/5] 세그먼트 중요도 산출", flush=True)
    run_segment_importance_pipeline(
        scene_json=scene_json, 
        frame_scores=frame_scores, 
        output_json=segment_json, 
        output_sorted_combined_json=sorted_json, 
        alpha=alpha, 
        std_weight=std_weight, 
        fps=fps
    )

    # ========== 5. α 값 변화에 따른 세그먼트 추출 ==========
    print("\n[5/5] 다양한 α 값으로 세그먼트 선택 (0.0 ~ 1.0)", flush=True)
    extracted_scenes = []
    
    for i in range(11):  # 0.0, 0.1, ..., 1.0
        alpha_weight = i / 10.0
        print(f"  - α = {alpha_weight:.1f} 처리 중...", end=" ", flush=True)
        
        selected_ids = run_sub_knapsack_pipeline(
            feature_h5=h5_path, 
            scene_json=scene_json, 
            fps=fps,
            output_sorted_combined_json=sorted_json, 
            importance_weight=alpha_weight,
            selected_json=selected_json,
            top_ratio=top_ratio, 
            budget_time=budget_time
        )
        
        extracted_scenes.append({
            "alpha_weight": alpha_weight,
            "extracted_segment_ids": selected_ids
        })
        print("완료", flush=True)

    # 결과 저장
    with open(all_selected_json, "w", encoding="utf-8") as f:
        json.dump(extracted_scenes, f, indent=2, ensure_ascii=False)
    
    print(f"\n추출 결과 저장: {all_selected_json}")

    # ========== 6. 통합 평가 ==========
    print("\n" + "=" * 80)
    print("                         평가 시작")
    print("=" * 80)
    
    # 모든 지표를 한 번에 계산 및 저장
    run_evaluation(
        importance_file=sorted_json,
        extracted_file=all_selected_json,
        output_json=evaluation_json,
        metrics=['id_interval', 'time_interval', 'gini'],
        display=True
    )
    
    print("\n파이프라인 완료!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="비디오 요약 파이프라인")
    parser.add_argument("--video_path", required=True, help="입력 영상 파일 (.mp4)")
    parser.add_argument("--fine_ckpt", required=True, help="모델 체크포인트 (.pkl)")
    parser.add_argument("--output_dir", required=True, help="결과 저장 디렉토리")
    parser.add_argument("--fps", type=float, default=1.0, help="특징 추출 FPS")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="연산 장치")
    parser.add_argument("--alpha", type=float, default=0.7, help="점수 평균 가중치")
    parser.add_argument("--std_weight", type=float, default=0.3, help="표준편차 가중치")
    parser.add_argument("--top_ratio", type=float, default=0.2, help="상위 선택 비율")
    parser.add_argument("--model_size", default="base", help="Whisper 모델 크기")
    parser.add_argument("--importance_weight", type=float, default=0.1, 
                        help="중요도 가중치 (0.0=스토리, 1.0=하이라이트)")
    parser.add_argument("--budget_time", type=float, default=None, 
                        help="요약 목표 시간(초)")

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