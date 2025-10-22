# VideoSummary Execution Guide

This document provides instructions on how to run VideoSummary.  
VideoSummary can be used either **through a web server in a browser** or by **directly executing the pipeline**.  
<br>

## Method 1: Web Server Execution (Recommended)

Running the web server allows you to upload videos and create summaries directly in your browser.

### 1. Activate Conda Environment

```bash
conda activate vidsum
```

### 2. Start the Server

```bash
cd VideoSummary/server
npm start
```

### 3. Access the Web Interface

Open your web browser and navigate to:
```
http://localhost:3000
```

### 4. Using the Web Interface

1. Upload video file
2. Configure summarization parameters:
   - **Importance Weight** (0 ~ 1): Lower values create story-focused summaries, higher values create highlight-focused summaries
   - **Target Duration**: Target length for the summary video
3. Click "Start Summarization"
4. Wait for processing to complete
5. Download the generated summary video and related files  
<br>

## Method 2: Direct Pipeline Execution

Direct pipeline execution allows you to adjust detailed options or integrate with other systems.

### 1. Activate Conda Environment

```bash
conda activate vidsum
```

### 2. Navigate to Source Directory

```bash
cd VideoSummary/src
```

### 3. Run the Pipeline

```bash
python pipeline.py --video_path [VIDEO_PATH] --fine_ckpt [CHECKPOINT_PATH] --output_dir [OUTPUT_DIR] [OPTIONS]
```

### Required Parameters

- `--video_path`: Input video file path (.mp4)
- `--fine_ckpt`: PGL-SUM checkpoint file path (.pkl)
- `--output_dir`: Directory to save output files

### Optional Parameters

| Option                | Default | Description                                                                              |
| --------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `--fps`               | 1.0     | Frames per second for feature extraction                                                 |
| `--device`            | cpu     | Device to use: `cpu` or `cuda`                                                          |
| `--alpha`             | 0.7     | Weight for average score calculation                                                     |
| `--std_weight`        | 0.3     | Weight for standard deviation in scoring                                                 |
| `--model_size`        | base    | Whisper model size (`tiny`, `base`, `small`, `medium`)                                   |
| `--importance_weight` | 0.1     | Importance weight (0~1). <br> Lower = story-focused summary, higher = highlight-focused summary |
| `--budget_time`       | -       | Target summary duration (seconds). <br> If not specified, automatically set to 0.2x original video length |

### Example Usage

**Basic usage:**
```bash
python pipeline.py \
  --video_path "input/my_video.mp4" \
  --fine_ckpt "../dataset/vasnet1_best_f1.pkl" \
  --output_dir "../output"
```

**Usage with custom options:**
```bash
python pipeline.py \
  --video_path "input/lecture.mp4" \
  --fine_ckpt "../dataset/vasnet1_best_f1.pkl" \
  --output_dir "../output" \
  --device "cuda" \
  --importance_weight 0.8 \
  --budget_time 300 \
  --model_size "medium"
```

### Pipeline Output Files

The pipeline generates the following files in the output directory:

- `highlight_[video_name].mp4`: Summary video
- `[video_name]_refined_segments.json`: Final selected segments  
- `[video_name]_reScript.json`: Reconstructed transcripts for summary
- `[video_name]_score.json`: Quality scores
- `thumbnails/`: Generated thumbnail images
- Various intermediate files for debugging and analysis
