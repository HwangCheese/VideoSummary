# VideoSummary Installation Guide
This document provides an installation and environment setup guide for running VideoSummary in a local environment.  
**Written based on Windows 11 and macOS Sequoia.**  
<br>

## 0. Prerequisites

The following environment is required before running the project:

- **Git**  
  Version control and source code download
- **Conda**  
  Python virtual environment management  
  - [Anaconda](https://www.anaconda.com/products/distribution)  
  - [Miniconda](https://docs.conda.io/en/latest/miniconda.html)
- **Node.js & npm**  
  Express server execution
- **CUDA 11.8 or higher** (when using GPU)
- **Internet connection**  
  Package and model file downloads

> ⚠ Conda, Node.js, Git, etc. must be installed for smooth installation steps.
<br>

## 1. Clone Git Repository

```bash
git clone https://github.com/HwangCheese/VideoSummary.git
cd VideoSummary
```
<br>

## 2. Create Conda Virtual Environment

```bash
conda create -n vidsum python=3.12
conda activate vidsum
```
<br>

## 3. Install Dependencies

### 3-1. Node.js Server
Install Node modules required for Express server execution

```bash
cd VideoSummary/server
npm install
```

### 3-2. Python Packages

- **PyTorch Installation**
  - CPU Environment
    ```bash
    conda install pytorch==2.5.1 torchvision torchaudio cpuonly -c pytorch
    ```
  - GPU Environment (CUDA 11.8 based)
    ```bash
    conda install pytorch==2.5.1 torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia
    ```

- **Installation of decord or OpenCV depending on the operating system﻿**
    - **Windows/Linux: decord Installation**
      ```bash
      pip install decord
      ```
    > In Windows 64bit environment, `decord` Conda package is not available, so PIP usage is mandatory
  
    - **macOS: OpenCV Installation**
      ```bash
      pip install opencv-python
      ```
    - Verify OpenCV Installation
      ```bash
      python -c "import cv2; print(cv2.__version__)"
      ```
     
- **Basic Package Installation**
  ```bash
  conda install h5py scikit-learn -c conda-forge
  conda install -c conda-forge moviepy
  pip install decord
  pip install openai-whisper
  pip install ffmpeg-python
  ```
  > `moviepy`, `ffmpeg-python`, etc. can be installed using mixed Conda and PIP
<br>


## 4. Install TransNetV2
The `transnetv2` package is not registered on PyPI, so it must be **installed directly from the GitHub repository**.
### 4-1. Download and Install Source from GitHub

```bash
# Download ZIP file from GitHub website or use git clone
git clone https://github.com/soCzech/TransNetV2
cd TransNetV2
# Install to currently activated Conda environment
pip install .
```

### 4-2. Copy Model (weights) Files

Simply cloning from GitHub leaves the `transnetv2-weights` folder empty.  
To use pretrained models (weights), you need to download them directly from GitHub.

1. Prepare the `TransNetV2/inference/transnetv2-weights/` folder downloaded from GitHub
2. Check the TransNetV2 package path in the Conda virtual environment
   ```bash
   python -c "import transnetv2; print(transnetv2.__path__)"
   ```
3. Copy the `transnetv2-weights` folder as-is into the confirmed path
> Example: `[virtual_environment]/Lib/site-packages/transnetv2/transnetv2-weights`

### 4-3. Cleanup After Installation

- The original `TransNetV2` directory can be deleted
- Model (weights) files must be maintained within the virtual environment
<br>


## 5. Install TensorFlow
The `transnetv2` library requires tensorflow internally, so TensorFlow needs to be installed in the vidsum virtual environment.
- **TensorFlow Installation**
    ```bash
    pip install tensorflow==2.19.0
    ```
<br/>


## 6. Install Matplotlib
- **Matplotlib Installation**
    ```bash
    conda install -c conda-forge matplotlib
    ```
- **Verify Matplotlib Installation**
    ```bash
    python -c "import matplotlib.pyplot as plt; print('matplotlib OK')"
    ```    
<br/>


## 7. Download PGL-SUM Checkpoint

1. Navigate to the project root directory.
   ```bash
   cd VideoSummary
   ```
2. Create `dataset` directory (if it doesn't exist)
   ```bash
   mkdir dataset
   ```
3. Go to the [mrhisum GitHub](https://github.com/MRHiSum/MR.HiSum) page and click the **"Download PGL-SUM checkpoint"** link to download the ZIP file.
4. After extracting the downloaded ZIP file, place the `.pkl` file inside into the `dataset` folder.
   ```
   C:\VideoSummary-test\VideoSummary\dataset\filename.pkl
   ```
> ⚠ Do not change the filename and leave it as is. The model reads the file from that path.
