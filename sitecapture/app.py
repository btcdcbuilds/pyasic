"""Vercel entry point: Vercel serves the ASGI ``app`` defined here."""

from sitecapture.api.app import create_app

app = create_app()
