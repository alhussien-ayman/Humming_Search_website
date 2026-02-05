#!/usr/bin/env python
"""
Initialize the song database.
Run this once after adding songs to media/songs/ directory.
"""

import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Humming.settings')
django.setup()

from Humming.views import create_song_database

if __name__ == '__main__':
    print("Initializing HumSearch database...")
    database = create_song_database()
    print(f"\n✅ Database initialized with {len(database)} songs!")
    print("\nNow you can:")
    print("1. Run: python manage.py runserver")
    print("2. Open: http://localhost:8000")
    print("3. Record or upload audio to find matches!")