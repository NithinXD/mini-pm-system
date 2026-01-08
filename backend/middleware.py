"""
Custom middleware for performance monitoring and logging.
"""
import time
import logging
from django.http import HttpRequest

logger = logging.getLogger(__name__)


class PerformanceMiddleware:
    """Middleware to log request processing time."""
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest):
        start_time = time.time()
        
        response = self.get_response(request)
        
        duration = time.time() - start_time
        
        # Log slow requests (> 1 second)
        if duration > 1:
            logger.warning(
                f"Slow request: {request.method} {request.path} took {duration:.2f}s"
            )
        else:
            logger.debug(
                f"Request: {request.method} {request.path} took {duration:.2f}s"
            )
        
        # Add custom header with processing time
        response['X-Process-Time'] = f"{duration:.2f}s"
        
        return response
