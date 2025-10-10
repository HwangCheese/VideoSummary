import subprocess
import os

def extract_audio(video_path: str, output_dir: str, base_name: str) -> str:
    """
    비디오 파일에서 16kHz 모노 WAV 오디오 파일을 추출

    Args:
        video_path (str): 원본 비디오 파일 경로
        output_dir (str): 출력을 저장할 디렉토리
        base_name (str): 출력 파일의 기본 이름

    Returns:
        str: 생성된 오디오 파일의 경로
    """
    print("\nWhisper용 오디오 추출", flush=True)
    audio_wav_path = os.path.join(output_dir, f"{base_name}.wav")

    # ffmpeg으로 원본 영상에서 오디오 추출
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            audio_wav_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        print(f"오디오 추출 실패: {e.stderr.decode('utf-8')}")
        raise
        
    return audio_wav_path