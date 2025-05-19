import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export default function VisualVideoEditor() {
  const ffmpegRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const splitCanvasRef = useRef(null);
  const partCanvasRefs = [useRef(null), useRef(null)];

  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [thumbs, setThumbs] = useState([]);
  const [splitTime, setSplitTime] = useState(0);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const [partedOrder, setPartedOrder] = useState([0, 1]);
  const [partThumbs, setPartThumbs] = useState([[], []]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedUrl, setEditedUrl] = useState('');

  useEffect(() => {
    ffmpegRef.current = new FFmpeg();
    console.log('FFmpeg instance created');
  }, []);

  // 生成缩略图
  const generateThumbnails = async (videoEl, count = 20, totalDuration) => {
    const arr = [];
    const offCanvas = document.createElement('canvas');
    const w = 60, h = 40;
    offCanvas.width = w;
    offCanvas.height = h;
    const ctx = offCanvas.getContext('2d');
    for (let i = 0; i < count; i++) {
      const t = (totalDuration * i) / count;
      if (i > 0) {
        await new Promise(resolve => {
          videoEl.onseeked = resolve;
          videoEl.currentTime = t;
        });
      }
      console.log(`generateThumbnails: frame ${i+1}/${count} at ${t.toFixed(2)}s`);
      ctx.drawImage(videoEl, 0, 0, w, h);
      arr.push(offCanvas.toDataURL('image/jpeg', 0.7));
    }
    return arr;
  };

  // 主画卷加载
  const onFileChange = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
    console.log('File loaded:', f.name);

    const v = hiddenVideoRef.current;
    v.src = url;
    await new Promise(r => (v.onloadedmetadata = r));
    const dur = v.duration;
    setDuration(dur);
    setSplitTime(dur / 2);
    console.log('Video duration:', dur);

    const thumbsArr = await generateThumbnails(v, 20, dur);
    setThumbs(thumbsArr);
    console.log('Thumbnails generated');
  };

  // 渲染分割画卷
  useEffect(() => {
    const c = splitCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    thumbs.forEach((src, i) => {
      const img = new Image(); img.src = src;
      img.onload = () => {
        ctx.drawImage(img, (i * W) / thumbs.length, 0, W / thumbs.length, H);
        if (i === thumbs.length - 1) drawSplit(ctx, W, H);
      };
    });
  }, [thumbs, splitTime]);

  const drawSplit = (ctx, totalW, h) => {
    const x = (splitTime / duration) * totalW;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, x, h);
    ctx.strokeRect(x, 0, totalW - x, h);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h);
    ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.stroke();
  };

  // 拖拽分割线
  const onMouseDown = e => {
    const rect = splitCanvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const x = (splitTime / duration) * rect.width;
    if (Math.abs(cx - x) < 6) setIsDraggingSplit(true);
  };
  const onMouseMove = e => {
    if (!isDraggingSplit) return;
    const rect = splitCanvasRef.current.getBoundingClientRect();
    let cx = e.clientX - rect.left;
    cx = Math.max(0, Math.min(rect.width, cx));
    const newTime = (cx / rect.width) * duration;
    setSplitTime(newTime);
    console.log('Split time updated:', newTime);
  };
  const onMouseUp = () => setIsDraggingSplit(false);

  // 分割画卷 (无需重生成 Thumbnails，直接 slice)
  const handleSplit = () => {
    console.log('Splitting canvas at', splitTime);
    const idx = Math.round((thumbs.length * splitTime) / duration);
    const part1 = thumbs.slice(0, idx);
    const part2 = thumbs.slice(idx);
    setPartThumbs([part1, part2]);
    console.log('Canvas split into parts:', part1.length, part2.length);
  };

  // 拖拽交换画卷顺序
  const onPartDrop = () => {
    setPartedOrder(prev => {
      const newOrder = [prev[1], prev[0]];
      console.log('Parts order swapped:', newOrder);
      return newOrder;
    });
  };

  // 导出编辑后视频
  const exportEdited = async () => {
    if (!file) return;
    setIsProcessing(true);
    console.log('Exporting video with order', partedOrder);
    const ff = ffmpegRef.current;
    await ff.load();
    await ff.writeFile('input.mp4', await fetchFile(file));
    console.log('Writing input.mp4');
    const p1 = 'part1.mp4', p2 = 'part2.mp4';
    await ff.exec(['-ss', '0', '-to', splitTime.toFixed(2), '-i', 'input.mp4', '-c', 'copy', p1]);
    await ff.exec(['-ss', splitTime.toFixed(2), '-to', duration.toFixed(2), '-i', 'input.mp4', '-c', 'copy', p2]);
    console.log('Created parts:', p1, p2);
    const files = partedOrder.map(i => (i === 0 ? p1 : p2));
    const list = files.map(f => `file '${f}'`).join('\n');
    await ff.writeFile('list.txt', new TextEncoder().encode(list));
    console.log('Concat list:', list);
    const out = 'edited.mp4';
    await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', out]);
    console.log('Exported', out);
    const data = await ff.readFile(out);
    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    setEditedUrl(url);
    setIsProcessing(false);
  };

  return (
    <div>
      <h2>可视化视频剪辑 (画卷式)</h2>
      <input type="file" accept="video/*" onChange={onFileChange} />
      <video ref={hiddenVideoRef} style={{ display: 'none' }} />

      {thumbs.length > 0 && (
        <>
          <canvas
            ref={splitCanvasRef}
            width={600}
            height={40}
            style={{ marginTop: 10, cursor: 'pointer' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          />
          <div>分割时间：{formatTime(splitTime)}</div>
          <button onClick={handleSplit} style={{ margin: '8px 0' }}>
            分割画卷
          </button>
        </>
      )}

      {partThumbs[0].length + partThumbs[1].length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {partedOrder.map((idx, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 4, fontWeight: 'bold' }}>分割部分{idx + 1}</div>
              <canvas
                ref={partCanvasRefs[idx]}
                width={290}
                height={40}
                draggable
                onDragOver={e => e.preventDefault()}
                onDrop={onPartDrop}
                style={{ border: '1px solid #ccc' }}
              />
            </div>
          ))}
        </div>
      )}

      {thumbs.length > 0 && (
        <button onClick={exportEdited} disabled={isProcessing} style={{ marginTop: 10 }}>
          {isProcessing ? '处理中…' : '导出编辑后视频'}
        </button>
      )}
      {editedUrl && (
        <div style={{ marginTop: 10 }}>
          <video src={editedUrl} controls width={480} />
          <br />
          <a href={editedUrl} download="edited.mp4">下载编辑后视频</a>
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
