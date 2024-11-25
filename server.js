const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Be more specific in production
  },
});

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
  socket.on("videoTriggered", ({ roomId, action, time = 0 }) => {
    console.log(`Video action trigger to ${roomId}: ${action}`);

    // Broadcast message to everyone in the room
    io.to(roomId).emit("videoAction", { action, time, roomId });
  });

  socket.on("joinVideoRoom", ({ roomId, username }) => {
    socket.join(`video-${roomId}`);
    socket.to(`video-${roomId}`).emit("userJoinedCall", {
      userId: socket.id,
      username,
    });
  });
  socket.on("offer", ({ offer, to, roomId }) => {
    socket.to(to).emit("offer", {
      offer,
      from: socket.id,
    });
  });

  socket.on("answer", ({ answer, to, roomId }) => {
    socket.to(to).emit("answer", {
      answer,
      from: socket.id,
    });
  });

  socket.on("iceCandidate", ({ candidate, to, roomId }) => {
    socket.to(to).emit("iceCandidate", {
      candidate,
      from: socket.id,
    });
  });

  socket.on("leaveVideoRoom", ({ roomId }) => {
    socket.to(`video-${roomId}`).emit("userLeftCall", {
      userId: socket.id,
    });
    socket.leave(`video-${roomId}`);
    io.emit("userLeftCall", {
      userId: socket.id,
    });
  });
  // Handle disconnection
  socket.on("disconnect", () => {
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
