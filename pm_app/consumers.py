"""
WebSocket consumers for real-time updates.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Task, TaskComment


class TaskCommentConsumer(AsyncWebsocketConsumer):
    """Consumer for real-time task comment updates."""
    
    async def connect(self):
        self.task_id = self.scope['url_route']['kwargs']['task_id']
        self.room_group_name = f'task_{self.task_id}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        """Receive message from WebSocket."""
        text_data_json = json.loads(text_data)
        message_type = text_data_json.get('type')

        if message_type == 'comment_added':
            # Broadcast to room group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'comment_notification',
                    'comment': text_data_json.get('comment')
                }
            )

    async def comment_notification(self, event):
        """Send comment notification to WebSocket."""
        comment = event['comment']

        await self.send(text_data=json.dumps({
            'type': 'comment_added',
            'comment': comment
        }))

    async def new_comment(self, event):
        """Handle new comment event from signal."""
        await self.send(text_data=json.dumps({
            'type': 'comment_added',
            'comment': event['comment']
        }))

import sys

class TaskConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print(f"WebSocket CONNECT for project_id={self.scope['url_route']['kwargs']['project_id']}", file=sys.stderr)
        self.project_id = self.scope['url_route']['kwargs']['project_id']
        self.group_name = f"task_project_{self.project_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        print(f"WebSocket DISCONNECT for project_id={self.project_id}", file=sys.stderr)
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def task_update(self, event):
        print(f"WebSocket task_update event: {event}", file=sys.stderr)
        await self.send(text_data=json.dumps(event['data']))
