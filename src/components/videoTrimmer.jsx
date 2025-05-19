import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export default function VisualVideoEditor() {
  const ffmpegRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const canvasRef = useRef(null);

  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [thumbs, setThumbs] = useState([]);
  const [splitTime, setSplitTime] = useState(0);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [offsetX, setOffsetX] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [partUrls, setPartUrls] = useState([]);
  const dragIndex = useRef(null);

  useEffect(() => {
    ffmpegRef.current = new FFmpeg();
  }, []);

  // 隐藏 video + canvas 缩略图
  const generateThumbnails = async (videoEl, count = 20) => {
    const arr = [];
    const offCanvas = document.createElement('canvas');
    const w = 60, h = 40;
    offCanvas.width = w; offCanvas.height = h;
    const ctx = offCanvas.getContext('2d');
    for (let i = 0; i < count; i++) {
      const t = (duration * i) / count;
      await new Promise(r => { videoEl.currentTime = t; videoEl.onseeked = r; });
      ctx.drawImage(videoEl, 0, 0, w, h);
      arr.push(offCanvas.toDataURL('image/jpeg',0.7));
    }
    return arr;
  };

  const onFileChange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setVideoUrl(url);

    const v = hiddenVideoRef.current;
    v.src = url;
    await new Promise(r => v.onloadedmetadata = r);
    setDuration(v.duration);
    setSplitTime(v.duration/2);

    const thumbsArr = await generateThumbnails(v, 20);
    setThumbs(thumbsArr);
  };

  // Canvas 渲染
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0,0,W,H);
    ctx.save(); ctx.translate(-offsetX,0);
    thumbs.forEach((src,i)=>{
      const img = new Image(); img.src = src;
      img.onload = ()=>{
        ctx.drawImage(img, i*(W/thumbs.length),0,W/thumbs.length,H);
        if(i===thumbs.length-1) drawSplit(ctx,W,H);
      };
    });
    ctx.restore();
  }, [thumbs, splitTime, offsetX]);

  const drawSplit = (ctx,totalW,h) => {
    const x = (splitTime/duration)*totalW;
    ctx.save(); ctx.translate(-offsetX,0);
    ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    ctx.strokeRect(0,0,x,h);
    ctx.strokeRect(x,0,totalW-x,h);
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h);
    ctx.strokeStyle='red'; ctx.lineWidth=2; ctx.stroke();
    ctx.restore();
  };

  // 拖拽
  const onMouseDown = e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX-rect.left+offsetX;
    const splitX = (splitTime/duration)*rect.width;
    if(Math.abs(cx-splitX)<6) setIsDraggingSplit(true);
    else { dragIndex.current = null; }
  };
  const onMouseMove = e => {
    if(isDraggingSplit){
      const rect = canvasRef.current.getBoundingClientRect();
      let cx = e.clientX-rect.left+offsetX;
      cx=Math.max(0,Math.min(rect.width,cx));
      setSplitTime((cx/rect.width)*duration);
    }
  };
  const onMouseUp = ()=> setIsDraggingSplit(false);

  // 分割视频
  const handleSplit = async () => {
    if(!file) return; setIsProcessing(true);
    const ff = ffmpegRef.current;
    await ff.load(); await ff.writeFile('input.mp4',await fetchFile(file));
    const p1='part1.mp4', p2='part2.mp4';
    await ff.exec(['-ss','0','-to',splitTime.toFixed(2),'-i','input.mp4','-c','copy',p1]);
    await ff.exec(['-ss',splitTime.toFixed(2),'-to',duration.toFixed(2),'-i','input.mp4','-c','copy',p2]);
    const d1=await ff.readFile(p1), d2=await ff.readFile(p2);
    const u1=URL.createObjectURL(new Blob([d1.buffer],{type:'video/mp4'}));
    const u2=URL.createObjectURL(new Blob([d2.buffer],{type:'video/mp4'}));
    setPartUrls([u1,u2]); setIsProcessing(false);
  };

  // 拖拽交换顺序
  const onSegmentDragStart = (i) => { dragIndex.current = i; };
  const onSegmentDrop = (i) => {
    const j=dragIndex.current; if(j===null) return;
    const arr=[...partUrls]; [arr[j],arr[i]]=[arr[i],arr[j]];
    setPartUrls(arr); dragIndex.current=null;
  };

  return (
    <div>
      <h2>可视化视频剪辑 (画卷式)&mdash; 分割模式</h2>
      <input type='file' accept='video/*' onChange={onFileChange}/>
      <video ref={hiddenVideoRef} style={{display:'none'}}/>

      {thumbs.length>0 && (
        <>
          <canvas width={600} height={40}
            ref={canvasRef}
            style={{marginTop:10,cursor:'pointer'}}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}/>
          <div>分割时间：{formatTime(splitTime)}</div>
          <button onClick={handleSplit} disabled={isProcessing} style={{margin:'8px 0'}}>
            {isProcessing?'分割中…':'分割视频'}
          </button>
        </>
      )}

      {partUrls.length===2 && (
        <div style={{display:'flex',gap:8,marginTop:10}}>
          {partUrls.map((u,i)=>(
            <div key={i} draggable
              onDragStart={()=>onSegmentDragStart(i)}
              onDragOver={e=>e.preventDefault()}
              onDrop={()=>onSegmentDrop(i)}
            >
              <video src={u} controls width={280}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(sec){
  const m=Math.floor(sec/60).toString().padStart(2,'0');
  const s=Math.floor(sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}
