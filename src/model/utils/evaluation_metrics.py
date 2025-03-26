# -*- coding: utf-8 -*-
import numpy as np
from scipy import stats

def evaluate_summary(predicted_summary, user_summary, eval_method):
    """ Compare the predicted summary with the user defined one(s).

    :param ndarray predicted_summary: The generated summary from our model.
    :param ndarray user_summary: The user defined ground truth summaries (or summary).
    """

    # 🔹 user_summary가 1차원 배열이면 (T,) → (1, T)로 변환
    if user_summary.ndim == 1:
        user_summary = user_summary[None, :]  # (1, T)

    # 🔹 길이가 다른 경우 max 길이 기준으로 배열 초기화
    max_len = max(len(predicted_summary), user_summary.shape[1])
    S = np.zeros(max_len, dtype=int)
    G = np.zeros(max_len, dtype=int)

    # 🔹 `predicted_summary`가 `max_len` 보다 짧을 경우 패딩
    S[:len(predicted_summary)] = predicted_summary
    f_scores = []

    for user in range(user_summary.shape[0]):
        G[:user_summary.shape[1]] = user_summary[user]  # GT summary 패딩
        overlapped = S & G  # 공통된 부분 체크

        # 🔹 Precision, Recall, F1 Score 계산
        precision = sum(overlapped) / (sum(S) + 1e-8)
        recall = sum(overlapped) / (sum(G) + 1e-8)

        if precision + recall == 0:
            f_scores.append(0)
        else:
            f_scores.append((2 * precision * recall * 100) / (precision + recall))

    # 🔹 `eval_method`가 'max'이면 최댓값, 아니면 평균 사용
    f_score_result = max(f_scores) if eval_method == 'max' else sum(f_scores) / len(f_scores)

    # 🔹 Spearman & Kendall 평가 추가
    y_pred2 = predicted_summary
    y_true2 = user_summary.mean(axis=0)

    # 🔹 y_pred2와 y_true2 길이가 다르면 가장 긴 길이로 패딩
    min_len = min(len(y_pred2), len(y_true2))
    y_pred2 = y_pred2[:min_len]
    y_true2 = y_true2[:min_len]

    pS = stats.spearmanr(y_pred2, y_true2)[0]
    kT = stats.kendalltau(stats.rankdata(-np.array(y_true2)), stats.rankdata(-np.array(y_pred2)))[0]

    return f_score_result, kT, pS
