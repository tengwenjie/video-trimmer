import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export default function VisualVideoEditor() {
  const ffmpegRef = useRef(null);
  const hiddenVideoRef = useRef(null);

  // segments: array of { start, end, thumbs, splitTime }
  const [segments, setSegments] = useState([]);
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedUrl, setEditedUrl] = useState('');
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [activeIdx, setActiveIdx] = useState(null);

  useEffect(() => {
    ffmpegRef.current = new FFmpeg();
    console.log('FFmpeg instance created');
  }, []);

  // generate thumbnails
  const generateThumbnails = async (videoEl, count = 20, start = 0, end = 0) => {
    const arr = [];
    const offCanvas = document.createElement('canvas');
    const w = 60, h = 40;
    offCanvas.width = w;
    offCanvas.height = h;
    const ctx = offCanvas.getContext('2d');
    for (let i = 0; i < count; i++) {
      const t = start + ((end - start) * i) / count;
      await new Promise(resolve => { videoEl.onseeked = resolve; videoEl.currentTime = t; });
      ctx.drawImage(videoEl, 0, 0, w, h);
      arr.push(offCanvas.toDataURL('image/jpeg', 0.7));
    }
    return arr;
  };

  // load file
  const onFileChange = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    hiddenVideoRef.current.src = url;
    await new Promise(r => (hiddenVideoRef.current.onloadedmetadata = r));
    const dur = hiddenVideoRef.current.duration;
    setDuration(dur);
    const thumbs = await generateThumbnails(hiddenVideoRef.current, 20, 0, dur);
    setSegments([{ start: 0, end: dur, thumbs, splitTime: dur / 2 }]);
    setActiveIdx(0);
  };

  // split active segment
  const handleSplit = () => {
    if (activeIdx === null) return;
    setSegments(prev => {
      const seg = prev[activeIdx];
      const { start, end, thumbs, splitTime } = seg;
      const rel = splitTime - start;
      const count = thumbs.length;
      const splitIdx = Math.round((count * rel) / (end - start));
      const first = thumbs.slice(0, splitIdx);
      const second = thumbs.slice(splitIdx);
      return [
        ...prev.slice(0, activeIdx),
        { start, end: splitTime, thumbs: first, splitTime: start + rel / 2 },
        { start: splitTime, end, thumbs: second, splitTime: splitTime + (end - splitTime) / 2 },
        ...prev.slice(activeIdx + 1)
      ];
    });
  };

  // delete active segment
  const handleDelete = () => {
    if (activeIdx === null) return;
    setSegments(prev => prev.filter((_, i) => i !== activeIdx));
    setActiveIdx(prev => {
      const newLen = segments.length - 1;
      if (newLen <= 0) return null;
      if (prev >= newLen) return newLen - 1;
      return prev;
    });
  };

  // click to set split time and active segment
  const updateSplitTime = (idx, newTime) => {
    setActiveIdx(idx);
    setSegments(prev => prev.map((s, i) => i === idx ? { ...s, splitTime: newTime } : s));
  };

  // drag & drop reorder
  const onDragStart = (e, idx) => setDraggingIdx(idx);
  const onDragOver = e => e.preventDefault();
  const onDrop = (e, idx) => {
    const temp = [...segments];
    const moved = temp.splice(draggingIdx, 1)[0];
    temp.splice(idx, 0, moved);
    setSegments(temp);
    if (draggingIdx === activeIdx) setActiveIdx(idx);
    setDraggingIdx(null);
  };

  // export edited
  const exportEdited = async () => {
    if (!file) return;
    setIsProcessing(true);
    const ff = ffmpegRef.current;
    await ff.load();
    await ff.writeFile('input.mp4', await fetchFile(file));
    const partFiles = [];
    for (let i = 0; i < segments.length; i++) {
      const { start, end } = segments[i];
      const name = `part${i}.mp4`;
      await ff.exec(['-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', 'input.mp4', '-c', 'copy', name]);
      partFiles.push(name);
    }
    const list = partFiles.map(f => `file '${f}'`).join('\n');
    await ff.writeFile('list.txt', new TextEncoder().encode(list));
    await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'edited.mp4']);
    const data = await ff.readFile('edited.mp4');
    setEditedUrl(URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' })));    
    setIsProcessing(false);
  };

  return (
    <div>
      <h2>可视化视频剪辑工具</h2>
      <input type="file" accept="video/*" onChange={onFileChange} />
      <video ref={hiddenVideoRef} style={{ display: 'none' }} />

      {/* 时间轴 */}
      {segments.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginTop: 10, fontSize: 12, color: '#555' }}>
          {segments.map((seg, idx) => (
            <div key={idx} style={{ width: 100, textAlign: 'center' }}>
              {formatTime(seg.start)}
            </div>
          ))}
          <div style={{ width: 100, textAlign: 'center' }}>
            {formatTime(segments[segments.length - 1].end)}
          </div>
        </div>
      )}

      {/* 缩略图排列区 */}
      <div style={{ display: 'flex', gap: '8px', marginTop: 4 }}>
        {segments.map((seg, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={e => onDragStart(e, idx)}
            onDragOver={onDragOver}
            onDrop={e => onDrop(e, idx)}
            style={{
              cursor: 'move',
              textAlign: 'center',
              border: idx === activeIdx ? '2px solid #007bff' : '1px solid #ccc'
            }}
          >
            <canvas
              width={100}
              height={40}
              style={{ display: 'block', margin: '0 auto', cursor: 'pointer' }}
              ref={c => {
                if (!c) return;
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, 100, 40);
                seg.thumbs.forEach((src, i) => {
                  const img = new Image();
                  img.src = src;
                  img.onload = () => {
                    ctx.drawImage(img, (i * 100) / seg.thumbs.length, 0, 100 / seg.thumbs.length, 40);
                    if (idx === activeIdx) {
                      const x = ((seg.splitTime - seg.start) / (seg.end - seg.start)) * 100;
                      ctx.beginPath();
                      ctx.moveTo(x, 0);
                      ctx.lineTo(x, 40);
                      ctx.strokeStyle = 'red';
                      ctx.lineWidth = 2;
                      ctx.stroke();
                    }
                  };
                });
              }}
              onClick={e => {
                const rect = e.target.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                updateSplitTime(idx, seg.start + (cx / rect.width) * (seg.end - seg.start));
              }}
            />
            <div>Seg {idx + 1}</div>
          </div>
        ))}
      </div>

      {/* Single Split and Delete Buttons */}
      {activeIdx !== null && (
        <>
          <button
            onClick={handleSplit}
            disabled={segments[activeIdx]?.thumbs.length < 2}
            style={{ marginTop: 10 }}
          >
            剪切
          </button>
          <button
            onClick={handleDelete}
            disabled={segments.length < 2}
            style={{ marginTop: 10, marginLeft: 10 }}
          >
            删除
          </button>
        </>
      )}

      {segments.length > 0 && (
        <button
          onClick={exportEdited}
          disabled={isProcessing}
          style={{ marginTop: 10, marginLeft: 10 }}
        >
          {isProcessing ? '处理中…' : '生成视频'}
        </button>
      )}

      {editedUrl && (
        <div style={{ marginTop: 10 }}>
          <video src={editedUrl} controls width={480} />
          <br />
          <a href={editedUrl} download="edited.mp4">
            下载
          </a>
        </div>
      )}
    </div>
  );
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
