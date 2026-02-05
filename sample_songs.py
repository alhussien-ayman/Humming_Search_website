#!/usr/bin/env python
"""
Script to add sample songs to the database.
Place MP3 files in the songs directory or use this to download samples.
"""

import os
from django.conf import settings
from utils.qtune_processor import QTuneProcessor

def add_sample_songs():
    """Add sample songs to the database."""
    processor = QTuneProcessor()
    
    # List of sample song URLs (optional - for downloading)
    sample_songs = [
        {
            'name': 'Shape Of You',
            'url': '',  # Leave empty if you have local files
            'filename': 'shape_of_you.mp3'
        },
        {
            'name': 'Moonlight Sonata',
            'url': '',
            'filename': 'moonlight_sonata.mp3'
        },
        {
            'name': 'Star Wars Theme',
            'url': '',
            'filename': 'star_wars_theme.mp3'
        },
        {
            'name': 'Happy Birthday',
            'url': '',
            'filename': 'happy_birthday.mp3'
        },
        {
            'name': 'Twinkle Twinkle',
            'url': '',
            'filename': 'twinkle_twinkle.mp3'
        }
    ]
    
    songs_dir = settings.MEDIA_ROOT / 'songs'
    songs_dir.mkdir(parents=True, exist_ok=True)
    
    print("Adding sample songs to database...")
    
    # If you want to download sample songs, uncomment and install requests:
    # import requests
    # for song in sample_songs:
    #     if song['url']:
    #         print(f"Downloading {song['name']}...")
    #         response = requests.get(song['url'])
    #         file_path = songs_dir / song['filename']
    #         with open(file_path, 'wb') as f:
    #             f.write(response.content)
    
    print("Sample songs added. Place your MP3 files in media/songs/ directory.")
    print("Then run the application and click 'Scan Songs' in the web interface.")

if __name__ == '__main__':
    import django
    import sys
    
    # Setup Django
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Humming.settings')
    django.setup()
    
    add_sample_songs()