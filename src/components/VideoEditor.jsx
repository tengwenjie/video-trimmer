import React, { useState, useRef } from "react";
import ReactPlayer from "react-player";
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack
} from "@mui/material";
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';

export default function VideoUploadWithFilmstrip() {
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null);

  // 假缩略图
  const generateFakeThumbnails = (count = 20) => (
    Array.from({ length: count }).map(
      (_, i) => `hsl(${(i * 360) / count},70%,70%)`
    )
  );
  const thumbs = generateFakeThumbnails(duration > 0 ? Math.floor(duration / 3) : 20);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const formData = new FormData();
    files.forEach(file => formData.append('videos', file));
    const res = await fetch('http://3.112.34.135:3001/videos/merge', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      alert('服务器处理失败');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
  };

  return (
    <Box maxWidth={700} mx="auto" mt={4} p={2}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h5" mb={2} fontWeight={700}>
          视频上传与预览
        </Typography>

        <Stack direction="row" alignItems="center" spacing={2}>
          <Button
            component="label"
            variant="contained"
            startIcon={<VideoLibraryIcon />}
          >
            选择视频文件
            <input
              hidden
              type="file"
              accept="video/*"
              multiple
              onChange={handleFileChange}
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            支持多文件合并
          </Typography>
        </Stack>

        {/* 视频预览 */}
        {videoUrl && (
          <Box mt={4}>
            <Paper
              variant="outlined"
              sx={{ p: 2, borderRadius: 3, background: "#101418" }}
            >
              <ReactPlayer
                ref={playerRef}
                url={videoUrl}
                controls
                width="100%"
                height="340px"
                onDuration={setDuration}
                style={{ borderRadius: 8 }}
              />
              <Typography sx={{ mt: 2, color: "#8bc34a" }}>
                总时长：{Math.round(duration)} 秒
              </Typography>
            </Paper>

            {/* 胶片轨道 */}
            <Paper
              elevation={1}
              sx={{
                mt: 3,
                p: 1,
                borderRadius: 3,
                bgcolor: "#24292f",
                overflowX: "auto",
                boxShadow: 2,
                display: "flex",
                alignItems: "center",
                minHeight: 62,
                maxWidth: "100%"
              }}
            >
              <canvas
                width={thumbs.length * 44}
                height={48}
                style={{ background: "#181c20", borderRadius: 6, minWidth: 180 }}
                ref={canvas => {
                  if (canvas && videoUrl) {
                    const ctx = canvas.getContext("2d");
                    // 填充假缩略图色块
                    thumbs.forEach((color, i) => {
                      ctx.fillStyle = color;
                      ctx.fillRect(i * 44 + 2, 4, 40, 40);
                    });
                    // 分割线
                    ctx.strokeStyle = "#444";
                    for (let i = 0; i < thumbs.length; i++) {
                      ctx.beginPath();
                      ctx.moveTo(i * 44 + 2, 4);
                      ctx.lineTo(i * 44 + 2, 44);
                      ctx.stroke();
                    }
                  }
                }}
              />
            </Paper>
            <Typography sx={{ mt: 1, fontSize: 12, color: "#aaa" }}>
              胶片轨道，演示用假缩略图。正式应用请用视频缩略图替换。
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
