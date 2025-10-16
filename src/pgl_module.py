import torch
# import os
import numpy as np
import h5py
from networks.pgl_sum.pgl_sum import PGL_SUM

def load_h5_features(h5_path):
    # H5 파일에서 프레임 특징(feature)을 로드
    with h5py.File(h5_path, "r") as hf:
        return np.array(hf["features"])

def predict_scores(model, features, device):
    # 모델을 통해 하이라이트 점수를 예측
    x = torch.from_numpy(features).float().to(device)
    if x.ndim == 2:
        x = x.unsqueeze(0)
    mask = torch.ones((x.shape[0], x.shape[1]), dtype=torch.bool).to(device)
    with torch.no_grad():
        scores, _ = model(x, mask)
    scores = scores.cpu().numpy().squeeze()
    print(f"요약 점수 리스트: {scores} 길이: {len(scores)}")
    return scores

def load_model_checkpoint(model, ckpt_path, device):
    # 체크포인트에서 모델 파라미터 로드
    checkpoint = torch.load(ckpt_path, map_location=device)
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"], strict=False)
    else:
        model.load_state_dict(checkpoint, strict=False)
    return model


def run_pgl_module(ckpt_path, feature_h5, device):
    """
    PGL-SUM 모델을 사용하여 각 세그먼트의 중요도 점수를 계산하고, Knapsack 알고리즘으로 최종 세그먼트를 선택한다.
    Args:
        ckpt_path (str): 사전 학습된 PGL-SUM 모델의 체크포인트(.pkl) 파일 경로
        feature_h5 (str): 특징 벡터가 저장된 .h5 파일 경로
        device (str, optional): 연산에 사용할 장치. 기본값: cpu

    Returns:
        list: 최종적으로 선택된 세그먼트 객체(dict)들의 리스트
    """

    print(f"사용 디바이스: {device}")


    # 모델 초기화 및 체크포인트 로드

    model = PGL_SUM(input_size=1024, output_size=1024, num_segments=4, heads=8, fusion="add", pos_enc="absolute")
    model = load_model_checkpoint(model, ckpt_path, device)
    model.to(device).eval()

    features = load_h5_features(feature_h5)
    scores = predict_scores(model, features, device=device)

    return scores