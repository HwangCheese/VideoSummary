import torch
import numpy as np

# ✅ GPU 사용 가능 여부 확인
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🚀 실행 디바이스: {device}")

print("torch version:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())

if torch.cuda.is_available():
    print("GPU name:", torch.cuda.get_device_name(0))
    print("GPU count:", torch.cuda.device_count())
else:
    print("❌ CUDA not available. CPU 모드로 실행됩니다.")

# ✅ 체크포인트 로드 (GPU에서 실행)
checkpoint = torch.load("dataset/sl_module1_best_f1.pkl", map_location=device)

# ✅ 모델 가중치 가져오기
if "model_state_dict" in checkpoint:
    model_state = checkpoint["model_state_dict"]
elif "state_dict" in checkpoint:
    model_state = checkpoint["state_dict"]
else:
    model_state = checkpoint

# ✅ 가중치 평균값 계산
param_means = [p.mean().item() for p in model_state.values()]
print(f"✅ [GPU] 모델 가중치 평균값: {np.mean(param_means):.4f}")

# 확인용 예시 코드 (한번 확인 권장)
checkpoint = torch.load("dataset/sl_module1_best_f1.pkl", map_location="cpu")
print(type(checkpoint))  # dict 또는 OrderedDict 확인
print(checkpoint.keys())
