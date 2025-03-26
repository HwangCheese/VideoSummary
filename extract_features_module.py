# extract_features_module.py
import torch
import h5py
import numpy as np
import torchvision.models as models
import torchvision.transforms as transforms
import cv2
from sklearn.decomposition import PCA
import json
from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector
import concurrent.futures

def load_inception_v3(device):
    model = models.inception_v3(weights="DEFAULT")
    model.fc = torch.nn.Identity()
    return model.to(device).eval()

def extract_features(video_path, model, device):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    transform = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((299, 299)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
    ])
    features = []
    frame_count = 0
    success, frame = cap.read()
    while success:
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

def apply_pca(features, max_components=1024):
    n_samples, n_features = features.shape
    n_components = min(n_samples, max_components)
    if n_samples < 2:
        return features
    pca = PCA(n_components=n_components)
    pca_features = pca.fit_transform(features)
    if n_components < max_components:
        pad_width = ((0, 0), (0, max_components-n_components))
        pca_features = np.pad(pca_features, pad_width, mode='constant', constant_values=0)
    return pca_features

def save_to_h5(features, output_h5):
    with h5py.File(output_h5, "w") as hf:
        hf.create_dataset("features", data=features)

def detect_scenes(video_path, threshold=27.0, min_scene_len=45):
    video_manager = VideoManager([video_path])
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold, min_scene_len=min_scene_len))
    video_manager.set_downscale_factor()
    video_manager.start()
    scene_manager.detect_scenes(frame_source=video_manager)
    scene_list = scene_manager.get_scene_list()
    fps = video_manager.get_framerate()
    change_points = [[int(s.get_frames()), int(e.get_frames())-1] for s,e in scene_list]
    return change_points, fps

def save_segments_to_json(change_points, output_json, fps):
    segment_data = [
        {"segment_id":idx, "start_time":round(s/fps,2), "end_time":round(e/fps,2)}
        for idx,(s,e) in enumerate(change_points)
    ]
    with open(output_json,"w",encoding="utf-8") as f:
        json.dump(segment_data,f,ensure_ascii=False,indent=4)

def extract_features_chunk(video_path, output_h5, output_json, device="cuda"):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        model = load_inception_v3(device)
        future_feat = executor.submit(lambda: save_to_h5(apply_pca(extract_features(video_path,model,device)),output_h5))
        future_scene = executor.submit(lambda: save_segments_to_json(*detect_scenes(video_path),output_json))
        concurrent.futures.wait([future_feat, future_scene])
