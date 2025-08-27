# VideoSummary Contribution Guide

VideoSummary 프로젝트에 기여해주셔서 감사합니다.

이 문서는 버그 리포트, 기능 개발, Pull Request 생성 등 프로젝트 기여에 필요한 전체 워크플로우를 안내합니다.   
기여자는 이 가이드를 숙지하고 따라주시길 바랍니다.

> 설치 방법: `INSTALL_KO.md`, `INSTALL_EN.md`  
> 실행 방법: `EXECUTE_KO.md`, `EXECUTE_EN.md` 

<br>

## 기여 워크플로우

프로젝트 기여는 다음의 표준 절차를 따릅니다.

1️⃣ Issue 생성  
2️⃣ Branch 생성  
3️⃣ 개발 및 Commit  
4️⃣ Pull Request  
5️⃣ 코드 리뷰 및 Merge  

<br>

## 1. 기여 분야

아래와 같은 분야에서 기여할 수 있습니다.

### 1.1. 기능 개발:
- 핵심 요약 로직 및 AI 모델 성능 개선
- 신규 API 엔드포인트 개발
- 프론트엔드 UI/UX 컴포넌트 추가 및 개선

### 1.2. 버그 수정 및 리팩토링:
- 코드 안정성 및 성능 최적화
- 플랫폼별 호환성 문제 해결
- 코드 가독성 및 유지보수성 향상을 위한 구조 개선

### 1.3. 문서화:
- 코드 내 주석 보강
- 트러블슈팅 가이드 작성

<br>

## 2. 개발 프로세스

### 2.1. 이슈(Issue) 생성

- 모든 코드 변경은 관련 이슈를 기반으로 진행하는 것을 원칙으로 합니다.
- 기능 개발 또는 버그 수정 전, 해당하는 이슈가 있는지 확인하고 없다면 `.github/ISSUE_TEMPLATE`를 사용하여 새로 생성합니다.
- **버그 리포트** 작성 시, **재현 단계, 기대 결과, 실제 결과**를 명확히 기술하고 관련 로그나 스크린샷을 첨부해주십시오.

### 2.2. 브랜치(Branch) 생성

- 모든 작업 브랜치는 develop 브랜치에서 분기합니다.
- 브랜치 이름은 작업 내용을 명확히 나타내도록 아래 컨벤션을 따릅니다.
    - **형식**: `타입/이슈번호-간단한-설명`
    - **예시**:
        - `feature/42-add-thumbnail-slider`
        - `fix/15-macos-opencv-compatibility`
        - `refactor/30-modularize-pipeline`   
    <br>
    
    ```
    # develop 브랜치 이동
    git checkout develop

    # develop 브랜치 이동
    git pull origin develop

    # 새 기능 브랜치 생성
    git checkout -b feature/42-add-thumbnail-slider
    ```
    

### 2.3. 개발 및 커밋(Commit)

- 본 프로젝트는 [**Conventional Commits**](https://www.conventionalcommits.org/ko/v1.0.0/) 명세에 따라 커밋 메시지를 작성합니다.
    - **타입**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` 중 선택
- **커밋 메시지 예시**:
    - `feat: Add thumbnail generation to pipeline`
    - `fix: Resolve video processing failure on macOS`
- 하나의 커밋은 논리적으로 독립된 최소 단위의 변경사항을 포함해야 합니다.

### 2.4. Pull Request(PR) 생성

- 작업이 완료된 브랜치는 `develop` 브랜치를 대상으로 Pull Request를 생성합니다.
- PR 생성 시 제공되는 템플릿의 모든 항목을 상세히 작성합니다.
    - **변경 사항 요약**: PR의 핵심 변경 내용을 기술합니다.
    - **테스트 방법**: 리뷰어가 변경 사항을 검증할 수 있는 절차를 안내합니다.
    - **관련 이슈**: PR 설명 본문에 `Closes #이슈번호`를 포함하여 관련 이슈가 자동으로 종료되도록 설정합니다.
- 모든 CI/CD 파이프라인이 통과하고, 할당된 리뷰어의 승인을 받으면 `Squash and merge` 방식으로 병합하는 것을 원칙으로 합니다.
