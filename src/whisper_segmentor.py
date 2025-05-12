import whisper
import torchaudio
import torch
import json
import numpy as np # numpy 추가

def check_overlap(whisper_start, whisper_end, vad_start, vad_end):
    """두 시간 범위가 겹치는지 확인"""
    return whisper_start < vad_end and whisper_end > vad_start

def process(audio_path, scene_json_path, output_json_path, model_size="small", max_segment_gap_ms=500): # 최대 세그먼트 간격 추가
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"디바이스: {device} (Silero VAD + Whisper {model_size})")

    # Silero VAD 로드 및 음성 구간 추출
    try:
        vad_model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            trust_repo=True
        )
        vad_model.to(device)
        get_speech_timestamps, _, read_audio, *_ = utils
        # 16000Hz 샘플링 속도로 오디오 로드
        audio_tensor = read_audio(audio_path, sampling_rate=16000)
        audio_tensor = audio_tensor.to(device) # VAD 모델과 동일한 장치로 이동
    except Exception as e:
        print(f"오류: Silero VAD 모델 로드 또는 오디오 처리 중 문제 발생 - {e}")
        # 오류 발생 시 빈 JSON 저장 또는 예외 발생 등 처리
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
        return

    # VAD 민감도 조정 및 실행
    try:
        vad_segments = get_speech_timestamps(
            audio_tensor, vad_model,
            threshold=0.3,             # 음성 감지 임계값 (낮추면 더 민감)
            min_speech_duration_ms=100, # 최소 음성 길이 (ms)
            min_silence_duration_ms=50, # 최소 침묵 길이 (ms) - 음성 구간 병합에 영향
            window_size_samples=512,   # VAD 분석 창 크기
            speech_pad_ms=50           # 감지된 음성 앞뒤에 추가할 여유 시간 (ms)
        )
        vad_time_ranges = [(s['start'] / 16000, s['end'] / 16000) for s in vad_segments]
        print(f"VAD 감지된 음성 구간 수: {len(vad_time_ranges)}")
        if not vad_time_ranges:
            print("경고: VAD가 음성 구간을 감지하지 못했습니다.")
            # 필요시 여기서 처리를 중단하거나 다른 로직 수행
            # with open(output_json_path, 'w', encoding='utf-8') as f:
            #     json.dump([], f)
            # return

    except Exception as e:
        print(f"오류: Silero VAD 실행 중 문제 발생 - {e}")
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
        return

    # Whisper 모델 로드
    try:
        model = whisper.load_model(model_size).to(device)
    except Exception as e:
        print(f"오류: Whisper 모델 로드 중 문제 발생 ({model_size}) - {e}")
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
        return

    # 언어 자동 감지 (옵션)
    detected_lang = None
    if model_size != "tiny":
        try:
            audio_for_detect = whisper.load_audio(audio_path)
            audio_for_detect = whisper.pad_or_trim(audio_for_detect)
            mel = whisper.log_mel_spectrogram(audio_for_detect).to(device)
            _, probs = model.detect_language(mel)
            detected_lang = max(probs, key=probs.get)
            print(f"감지된 언어: {detected_lang} (신뢰도: {probs[detected_lang]:.2f})")
            if detected_lang not in ["ko", "en"]: # 지원 언어 목록 확인 필요
                print(f"지원하지 않는 언어({detected_lang}) 감지. 기본 언어(None) 사용.")
                detected_lang = None # 또는 'en' 등으로 강제 지정
        except Exception as e:
            print(f"경고: 언어 감지 중 오류 발생 - {e}. 기본 언어 사용.")
            detected_lang = None

    # Whisper 음성 인식 수행 (단어 타임스탬프 활성화)
    try:
        print("Whisper 전사 시작...")
        # word_timestamps=True 추가
        result = model.transcribe(audio_path, language=detected_lang, word_timestamps=True)
        print("Whisper 전사 완료.")
        # Whisper 결과 구조 확인 (디버깅용)
        # print(json.dumps(result, indent=2, ensure_ascii=False))

    except Exception as e:
        print(f"오류: Whisper 전사 중 문제 발생 - {e}")
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
        return

    # VAD 결과와 단어 타임스탬프 결합
    valid_words = []
    if 'segments' not in result or not result['segments']:
        print("경고: Whisper 결과에 세그먼트가 없습니다.")
    else:
        print(f"Whisper 추출 세그먼트 수: {len(result['segments'])}")
        total_word_count = 0
        for segment in result['segments']:
            # 'words' 키가 있는지, 리스트인지 확인
            if 'words' in segment and isinstance(segment['words'], list):
                total_word_count += len(segment['words'])
                for word_info in segment['words']:
                     # 'start', 'end', 'word' 키가 있는지 확인
                    if all(k in word_info for k in ['start', 'end', 'word']):
                        w_start, w_end = word_info['start'], word_info['end']
                        # 단어가 VAD 구간과 겹치는지 확인
                        for v_start, v_end in vad_time_ranges:
                            if check_overlap(w_start, w_end, v_start, v_end):
                                valid_words.append({
                                    "text": word_info['word'].strip(),
                                    "start": w_start,
                                    "end": w_end
                                })
                                break # 하나의 VAD 구간과 겹치면 충분
                    else:
                        print(f"경고: 유효하지 않은 단어 정보 발견: {word_info}")
            else:
                 print(f"경고: 세그먼트에 'words' 정보가 없거나 유효하지 않음: {segment.get('id', 'ID 없음')}")
        print(f"Whisper 추출 총 단어 수: {total_word_count}")
        print(f"VAD 필터링 후 유효 단어 수: {len(valid_words)}")

    # 유효 단어가 없으면 fallback (기존 방식과 유사하게 처리)
    if not valid_words:
        print("경고: VAD 필터링된 유효 단어가 없습니다. Whisper 세그먼트 기준으로 대체합니다.")
        filtered_segments = []
        if 'segments' in result and result['segments']:
             for seg in result['segments']:
                 if 'start' in seg and 'end' in seg and 'text' in seg:
                    filtered_segments.append({
                        "start": round(seg['start'], 2),
                        "end": round(seg['end'], 2),
                        "text": seg['text'].strip()
                    })
        # fallback 결과 저장
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(filtered_segments, f, indent=2, ensure_ascii=False)
        print(f"Whisper (Fallback) 자막 세그먼트 저장 완료: {output_json_path}")
        return # Fallback 처리 후 종료

    # 유효 단어들을 기반으로 최종 세그먼트 재구성
    final_segments = []
    if valid_words:
        current_segment_words = []
        current_segment_start = valid_words[0]['start']

        for i, word in enumerate(valid_words):
            current_segment_words.append(word['text'])

            # 다음 단어가 있는지, 있다면 간격이 너무 크지 않은지 확인
            is_last_word = (i == len(valid_words) - 1)
            gap_to_next = 0
            if not is_last_word:
                gap_to_next = valid_words[i+1]['start'] - word['end']

            # 마지막 단어이거나 다음 단어와의 간격이 설정값보다 크면 현재 세그먼트 종료
            if is_last_word or gap_to_next * 1000 > max_segment_gap_ms:
                segment_text = " ".join(current_segment_words)
                segment_end = word['end'] # 현재 단어의 끝 시간
                final_segments.append({
                    "start": round(current_segment_start, 2), # 소수점 2자리 반올림
                    "end": round(segment_end, 2),           # 소수점 2자리 반올림
                    "text": segment_text.strip()
                })
                # 다음 세그먼트 준비 (마지막 단어가 아닐 경우)
                if not is_last_word:
                    current_segment_words = []
                    current_segment_start = valid_words[i+1]['start']

    # 최종 결과 JSON 저장
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(final_segments, f, indent=2, ensure_ascii=False)

    print(f"정밀 타임스탬프 자막 세그먼트 저장 완료: {output_json_path}")
    print(f"생성된 최종 세그먼트 수: {len(final_segments)}")