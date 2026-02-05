from django.shortcuts import render
from django.http import JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import FileSystemStorage
import json
import os
import wave
import struct
import io
from utils.qtune_processor import QTuneProcessor
from django.conf import settings

processor = QTuneProcessor()

def home(request):
    """Render the main page."""
    return render(request, 'index.html')

@csrf_exempt
def upload_audio(request):
    """Handle audio file upload."""
    if request.method == 'POST':
        try:
            if 'audio' in request.FILES:
                audio_file = request.FILES['audio']
                
                # Save uploaded file
                fs = FileSystemStorage(location=settings.MEDIA_ROOT / 'uploads')
                filename = fs.save(audio_file.name, audio_file)
                file_path = fs.path(filename)
                
                # Process the audio
                with open(file_path, 'rb') as f:
                    audio_data = f.read()
                
                features = processor.process_user_audio(audio_data)
                
                if features:
                    # Find matches
                    database = load_song_database()
                    
                    if not database:
                        return JsonResponse({
                            'success': False,
                            'error': 'No songs in database. Please add songs to media/songs/ directory first.'
                        })
                    
                    matches = processor.find_best_matches(features, database)
                    
                    return JsonResponse({
                        'success': True,
                        'features': {
                            'tempo': features.get('tempo', 0),
                            'duration': features.get('duration', 0),
                            'pitch_count': features.get('pitch_count', 0),
                            'onset_count': features.get('onset_count', 0)
                        },
                        'matches': matches
                    })
                else:
                    return JsonResponse({
                        'success': False,
                        'error': 'Could not extract features from audio.'
                    })
            else:
                return JsonResponse({
                    'success': False,
                    'error': 'No audio file provided. Please select a file.'
                })
        
        except Exception as e:
            print(f"Error in upload_audio: {e}")
            return JsonResponse({
                'success': False,
                'error': f'Server error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'error': 'Invalid request method'})

def webm_to_wav(webm_data):
    """Convert WebM/Opus audio to WAV format."""
    try:
        import tempfile
        import subprocess
        
        # Create temporary files
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
            webm_file.write(webm_data)
            webm_path = webm_file.name
        
        wav_path = webm_path.replace('.webm', '.wav')
        
        # Use ffmpeg to convert WebM to WAV
        try:
            # Try using ffmpeg (preferred)
            cmd = [
                'ffmpeg', '-y', '-i', webm_path,
                '-acodec', 'pcm_s16le',
                '-ac', '1',
                '-ar', '22050',
                wav_path
            ]
            
            # Run conversion
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                # If ffmpeg fails, try alternative with avconv
                cmd = [
                    'avconv', '-y', '-i', webm_path,
                    '-acodec', 'pcm_s16le',
                    '-ac', '1',
                    '-ar', '22050',
                    wav_path
                ]
                result = subprocess.run(cmd, capture_output=True, text=True)
            
            if os.path.exists(wav_path):
                with open(wav_path, 'rb') as f:
                    wav_data = f.read()
                
                # Clean up temp files
                os.unlink(webm_path)
                os.unlink(wav_path)
                
                return wav_data
            else:
                print(f"Conversion failed: {result.stderr}")
                return None
                
        except FileNotFoundError:
            # If ffmpeg/avconv is not available, use pydub as fallback
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_file(webm_path, format="webm")
                audio = audio.set_frame_rate(22050).set_channels(1)
                
                # Export to WAV
                wav_buffer = io.BytesIO()
                audio.export(wav_buffer, format="wav")
                wav_data = wav_buffer.getvalue()
                
                # Clean up temp file
                os.unlink(webm_path)
                
                return wav_data
            except ImportError:
                print("pydub not installed. Installing pydub with: pip install pydub")
                return None
            except Exception as e:
                print(f"Pydub conversion error: {e}")
                return None
                
    except Exception as e:
        print(f"WebM to WAV conversion error: {e}")
        return None

@csrf_exempt
def record_audio(request):
    """Handle recorded audio from browser."""
    if request.method == 'POST':
        try:
            audio_data = None
            
            # Handle different ways audio data can be sent
            if 'audio' in request.FILES:
                # FormData submission
                audio_file = request.FILES['audio']
                audio_data = audio_file.read()
            elif request.body:
                # Raw body submission
                audio_data = request.body
            
            if not audio_data:
                return JsonResponse({'success': False, 'error': 'No audio data received'})
            
            # Check if it's WebM format and convert to WAV
            if isinstance(audio_data, bytes):
                # Check for WebM/Opus signature
                if audio_data[:4] == b'\x1aE\xdf\xa3' or b'webm' in audio_data[:100].lower():
                    print("Converting WebM to WAV...")
                    wav_data = webm_to_wav(audio_data)
                    if wav_data:
                        audio_data = wav_data
                    else:
                        return JsonResponse({
                            'success': False,
                            'error': 'Failed to convert audio format. Please install ffmpeg: sudo apt-get install ffmpeg'
                        })
            
            # Process the audio
            features = processor.process_user_audio(audio_data)
            
            if features:
                # Find matches
                database = load_song_database()
                
                if not database:
                    return JsonResponse({
                        'success': False,
                        'error': 'No songs in database. Please add songs to media/songs/ directory.'
                    })
                
                matches = processor.find_best_matches(features, database)
                
                return JsonResponse({
                    'success': True,
                    'features': {
                        'tempo': features.get('tempo', 0),
                        'duration': features.get('duration', 0),
                        'pitch_count': features.get('pitch_count', 0),
                        'onset_count': features.get('onset_count', 0)
                    },
                    'matches': matches
                })
            else:
                return JsonResponse({
                    'success': False,
                    'error': 'Could not extract features from audio. Please try a clearer recording.'
                })
        
        except Exception as e:
            print(f"Error in record_audio: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({
                'success': False,
                'error': f'Processing error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'error': 'Invalid request method'})

@csrf_exempt
def match_song(request):
    """Match audio features against database."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            user_features = data.get('features', {})
            
            # Find matches
            database = load_song_database()
            matches = processor.find_best_matches(user_features, database)
            
            return JsonResponse({
                'success': True,
                'matches': matches
            })
        
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            })
    
    return JsonResponse({'success': False, 'error': 'Invalid request'})

def get_songs(request):
    """Get list of available songs."""
    database = load_song_database()
    songs = []
    
    for song in database:
        songs.append({
            'name': song.get('name'),
            'path': song.get('path'),
            'tempo': song.get('tempo'),
            'pitch_count': song.get('pitch_count', 0)
        })
    
    return JsonResponse({'songs': songs})

def play_song(request, song_path):
    """Serve song file for playback."""
    try:
        # Construct full path
        full_path = os.path.join(settings.MEDIA_ROOT, song_path)
        
        if os.path.exists(full_path):
            # Serve the file
            response = FileResponse(open(full_path, 'rb'))
            
            # Set appropriate content type based on file extension
            if full_path.endswith('.mp3'):
                response['Content-Type'] = 'audio/mpeg'
            elif full_path.endswith('.wav'):
                response['Content-Type'] = 'audio/wav'
            elif full_path.endswith('.ogg'):
                response['Content-Type'] = 'audio/ogg'
            else:
                response['Content-Type'] = 'audio/mpeg'
            
            return response
        else:
            return JsonResponse({'error': 'Song not found'}, status=404)
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

def load_song_database():
    """Load song database from JSON file."""
    db_path = settings.SONG_DATABASE_PATH
    
    if not os.path.exists(db_path):
        # Create initial database
        return create_song_database()
    
    else:
        # Load existing database
        try:
            with open(db_path, 'r') as f:
                database = json.load(f)
                # Ensure database is a list
                if not isinstance(database, list):
                    return create_song_database()
                return database
        except:
            return create_song_database()

def create_song_database():
    """Create song database by scanning songs directory."""
    database = []
    
    # Scan songs directory
    songs_dir = settings.MEDIA_ROOT / 'songs'
    
    if songs_dir.exists():
        for file in songs_dir.iterdir():
            if file.suffix.lower() in ['.mp3', '.wav', '.ogg', '.m4a', '.flac']:
                print(f"Processing {file.name}...")
                
                try:
                    features = processor.process_audio_file(str(file))
                    if features and features.get('relative_pitches'):
                        database.append({
                            'name': file.stem.replace('_', ' ').title(),
                            'path': str(file.relative_to(settings.MEDIA_ROOT)),
                            'tempo': features['tempo'],
                            'relative_pitches': features['relative_pitches'],
                            'pitch_count': features['pitch_count'],
                            'duration': features['duration'],
                            'onset_count': features.get('onset_count', 0)
                        })
                        print(f"  ✓ Added {file.name} to database")
                    else:
                        print(f"  ✗ Could not extract features from {file.name}")
                
                except Exception as e:
                    print(f"  ✗ Error processing {file.name}: {e}")
    
    # Save database
    db_path = settings.SONG_DATABASE_PATH
    with open(db_path, 'w') as f:
        json.dump(database, f, indent=2)
    
    print(f"Database created with {len(database)} songs")
    return database