// server/routes/share.js
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 저장소 설정
const STORE_DIR = path.join(process.cwd(), 'data', 'shares');
fs.mkdirSync(STORE_DIR, { recursive: true });

// 특정 공유 문서를 저장할 파일 경로 
function shareFile(id) {
    return path.join(STORE_DIR, `${id}.json`);
}

function writeShare(id, payload) {
    const file = shareFile(id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
        fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
        return { ok: true, file };
    } catch (e) {
        return { ok: false, file, error: e };
    }
}

function readShare(id) {
    const f = shareFile(id);
    if (!fs.existsSync(f)) return null;
    try {
        return JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch {
        return null;
    }
}

function applyTemplate(html, map) {
    let out = html;
    for (const [key, val] of Object.entries(map)) {
        const re = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        out = out.replace(re, String(val ?? ''));
    }
    return out;
}

router.post('/share', async (req, res) => {
    try {
        console.log('[share] POST /share hit');
        const { filename, segments = [], score = null, meta = {} } = req.body || {};
        console.log('[share] body.preview =', {
            filename,
            segCount: Array.isArray(segments) ? segments.length : 'n/a',
            scoreType: typeof score,
            metaKeys: meta ? Object.keys(meta) : []
        });

        if (!filename) return res.status(400).json({ message: 'filename is required' });

        const id = crypto.randomUUID();

        const EXPIRE_DAYS = Number(process.env.SHARE_EXPIRE_DAYS || 7);
        const expiresAt = Date.now() + EXPIRE_DAYS * 24 * 60 * 60 * 1000;

        const payload = {
            id,
            filename,
            segments,
            score,
            meta: {
                ...meta,
                createdAt: meta.createdAt || new Date().toISOString(),
                expireDays: EXPIRE_DAYS,
            },
            expiresAt
        };

        const result = writeShare(id, payload);
        console.log('[share] writeShare ->', result);
        if (!result.ok) {
            console.error('[share] write error:', result.error);
            return res.status(500).json({ message: 'failed to save file', error: String(result.error) });
        }

        const base = `${req.protocol}://${req.get('host')}`;
        const url = `${base}/share/${id}`;

        return res.json({ id, url, expiresAt, path: result.file });
    } catch (e) {
        console.error('[share] create error:', e);
        return res.status(500).json({ message: 'failed to create share link' });
    }
});

router.get('/share/:id', async (req, res) => {
    const doc = readShare(req.params.id);
    if (!doc) return res.status(404).send('Link not found');
    if (doc.expiresAt && Date.now() > doc.expiresAt) return res.status(410).send('Link expired');

    const wantsJson = req.accepts(['html', 'json']) === 'json' || req.query.format === 'json';
    if (wantsJson) return res.json(doc);

    // 템플릿 로드
    const tplPath = path.join(__dirname, '..', 'public', 'share.html');
    let tplHtml;
    try {
        tplHtml = fs.readFileSync(tplPath, 'utf-8');
    } catch (e) {
        console.error('[share] Failed to read template:', e);
        return res.status(500).send('Template not found');
    }

    // 안전 문자열
    const safe = (s) => (typeof s === 'string' ? s.replace(/</g, '&lt;').replace(/>/g, '&gt;') : s);

    const baseName = String(doc.filename || '').replace(/\.mp4$/i, '');
    const originalVideoUrl = `/uploads/${encodeURIComponent(doc.filename)}`;
    const summaryVideoUrl = `/clips/${encodeURIComponent(baseName)}/highlight_${encodeURIComponent(baseName)}.mp4`;

    // 실제 파일 존재 여부 확인
    const summaryDiskPath = path.resolve(__dirname, '..', '..', 'clips', baseName, `highlight_${baseName}.mp4`);
    const summaryExists = fs.existsSync(summaryDiskPath);

    const originalDiskPath = path.resolve(__dirname, '..', 'uploads', doc.filename);
    const originalExists = fs.existsSync(originalDiskPath);

    // 비디오 블록 HTML
    const originalHtml = originalExists
        ? `<video id="originalVideo" controls src="${originalVideoUrl}"></video>`
        : `<div class="muted">원본 영상 파일을 찾을 수 없습니다.</div>`;

    const summaryHtml = summaryExists
        ? `<video id="finalVideo" controls src="${summaryVideoUrl}"></video>`
        : `<div class="muted">요약 영상 파일을 찾을 수 없습니다.</div>`;

    // 세그먼트 정렬 및 렌더
    const segments = Array.isArray(doc.segments) ? [...doc.segments] : [];
    segments.sort((a, b) => Number(a.start_time) - Number(b.start_time));

    const segmentsHtml =
        segments.length > 0
            ? segments
                .map(
                    (s) =>
                        `<div class="seg">${Number(s.start_time).toFixed(2)}s → ${Number(s.end_time).toFixed(2)}s (dur ${(Number(s.end_time) - Number(s.start_time)).toFixed(2)}s)</div>`
                )
                .join('')
            : '<div class="muted">세그먼트 없음</div>';

    // 치환 맵
    const map = {
        TITLE: `${safe(doc.filename)} - Shared Result`,
        FILENAME_SAFE: safe(doc.filename),
        EXPIRES_AT: new Date(doc.expiresAt).toLocaleString(),
        SCORE: doc.score ?? '-',
        DURATION_KV: doc.meta?.duration
            ? `<li class="metric-item">
         <div class="metric-icon-wrapper"><i class="fas fa-film"></i></div>
         <div class="metric-info">
           <span class="metric-label">원본 길이</span>
           <span class="metric-value">${Number(doc.meta.duration).toFixed(2)}s</span>
         </div>
       </li>`
            : '',
        ORIGINAL_VIDEO_HTML: originalHtml,
        SUMMARY_VIDEO_HTML: summaryHtml,
        SEGMENTS_HTML: segmentsHtml
    };

    const html = applyTemplate(tplHtml, map);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
});

module.exports = router;
