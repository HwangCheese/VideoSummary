import whisper
import torchaudio
import torch
import json


def process(audio_path, scene_json_path, output_json_path, model_size="small"):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"디바이스: {device} (Silero VAD + Whisper {model_size})")

    # Silero VAD 로드 및 음성 구간 추출 (trust_repo=True 명시)
    vad_model, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-vad',
        model='silero_vad',
        trust_repo=True
    )
    get_speech_timestamps, _, read_audio, *_ = utils
    audio_tensor = read_audio(audio_path, sampling_rate=16000).to(device)

    # 🔧 VAD 민감도 조정
    vad_segments = get_speech_timestamps(
        audio_tensor, vad_model,
        threshold=0.3,
        min_speech_duration_ms=100
    )
    vad_time_ranges = [(s['start'] / 16000, s['end'] / 16000) for s in vad_segments]

    # Whisper 음성 인식 수행
    model = whisper.load_model(model_size).to(device)

    # 언어 자동 감지 (tiny 모델 제외)
    if model_size != "tiny":
        audio = whisper.load_audio(audio_path)
        audio = whisper.pad_or_trim(audio)
        mel = whisper.log_mel_spectrogram(audio).to(device)
        _, probs = model.detect_language(mel)
        detected_lang = max(probs, key=probs.get)
        print(f"감지된 언어: {detected_lang}")

        # 한국어/영어 외의 언어면 fallback
        if detected_lang not in ["ko", "en"]:
            print(f"감지된 언어({detected_lang})가 비정상적입니다. 영어(en)로 강제 지정합니다.")
            detected_lang = "en"
    else:
        detected_lang = None

    result = model.transcribe(audio_path, language=detected_lang)

    # Whisper 자막 결과 존재 여부 확인용 출력
    print(f"Whisper 추출 자막 수: {len(result['segments'])}")

    # Whisper 자막 결과에서 유효한 음성 구간만 필터링
    filtered_segments = []
    for seg in result['segments']:
        w_start, w_end = seg['start'], seg['end']
        for v_start, v_end in vad_time_ranges:
            if w_start <= v_end and w_end >= v_start:
                filtered_segments.append({
                    "start": round(w_start, 2),
                    "end": round(w_end, 2),
                    "text": seg['text'].strip()
                })
                break

    if not filtered_segments:
        print("VAD 필터링된 자막이 없습니다. Whisper 전체 자막을 저장합니다.")
        filtered_segments = [
            {
                "start": round(seg['start'], 2),
                "end": round(seg['end'], 2),
                "text": seg['text'].strip()
            }
            for seg in result['segments']
        ]

    # JSON 저장
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(filtered_segments, f, indent=2, ensure_ascii=False)

    print(f"Whisper 자막 세그먼트 저장 완료: {output_json_path}")