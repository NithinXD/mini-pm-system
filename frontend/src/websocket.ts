let socket: WebSocket | null = null;

export const getWebSocket = (projectId: string) => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    socket = new WebSocket(`ws://localhost:8000/ws/tasks/${projectId}/`);
    socket.onopen = () => {
      console.log("WebSocket connected - timestamp:", Date.now());
      // Optionally request full state
      // socket.send(JSON.stringify({ action: "requestState" }));
    };
    socket.onclose = () => {
      console.log("WebSocket closed");
      socket = null;
    };
  }
  return socket;
};
