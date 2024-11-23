const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Handle socket.io connections
io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Listen for video actions
    socket.on("video-action", (data) => {
        // Broadcast the action to other users
        socket.broadcast.emit("video-action", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

const PORT = 5001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
