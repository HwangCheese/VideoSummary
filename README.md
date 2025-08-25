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
