# VideoSummary Installation Guide
본 문서는 VideoSummary를 로컬 환경에서 실행하기 위한 설치 및 환경 설정 가이드입니다.  
**Windows 11 및 macOS sequoia 기준으로 작성되었습니다.**  
<br/>

## 0. 사전 요구사항

프로젝트를 실행하기 전에 다음 환경이 필요합니다:

- **Git**  
  버전 관리 및 소스 코드 다운로드

- **Conda**  
  Python 가상환경 관리  
  - [Anaconda](https://www.anaconda.com/products/distribution)  
  - [Miniconda](https://docs.conda.io/en/latest/miniconda.html)

- **Node.js & npm**  
  Express 서버 실행

- **CUDA 11.8 이상** (GPU 사용 시)

- **인터넷 연결**  
  패키지 및 모델 파일 다운로드


> ⚠ Conda, Node.js, Git 등이 설치되어 있어야 설치 단계가 원활합니다.
<br/>


## 1. Git 저장소 복제
```bash
git clone https://github.com/HwangCheese/VideoSummary.git
cd VideoSummary
```
<br/>

## 2. Conda 가상환경 생성
```bash
conda create -n vidsum python=3.12
conda activate vidsum
```
<br/>

## 3. 의존성 설치
### 3-1. Node.js 서버
Express 서버 실행에 필요한 Node 모듈 설치
```bash
cd VideoSummary/server
npm install
```
### 3-2. Python 패키지

- **PyTorch 설치**
  - CPU 환경
    ```bash
    conda install pytorch==2.5.1 torchvision torchaudio cpuonly -c pytorch
    ```
  - GPU 환경 (CUDA 11.8 기준)
    ```bash
    conda install pytorch==2.5.1 torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia
    ```

- **운영체제에 따라 decord 또는 OpenCV 설치**
    - **Windows/Linux: decord 설치**
      ```bash
      pip install decord
      ```
    > Windows 64bit 환경에서는 `decord` Conda 패키지가 없으므로 PIP 사용 필수
  
    - **macOS: OpenCV 설치**
      ```bash
      pip install opencv-python
      ```
    - OpenCV 설치 후 확인
      ```bash
      python -c "import cv2; print(cv2.__version__)"
      ```    

  
- **기본 패키지 설치**
  ```bash
  conda install h5py scikit-learn -c conda-forge
  conda install -c conda-forge moviepy
  pip install openai-whisper
  pip install ffmpeg-python
  ```
  > `moviepy`, `ffmpeg-python` 등은 Conda와 PIP 혼합 설치 가능
<br/>


## 4. TransNetV2 설치
`transnetv2` 패키지는 PyPI에 등록되어 있지 않으므로 **GitHub 저장소에서 직접 설치**해야 합니다.

### 4-1. GitHub에서 소스 다운로드 및 설치
```bash
# GitHub 웹사이트에서 ZIP 파일 다운로드 또는 git clone
git clone https://github.com/soCzech/TransNetV2
cd TransNetV2

# 현재 활성화된 Conda 환경에 설치
pip install .
```

### 4-2. 모델(weights) 파일 복사
GitHub에서 clone만 하면 `transnetv2-weights` 폴더는 비어 있습니다. <br/>
pretrained 모델(weights)을 사용하려면 GitHub에서직접 다운로드해야 합니다.
1. GitHub에서 다운로드한 `TransNetV2/inference/transnetv2-weights/` 폴더 준비
2. Conda 가상환경에서 TransNetV2 패키지 경로 확인
```bash
python -c "import transnetv2; print(transnetv2.__path__)"
```
3. 확인된 경로 안에 `transnetv2-weights` 폴더를 그대로 복사
> 예:`[가상환경]/Lib/site-packages/transnetv2/transnetv2-weights`

### 4-3. 설치 후 정리
- 원본 `TransNetV2` 디렉토리는 삭제 가능
- 모델(weights) 파일은 반드시 가상환경 내에 유지
<br/>


## 5. TensorFlow 설치
`transnetv2` 라이브러리는 내부적으로 tensorflow를 필요로 하므로, vidsum 가상환경에 TensorFlow 설치가 필요합니다.
- **TensorFlow 설치**
    ```bash
    pip install tensorflow==2.19.0
    ```
<br/>


## 6. Matplotlib 설치
- **Matplotlib 설치**
    ```bash
    conda install -c conda-forge matplotlib
    ```
- **Matplotlib 설치 후 확인**
    ```bash
    python -c "import matplotlib.pyplot as plt; print('matplotlib OK')"
    ```    
<br/>

## 7. PGL-SUM 체크포인트 다운로드

1. 프로젝트 루트 디렉토리로 이동합니다.
    ```bash
    cd VideoSummary
    ```
2. `dataset` 디렉토리 생성 (없는 경우)
    ```bash
    mkdir dataset
    ```
3. [mrhisum GitHub](https://github.com/MRHiSum/MR.HiSum) 페이지에서 **"Download PGL-SUM checkpoint"** 링크를 클릭하여 ZIP 파일을 다운로드합니다.
4. 다운로드한 ZIP 파일을 압축 해제한 후, 그 안의 `.pkl` 파일을 `dataset` 폴더 안에 넣습니다.
    ```
    C:\VideoSummary-test\VideoSummary\dataset\파일명.pkl
    ```
> ⚠ 파일명을 변경하지 말고 그대로 두어야 합니다. 모델이 해당 경로에서 파일을 읽습니다.
<br/>
<br/>
