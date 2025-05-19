import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export default function VideoTrimmer() {
  const [videoFile, setVideoFile] = useState(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(10);
  const [outputUrl, setOutputUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const ffmpegRef = useRef(null);
  const [videoPreview, setVideoPreview] = useState('');

  useEffect(() => {
    ffmpegRef.current = new FFmpeg();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setVideoFile(file);
    setOutputUrl('');
    setVideoPreview(URL.createObjectURL(file));
  };

  const trimVideo = async () => {
    if (!videoFile || !ffmpegRef.current || endTime <= startTime) {
      alert("请检查时间设置：结束时间必须大于开始时间！");
      return;
    }
  
    setIsProcessing(true);
    setOutputUrl('');
  
    try {
      const ffmpeg = ffmpegRef.current;
      console.log('开始加载 FFmpeg...');
      await ffmpeg.load();
      console.log('FFmpeg 加载完成');
  
      const inputName = 'input.mp4';
      const outputName = 'output.mp4';
  
      console.log('写入文件...');
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
  
      const duration = endTime - startTime;
  
      console.log(`执行剪切：start=${startTime}, duration=${duration}`);
      await ffmpeg.exec([
        '-i', inputName,
        '-ss', String(startTime),
        '-t', String(duration),
        '-c:v', 'copy',
        '-c:a', 'copy',
        outputName
      ]);
      console.log('剪切执行完成');
  
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
  
      setOutputUrl(url);
    } catch (err) {
      console.error('剪切失败:', err);
      alert('剪切过程中出错，请查看控制台日志');
    }
  
    setIsProcessing(false);
  };
  

  return (
    <div>
      <h2>视频剪切器（可设定时间）</h2>

      <input type="file" accept="video/*" onChange={handleFileChange} />
      <br /><br />

      <label>
        开始时间（秒）：
        <input type="number" value={startTime} onChange={(e) => setStartTime(Number(e.target.value))} />
      </label>
      <br />
      <label>
        结束时间（秒）：
        <input type="number" value={endTime} onChange={(e) => setEndTime(Number(e.target.value))} />
      </label>
      <br /><br />

      <button onClick={trimVideo} disabled={isProcessing}>
        {isProcessing ? '剪切中...' : '开始剪切'}
      </button>

      <hr />

      {videoPreview && (
        <div>
          <h4>原始视频预览：</h4>
          <video controls src={videoPreview} width="480" />
        </div>
      )}

      {outputUrl && (
        <div>
          <h4>剪切后视频预览：</h4>
          <video controls src={outputUrl} width="480" />
          <br />
          <a href={outputUrl} download="trimmed.mp4">下载剪切视频</a>
        </div>
      )}
    </div>
  );
}
