import numpy as np
import pandas as pd
import json
import os
import matplotlib.pyplot as plt
from typing import List, Dict, Optional

# ============================================================================
# 데이터 로드
# ============================================================================

def load_json_data(file_path: str) -> List[Dict]:
    """JSON 파일 로드"""
    if not os.path.exists(file_path):
        print(f"오류: 파일을 찾을 수 없습니다 -> {file_path}")
        return []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"JSON 파일 로드 오류 ({file_path}): {e}")
        return []

# ============================================================================
# 지표 계산 함수
# ============================================================================

def calc_mean_importance(extracted_ids: List[int], importance_map: Dict[int, float]) -> float:
    """평균 중요도 계산"""
    if not extracted_ids:
        return 0.0
    scores = [importance_map.get(i, 0) for i in extracted_ids]
    return np.mean(scores)

def calc_id_interval_std(extracted_ids: List[int]) -> float:
    """ID 간격 표준편차 계산"""
    if len(extracted_ids) < 2:
        return 0.0
    intervals = np.diff(sorted(extracted_ids))
    return np.std(intervals)

def calc_time_interval_std(extracted_ids: List[int], mid_time_map: Dict[int, float]) -> float:
    """시간 간격 표준편차 계산"""
    if len(extracted_ids) < 2:
        return 0.0
    mid_times = [mid_time_map[i] for i in extracted_ids if i in mid_time_map]
    if len(mid_times) < 2:
        return 0.0
    intervals = np.diff(sorted(mid_times))
    return np.std(intervals)

def calc_gini_coefficient(extracted_ids: List[int], total_scenes: int) -> float:
    """Gini 계수 계산"""
    if total_scenes == 0 or not extracted_ids:
        return 0.0
    
    distribution = np.zeros(total_scenes)
    for seg_id in extracted_ids:
        if 0 <= seg_id < total_scenes:
            distribution[seg_id] = 1.0
    
    sorted_dist = np.sort(distribution)
    cumsum = np.cumsum(sorted_dist)
    n_extracted = np.sum(distribution)
    
    if n_extracted == 0:
        return 0.0
    
    area = (np.sum(cumsum * 2) - cumsum[-1]) / (total_scenes * n_extracted)
    return 1.0 - area

# ============================================================================
# 통합 분석 함수
# ============================================================================

def analyze_summary(
    importance_file: str, 
    extracted_file: str,
    metrics: List[str] = ['id_interval', 'time_interval', 'gini']
) -> pd.DataFrame:
    """
    통합 분석 함수 - 선택한 지표들로 분석 수행
    
    Args:
        importance_file: 중요도 JSON 파일 경로
        extracted_file: 추출 결과 JSON 파일 경로
        metrics: 계산할 지표 리스트
            - 'id_interval': ID 간격 표준편차
            - 'time_interval': 시간 간격 표준편차
            - 'gini': Gini 계수
    
    Returns:
        분석 결과 DataFrame
    """
    # 데이터 로드
    importance_data = load_json_data(importance_file)
    extracted_data = load_json_data(extracted_file)
    
    if not importance_data or not extracted_data:
        print("데이터 로드 실패")
        return pd.DataFrame()
    
    # 전처리
    df_imp = pd.DataFrame(importance_data).set_index('segment_id')
    importance_map = df_imp['combined_score'].to_dict()
    total_scenes = len(df_imp)
    
    # 시간 정보 확인
    has_time = 'start_time' in df_imp.columns and 'end_time' in df_imp.columns
    mid_time_map = {}
    if has_time:
        df_imp['mid_time'] = (df_imp['start_time'] + df_imp['end_time']) / 2
        mid_time_map = df_imp['mid_time'].to_dict()
    
    # 분석 수행
    results = []
    for entry in extracted_data:
        alpha = entry.get('alpha_weight')
        ids = entry.get('extracted_segment_ids', [])
        if alpha is None:
            continue
        
        row = {
            'alpha_weight': alpha,
            '평균_중요도': calc_mean_importance(ids, importance_map)
        }
        
        # 선택된 지표 계산
        if 'id_interval' in metrics:
            row['ID_간격_표준편차'] = calc_id_interval_std(ids)
        
        if 'time_interval' in metrics and has_time:
            row['시간_간격_표준편차'] = calc_time_interval_std(ids, mid_time_map)
        
        if 'gini' in metrics:
            row['Gini_계수'] = calc_gini_coefficient(ids, total_scenes)
        
        results.append(row)
    
    # DataFrame 생성 및 정렬
    df = pd.DataFrame(results).sort_values('alpha_weight', ascending=False)
    df['비율_스토리_하이라이트'] = df['alpha_weight'].apply(
        lambda a: f"{int((1-a)*10)}:{int(a*10)}"
    )
    
    return df

# ============================================================================
# 시각화 함수
# ============================================================================

