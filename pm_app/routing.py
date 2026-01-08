"""
WebSocket URL routing for real-time features.
"""
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/tasks/(?P<project_id>\w+)/$', consumers.TaskConsumer.as_asgi()),
    re_path(r'ws/comments/(?P<task_id>\w+)/$', consumers.TaskCommentConsumer.as_asgi()),
]
