# pgl_test.py
import torch
import h5py
import numpy as np
import moviepy.editor as mp
import os
import json
import kss
from faster_whisper import WhisperModel
from networks.pgl_sum.pgl_sum import PGL_SUM


def load_model_checkpoint(model, ckpt_path, device):
    checkpoint = torch.load(ckpt_path, map_location=device)
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"], strict=False)
    else:
        model.load_state_dict(checkpoint, strict=False)
    return model

def predict_scores(model, features, device="cpu"):
    x = torch.from_numpy(features).float().to(device)
    if x.ndim == 2:
        x = x.unsqueeze(0)
    mask = torch.ones((x.shape[0], x.shape[1]), dtype=torch.bool).to(device)
    with torch.no_grad():
        scores, _ = model(x, mask)
    return scores.cpu().numpy().squeeze()

def compute_segment_scores(scores, segment_length=1, fps=1.0):
    segment_scores = []
    num_frames = len(scores)
    num_segments = num_frames // segment_length
    for i in range(num_segments):
        start_idx = i * segment_length
        end_idx = min(start_idx + segment_length, num_frames)
        avg_score = np.mean(scores[start_idx:end_idx])
        segment_scores.append((i * segment_length, float(avg_score)))
    return segment_scores

def detect_highlights(segment_scores, top_k=3, clip_duration=15):
    sorted_segments = sorted(segment_scores, key=lambda x: x[1], reverse=True)
    selected_highlights = []
    selected_times = []
    for start, score in sorted_segments:
        end = start + clip_duration
        if any(start < e and end > s for s, e in selected_times):
            continue
        selected_times.append((start, end))
        selected_highlights.append({"start": start, "end": end, "score": float(score)})
        if len(selected_highlights) >= top_k:
            break
    selected_highlights.sort(key=lambda x: x["start"])
    return selected_highlights

def get_transcription_segments(audio_clip, stt_model):
    temp_audio_path = "temp_audio.wav"
    audio_clip.write_audiofile(temp_audio_path, codec="pcm_s16le", fps=16000, verbose=False, logger=None)
    segments, _ = stt_model.transcribe(temp_audio_path, word_timestamps=True, language='ko')
    return list(segments)

def adjust_highlight_by_stt_with_sentences(highlight, video, stt_model, margin=3.0):
    h_start, h_end = highlight["start"], highlight["end"]
    extract_start = max(0, h_start - margin)
    extract_end = min(video.duration, h_end + margin)
    audio_clip = video.subclip(extract_start, extract_end).audio
    segments = get_transcription_segments(audio_clip, stt_model)

    words = []
    full_text = ""
    offset = extract_start

    for seg in segments:
        if hasattr(seg, "words") and seg.words:
            for word in seg.words:
                words.append((word.start + offset, word.end + offset, word.word))
                full_text += word.word
        else:
            words.append((seg.start + offset, seg.end + offset, seg.text))
            full_text += seg.text

    sentences = kss.split_sentences(full_text)
    sentence_boundaries = []
    current_idx = 0

    for sentence in sentences:
        sent_length = len(sentence.replace(' ', ''))
        sent_words = []
        current_sent_len = 0
        while current_idx < len(words) and current_sent_len < sent_length:
            word = words[current_idx]
            sent_words.append(word)
            current_sent_len += len(word[2].replace(' ', ''))
            current_idx += 1
        if sent_words:
            start_time = sent_words[0][0]
            end_time = sent_words[-1][1]
            sentence_boundaries.append((start_time, end_time))

    new_start, new_end = h_start, h_end
    for s_time, e_time in sentence_boundaries:
        if s_time <= h_start < e_time:
            new_start = s_time
        if s_time < h_end <= e_time:
            new_end = e_time
            break

    return {"start": new_start, "end": new_end, "score": highlight["score"]}

def save_highlight_json(highlights, output_json):
    with open(output_json, "w") as f:
        json.dump({"highlights": highlights}, f, indent=2, ensure_ascii=False)

def extract_highlight_clips(video_path, highlights, output_dir):
    video = mp.VideoFileClip(video_path)
    os.makedirs(output_dir, exist_ok=True)
    for i, h in enumerate(highlights, 1):
        start, end = h["start"], h["end"]
        end = min(end, video.duration)
        clip_out = os.path.join(output_dir, f"highlight_{i}.mp4")
        video.subclip(start, end).write_videofile(clip_out, codec="libx264", fps=30, audio=True, audio_codec="aac")

def run_pgl_chunk(video_path, feature_h5, output_json, output_dir, ckpt_path,
                  clip_duration=15, fps=1.0, device="cuda", top_k=3):  # ✅ 추가됨
    print("🚀 PGL-SUM 실행 시작")

    model = PGL_SUM(
    input_size=1024,
    output_size=1024,
    freq=10000,
    pos_enc="absolute",
    num_segments=4,
    heads=8,
    fusion="add"
    )
    model = load_model_checkpoint(model, ckpt_path, device).eval().to(device)
    stt_model = WhisperModel("base", device="cpu", compute_type="int8")

    with h5py.File(feature_h5, "r") as hf:
        features = np.array(hf["features"])

    scores = predict_scores(model, features, device)
    seg_scores = compute_segment_scores(scores, segment_length=5, fps=fps)
    highlights = detect_highlights(seg_scores, top_k=3, clip_duration=clip_duration)

    video = mp.VideoFileClip(video_path)
    final_highlights = [adjust_highlight_by_stt_with_sentences(h, video, stt_model) for h in highlights]

    save_highlight_json(final_highlights, output_json)
    extract_highlight_clips(video_path, final_highlights, output_dir)

    print("✅ 하이라이트 저장 완료:", output_json)
