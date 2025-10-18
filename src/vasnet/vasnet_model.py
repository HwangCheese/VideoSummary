__author__ = 'Jiri Fajtl'
__email__ = 'ok1zjf@gmail.com'
__version__= '3.6'
__status__ = "Research"
__date__ = "1/12/2018"
__license__= "MIT License"


import torch
import torch.nn as nn
import torch.nn.functional as F

from vasnet.layer_norm import LayerNorm


class SelfAttention(nn.Module):
    """
    VASNet의 Self-Attention 모듈 (MIT 라이선스)
    배치 처리 및 마스킹을 지원하도록 수정됨
    """
    def __init__(self, apperture=-1, ignore_itself=False, input_size=1024, output_size=1024):
        super(SelfAttention, self).__init__()
        self.apperture = apperture  # 시간적 제약 범위 (aperture 윈도우)
        self.ignore_itself = ignore_itself  # 자기 자신에 대한 attention 무시 여부
        self.m = input_size  # 입력 특징 차원
        self.output_size = output_size  # attention 출력 차원
        
        # Query, Key, Value 변환을 위한 선형 레이어
        self.K = nn.Linear(in_features=self.m, out_features=self.output_size, bias=False)
        self.Q = nn.Linear(in_features=self.m, out_features=self.output_size, bias=False)
        self.V = nn.Linear(in_features=self.m, out_features=self.output_size, bias=False)
        
        # Attention 결과를 원래 차원으로 되돌리는 레이어
        self.output_linear = nn.Linear(in_features=self.output_size, out_features=self.m, bias=False)
        
        # 드롭아웃 (50%)
        self.drop50 = nn.Dropout(0.5)

    def forward(self, x, mask=None):
        """
        Args:
            x: (batch_size, seq_len, feature_dim) - 입력 특징
            mask: (batch_size, seq_len) - 유효한 프레임 위치는 True
        Returns:
            y: attention 적용된 출력
            att_weights_: attention 가중치
        """
        bs = x.shape[0]  # 배치 크기
        n = x.shape[1]   # 시퀀스 길이 (프레임 수)
        
        # Query, Key, Value 계산
        K = self.K(x)
        Q = self.Q(x)
        V = self.V(x)
        
        # Query 스케일링 (안정성을 위해)
        Q *= 0.06
        
        # Attention 스코어 계산: Q * K^T
        logits = torch.matmul(Q, K.transpose(1, 2))
        
        # 패딩 마스크 적용 (배치 내 가변 길이 시퀀스 처리)
        if mask is not None:
            mask_expanded = mask.unsqueeze(-1)  # (B, L, 1)
            mask_transposed = mask.transpose(2, 1) if len(mask.shape) == 3 else mask.unsqueeze(1)  # (B, 1, L)
            # 유효한 위치끼리만 attention 가능
            attention_mask = torch.matmul(mask_expanded.float(), mask_transposed.float()).bool()
            # 무효한 위치는 매우 작은 값으로 마스킹
            logits = logits.masked_fill(~attention_mask, -1e9)
        
        # 자기 자신에 대한 attention 제거 (옵션)
        if self.ignore_itself:
            logits[:, torch.arange(n), torch.arange(n)] = -float("Inf")
        
        # Aperture 제약: 시간적으로 너무 먼 프레임 간 attention 차단
        if self.apperture > 0:
            onesmask = torch.ones(n, n, device=x.device)
            # aperture 범위를 벗어난 위치를 1로 표시
            trimask = torch.tril(onesmask, -self.apperture) + torch.triu(onesmask, self.apperture)
            logits = logits.masked_fill(trimask.unsqueeze(0).bool(), -float("Inf"))
        
        # Softmax로 attention 가중치 계산
        att_weights_ = F.softmax(logits, dim=-1)
        
        # 드롭아웃 적용
        weights = self.drop50(att_weights_)
        
        # Attention 가중치를 사용해 Value의 가중합 계산
        # (B, L, L) x (B, D, L) -> (B, D, L) -> (B, L, D)
        y = torch.matmul(V.transpose(1, 2), weights).transpose(1, 2)
        
        # 출력 선형 변환
        y = self.output_linear(y)
        
        return y, att_weights_


class VASNet(nn.Module):
    """
    Video Attention-based Summarization Network
    비디오 요약을 위한 어텐션 기반 네트워크
    배치 처리를 지원하는 버전
    """
    def __init__(self, feature_dim=1024, hidden_dim=1024):
        super().__init__()
        
        self.m = feature_dim  # 입력 특징 차원 (원본 코드와의 호환성)
        self.hidden_size = hidden_dim  # 은닉 차원
        
        # Self-attention 모듈 (설정 가능한 은닉 차원)
        self.att = SelfAttention(
            input_size=self.m, 
            output_size=self.hidden_size
        )
        
        # 프레임 중요도 점수를 계산하는 네트워크
        self.ka = nn.Linear(in_features=self.m, out_features=1024)
        self.kb = nn.Linear(in_features=self.ka.out_features, out_features=1024)
        self.kc = nn.Linear(in_features=self.kb.out_features, out_features=1024)
        self.kd = nn.Linear(in_features=self.ka.out_features, out_features=1)  # 최종 점수 출력
        
        # 활성화 함수
        self.sig = nn.Sigmoid()  # 최종 점수를 0~1 사이로 정규화
        self.relu = nn.ReLU()
        
        # 정규화 기법
        self.drop50 = nn.Dropout(0.5)  # 드롭아웃
        self.softmax = nn.Softmax(dim=0)
        
        # Layer Normalization
        self.layer_norm_y = LayerNorm(self.m)
        self.layer_norm_ka = LayerNorm(self.ka.out_features)

    def forward(self, x, seq_len=None, mask=None):
        """
        비디오 특징에서 프레임별 중요도 점수 생성
        
        Args:
            x: (batch_size, seq_len, feature_dim) - 비디오 프레임 특징
            seq_len: (선택) 호환성을 위한 파라미터
            mask: (batch_size, seq_len) - 유효한 프레임은 True
        Returns:
            y: (batch_size, seq_len) - 프레임별 중요도 점수 (0~1)
            att_weights_: (batch_size, seq_len, seq_len) - attention 가중치
        """
        bs = x.shape[0]  # 배치 크기
        m = x.shape[2]   # 특징 차원
        
        # Self-attention 적용
        y, att_weights_ = self.att(x, mask=mask)
        
        # Residual connection (잔차 연결)
        y = y + x
        y = self.drop50(y)
        y = self.layer_norm_y(y)
        
        # 프레임 레벨 중요도 점수 회귀
        # 2-layer 신경망
        y = self.ka(y)
        y = self.relu(y)
        y = self.drop50(y)
        y = self.layer_norm_ka(y)
        
        # 최종 점수 계산
        y = self.kd(y)
        y = self.sig(y)  # 0~1 사이로 정규화
        
        # (batch_size, seq_len) 형태로 reshape
        y = y.view(bs, -1)
        
        return y, att_weights_

if __name__ == "__main__":
    pass