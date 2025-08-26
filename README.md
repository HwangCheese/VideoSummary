<p align="center">
  <img 
    src="https://capsule-render.vercel.app/api?type=waving&color=auto&height=200&text=🧀%20VideoSummary%20-%20영상%20요약%20웹%20시스템&textColor=ffffff&fontSize=45&animation=twinkling&section=header" 
    width="100%" 
  />
</p>
<p align="center"><i>VideoSummary : 하이라이트와 스토리의 비율 조절이 가능한 영상 요약 시스템</i></p>

## ❤️ 작품 개요

### 1. 개발 배경

  오늘날 영상 콘텐츠 폭증에 따라, 사용자들은 필요한 정보나 흥미로운 구간만을 빠르게 확인하고자 하는 요구가 증가하고 있다. 또한 영상을 쉽게 검색하도록 하기 위해서는 전체의 긴 영상을 요약한 짧은 요약 영상을 제공하는 것이 필연적이다. 

  지금까지 대부분의 영상 요약 기술은 원본 영상의 중요한 부분들을 선택하여 원본 영상의 의미를 짧게 담아내는데 초점을 두었다. 하지만, 실존하는 영상 요약 응용들은 단순히 중요한 장면만 선택하는 방식으로는 충분하지 않다. 비율은 다르지만 중요한 장면과 이야기의 흐름을 보여주는 장면이 균형 있게 포함된 요약 기술이 필요하다.

---

<p align="center"><i>따라서 본 팀은 영상에서 중요한 부분을 나타내는 <strong>하이라이트 장면</strong>들과 <br>영상 전체 흐름을 담아내는 <strong>스토리를 전달하는 장면</strong>을 배합하여 요약 영상을 생성하는 VideoSummary 시스템을 개발하였다.</i></p>

---
<br>

### 2. 솔루션 및 개발 내용 요약

- **영상 형태의 요약 결과 제공**
    
     VideoSummary는 기존 텍스트 기반 요약과 달리, 실제 영상 형태의 요약 결과를 제공한다.
    
- **가중치 W와 다양성 기여도 개념 도입**
    
    중요한 장면(하이라이트)와 이야기의 흐름(스토리)의 비율 조절을 위한 가중치 w와 장면별 다양성 기여도라는 두 가지 새로운 개념을 도입한다.
    
- **가중치 W와 다양성 기여도를 결합한 알고리즘 개발**
    
    가중치 w와 다양성 기여도를 결합하여, 사용자가 직접 조절할 수 있는 알고리즘을 개발하였다. 이를 통해 중요도 점수와 다양성 기여도를 종합적으로 평가하는 세그먼트(장면) 선택 프레임워크를 제공하며, 다양한 요약 목적과 사용자 선호에 부합하는 맞춤형 영상 요약이 가능하다.
    
- **자연스러운 장면 전환 및 음성 연결**
    
    AI 기반 영상 처리 기술을 활용한 자연스러운 장면 전환과 음성 연결을 보장하는 세그먼트(장면)
    길이 재조정 알고리즘을 개발하였다.
    
- **반응형 웹으로 구현**
    
    반응형 웹으로 구현되어 다양한 기기 환경에서 접근 가능하며, 언제 어디서든 쉽게 사용 가능하다.
  
<br><br>

## :wrench: 시스템 구조

<img width="1460" height="785" alt="Image" src="https://github.com/user-attachments/assets/46d41365-c0c7-4bd7-b0b2-5e2a7078c8af" />
<br>
  VideoSummary 시스템은 웹 기반 시스템으로 구현하였으며, 전체 시스템은 웹 클라이언트 애플리케이션과 웹 서버 애플리케이션으로 구성된다. 웹 클라이언트 애플리케이션은 사용자 인터페이스 역할을 담당하며, 웹페이지 형태의 UI를 제공한다. 사용자는 이를 통해 영상 업로드, 영상 요약 요청, 요약 결과 확인 등의 핵심 기능을 수행할 수 있다.

  웹 서버 애플리케이션은 Node.js 기반의 Express 웹 프레임워크 위에서 개발되었으며, 영상 요약의 전체 처리 과정을 담당한다. 이 과정에서 다양한 AI 모델이 활용되며, 이러한 모델들은 서버의 저장소에 저장되어 있다. 시스템은 영상 요약이 완료된 후 요약 영상과 원본 영상을 모두 서버의 저장소에 보관하고, 최종 요약 결과를 웹 클라이언트 애플리케이션으로 전송한다.

