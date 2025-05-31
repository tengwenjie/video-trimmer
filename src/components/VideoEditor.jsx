import React, { useState, useRef } from "react";
import ReactPlayer from "react-player";
import { Box, Paper, Typography, Button,LinearProgress,Backdrop } from "@mui/material";

export default function FilmstripTrimDemo() {
  const [videoUrl, setVideoUrl] = useState("");
  const [outputUrl,setOutputUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [trimRange, setTrimRange] = useState([0, 10]); // 默认前10秒
  const [loading, setLoading] = useState(false);
  const [mergedVideoBlob, setMergedVideoBlob] = useState(null);
  const playerRef = useRef(null);

  // 假缩略图
  const THUMB_COUNT = duration > 0 ? Math.floor(duration / 3) : 20;
  const thumbs = Array.from({ length: THUMB_COUNT }).map(
    (_, i) => `hsl(${(i * 360) / THUMB_COUNT},70%,70%)`
  );

  // 视频上传
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setLoading(true);
  
    const formData = new FormData();
    files.forEach(file => formData.append('videos', file));
  
    // 调用服务器端合并接口（注意端口和路径）
    const res = await fetch('http://3.112.34.135:3001/videos/merge', {
      method: 'POST',
      body: formData,
    });
  
    if (!res.ok) {
      setLoading(false);
      alert('服务器处理失败');
      return;
    }
  
    // 返回的是视频 blob
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setMergedVideoBlob(blob);
    setOutputUrl(url);
    setVideoUrl(url); // 预览合并后的视频
    setLoading(false);
  };


  // 轨道总宽度（px）
  const STRIP_WIDTH = thumbs.length * 44;
  // 区间像素与秒数映射
  const secToPx = (sec) => (sec / duration) * STRIP_WIDTH;
  const pxToSec = (px) => (px / STRIP_WIDTH) * duration;

  // 句柄拖动
  const handleDrag = (which, e) => {
    const rect = e.target.parentNode.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let sec = pxToSec(x);
    if (which === "start") {
      sec = Math.max(0, Math.min(sec, trimRange[1] - 1)); // 保证start<end
      setTrimRange([sec, trimRange[1]]);
    } else {
      sec = Math.min(duration, Math.max(sec, trimRange[0] + 1));
      setTrimRange([trimRange[0], sec]);
    }
  };

    const handleTrim = async () => {
        if (!mergedVideoBlob) {
            alert("请先选择视频文件");
            return;
        }
        if (trimRange[0] >= trimRange[1]) {
            alert("结束时间需大于开始时间");
            return;
        }

        const formData = new FormData();
        const file = new File([mergedVideoBlob], 'merged.mp4', { type: mergedVideoBlob.type || 'video/mp4' });
        formData.append('video', file);
        formData.append('start', trimRange[0]); // 起始时间（单位：秒，字符串类型）
        formData.append('end', trimRange[1]);     // 结束时间（单位：秒，字符串类型）

        setLoading(true);
        const res = await fetch('http://3.112.34.135:3001/videos/trim', {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            setLoading(false);
            alert('裁剪失败');
            return;
        }

        // 返回裁剪后的视频
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setOutputUrl(url);
        
        setLoading(false);
    };

  return (
    <Box maxWidth={700} mx="auto" mt={4} p={2}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h5" mb={2}>胶片轨道裁剪 Demo</Typography>
        <Button variant="contained" component="label">
          选择视频
          <input type="file" accept="video/*" multiple hidden onChange={handleFileChange} />
        </Button>

        {videoUrl && (
          <Box mt={3}>
            <ReactPlayer
              ref={playerRef}
              url={videoUrl}
              controls
              width="100%"
              height="340px"
              onDuration={d => { setDuration(d); setTrimRange([0, Math.min(d, 10)]); }}
            />
            <Typography mt={2} color="text.secondary">
              总时长：{Math.round(duration)} 秒
            </Typography>

            {/* 胶片轨道（图片模拟，实际项目换成缩略图url） */}
            <Box
              position="relative"
              mt={4}
              bgcolor="#232323"
              borderRadius={3}
              p={1}
              sx={{ overflowX: "auto", width: "100%", minHeight: 64 }}
            >
              {/* 缩略图横排 */}
              <Box display="flex">
                {thumbs.map((color, idx) => (
                  <Box
                    key={idx}
                    width={44}
                    height={40}
                    mx={0.25}
                    borderRadius={1}
                    bgcolor={color}
                  />
                ))}
              </Box>

              {/* 裁剪高亮遮罩 */}
              {duration > 0 && (
                <Box position="absolute" top={1} left={0} height={40} width="100%" zIndex={1} pointerEvents="none">
                  {/* 左侧非选中灰色 */}
                  <Box
                    position="absolute"
                    top={0}
                    left={0}
                    height={40}
                    width={secToPx(trimRange[0])}
                    bgcolor="rgba(0,0,0,0.35)"
                  />
                  {/* 右侧非选中灰色 */}
                  <Box
                    position="absolute"
                    top={0}
                    left={secToPx(trimRange[1])}
                    height={40}
                    width={STRIP_WIDTH - secToPx(trimRange[1])}
                    bgcolor="rgba(0,0,0,0.35)"
                  />
                  {/* 选中区间透明框 */}
                  <Box
                    position="absolute"
                    top={0}
                    left={secToPx(trimRange[0])}
                    height={40}
                    width={secToPx(trimRange[1]) - secToPx(trimRange[0])}
                    border="2px solid #42a5f5"
                    borderRadius={1}
                  />
                </Box>
              )}

              {/* 左句柄 */}
              {duration > 0 && (
                <Box
                  position="absolute"
                  top={0}
                  left={secToPx(trimRange[0])}
                  width={16}
                  height={44}
                  zIndex={2}
                  sx={{ cursor: "ew-resize", userSelect: "none" }}
                  onMouseDown={e => {
                    const onMove = ev => { handleDrag("start", ev); };
                    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                >
                  <Box
                    width={16}
                    height={44}
                    bgcolor="#42a5f5"
                    borderRadius={1}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Box width={3} height={28} bgcolor="#fff" borderRadius={2} />
                  </Box>
                </Box>
              )}
              {/* 右句柄 */}
              {duration > 0 && (
                <Box
                  position="absolute"
                  top={0}
                  left={secToPx(trimRange[1]) - 16}
                  width={16}
                  height={44}
                  zIndex={2}
                  sx={{ cursor: "ew-resize", userSelect: "none" }}
                  onMouseDown={e => {
                    const onMove = ev => { handleDrag("end", ev); };
                    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                >
                  <Box
                    width={16}
                    height={44}
                    bgcolor="#42a5f5"
                    borderRadius={1}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Box width={3} height={28} bgcolor="#fff" borderRadius={2} />
                  </Box>
                </Box>
              )}
            </Box>

            {/* 裁剪区间显示 */}
            <Box mt={2} display="flex" alignItems="center">
              <Typography color="primary">
                剪辑区间: {Math.round(trimRange[0])}s ~ {Math.round(trimRange[1])}s
              </Typography>
              <Button sx={{ ml: 2 }} variant="contained" onClick={handleTrim}>裁剪</Button>
            </Box>

            {/* 剪辑后视频预览 */}
            {outputUrl && (
                <Box mt={3}>
                <Typography>剪辑后视频预览</Typography>
                <ReactPlayer url={outputUrl} controls width="100%" height="360px" />
                <Button
                    sx={{ mt: 1 }}
                    variant="outlined"
                    href={outputUrl}
                    download="edited.mp4"
                >
                    下载剪辑视频
                </Button>
                </Box>
            )}
          </Box>
        )}
      </Paper>
      {/* 全屏遮罩+进度条 */}
      <Backdrop
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 2 }}
        open={loading}
      >
        <Box sx={{ width: 360, bgcolor: "#fff", borderRadius: 2, p: 3, boxShadow: 3 }}>
          <LinearProgress />
          <Typography color="text.primary" mt={2} align="center">
            正在处理视频...
          </Typography>
        </Box>
      </Backdrop>
    </Box>
  );
}
