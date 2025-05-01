import whisper
import json
import torch

def process(audio_path, scene_json_path, output_json_path, model_size="small"):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"디바이스: {device}")

    model = whisper.load_model(model_size).to(device)

    result = model.transcribe(
        audio_path,
        language="en",
        beam_size=5,
        no_speech_threshold=0.8
    )

    segments = []
    for seg in result["segments"]:
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip()
        })

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(segments, f, indent=2, ensure_ascii=False)

    print(f"Whisper 자막 세그먼트 저장 완료: {output_json_path}")
