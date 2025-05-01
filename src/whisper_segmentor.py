
import whisper
import json

def process(audio_path, scene_json_path, output_json_path, model_size="base"):
    model = whisper.load_model(model_size)
    result = model.transcribe(audio_path, language="ko")

    segments = []
    for seg in result["segments"]:
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip()
        })

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(segments, f, indent=2, ensure_ascii=False)

    print(f"✅ Whisper 자막 세그먼트 저장 완료: {output_json_path}")
