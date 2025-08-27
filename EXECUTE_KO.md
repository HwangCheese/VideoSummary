# VideoSummary Execution Guide

본 문서는 VideoSummary를 실행하는 방법을 안내합니다.  
VideoSummary는 **웹 서버를 통해 브라우저에서 사용**하거나 **파이프라인을 직접 실행**할 수 있습니다.  
<br>

## 방법 1: 웹 서버 실행 (권장)

웹 서버를 실행하면 브라우저에서 영상을 업로드하고 바로 요약할 수 있습니다.

### 1. Conda 환경 활성화

```bash
conda activate vidsum
```

### 2. 서버 시작

```bash
cd VideoSummary/server
npm start
```

### 3. 웹 인터페이스 접속

웹 브라우저에 다음 주소로 이동:
```
http://localhost:3000
```

### 4. 웹 인터페이스 사용법

1. 비디오 파일 업로드
2. 요약 매개변수 설정:
   - **중요도 가중치** (0 \~ 1): 낮을수록 스토리 중심 요약, 높을수록 하이라이트 중심 요약
   - **목표 시간**: 요약 영상의 목표 길이.
3. "요약 시작" 클릭
4. 처리 완료까지 대기
5. 생성된 요약 영상 및 관련 파일 다운로드  
<br>

## 방법 2: 파이프라인 직접 실행

직접 파이프라인을 실행하면 세부 옵션을 조정하거나 다른 시스템과 통합할 수 있습니다.

### 1. Conda 환경 활성화

```bash
conda activate vidsum
```

### 2. 소스 디렉토리 이동

```bash
cd VideoSummary/src
```

### 3. 파이프라인 실행

```bash
python pipeline.py --video_path [비디오_경로] --fine_ckpt [체크포인트_경로] --output_dir [출력_디렉토리] [옵션들]
```

### 필수 매개변수

- `--video_path`: 입력 비디오 파일 경로 (.mp4)
- `--fine_ckpt`: PGL-SUM 체크포인트 파일 경로 (.pkl)
- `--output_dir`: 출력 파일을 저장할 디렉토리

### 선택적 매개변수
| 옵션                    | 기본값  | 설명                                                |
| --------------------- | ---- | ------------------------------------------------- |
| `--fps`               | 1.0  | 특징 추출을 위한 초당 프레임 수                                |
| `--device`            | cpu  | 사용할 장치: `cpu` 또는 `cuda`                           |
| `--alpha`             | 0.7  | 평균 점수 계산 가중치                                      |
| `--std_weight`        | 0.3  | 점수 계산 표준편차 가중치                                    |
| `--model_size`        | base | PGL-SUM 모델 크기 (`tiny`, `base`, `small`, `medium`) |
| `--importance_weight` | 0.1  | 중요도 가중치(0\~1). <br> 낮을수록 스토리 중심 요약, 높을수록 하이라이트 중심 요약    |
| `--budget_time`       | -    | 목표 요약 길이(초). <br> 지정하지 않으면 원본 영상 길이의 0.2배로 자동 설정    |

### 사용 예시

**기본 사용법:**

```bash
python pipeline.py \
  --video_path "input/my_video.mp4" \
  --fine_ckpt "../dataset/checkpoint_file.pkl" \
  --output_dir "output"
```

**사용자 정의 매개변수를 사용한 사용법:**
```bash
python pipeline.py \
  --video_path "input/lecture.mp4" \
  --fine_ckpt "../dataset/checkpoint_file.pkl" \
  --output_dir "output" \
  --device "cuda" \
  --importance_weight 0.8 \
  --budget_time 300 \
  --model_size "medium"
```

### 파이프라인 출력 파일

파이프라인은 출력 디렉토리에 다음 파일들을 생성합니다:

- `highlight_[video_name].mp4`: 요약 영상
- `[video_name]_refined_segments.json`: 최종 선택된 세그먼트
- `[video_name]_reScript.json`: 요약을 위해 재구성된 자막
- `[video_name]_score.json`: 품질 점수
- `thumbnails/`: 생성된 썸네일 이미지들
- 디버깅 및 분석을 위한 다양한 중간 파일들
