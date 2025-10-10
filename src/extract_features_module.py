import torch
import h5py
import numpy as np
import torchvision.models as models
import torchvision.transforms as transforms
import os
import json
from sklearn.decomposition import PCA
from PIL import Image
from transnetv2 import TransNetV2
import platform 

# OS에 따라 비디오 처리 라이브러리 선택
IS_MACOS = platform.system() == 'Darwin'

if IS_MACOS:
    import cv2 # macOS인 경우 OpenCV 임포트
else:
    from decord import VideoReader, cpu # 그 외 환경에서는 decord 임포트

# Inception V3 로드
def load_inception_v3(device):
    print("InceptionV3 모델 로딩 중...")
    model = models.inception_v3(weights="DEFAULT")
    model.fc = torch.nn.Identity()
    return model.to(device).eval()

# OpenCV를 사용한 특징 추출 함수 (macOS용)
def extract_features_opencv(video_path, model, device, batch_size=32):
    print("프레임 특징 추출 중... (OpenCV + 배치 처리)")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise IOError(f"비디오 파일을 열 수 없습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"평균 FPS: {fps}")
    
    frame_idxs = list(range(0, total_frames, int(round(fps))))

    transform = transforms.Compose([
        transforms.Resize((299, 299)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    feats = []
    batch = []
    for i, idx in enumerate(frame_idxs):
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx) # 특정 프레임으로 이동
        ret, frame = cap.read()
        if not ret:
            continue
        
        # OpenCV는 BGR 순서로 이미지를 읽으므로 RGB로 변환
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame_rgb)
        batch.append(transform(img))

        print(f"📸 처리 중... {idx}/{total_frames} 프레임", flush=True)

        if len(batch) == batch_size or i == len(frame_idxs) - 1:
            tensor_batch = torch.stack(batch).to(device)
            with torch.no_grad():
                batch_feats = model(tensor_batch).cpu().numpy()
                feats.append(batch_feats)
            batch = []
    
    cap.release()
    return np.concatenate(feats, axis=0)

# Decord를 사용한 특징 추출 함수 (Linux/Windows용)
def extract_features_decord(video_path, model, device, batch_size=32):
    print("프레임 특징 추출 중... (Decord + 배치 처리, 메모리 최적화)")
    ctx = cpu(0)
    vr = VideoReader(video_path, ctx=ctx)
    fps = vr.get_avg_fps()
    print(f"평균 FPS: {fps}")
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
        padding = np.zeros((pca_features.shape[0], max_components - n_components))
        pca_features = np.hstack((pca_features, padding))
    return pca_features

# 특징 저장
def save_to_h5(features, output_h5):
    os.makedirs(os.path.dirname(output_h5), exist_ok=True)
    with h5py.File(output_h5, "w") as hf:
        hf.create_dataset("features", data=features)

# TransNetV2를 이용한 장면 전환 감지
def detect_scenes_transnetv2(video_path, threshold=0.5):
    print("\n[2/6]TransNetV2로 장면 전환 감지 중...")
    model = TransNetV2()
    video_frames, single_frame_predictions, _ = model.predict_video(video_path)
    scene_changes = np.where(single_frame_predictions > threshold)[0]
    print(f"{len(scene_changes)}개의 장면 전환점 검출 완료")
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
    print("장면 구간 JSON 저장 완료")

# 특징 추출 및 TransNetV2 장면 분할 파이프라인
def extract_features_pipe(video_path, output_h5, output_json, device="cuda"):
    """
    비디오 파일에서 시각적 특징(feature)과 장면(scene) 정보를 추출하여 파일로 저장한다.

    이 함수는 파이프라인의 첫 단계로, 비디오를 분석하여 후속 AI 모델이 사용할 기초 데이터를 생성한다. 
    macOS 호환성을 위해 내부적으로 비디오 처리 라이브러리를 선택한다.

    Args:
        video_path (str): 분석할 원본 비디오 파일의 경로
        output_h5 (str): 추출된 시각적 특징 벡터를 저장할 .h5 파일 경로
        output_json (str): 감지된 장면들의 시간 정보를 저장할 .json 파일 경로
        device (str, optional): 연산에 사용할 장치("cpu" 또는 "cuda"). 기본값: cuda

    Returns:
        None: 이 함수는 값을 반환하는 대신 지정된 경로에 h5와 json 파일을 생성한다.
    """

    os.makedirs(os.path.dirname(output_h5), exist_ok=True)
    os.makedirs(os.path.dirname(output_json), exist_ok=True)

    model = load_inception_v3(device)
    
    # OS에 따라 다른 함수를 호출하여 특징 추출
    if IS_MACOS:
        features = extract_features_opencv(video_path, model, device)
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
    else:
        features = extract_features_decord(video_path, model, device)
        vr = VideoReader(video_path, ctx=cpu(0))
        fps = vr.get_avg_fps()

    pca_features = apply_pca(features)
    save_to_h5(pca_features, output_h5)

    scene_changes, total_frames = detect_scenes_transnetv2(video_path)
    save_segments_to_json(scene_changes, output_json, total_frames, fps)