<br><br>

## 👀 기대 효과
<details>
<summary><b>높은 정량적 성능 달성</b></summary>
<div>
  &nbsp;본 팀은 VideoSummary가 생성하는 요약 영상의 정확성을 정량적으로 검증하였다.
  YouTube ‘Most Replayed’ 구간과의 일치율 분석에서 하이라이트 중심 요약은 평균 93.75%의 높은 적중률을 보였으며,
  LLM 기반 시놉시스 비교를 통해 평가한 스토리 중심 요약의 일치도는 평균 92.8%로 나타났다. 
<br>
  &nbsp;이러한 검증 결과를 바탕으로, 사용자는 시스템이 제공하는 요약 결과를 신뢰할 수 있으며,
  자신의 목적에 맞게 하이라이트와 스토리 중심 요약의 비율을 조절함으로써 효율적이고 만족스러운 영상 요약을 경험할 수 있다.
</div>
</details>

<details>
<summary><b>사용자 맞춤형 요약 생성</b></summary>
<div>
  &nbsp;사용자는 요약 영상의 “요약 스타일”과 “길이(시간)”를 개인의 필요에 따라 직접 설정할 수 있으며,
  VideoSummary 시스템의 요약 알고리즘이 이러한 사용자 설정을 반영하여 맞춤형 요약 영상을 자동 생성한다.
  이를 통해 사용자는 자신의 목적과 용도에 적합한 요약 영상을 제공받을 수 있다.
</div>
</details>

<details>
<summary><b>기술의 실효성 입증 및 구현 모델 제시</b></summary>
  <div>
  &nbsp;본 프로젝트는 제안한 기술을 실제 웹 서비스로 구현하여 그 실용성을 검증했을 뿐만 아니라,
  성능 검증을 통해 우수한 성능을 객관적인 데이터로 입증했다.
  이처럼 아이디어를 실제로 구현하고 데이터로 증명한 과정 전체는 향후 유사 시스템을 개발하려는 연구자나 개발자들에게 구체적이고 신뢰할 수 있는 구현 모델을 제시하는 선례가 될 것이다.
</div>
</details>

<details>
<summary><b>기술 개방을 통한 개발 생태계 기여</b></summary>
<div>
  &nbsp;본 시스템의 핵심 프레임워크를 공개 소프트웨어 형태로 배포함으로써, 누구나 자유롭게 기술을 활용하고 목적에 맞게 확장할 수 있는 기반을 마련한다.
  결과적으로 본 프로젝트는 단순한 하나의 솔루션을 넘어, 영상 AI 개발 생태계 전반의 혁신과 성장에 기여할 것으로 기대된다. 
</div>
</details>
<br><br>

## 👍 활용 분야
<details>
<summary><b>높은 범용성</b></summary>
<div>
  &nbsp;웹 기반 서비스로 언제 어디서나 접속할 수 있으며, 반응형 웹으로 구현되어 PC, 태블릿, 스마트폰 등 다양한 기기에서 손쉽게 사용할 수 있다.
</div>
</details>

<details>
<summary><b>동영상 플랫폼에서의 예고편 생성</b></summary>
<div>
  &nbsp;YouTube, Netflix 등의 플랫폼에서 긴 콘텐츠의 예고편이나 하이라이트 영상을 자동으로 생성할 수 있다. 
  사용자 취향에 따라 액션 중심의 하이라이트나 스토리 흐름을 담은 예고편을 선택적으로 제공하여 콘텐츠 발견과 선택을 돕는다.
</div>
</details>

<details>
<summary><b>효율적인 영상 검색 및 탐색</b></summary>
<div>
  &nbsp;요약 영상은 핵심 세그먼트의 특징만 인덱싱하므로 메타데이터 크기가 줄어 저장 및 처리 비용을 낮춘다. 
  이로 인해 대규모 영상 레포지토리를 보유한 동영상 플랫폼이나 교육 기관 등에서 사용자가 원하는 내용을 빠르게 찾아낼 수 있으며, 응답 속도 향상으로 실시간에 가까운 검색이 가능하다.
