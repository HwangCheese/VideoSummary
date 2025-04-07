import torch
import h5py
import numpy as np
import torchvision.models as models
import torchvision.transforms as transforms
import os
import json
from sklearn.decomposition import PCA
from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector
from decord import VideoReader, cpu
from PIL import Image

def load_inception_v3(device):
    print("📦 InceptionV3 모델 로딩 중...", flush=True)
    model = models.inception_v3(weights="DEFAULT")
    model.fc = torch.nn.Identity()
    return model.to(device).eval()

def extract_features(video_path, model, device):
    print("🎞️ 프레임 특징 추출 중... (Decord + 배치 처리, CPU 고정)", flush=True)

    ctx = cpu(0)  # ✅ GPU 대신 CPU 강제 사용
    vr = VideoReader(video_path, ctx=ctx)
    fps = vr.get_avg_fps()
    frame_idxs = list(range(0, len(vr), int(round(fps))))
    print(f"📸 추출 프레임 수: {len(frame_idxs)} / 총 {len(vr)}", flush=True)

    transform = transforms.Compose([
        transforms.Resize((299, 299)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    frames = []
    for i, idx in enumerate(frame_idxs):
        frame = vr[idx].asnumpy()
        img = Image.fromarray(frame)
        tensor = transform(img)
        frames.append(tensor)

        # ✅ 프레임 처리 진행 상황 출력
        print(f"📸 처리 중... {idx}/{len(vr)} 프레임", flush=True)

    tensor_batch = torch.stack(frames).to(device)

    with torch.no_grad():
        feats = model(tensor_batch).cpu().numpy()

    print("✅ 프레임 특징 추출 완료", flush=True)
    return feats

def apply_pca(features, max_components=1024):
    print("📊 PCA 적용 중...", flush=True)
    n_samples, n_features = features.shape
    n_components = min(n_samples, max_components)
    if n_samples < 2:
        return features
    pca = PCA(n_components=n_components)
    pca_features = pca.fit_transform(features)
    if n_components < max_components:
        pad_width = ((0, 0), (0, max_components - n_components))
        pca_features = np.pad(pca_features, pad_width, mode='constant', constant_values=0)
    print("✅ PCA 완료", flush=True)
    return pca_features

def save_to_h5(features, output_h5):
    print(f"💾 특징 저장 중: {output_h5}", flush=True)
    os.makedirs(os.path.dirname(output_h5), exist_ok=True)
    with h5py.File(output_h5, "w") as hf:
        hf.create_dataset("features", data=features)
    print("✅ 특징 저장 완료", flush=True)

def detect_scenes(video_path, threshold=16.0, min_scene_len=45):
    print("🎬 장면 분할(씬 디텍션) 중...", flush=True)
    video_manager = VideoManager([video_path])
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold, min_scene_len=min_scene_len))
    video_manager.set_downscale_factor()
    video_manager.start()
    scene_manager.detect_scenes(frame_source=video_manager, show_progress=False)
    scene_list = scene_manager.get_scene_list()
    fps = video_manager.get_framerate()
    change_points = [[int(s.get_frames()), int(e.get_frames()) - 1] for s, e in scene_list]
    print(f"✅ {len(change_points)}개의 장면 구간 탐지 완료", flush=True)
    return change_points, fps

def save_segments_to_json(change_points, output_json, fps):
    print(f"📝 장면 정보를 JSON으로 저장 중: {output_json}", flush=True)
    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    segment_data = [
        {"segment_id": idx, "start_time": round(s / fps, 2), "end_time": round(e / fps, 2)}
        for idx, (s, e) in enumerate(change_points)
    ]
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(segment_data, f, ensure_ascii=False, indent=4)
    print("✅ 장면 JSON 저장 완료", flush=True)

def extract_features_pipe(video_path, output_h5, output_json, device="cuda"):
    print("🚀 extract_features_pipe 시작", flush=True)
    os.makedirs(os.path.dirname(output_h5), exist_ok=True)
    os.makedirs(os.path.dirname(output_json), exist_ok=True)

    model = load_inception_v3(device)
    features = extract_features(video_path, model, device)
    pca_features = apply_pca(features)
    save_to_h5(pca_features, output_h5)
    
    print("✅ 장면 분할 시작", flush=True)
    change_points, fps = detect_scenes(video_path)
    save_segments_to_json(change_points, output_json, fps)

    print("✅ extract_features_pipe 완료", flush=True)
