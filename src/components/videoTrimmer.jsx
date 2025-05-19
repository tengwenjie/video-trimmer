import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export default function VideoEditor() {
  const ffmpegRef = useRef(null);
  const videoRef = useRef(null);
  const thumbnailContainerRef = useRef(null);

  const [videoFiles, setVideoFiles] = useState([]);
  const [outputUrl, setOutputUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [thumbnails, setThumbnails] = useState([]);

  useEffect(() => {
    ffmpegRef.current = new FFmpeg();
  }, []);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setVideoFiles(files);
    setOutputUrl('');
    setThumbnails([]);
    setIsProcessing(true);

    const ffmpeg = ffmpegRef.current;
    await ffmpeg.load();

    const file = files[0];
    const inputName = 'input.mp4';
    await ffmpeg.writeFile(inputName, await fetchFile(file));
        const data = await ffmpeg.readFile('input.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    setOutputUrl(url);
    setIsProcessing(false);

    const video = document.createElement('video');
    video.src = url;
    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    const thumbs = await generateThumbnails(ffmpeg, 'input.mp4', video.duration);
    setVideoDuration(video.duration);
    setThumbnails(thumbs);
  };

  const generateThumbnails = async (ffmpeg, sourceName, duration) => {
    const thumbs = [];
    const totalThumbs = duration < 10 ? Math.floor(duration) : 10;
    const step = duration < 10 ? 1 : duration / 10;

    for (let i = 0; i < totalThumbs; i++) {
      const time = duration < 10 ? i : i * step;
      const timeStr = time.toFixed(2);
      const outputName = `thumb_${i}.jpg`;

      await ffmpeg.exec([
        '-ss', timeStr,
        '-i', sourceName,
        '-frames:v', '1',
        '-q:v', '5',
        outputName
      ]);

      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data.buffer], { type: 'image/jpeg' });
      thumbs.push({ url: URL.createObjectURL(blob), time: parseFloat(timeStr) });
    }

    return thumbs;
  };

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  const handleDrag = (e) => {
    const container = thumbnailContainerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const time = ratio * videoDuration;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  return (
    <div>
      <h2>视频预览 + 拖动缩略图时间轴</h2>

      <input type="file" accept="video/*" onChange={handleFileChange} />
      <br /><br />

      {outputUrl && (
        <div>
          <h4>视频预览：</h4>

          <video
            ref={videoRef}
            controls
            src={outputUrl}
            width="480"
            onLoadedMetadata={() => {
              const duration = videoRef.current.duration;
              setVideoDuration(duration);
            }}
            onTimeUpdate={() => {
              setCurrentTime(videoRef.current.currentTime);
            }}
          />

          <div style={{ textAlign: 'center' }}>
            {formatTime(currentTime)} / {formatTime(videoDuration)}
          </div>

          <div
            ref={thumbnailContainerRef}
            style={{
              position: 'relative',
              display: 'flex',
              width: '250px',
              overflowX: 'hidden',
              marginTop: '10px',
              cursor: 'pointer',
              border: '2px solid #ccc',
              padding: '4px',
              borderRadius: '6px'
            }}
            onClick={handleDrag}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: `${(currentTime / videoDuration) * 250}px`,
                width: '2px',
                height: '100%',
                backgroundColor: 'red'
              }}
            />
            {thumbnails.map((thumb, idx) => (
              <img
                key={idx}
                src={thumb.url}
                alt={`thumb-${thumb.time}`}
                style={{ width: `${250 / thumbnails.length}px` }}
              />
            ))}
          </div>

          <br />
          <a href={outputUrl} download="result.mp4">下载视频</a>
        </div>
      )}
    </div>
  );
}
