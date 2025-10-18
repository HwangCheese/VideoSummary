import importlib

def has_cuda() -> bool:
    """CUDA 사용 가능 여부를 반환"""
    try:
        import torch
        return bool(torch.cuda.is_available())
    except Exception:
        return False


def resolved_device() -> str:
    """CUDA 가능하면 cuda, 아니면 cpu"""
    return "cuda" if has_cuda() else "cpu"


def import_scene_module(use_cuda: bool):
    """CUDA 여부에 따라 적절한 장면 감지 모듈 반환"""
    module_name = "scene_detection_module" if use_cuda else "scene_detection_module_tf"
    try:
        mod = importlib.import_module(module_name)
        return mod.run_scene_detect_pipeline
    except Exception as e:
        raise ImportError(f"장면 전환 모듈 로드 실패: {module_name} ({e})")
