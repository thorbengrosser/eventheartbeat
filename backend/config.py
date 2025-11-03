import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Application configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    # EventMobi API base URL - according to Swagger docs, this is the Unified API URL
    EVENTMOBI_API_BASE_URL = os.environ.get('EVENTMOBI_API_BASE_URL', 'https://uapi.eventmobi.com')
    CORS_ORIGINS = [o.strip() for o in os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]
    WEBHOOK_BASE_URL = os.environ.get('WEBHOOK_BASE_URL', 'http://localhost:5001')

