import argparse, os, subprocess, json, subprocess
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from extract_features_module import extract_features_pipe
from pgl_module import run_pgl_module
from video_module import create_highlight_video
from whisper_segmentor import process as whisper_process
from refine_selected_segments import refine_selected_segments
from visualize_module import run_visualize_pipeline
from frame_score_plotter import visualize_all_segments_frame_scores


def run_pipeline(video_path, ckpt_path, output_dir, device="cpu", fps=1.0,
                 alpha=0.7, std_weight=0.3, top_ratio=0.2,
                 model_size="base", importance_weight=0.8, budget_time=None):

    os.makedirs(output_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(video_path))[0]
    output_dir = os.path.join(output_dir, base)
    os.makedirs(output_dir, exist_ok=True)


    # 파일 경로 정의 
    h5_path        = os.path.join(output_dir, f"{base}.h5")
    scene_json     = os.path.join(output_dir, f"{base}_scenes.json")
    segment_json   = os.path.join(output_dir, f"{base}_segment_scores.json")
    sorted_json    = os.path.join(output_dir, f"{base}_sorted_combined.json")
    selected_json  = os.path.join(output_dir, f"{base}_selected_segments.json")
    whisper_json   = os.path.join(output_dir, f"{base}_whisper_segments.json")
    refined_json   = os.path.join(output_dir, f"{base}_refined_segments.json")
    audio_wav      = os.path.join(output_dir, f"{base}.wav")
    # highlight_video= os.path.join(output_dir, f"highlight_{base}_w{importance_weight}.mp4")
    # visualize_png  = os.path.join(output_dir, f"visualize_{base}_w{importance_weight}.png")
    highlight_video= os.path.join(output_dir, f"highlight_{base}.mp4")
    visualize_png  = os.path.join(output_dir, f"{base}_w{importance_weight}.png")

    # 1. 특징 추출
    if os.path.exists(h5_path) and os.path.exists(scene_json):
        print("\n🎬 [1/6] 특징 추출 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n🎬 [1/6] 특징 추출", flush=True)
        extract_features_pipe(video_path, h5_path, scene_json, device=device)

    # 2. 오디오 추출
    if os.path.exists(audio_wav):
        print("\n🔊 [2/6] Whisper용 오디오 추출 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n🔊 [2/6] Whisper용 오디오 추출", flush=True)
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            audio_wav
        ], check=True)

    # 3. Whisper 세그먼트
    if os.path.exists(whisper_json):
        print("\n🧠 [3/6] Whisper 자막 기반 문장 세그먼트 생성 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n🧠 [3/6] Whisper 자막 기반 문장 세그먼트 생성", flush=True)
        whisper_process(audio_wav, scene_json, whisper_json, model_size=model_size)

    # 4. 중요도 기반 세그먼트 선택
    print("\n🎯 [4/6] 중요도 기반 상위 세그먼트 선택 (PGL‑SUM)", flush=True)
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
        budget_time=budget_time
    )
    with open(selected_json, "w", encoding="utf-8") as f:
        json.dump(selected_segments, f, indent=2, ensure_ascii=False)

    # 5. 경계 보정
    print("\n✂️ [5/6] Whisper 기반으로 경계 보정", flush=True)
    refine_selected_segments(selected_json, whisper_json, refined_json)

    # 시각화 PNG
    #run_visualize_pipeline(segment_json, selected_json, visualize_png)
    
    # 📈 전체 프레임 점수 시각화 
    #print("\n🖼️ [시각화] 전체 세그먼트 프레임 점수 시각화", flush=True)
    #visualize_all_segments_frame_scores(segment_json, visualize_png)
    
    # 📈 전체 프레임 점수 시각화 
    print("\n🖼️ [시각화] 전체 세그먼트 프레임 점수 시각화", flush=True)
    try:
        visualize_all_segments_frame_scores(segment_json)
    except Exception as e:
        print(f"❌ 프레임 점수 시각화 실패: {e}")

   # 6. 요약 영상 생성
    if os.path.exists(highlight_video):
        print("\n🎞️ [6/6] 요약 영상 생성 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n🎞️ [6/6] 요약 영상 생성", flush=True)
        create_highlight_video(
            selected_segments=json.load(open(refined_json, encoding="utf-8")),
            video_path=video_path,
            output_video=highlight_video
        )

    # 7. 썸네일 사진 생성
    try:
        with open(refined_json, encoding="utf-8") as f:
            refined_segments = json.load(f)
        generate_thumbnails(video_path, refined_segments, output_dir, base)
    except Exception as e:
        print(f"❌ 썸네일 생성 중 오류 발생: {e}")

    # 8. 요약 영상 자막 재구성 -> 원본 자막 재활용
    highlight_transcript_json = os.path.join(output_dir, f"{base}_reScript.json")

    if os.path.exists(highlight_transcript_json):
        print("\n📝 요약 영상 자막 재구성 - 기존 파일 발견, 스킵", flush=True)
    else:
        print("\n📝 요약 영상 자막 재구성 중...", flush=True)
        try:
            with open(refined_json, "r", encoding="utf-8") as f:
                selected_video_segments = json.load(f) 

            with open(whisper_json, "r", encoding="utf-8") as f:
                original_transcripts = json.load(f) 

            highlight_transcripts = []
            current_highlight_time = 0.0  

            for video_segment in selected_video_segments:
                segment_original_start = video_segment["start_time"]
                segment_original_end = video_segment["end_time"]
                segment_duration_in_highlight = segment_original_end - segment_original_start 

                for transcript_segment in original_transcripts:
                    original_transcript_start = transcript_segment["start"]
                    original_transcript_end = transcript_segment["end"]
                    text = transcript_segment["text"]
                    if segment_original_start <= original_transcript_start < segment_original_end:
                        relative_start_in_segment = original_transcript_start - segment_original_start
                        new_start_time = current_highlight_time + relative_start_in_segment

                        relative_end_in_segment = min(original_transcript_end, segment_original_end) - segment_original_start
                        new_end_time = current_highlight_time + relative_end_in_segment
                    
                        if new_end_time <= new_start_time or not text.strip():
                            continue

                        highlight_transcripts.append({
                            "start": round(new_start_time, 2),
                            "end": round(new_end_time, 2),
                            "text": text
                        })

                current_highlight_time += segment_duration_in_highlight 

            with open(highlight_transcript_json, "w", encoding="utf-8") as f:
                json.dump(highlight_transcripts, f, indent=2, ensure_ascii=False)
            print(f"  - 요약 영상 자막 재구성 완료: {highlight_transcript_json}", flush=True)

        except FileNotFoundError as e:
            print(f"  - ⚠️ 오류: 자막 재구성에 필요한 파일({e.filename})을 찾을 수 없습니다.", flush=True)
        except KeyError as e:
            print(f"  - ⚠️ 오류: JSON 데이터에 필요한 키 '{e}'가 없습니다. (refined_json 또는 whisper_json 구조 확인 필요)", flush=True)
        except Exception as e:
            print(f"  - ⚠️ 오류: 요약 영상 자막 재구성 중 예외 발생 - {e}", flush=True)

    # 9. 비디오 내 상대 점수 기반 품질 점수 계산
    print("\n📊 순위 기반 상대 품질 점수 계산 중...", flush=True)
    quality_score = 0.0  # 기본값 설정
    score_calculation_successful = False
    sort_key = 'combined_score'
    print(f"ℹ️ 정보: '{sort_key}' 기준 정렬 파일({os.path.basename(sorted_json)})을 사용하여 순위 기반 점수를 계산합니다.")

    try:
        if not os.path.exists(sorted_json):
             print(f"⚠️ 경고: 정렬된 세그먼트 파일({sorted_json})을 찾을 수 없습니다. 점수를 0으로 계산합니다.")
        else:
            with open(sorted_json, encoding="utf-8") as f:
                sorted_segments = json.load(f)

            total_segments = len(sorted_segments)
            if total_segments == 0:
                print(f"⚠️ 경고: 정렬된 세그먼트 파일({sorted_json})이 비어 있습니다. 점수를 0으로 계산합니다.")
            else:
                rank_map = {seg['segment_id']: rank for rank, seg in enumerate(sorted_segments) if 'segment_id' in seg}
                if not rank_map:
                     print(f"⚠️ 경고: 정렬된 세그먼트 데이터에 'segment_id' 키가 없어 순위 매핑 불가. 점수를 0으로 계산합니다.")
                else:
                    if not os.path.exists(selected_json):
                        print(f"⚠️ 경고: 선택된 세그먼트 파일({selected_json})을 찾을 수 없습니다. 점수를 0으로 계산합니다.")
                    else:
                        with open(selected_json, encoding="utf-8") as f:
                            selected_segments_info = json.load(f)

                        num_selected = len(selected_segments_info)
                        if num_selected == 0:
                            print(f"⚠️ 경고: 선택된 세그먼트가 없습니다. 점수를 0으로 계산합니다.")
                        else:
                            selected_ranks = []
                            missing_rank_count = 0
                            for seg in selected_segments_info:
                                seg_id = seg.get('segment_id')
                                if seg_id is not None and seg_id in rank_map:
                                    selected_ranks.append(rank_map[seg_id])
                                else:
                                    missing_rank_count += 1
                                    print(f"  - ⚠️ 경고: 선택된 세그먼트 ID {seg_id}의 순위를 찾을 수 없습니다. (정렬 기준: {sort_key})")

                            if missing_rank_count > 0:
                                print(f"  - 총 {missing_rank_count}개의 선택된 세그먼트 순위를 찾지 못했습니다.")

                            if not selected_ranks:
                                print(f"⚠️ 경고: 유효한 순위를 가진 선택된 세그먼트가 없습니다. 점수를 0으로 계산합니다.")
                            else:
                                avg_rank = sum(selected_ranks) / len(selected_ranks)
                                normalized_rank_score = max(0.0, 1.0 - (avg_rank / total_segments))
                                quality_score = round(normalized_rank_score * 100, 2)
                                score_calculation_successful = True
                                print(f"  - 전체 세그먼트 수: {total_segments}")
                                print(f"  - 선택된 세그먼트 수: {num_selected} (유효 순위: {len(selected_ranks)})")
                                print(f"  - 선택된 세그먼트 평균 순위: {avg_rank:.2f} (0이 최상위)")

    except FileNotFoundError as e:
        missing_file = e.filename if hasattr(e, 'filename') else f"{sorted_json} 또는 {selected_json}"
        print(f"⚠️ 경고: 점수 계산에 필요한 파일({missing_file})을 찾을 수 없습니다. 점수를 0으로 계산합니다.")
    except json.JSONDecodeError as e:
        print(f"⚠️ 경고: 점수 파일 ({sorted_json} 또는 {selected_json} 중 하나) 파싱 오류 - {e}. 점수를 0으로 계산합니다.")
    except KeyError as e:
        print(f"⚠️ 경고: JSON 데이터에 필요한 키 '{e}'가 없습니다. 점수를 0으로 계산합니다.")
    except Exception as e:
        print(f"⚠️ 오류: 점수 계산 중 예외 발생 - {e}. 점수를 0으로 계산합니다.")


    if score_calculation_successful:
        print(f"📈 순위 기반({sort_key} 기준) 상대 품질 점수: {quality_score}/100", flush=True)
    else:
        print(f"📉 요약 품질 점수 계산 실패. 최종 점수: {quality_score}/100", flush=True)

    score_path = os.path.join(output_dir, f"{base}_score.json")
    score_data = {
        "summary_score": quality_score,
        "score_type": "rank_based_relative", 
        "based_on_sort_key": sort_key    
    }
    if score_calculation_successful:
        score_data["average_rank"] = round(avg_rank, 2)
        score_data["total_segments"] = total_segments
        score_data["num_selected_with_rank"] = len(selected_ranks)

    with open(score_path, "w", encoding="utf-8") as f:
        json.dump(score_data, f, indent=2, ensure_ascii=False)
        print(f"[📁 SCORE PATH] {score_path}")

    # 10. 요약 메타 정보 저장
    print("\n📊 요약 리포트 정보 계산 중...", flush=True)

    with open(scene_json, encoding="utf-8") as f:
        full_segments = json.load(f)

    with open(refined_json, encoding="utf-8") as f:
        selected_segments = json.load(f)

    full_duration = max(seg["end_time"] for seg in full_segments)
    summary_duration = sum(seg["end_time"] - seg["start_time"] for seg in selected_segments)
    segment_count = len(selected_segments)
    compression_ratio = round((1 - summary_duration / full_duration) * 100, 1)

    report = {
        "full_duration": round(full_duration, 2), 
        "summary_duration": round(summary_duration, 2),
        "compression_ratio": compression_ratio, 
        "segment_count": segment_count         
    }

    report_path = os.path.join(output_dir, f"{base}_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"📄 요약 리포트 저장 완료: {report_path}")

    # 11. 모든 파이프라인 완료
    print(f"\n✅ 파이프라인 완료! 최종 요약 영상: {highlight_video}", flush=True)
    if os.path.exists(highlight_transcript_json):
        print(f"📝 요약 영상 자막 (재구성됨): {highlight_transcript_json}", flush=True)
    else:
        print(f"📝 요약 영상 자막 (재구성 실패 또는 스킵됨)", flush=True)

def generate_thumbnails(video_path, refined_segments, output_dir, base):
    """
    refined_segments (보정된 세그먼트) 기반으로 start_time을 모두 순회하며 썸네일을 생성한다.
    refined_segments는 이미 요약 대상으로 선정된 segment들의 리스트이다.
    """
    os.makedirs(output_dir, exist_ok=True)

    thumb_meta = []

    for seg in refined_segments:
        start_sec = int(seg.get("start_time", 0))  # 썸네일 기준 시간
        thumb_path = os.path.join(output_dir, f"{base}_thumb_{start_sec}.jpg")
        cmd = [
            "ffmpeg", "-ss", str(start_sec), "-i", video_path,
            "-vframes", "1", "-q:v", "2", "-y", thumb_path
        ]

        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"📸 썸네일 생성 완료: {thumb_path}")
            thumb_meta.append({
                "start_time": start_sec,
                "score": seg.get("combined_score", 0),  # 또는 avg_score 등 원하는 기준
                "segment_id": seg.get("segment_id", None)
            })
        except subprocess.CalledProcessError:
            print(f"❌ 썸네일 생성 실패: {thumb_path}")

    # 썸네일 메타 정보 저장
    meta_path = os.path.join(output_dir, f"{base}_thumbs.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(thumb_meta, f, indent=2, ensure_ascii=False)
    print(f"📝 썸네일 메타 저장 완료: {meta_path}")

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
    parser.add_argument("--importance_weight", default=0.1, type=float, help="중요도 가중치 (0.0 ~ 1.0) for knapsack selection 0에 가까울 수록 전반적인 요약")  
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