def plot_analysis(df: pd.DataFrame, output_path: str):
    """분석 결과를 시각화하여 저장"""
    if df.empty:
        print("시각화할 데이터가 없습니다.")
        return
    
    # 지표 컬럼 찾기
    metric_cols = [c for c in df.columns 
                   if c not in ['alpha_weight', '비율_스토리_하이라이트']]
    
    if not metric_cols:
        print("시각화할 지표가 없습니다.")
        return
    
    # 한글 폰트 설정 (Mac)
    plt.rcParams['font.family'] = 'AppleGothic'
    plt.rcParams['axes.unicode_minus'] = False
    
    # 서브플롯 개수 결정
    n_metrics = len(metric_cols)
    fig, axes = plt.subplots(n_metrics, 1, figsize=(12, 4*n_metrics))
    
    if n_metrics == 1:
        axes = [axes]
    
    df_sorted = df.sort_values('alpha_weight')
    
    # 각 지표별 플롯
    for idx, col in enumerate(metric_cols):
        ax = axes[idx]
        
        # 라인 플롯
        ax.plot(df_sorted['alpha_weight'], df_sorted[col], 
                marker='o', linewidth=2, markersize=8, color='#2E86AB')
        
        # 그리드
        ax.grid(True, alpha=0.3, linestyle='--')
        
        # 라벨
        ax.set_xlabel('α (하이라이트 가중치)', fontsize=12, fontweight='bold')
        ax.set_ylabel(col.replace('_', ' '), fontsize=12, fontweight='bold')
        ax.set_title(f'{col.replace("_", " ")} 변화 추이', 
                    fontsize=14, fontweight='bold', pad=15)
        
        # x축 눈금
        ax.set_xticks([i/10 for i in range(11)])
        ax.set_xticklabels([f'{i/10:.1f}' for i in range(11)])
        
        # 배경색
        ax.set_facecolor('#F8F9FA')
        
        # 범위 표시
        min_val, max_val = df_sorted[col].min(), df_sorted[col].max()
        ax.axhline(y=min_val, color='green', linestyle=':', alpha=0.5, 
                  label=f'최소: {min_val:.4f}')
        ax.axhline(y=max_val, color='red', linestyle=':', alpha=0.5, 
                  label=f'최대: {max_val:.4f}')
        ax.legend(loc='best')
        
        # 주요 포인트 강조
        ax.scatter([0.0, 1.0], 
                  [df_sorted[df_sorted['alpha_weight']==0.0][col].values[0],
                   df_sorted[df_sorted['alpha_weight']==1.0][col].values[0]], 
                  color='red', s=100, zorder=5)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"\n[시각화 완료] {output_path}")

# ============================================================================
# 출력 함수
# ============================================================================

def display_results(df: pd.DataFrame):
    """분석 결과 간결하게 출력"""
    if df.empty:
        print("출력할 결과가 없습니다.")
        return
    
    print("\n" + "=" * 80)
    print("         하이라이트 가중치(α)에 따른 혼합 추이 분석 결과")
    print("=" * 80)
    
    # 핵심 통계만 출력
    df_sorted = df.sort_values('alpha_weight')
    metric_cols = [c for c in df.columns 
                   if c not in ['alpha_weight', '비율_스토리_하이라이트']]
    
    print("\n[α = 0.0 → 1.0 변화 요약]")
    print("-" * 80)
    
    for col in metric_cols:
        val_start = df_sorted[col].iloc[0]   # α=0.0
        val_end = df_sorted[col].iloc[-1]     # α=1.0
        change = val_end - val_start
        trend = "↗️ 증가" if change > 0 else "↘️ 감소"
        
        print(f"{col.replace('_', ' '):20s}: {val_start:7.4f} → {val_end:7.4f}  "
              f"({change:+.4f})  {trend}")
    
    print("-" * 80)
    
    # 해석
    print("\n[분석 해석]")
    
    if '평균_중요도' in metric_cols:
        val_0 = df_sorted['평균_중요도'].iloc[0]
        val_1 = df_sorted['평균_중요도'].iloc[-1]
        if val_1 > val_0:
            print("✓ 평균 중요도: α 증가 시 상승 → 하이라이트 집중도 강화")
    
    for col in metric_cols:
        if '표준편차' in col or 'Gini' in col:
            val_0 = df_sorted[col].iloc[0]
            val_1 = df_sorted[col].iloc[-1]
            if val_0 < val_1:
                print(f"✓ {col.replace('_', ' ')}: α 감소 시 감소 → 분포 균일성 증가")
    
    print("\n※ 상세 수치는 JSON 파일과 그래프를 참고하세요.")
    print("=" * 80)

def save_results(df: pd.DataFrame, output_path: str):
    """결과를 JSON 파일로 저장"""
    if df.empty:
        print("저장할 결과가 없습니다.")
        return
    
    try:
        results = df.to_dict('records')
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"[저장 완료] {output_path}")
    except Exception as e:
        print(f"[저장 오류] {e}")

# ============================================================================
# 간편 사용 함수
# ============================================================================

def run_evaluation(
    importance_file: str,
    extracted_file: str,
    output_json: str,
    metrics: List[str] = ['id_interval', 'time_interval', 'gini'],
    display: bool = True,
    plot: bool = True
):
    """
    평가 파이프라인 실행
    
    Args:
        importance_file: 중요도 JSON 경로
        extracted_file: 추출 결과 JSON 경로  
        output_json: 결과 저장 경로
        metrics: 계산할 지표 리스트
        display: 결과 출력 여부
        plot: 그래프 생성 여부
    """
    df = analyze_summary(importance_file, extracted_file, metrics)
    
    if df.empty:
        print("분석 결과가 비어있습니다.")
        return df
    
    # 출력
    if display:
        display_results(df)
    
    # 저장
    save_results(df, output_json)
    
    # 시각화
    if plot:
        plot_path = output_json.replace('.json', '_plot.png')
        plot_analysis(df, plot_path)
    
    return df