</div>
</details>

<details>
<summary><b>개인 미디어 관리 및 공유</b></summary>
<div>
  &nbsp;사용자는 여행, 가족 행사 등 개인적으로 촬영한 긴 영상을 간편하게 요약하여 핵심 순간만 공유할 수 있다. 
  이를 통해 소셜 미디어에 게시하거나 지인과 빠르고 가볍게 추억을 나눌 수 있다. 
</div>
</details>

<details>
<summary><b>공공기관 및 기업의 영상 보고서 활용</b></summary>
<div>
  &nbsp;공공기관이나 기업에서 주최하는 장시간의 행사, 회의, 세미나 영상을 자동으로 요약하여 핵심 내용만 담은 영상 보고서로 활용할 수 있다. 
  이를 통해 내부 구성원 간의 신속한 정보 공유 및 기록 보관이 용이해진다. 
</div>
</details>

<details>
<summary><b>CCTV 영상 데이터 분석</b></summary>
<div>
  &nbsp;장시간 녹화된 CCTV 영상을 요약하여 시간대별 유동 인구나 전반적인 움직임 등 데이터 패턴을 분석하는 데 활용할 수 있다. 
  예를 들어, 매장의 시간대별 고객 방문 추이를 파악하거나 특정 구역의 일일 활동량을 직관적으로 확인할 수 있다.
</div>
</details>
<br><br>

### - 개발 도구
![apple](https://img.shields.io/badge/apple-000000?style=for-the-badge&logo=apple&logoColor=white)
![Windows11](https://img.shields.io/badge/windows11-00008B?style=for-the-badge&logoColor=white)
![vscode](https://img.shields.io/badge/vscode-8B008B?style=for-the-badge&logoColor=white)


### - 개발 언어
![python](https://img.shields.io/badge/python-0000FF?style=for-the-badge&logo=python&logoColor=white)
![html](https://img.shields.io/badge/HTML-FF0000?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-FF1493?style=for-the-badge&logo=css3&logoColor=white)
![Javascript](https://img.shields.io/badge/Javascript-FFFF00?style=for-the-badge&logo=Javascript&logoColor=black)

<br><br>


## 🎈사용자 메뉴얼

- <b>랜딩페이지
  <p align="center">
  <img src="https://github.com/user-attachments/assets/531f3f60-38df-410b-9a55-4f2e1f10e36f" width="600">
  </p>
  <br>
  
- 영상 첨부
  <p align="center">
  <img src="https://github.com/user-attachments/assets/f7be9363-fa4a-4099-85c7-58b48117ffd0" width="600">
  </p>
  <br>

- 요약 방식 조절
  <p align="center">
  <img src="https://github.com/user-attachments/assets/1157ecde-9427-4f5d-97c3-550a22d5bf92" width="600">
  </p>
  <br>
  
- 요약 과정
  <p align="center">
  <img src="https://github.com/user-attachments/assets/7e633c4f-2aa5-496b-a4f4-e08259a31e71" width="600">
  </p>
  <br>
  
- 결과 화면
  <p align="center">
  <img src="https://github.com/user-attachments/assets/e886bee7-b87e-48de-b84e-d65c3aa8790f" width="600">
  </p>
  <br>
  
- 수동 편집
  <p align="center">
  <img src="https://github.com/user-attachments/assets/d52cfdfe-aa99-4c88-84c8-dd06606e27d1" width="600">
  </p>
  <br>

  <br><br>
  
## 🎬 시연 영상
<div align="center">
  <a href="https://youtu.be/NDl8Q00G98E" target="_blank"> 
    <img src="https://github.com/user-attachments/assets/fe4b0431-5ba8-49bb-9fc2-43ea503f278f" width="600">
  </a>
</div>
<br><br>
  
## 📃 라이선스

Copyright (c) 2023  
All rights reserved.

This code is provided for **academic, non-commercial use only**. Redistribution and use in source and binary forms, with or without modification, are permitted for academic non-commercial use provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.  
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation provided with the distribution.

This software is provided by the authors "as is" and any express or implied warranties, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose are disclaimed.  
In no event shall the authors be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, procurement of substitute goods or services; loss of use, data, or profits; or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort (including negligence or otherwise) arising in any way out of the use of this software, even if advised of the possibility of such damage.

---
