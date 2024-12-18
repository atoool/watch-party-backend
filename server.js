const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Be more specific in production
  },
});

app.use(cors()); // Add this line to enable CORS
app.use(express.json());

const ffmpegProcesses = new Map();

app.post('/transcode', (req, res) => {
  const { videoUrl, roomId } = req.body;
  const videoName = path.basename(videoUrl, path.extname(videoUrl)).replace(/[^a-zA-Z0-9]/g, "").replace(/\s+/g, "");
  const videosDir = path.join(os.tmpdir());

  // Terminate any existing FFmpeg process for the same room
  if (ffmpegProcesses.has(roomId)) {
    const existingProcess = ffmpegProcesses.get(roomId);
    existingProcess.kill('SIGINT');
    ffmpegProcesses.delete(roomId);
  }
  
  // Transcode the video using FFmpeg
  const command = `ffmpeg -i "${videoUrl}" -c:v libx264 -c:a aac -f segment -segment_time 300 -reset_timestamps 1 "${videosDir}/${videoName}_%03d.mp4"`;
  const ffmpegProcess = exec(command);

  ffmpegProcesses.set(roomId, ffmpegProcess);

  ffmpegProcess.on('error', (error) => {
      console.error(`Error transcoding video: ${error.message}`);
      ffmpegProcesses.delete(roomId);
      return res.status(500).json({ error: 'Error transcoding video' });
  });

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
    // Check for new chunks
    fs.readdir(videosDir, (err, files) => {
      if (err) {
        console.error(`Error reading directory: ${err.message}`);
        return;
      }

      // Emit the chunk URLs to the frontend
      console.log('Files:', files);
      const chunkUrls = files.map(file => `https://watch-party-backend-sppv.onrender.com/videos/${file}`);
      io.to(roomId).emit("videoAction", { action: 'videourl', roomId, url: chunkUrls });
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      res.json({ message: 'Transcoding started' });
    });
  });

});

app.use('/videos', express.static(path.join(os.tmpdir())));

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  console.log("Total connected clients:", io.engine.clientsCount);
  socket.onAny((eventName, ...args) => {
    console.log("Received event:", eventName, "with args:", args);
  });
  // Listen for 'joinRoom' events
  socket.on("joinRoom", ({ roomId, username }) => {
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    socket.join(roomId); // Add the socket to the specified room

    // Log all clients in this room
    const clients = io.sockets.adapter.rooms.get(roomId);
    console.log(
      `Clients in room ${roomId}:`,
      clients ? Array.from(clients) : []
    );

    // Confirm the user has joined the room
    socket
      .to(roomId)
      .emit("roomJoined", {
        message: `${username} has joined room: ${roomId}`,
        count: io.engine.clientsCount,
      });
  });

  // Handle messages sent to the room
  socket.on("sendMessageToRoom", ({ roomId, message, username }) => {
    console.log(`Message to ${roomId}: ${message}`);
    console.log(`Sender socket ID: ${socket.id}`);

    // Log all clients in this room before sending
    const clients = io.sockets.adapter.rooms.get(roomId);
    console.log(
      `Clients in room ${roomId}:`,
      clients ? Array.from(clients) : []
    );

    // Broadcast message to everyone in the room
    socket.to(roomId).emit("roomMessage", { message, roomId, username });
  });

  // Handle messages sent to the room
  socket.on("videoTriggered", ({ roomId, action, time = 0, url = '' }) => {
    console.log(`Video action trigger to ${roomId}: ${action}`);

    // Broadcast message to everyone in the room
    if(action === 'videourl'){
      io.to(roomId).emit("videoAction", { action, roomId, url });
    }
    else{
      socket.to(roomId).emit("videoAction", { action, time, roomId });
    }
  });

  socket.on("joinVideoRoom", ({ roomId, username }) => {
    console.log(`Socket ${socket.id} joined video room ${roomId}`);
    socket.join(`video-${roomId}`);
    socket.to(`video-${roomId}`).emit("userJoinedCall", {
      userId: socket.id,
      username,
    });
  });

  socket.on("offer", ({ offer, to, roomId }) => {
    console.log(`Received offer from ${socket.id} to ${to} in room ${roomId}`);
    socket.to(to).emit("offer", {
      offer,
      from: socket.id,
    });
  });

  socket.on("answer", ({ answer, to, roomId }) => {
    console.log(`Received answer from ${socket.id} to ${to} in room ${roomId}`);
    socket.to(to).emit("answer", {
      answer,
      from: socket.id,
    });
  });

  socket.on("iceCandidate", ({ candidate, to, roomId }) => {
    console.log(`Received ICE candidate from ${socket.id} to ${to} in room ${roomId}`);
    socket.to(to).emit("iceCandidate", {
      candidate,
      from: socket.id,
    });
  });

  socket.on("leaveVideoRoom", ({ roomId }) => {
    if(!!roomId){
    socket.to(`video-${roomId}`).emit("userLeftCall", {
      userId: socket.id,
    });
    socket.leave(`video-${roomId}`);
    io.emit("userLeftCall", {
      userId: socket.id,
    });
  }
  });
  // Handle disconnection
  socket.on("disconnect", ({roomId}) => {
    console.log("A user disconnected:", socket.id);
    socket.to(`video-${roomId}`).emit("userLeftCall", {
      userId: socket.id,
    });
    socket.leave(`video-${roomId}`);
    io.emit("userLeftCall", {
      userId: socket.id,
    });
  });
});

// Add error handling
io.engine.on("connection_error", (err) => {
  console.log("Connection error:", err);
});

const PORT = 5001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});