import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export default function VisualVideoEditor() {
  const ffmpegRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const previewVideoRef = useRef(null);

  // segments: array of { start, end, thumbs, splitTime }
  const [segments, setSegments] = useState([]);
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedUrl, setEditedUrl] = useState('');
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [activeIdx, setActiveIdx] = useState(null);

  // init ffmpeg
  useEffect(() => {
    ffmpegRef.current = new FFmpeg();
  }, []);

  // auto export when file or segments change
  useEffect(() => {
    if (file && segments.length > 0) {
      exportEdited();
    }
  }, [file, segments]);

  // generate thumbnails
  const generateThumbnails = async (videoEl, count = 20, start = 0, end = 0) => {
    const arr = [];
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 60;
    offCanvas.height = 40;
    const ctx = offCanvas.getContext('2d');
    for (let i = 0; i < count; i++) {
      const t = start + ((end - start) * i) / count;
      await new Promise(resolve => { videoEl.onseeked = resolve; videoEl.currentTime = t; });
      ctx.clearRect(0, 0, 60, 40);
      ctx.drawImage(videoEl, 0, 0, 60, 40);
      arr.push(offCanvas.toDataURL('image/jpeg', 0.7));
    }
    return arr;
  };

  // load multiple files and concat
  const onFileChange = async e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const ff = ffmpegRef.current;
    setIsProcessing(true);
    await ff.load();
    // write inputs
    for (let i = 0; i < files.length; i++) {
      const data = await fetchFile(files[i]);
      await ff.writeFile(`input${i}.mp4`, data);
    }
    // create list.txt and concat
    const list = files.map((_, i) => `file 'input${i}.mp4'`).join('\n');
    await ff.writeFile('list.txt', new TextEncoder().encode(list));
    await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'combined.mp4']);
    // read combined video
    const combined = await ff.readFile('combined.mp4');
    const blob = new Blob([combined.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    setFile(blob);
    hiddenVideoRef.current.src = url;
    await new Promise(r => (hiddenVideoRef.current.onloadedmetadata = r));
    const dur = hiddenVideoRef.current.duration;
    setDuration(dur);
    const thumbs = await generateThumbnails(hiddenVideoRef.current, 20, 0, dur);
    setSegments([{ start: 0, end: dur, thumbs, splitTime: dur / 2 }]);
    setActiveIdx(0);
    setIsProcessing(false);
  };

  // split active segment
  const handleSplit = () => {
    if (activeIdx === null) return;
    setSegments(prev => {
      const seg = prev[activeIdx];
      const { start, end, thumbs, splitTime } = seg;
      const rel = splitTime - start;
      const idx = Math.round((thumbs.length * rel) / (end - start));
      return [
        ...prev.slice(0, activeIdx),
        { start, end: splitTime, thumbs: thumbs.slice(0, idx), splitTime: start + rel / 2 },
        { start: splitTime, end, thumbs: thumbs.slice(idx), splitTime: splitTime + (end - splitTime) / 2 },
        ...prev.slice(activeIdx + 1)
      ];
    });
  };

  // delete active segment
  const handleDelete = () => {
    if (activeIdx === null) return;
    setSegments(prev => prev.filter((_, i) => i !== activeIdx));
    setActiveIdx(idx => (idx > 0 ? idx - 1 : null));
  };

  // update split time and seek preview
  const updateSplitTime = (idx, newTime) => {
    setActiveIdx(idx);
    setSegments(prev => prev.map((s, i) => i === idx ? { ...s, splitTime: newTime } : s));
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = newTime;
    }
  };

  // drag & drop reorder
  const onDragStart = (e, idx) => setDraggingIdx(idx);
  const onDragOver = e => e.preventDefault();
  const onDrop = (e, idx) => {
    const tmp = [...segments];
    const it = tmp.splice(draggingIdx, 1)[0];
    tmp.splice(idx, 0, it);
    setSegments(tmp);
    if (draggingIdx === activeIdx) setActiveIdx(idx);
    setDraggingIdx(null);
  };

  // export edited video
  const exportEdited = async () => {
    if (!file) return;
    setIsProcessing(true);
    const ff = ffmpegRef.current;
    await ff.load();
    await ff.writeFile('input.mp4', await fetchFile(file));
    const parts = [];
    for (let i = 0; i < segments.length; i++) {
      const { start, end } = segments[i];
      const name = `seg${i}.mp4`;
      await ff.exec(['-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', 'input.mp4', '-c', 'copy', name]);
      parts.push(name);
    }
    const list = parts.map(n => `file '${n}'`).join('\n');
    await ff.writeFile('list.txt', new TextEncoder().encode(list));
    await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'edited.mp4']);
    const out = await ff.readFile('edited.mp4');
    setEditedUrl(URL.createObjectURL(new Blob([out.buffer], { type: 'video/mp4' })));
    setIsProcessing(false);
  };

  return (
    <div>
      <h2>可视化视频剪辑工具</h2>
      <input type="file" accept="video/*" multiple onChange={onFileChange} />
      <video ref={hiddenVideoRef} style={{ display: 'none' }} />

      {/* Video Preview */}
      {editedUrl && (
        <div style={{ marginTop: 10 }}>
          <video ref={previewVideoRef} src={editedUrl} controls width={250} />
          <div style={{ marginTop: 8 }}>
            <a href={editedUrl} download="edited.mp4">下载视频</a>
          </div>
        </div>
      )}

      {/* timeline */}
      <div style={{ position: 'relative', width: '15000px', height: 30, backgroundColor: '#eee', overflowX: 'auto', whiteSpace: 'nowrap', marginTop: 10 }}>
        <div style={{ position: 'relative', width: '15000px', height: '100%' }}>
          {Array.from({ length: 121 }).map((_, i) => {
            const sec = i * 5;
            return (
              <div key={sec} style={{ position: 'absolute', left: `${sec * 25}px`, height: '100%' }}>
                <div style={{ borderLeft: '1px solid #999', height: '100%' }} />
                <div style={{ position: 'absolute', top: 0, left: -10, fontSize: 10 }}>{sec}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* thumbnails */}
      <div style={{ display: 'flex', marginTop: 4 }}>
        {segments.map((seg, idx) => (
          <div key={idx} draggable onDragStart={e => onDragStart(e, idx)} onDragOver={onDragOver} onDrop={e => onDrop(e, idx)}>
            <canvas
              width={Math.round((seg.end - seg.start) * 25)}
              height={40}
              style={{ border: idx === activeIdx ? '2px solid #007bff' : '1px solid #ccc', cursor: 'pointer' }}
              ref={c => {
                if (!c) return;
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, c.width, c.height);
                seg.thumbs.forEach((src, i) => {
                  const img = new Image();
                  img.src = src;
                  img.onload = () => {
                    const tw = c.width / seg.thumbs.length;
                    ctx.drawImage(img, i * tw, 0, tw, c.height);
                    if (idx === activeIdx) {
                      const pos = ((seg.splitTime - seg.start) / (seg.end - seg.start)) * c.width;
                      ctx.beginPath();
                      ctx.moveTo(pos, 0);
                      ctx.lineTo(pos, c.height);
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
                updateSplitTime(idx, seg.start + (cx / e.target.width) * (seg.end - seg.start));
              }}
            />
          </div>
        ))}
      </div>

      {/* controls */}
      {activeIdx !== null && (
        <div style={{ marginTop: 10 }}>
          <button onClick={handleSplit} disabled={segments[activeIdx].thumbs.length < 2} style={{ marginRight: 10 }}>剪切</button>
          <button onClick={handleDelete} disabled={segments.length < 2}>删除</button>
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
