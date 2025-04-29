import torch
import h5py
import numpy as np
import torchvision.models as models
import torchvision.transforms as transforms
import os
import json
from sklearn.decomposition import PCA
from decord import VideoReader, cpu
from PIL import Image
from transnetv2 import TransNetV2

# Inception V3 로드
def load_inception_v3(device):
    print("📦 InceptionV3 모델 로딩 중...")
    model = models.inception_v3(weights="DEFAULT")
    model.fc = torch.nn.Identity()
    return model.to(device).eval()

# 특징 추출 batch_size를 늘리면 훨씬 속도가 빨라질것 2^n 값으로 유지
def extract_features(video_path, model, device, batch_size=32):
    print("🎞️ 프레임 특징 추출 중... (Decord + 배치 처리, 메모리 최적화)")
    ctx = cpu(0)
    vr = VideoReader(video_path, ctx=ctx)
    fps = vr.get_avg_fps()
    frame_idxs = list(range(0, len(vr), int(round(fps))))

    transform = transforms.Compose([
        transforms.Resize((299, 299)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    feats = []
    batch = []
    for i, idx in enumerate(frame_idxs):
        frame = vr[idx].asnumpy()
        img = Image.fromarray(frame)
        batch.append(transform(img))

        # ✅ 프레임 처리 진행 상황 출력
        print(f"📸 처리 중... {idx}/{len(vr)} 프레임", flush=True)

        if len(batch) == batch_size or i == len(frame_idxs) - 1:
            tensor_batch = torch.stack(batch).to(device)
            with torch.no_grad():
                batch_feats = model(tensor_batch).cpu().numpy()
                feats.append(batch_feats)
            batch = []

    return np.concatenate(feats, axis=0)

# PCA 적용
def apply_pca(features, max_components=1024):
    n_samples = features.shape[0]
    n_components = min(n_samples, max_components)
    if n_samples < 2:
        return features
    pca = PCA(n_components=n_components)
    pca_features = pca.fit_transform(features)
    if n_components < max_components:
        pca_features = np.pad(pca_features, ((0, 0), (0, max_components - n_components)))
    return pca_features

# 특징 저장
def save_to_h5(features, output_h5):
    os.makedirs(os.path.dirname(output_h5), exist_ok=True)
    with h5py.File(output_h5, "w") as hf:
        hf.create_dataset("features", data=features)

# TransNetV2를 이용한 장면 전환 감지
def detect_scenes_transnetv2(video_path, threshold=0.5):
    print("🎬 TransNetV2로 장면 전환 감지 중...")
    model = TransNetV2()
    video_frames, single_frame_predictions, _ = model.predict_video(video_path)
    scene_changes = np.where(single_frame_predictions > threshold)[0]
    print(f"✅ {len(scene_changes)}개의 장면 전환점 검출 완료")
    return scene_changes.tolist(), video_frames.shape[0]

# 장면 구간 JSON으로 저장
def save_segments_to_json(scene_changes, output_json, total_frames, fps):
    segment_data = []
    scene_changes = [0] + scene_changes + [total_frames - 1]
    for idx in range(len(scene_changes)-1):
        start_frame = scene_changes[idx]
        end_frame = scene_changes[idx+1]
        segment_data.append({
            "segment_id": idx,
            "start_time": round(start_frame / fps, 2),
            "end_time": round(end_frame / fps, 2)
        })

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(segment_data, f, ensure_ascii=False, indent=4)
    print("✅ 장면 구간 JSON 저장 완료")

# 특징 추출 및 TransNetV2 장면 분할 파이프라인
def extract_features_pipe(video_path, output_h5, output_json, device="cuda"):
    os.makedirs(os.path.dirname(output_h5), exist_ok=True)
    os.makedirs(os.path.dirname(output_json), exist_ok=True)

    model = load_inception_v3(device)
    features = extract_features(video_path, model, device)
    pca_features = apply_pca(features)
    save_to_h5(pca_features, output_h5)

    scene_changes, total_frames = detect_scenes_transnetv2(video_path)
    fps = VideoReader(video_path, cpu(0)).get_avg_fps()
    save_segments_to_json(scene_changes, output_json, total_frames, fps)

    print("✅ 전체 파이프라인 완료")
