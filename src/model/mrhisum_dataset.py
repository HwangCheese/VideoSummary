import h5py
import numpy as np
import json
import torch
from torch.utils.data import Dataset
from torch.nn.utils.rnn import pad_sequence

class MrHiSumDataset(Dataset):

    def __init__(self, mode):
        self.mode = mode
        self.dataset = 'dataset/mr_hisum.h5'
        self.split_file = 'dataset/mr_hisum_split.json'
        
        self.video_data = h5py.File(self.dataset, 'r')

        with open(self.split_file, 'r') as f:
            self.data = json.loads(f.read())

        self.video_list = self.data[self.mode + '_keys']

    def __len__(self):
        return len(self.video_list)

    def __getitem__(self, index):
        video_name = self.video_list[index]
        d = {}

        # 1) 필수 필드 체크: 'features', 'gtscore'는 모든 모드에서 필요
        required_fields = [f"{video_name}/features", f"{video_name}/gtscore"]

        # 2) val/test 모드면 'change_points', 'gt_summary'도 필요
        if self.mode != 'train':
            required_fields.extend([
                f"{video_name}/change_points",
                f"{video_name}/gt_summary"
            ])

        # 3) 모든 필드가 존재하는지 확인
        for field_path in required_fields:
            if field_path not in self.video_data:
                print(f"[WARNING] '{field_path}' not found. Skipping this sample.")
                return None

        # 4) 실제 데이터 로드
        d['video_name'] = video_name
        d['features'] = torch.Tensor(np.array(self.video_data[f"{video_name}/features"]))
        d['gtscore']  = torch.Tensor(np.array(self.video_data[f"{video_name}/gtscore"]))

        if self.mode != 'train':
            d['n_frames'] = d['features'].shape[0]
            d['change_points'] = np.array(self.video_data[f"{video_name}/change_points"])
            d['gt_summary']    = np.array(self.video_data[f"{video_name}/gt_summary"])
            d['picks']         = np.arange(d['n_frames'])
            d['n_frame_per_seg'] = np.array([
                cp[1] - cp[0] for cp in d['change_points']
            ])

        return d
    

class BatchCollator(object):
    def __call__(self, batch):
        # 1) None 제거
        batch = [b for b in batch if b is not None]
        if len(batch) == 0:
            return None  # 모두 None이면 None 반환

        video_name, features, gtscore = [], [], []

        # val/test 모드에서만 필요한 필드
        cps, gt_summary, n_frames, picks, n_frame_per_seg = [], [], [], [], []

        # 2) batch 구성
        for data in batch:
            video_name.append(data['video_name'])
            features.append(data['features'])
            gtscore.append(data['gtscore'])

            # val/test 모드라면
            if 'change_points' in data:
                cps.append(data['change_points'])
                gt_summary.append(data['gt_summary'])
                picks.append(data['picks'])
                n_frames.append(data['n_frames'])
                n_frame_per_seg.append(data['n_frame_per_seg'])

        # 3) 길이 및 패딩 처리
        lengths = torch.LongTensor([feat.shape[0] for feat in features])
        max_len = max(lengths)
        mask = torch.arange(max_len)[None, :] < lengths[:, None]
        frame_feat = pad_sequence(features, batch_first=True)
        gtscore    = pad_sequence(gtscore,   batch_first=True)

        # 4) batch_data 딕셔너리 반환
        batch_data = {
            'video_name': video_name,
            'features'  : frame_feat,
            'gtscore'   : gtscore,
            'mask'      : mask,
            'lengths'   : lengths
        }

        # val/test 필드 추가
        if len(cps) > 0:
            batch_data['change_points']   = cps
            batch_data['gt_summary']      = gt_summary
            batch_data['picks']           = picks
            batch_data['n_frames']        = n_frames
            batch_data['n_frame_per_seg'] = n_frame_per_seg

        return batch_data
