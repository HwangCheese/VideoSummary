import argparse
import h5py
import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms
import cv2
from sklearn.decomposition import PCA
import json
from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector
import concurrent.futures  # 병렬 처리를 위한 모듈

# ✅ Inception-v3 모델 로드 (GPU device 사용)
def load_inception_v3(device):
    model = models.inception_v3(weights="DEFAULT")
    model.fc = torch.nn.Identity()
    model = model.to(device).eval()
    return model

# ✅ 특징 추출 (1초에 1프레임)
def extract_features(video_path, model, device):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    transform = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((299, 299)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    features = []
    frame_count = 0

    success, frame = cap.read()
    while success:
        # 1초에 한 프레임 처리
        if frame_count % round(fps) == 0:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            tensor = transform(frame_rgb).unsqueeze(0).to(device)
            with torch.no_grad():
                feat = model(tensor).cpu().numpy().squeeze()
                features.append(feat)
        success, frame = cap.read()
        frame_count += 1

    cap.release()
    return np.array(features)

# ✅ PCA 적용
def apply_pca(features, max_components=1024):
    n_samples, n_features = features.shape
    n_components = min(n_samples, max_components)
    print(f"\U0001F4CC PCA 적용 중... (원래 {n_features}D → {n_components}D)")

    if n_samples < 2:
        print("⚠️ 샘플이 너무 적어 PCA 불가, 원본 유지")
        return features

    pca = PCA(n_components=n_components)
    pca_features = pca.fit_transform(features)

    if n_components < max_components:
        pad_width = ((0, 0), (0, max_components - n_components))
        pca_features = np.pad(pca_features, pad_width, mode='constant', constant_values=0)

    return pca_features

# ✅ 특징을 HDF5로 저장
def save_to_h5(features, output_h5):
    with h5py.File(output_h5, "w") as hf:
        hf.create_dataset("features", data=features)
    print(f"✅ 특징 저장 완료: {output_h5} (shape={features.shape})")

# ✅ 장면 컷 감지
def detect_scenes(video_path, threshold=27.0, min_scene_len=45):
    video_manager = VideoManager([video_path])
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold, min_scene_len=min_scene_len))

    print(f"\U0001F4FC 영상 로딩 중: {video_path}")
    video_manager.set_downscale_factor()
    video_manager.start()
    scene_manager.detect_scenes(frame_source=video_manager)

    scene_list = scene_manager.get_scene_list()
    fps = video_manager.get_framerate()

    print(f"✅ 장면 컷 감지 완료: 총 {len(scene_list)}개")

    change_points = []
    for start_time, end_time in scene_list:
        start_frame = int(start_time.get_frames())
        end_frame = int(end_time.get_frames()) - 1
        change_points.append([start_frame, end_frame])
    return change_points, fps

# ✅ JSON 저장
def save_segments_to_json(change_points, output_json, fps):
    segment_data = []
    for idx, (start, end) in enumerate(change_points):
        segment_info = {
            "segment_id": idx,
            "start_time": round(start / fps, 2),
            "end_time": round(end / fps, 2)
        }
        segment_data.append(segment_info)

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(segment_data, f, ensure_ascii=False, indent=4)
    print(f"✅ JSON 저장 완료: {output_json}")
    print(f"  - segments: {len(segment_data)}")

# ✅ GPU 기반 특징 추출 파이프라인 (배치, PCA, 저장)
def run_feature_extraction(args, device):
    model = load_inception_v3(device)
    raw_features = extract_features(args.video_path, model, device)
    print(f"✅ 원본 특징 추출 완료 (shape): {raw_features.shape}")

    pca_features = apply_pca(raw_features, max_components=1024)
    print(f"✅ PCA 완료 (shape): {pca_features.shape}")

    save_to_h5(pca_features, args.output_h5)

# ✅ CPU 기반 장면 감지 파이프라인 (JSON 저장)
def run_scene_detection(args):
    change_points, fps = detect_scenes(
        args.video_path,
        threshold=args.threshold,
        min_scene_len=args.min_scene_len
    )
    save_segments_to_json(change_points, args.output_json, fps)

# ✅ 메인 함수: GPU와 CPU를 병렬로 사용
def main(args):
    # 사용자가 GPU로 지정한 device(예: "cuda:1") 사용. 없으면 CPU
    device = torch.device(args.gpu_device if torch.cuda.is_available() else "cpu")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"🚀 실행 디바이스: {device}")
    if torch.cuda.is_available():
        print("GPU name:", torch.cuda.get_device_name(0))
        print("GPU count:", torch.cuda.device_count())
    else:
        print("❌ CUDA not available. CPU 모드로 실행됩니다.")
    # ThreadPoolExecutor를 사용해 특징 추출과 장면 감지를 병렬 실행
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_feat = executor.submit(run_feature_extraction, args, device)
        future_scene = executor.submit(run_scene_detection, args)
        
        # 두 작업이 완료될 때까지 기다림
        concurrent.futures.wait([future_feat, future_scene])
    print("✅ 모든 작업 완료.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video_path", required=True, help="MP4 비디오 경로")
    parser.add_argument("--output_h5", required=True, help="저장할 HDF5 경로")
    parser.add_argument("--output_json", required=True, help="저장할 JSON 경로")
    parser.add_argument("--threshold", type=float, default=27.0, help="장면 전환 감지 민감도")
    parser.add_argument("--min_scene_len", type=int, default=45, help="최소 장면 길이 (프레임)")
    # GPU device 지정: 예를 들어, GTX 1650 TI가 cuda:1이라면 "cuda:1"로 지정합니다.
    parser.add_argument("--gpu_device", default="cuda:0", help="GPU 디바이스 (예: cuda:0). GPU 사용 불가 시 CPU 사용")
    args = parser.parse_args()
    main(args)