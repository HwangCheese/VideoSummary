import torch
import numpy as np
import h5py
from vasnet.vasnet_model import VASNet # VasNet 클래스 경로

def load_h5_features(h5_path):
    """
    H5 파일에서 비디오 프레임/세그먼트의 특징 벡터(features)를 로드

    Args:
        h5_path: 특징 파일(.h5) 경로
        
    Returns:
        np.ndarray: 로드된 특징 배열. 형태는 (시퀀스 길이, 특징 차원)
    """

    # H5 파일에서 프레임 특징(feature)을 로드
    with h5py.File(h5_path, "r") as hf:
        return np.array(hf["features"])

def predict_scores(model, features, device):
    """
    입력 특징(features)을 사용하여 모델을 통해 각 프레임의 중요도 점수를 계산.
    
    Args:
        model: 로드된 요약 모델 (VASNet)
        features: 프레임 특징 배열 (시퀀스 길이, 특징 차원)
        device: 연산 장치 ('cuda' 또는 'cpu')

    Returns:
        np.ndarray: 각 프레임의 중요도 점수 (0.0 ~ 1.0) 배열.
    """
    # 1. 모델을 통해 하이라이트 점수를 예측
    x = torch.from_numpy(features).float().to(device)
    
    # 2. 입력 텐서의 형태를 (배치 크기, 시퀀스 길이, 특징 차원)으로 맞춤
    if x.ndim == 2:
        x = x.unsqueeze(0) # 배치 차원 추가

    # 3. 마스크(Mask) 생성: 시퀀스 전체를 유효하다고 가정합니다.
    mask = torch.ones((x.shape[0], x.shape[1]), dtype=torch.bool).to(device)

    # 4. 모델 추론(Inference) 실행 
    with torch.no_grad():
        # **제공된 VasNet 코드의 forward는 (y, att_weights_) 두 값을 반환합니다.**
        scores, att_weights = model(x, mask) 
    
    # scores는 [bs, sequence_length] 형태이고, 중요도 점수 y(시그모이드 통과 후)입니다.
    scores = scores.cpu().numpy().squeeze()
    print(f"요약 점수 리스트: {scores} 길이: {len(scores)}")
    return scores

def load_model_checkpoint(model, ckpt_path, device):
    """
    지정된 체크포인트 파일에서 모델의 가중치(weights)를 로드
    
    Args:
        model: 가중치를 로드할 PyTorch 모델 인스턴스
        ckpt_path: 체크포인트(.pth) 파일 경로
        device: 체크포인트를 로드할 장치

    Returns:
        torch.nn.Module: 가중치가 적용된 모델 인스턴스
    """

    # 체크포인트에서 모델 파라미터 로드
    checkpoint = torch.load(ckpt_path, map_location=device)

    # 일반적인 저장 형태: 딕셔너리에 'model_state_dict' 키로 저장
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"], strict=False) 
    else:
        model.load_state_dict(checkpoint, strict=False)
    
    return model


def run_frame_importance_pipeline(ckpt_path, feature_h5, device):
    """
    사전 학습된 모델을 사용하여 비디오 세그먼트의 중요도 점수를 계산하는 메인 함수.
    
    Args:
        ckpt_path (str): 사전 학습된 VASNet 모델의 체크포인트 파일 경로
        feature_h5 (str): 특징 벡터가 저장된 .h5 파일 경로
        device (str, optional): 연산에 사용할 장치

    Returns:
        numpy.ndarray: 각 프레임/세그먼트의 중요도 점수 (scores)
    """

    print(f"사용 디바이스: {device}")

    # 1. 모델 초기화: VASNet
    model = VASNet(hidden_dim=1024) 
    
    # 2. 체크포인트 로드 및 모델 설정
    model = load_model_checkpoint(model, ckpt_path, device)
    model.to(device).eval()

    # 3. 특징 로드 및 점수 예측
    features = load_h5_features(feature_h5)
    
    # 4. 특징 로드 및 점수 예측
    scores = predict_scores(model, features, device=device)

    return scores