# -*- coding: utf-8 -*-
"""QTune Processor for HumSearch (Librosa Version)"""

import numpy as np
import librosa
import librosa.display
import soundfile as sf
import json
import os
import tempfile
from scipy import signal
from scipy.ndimage import maximum_filter
from scipy.signal import find_peaks
from math import log2
from django.conf import settings

class QTuneProcessor:
    def __init__(self):
        self.sample_rate = 22050  # Lower sample rate for faster processing
        self.hop_length = 512
        self.n_fft = 2048
        
    def load_audio(self, audio_path):
        """Load audio file using librosa."""
        try:
            audio, sr = librosa.load(audio_path, sr=self.sample_rate, mono=True)
            return audio, sr
        except Exception as e:
            print(f"Error loading audio: {e}")
            return None, None
    
    def load_audio_from_bytes(self, audio_bytes):
        """Load audio from bytes."""
        try:
            # Save to temp file and load
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            
            audio, sr = librosa.load(tmp_path, sr=self.sample_rate, mono=True)
            os.unlink(tmp_path)
            return audio, sr
        except Exception as e:
            print(f"Error loading audio from bytes: {e}")
            return None, None
    
    def detect_bpm(self, audio):
        """Detect tempo using librosa."""
        try:
            # Use onset detection for tempo
            onset_env = librosa.onset.onset_strength(y=audio, sr=self.sample_rate)
            tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=self.sample_rate)
            return float(tempo[0]) if len(tempo) > 0 else 120.0
        except:
            return 120.0
    
    def extract_pitches(self, audio):
        """Extract pitch using librosa's piptrack."""
        try:
            # Extract pitch using CQT (Constant-Q Transform)
            cqt = np.abs(librosa.cqt(audio, sr=self.sample_rate, hop_length=self.hop_length))
            
            # Get pitch frequencies
            pitches, magnitudes = librosa.piptrack(
                y=audio, 
                sr=self.sample_rate,
                hop_length=self.hop_length,
                fmin=80.0,
                fmax=1000.0
            )
            
            # Get predominant pitch per frame
            pitch_values = []
            for t in range(pitches.shape[1]):
                index = magnitudes[:, t].argmax()
                pitch = pitches[index, t]
                if pitch > 0:
                    pitch_values.append(pitch)
                else:
                    pitch_values.append(0)
            
            # Calculate times
            pitch_times = librosa.frames_to_time(
                np.arange(len(pitch_values)),
                sr=self.sample_rate,
                hop_length=self.hop_length
            )
            
            # Simple confidence based on magnitude
            pitch_confidence = [1.0 if p > 0 else 0.0 for p in pitch_values]
            
            return pitch_times, np.array(pitch_values), np.array(pitch_confidence)
        except Exception as e:
            print(f"Error extracting pitches: {e}")
            # Return dummy data
            dummy_times = np.linspace(0, len(audio)/self.sample_rate, 100)
            dummy_pitches = np.zeros(100)
            dummy_confidence = np.zeros(100)
            return dummy_times, dummy_pitches, dummy_confidence
    
    def detect_onsets(self, audio):
        """Detect onsets using librosa."""
        try:
            onset_frames = librosa.onset.onset_detect(
                y=audio, 
                sr=self.sample_rate,
                hop_length=self.hop_length,
                backtrack=True
            )
            onset_times = librosa.frames_to_time(
                onset_frames, 
                sr=self.sample_rate,
                hop_length=self.hop_length
            )
            return onset_times
        except Exception as e:
            print(f"Error detecting onsets: {e}")
            # Return evenly spaced onsets as fallback
            duration = len(audio) / self.sample_rate
            return np.linspace(0, duration, min(10, int(duration)))
    
    def _get_note_number(self, pitch: float) -> int:
        """Return the number of the note based on its frequency value."""
        if pitch <= 0:
            return 0
        n = 12 * log2(pitch/440) + 49
        if 1 <= n <= 88:
            return round(n)
        return 0
    
    def _pitches_per_interval(self, audio_length, pitch_values: list, onsets: list) -> list:
        """Calculate the number of pitches contained between two consecutive onsets."""
        num_of_pitches = []
        total_frames = len(pitch_values)
        duration = audio_length / self.sample_rate
        
        for onset_time in onsets:
            frame_idx = int((onset_time / duration) * total_frames)
            num_of_pitches.append(frame_idx)
        
        num_of_pitches.append(total_frames)
        return num_of_pitches
    
    def _average_per_interval(self, pitch_values: list, pitches_per_interval: list, onsets: list) -> list:
        """Calculate the average of pitches contained between two consecutive onsets."""
        avg_per_interval = []
        for i in range(len(onsets) - 1):
            start_idx = pitches_per_interval[i]
            end_idx = pitches_per_interval[i + 1]
            
            if end_idx > start_idx:
                segment = pitch_values[start_idx:end_idx]
                valid_pitches = segment[segment > 0]
                
                if len(valid_pitches) > 0:
                    avg_pitch = np.mean(valid_pitches)
                    note_num = self._get_note_number(avg_pitch)
                else:
                    note_num = 0
            else:
                note_num = 0
            
            avg_per_interval.append(note_num)
        
        return avg_per_interval
    
    def _log_ioi(self, onsets: list, duration) -> list:
        """Calculate log(IOI), the logarithm of time between the two adjacent onsets."""
        log_ioi = []
        if len(onsets) > 1:
            for i in range(len(onsets) - 1):
                ioi = onsets[i + 1] - onsets[i]
                if ioi > 0:
                    log_ioi.append(round(np.log(ioi)))
                else:
                    log_ioi.append(0)
        
        if onsets:
            log_ioi.append(round(np.log(duration - onsets[-1])))
        
        return log_ioi
    
    def _find_relative_pitch(self, avg_pitch_values: list) -> list:
        """Create and return an array of relative pitch changes."""
        pitch_change = 0
        result = []
        
        for i in range(len(avg_pitch_values) - 1):
            pitch_change = -1 * (avg_pitch_values[i] - avg_pitch_values[i + 1])
            if pitch_change == 0 or abs(pitch_change) >= 22:
                continue
            result.append(pitch_change)
        
        return result
    
    def extract_features(self, audio):
        """Extract all features from audio."""
        try:
            # Detect tempo
            tempo = self.detect_bpm(audio)
            
            # Extract pitches
            pitch_times, pitch_values, pitch_confidence = self.extract_pitches(audio)
            
            # Detect onsets
            onsets = self.detect_onsets(audio)
            
            # Calculate features
            num_of_pitches = self._pitches_per_interval(len(audio), pitch_values, onsets)
            avg_pitches = self._average_per_interval(pitch_values, num_of_pitches, onsets)
            
            # Only proceed if we have enough data
            if len(avg_pitches) > 1:
                relative_pitches = self._find_relative_pitch(avg_pitches)
            else:
                relative_pitches = []
            
            return {
                'tempo': float(tempo),
                'relative_pitches': relative_pitches,
                'pitch_count': len(relative_pitches),
                'duration': len(audio) / self.sample_rate,
                'onset_count': len(onsets)
            }
        except Exception as e:
            print(f"Error extracting features: {e}")
            return None
    
    def process_audio_file(self, audio_path: str) -> dict:
        """Process an audio file and extract features."""
        try:
            audio, sr = self.load_audio(audio_path)
            if audio is None:
                return None
            
            return self.extract_features(audio)
        except Exception as e:
            print(f"Error processing audio file: {e}")
            return None
    
    def process_user_audio(self, audio_data: bytes) -> dict:
        """Process user audio data from upload/recording."""
        try:
            audio, sr = self.load_audio_from_bytes(audio_data)
            if audio is None:
                return None
            
            return self.extract_features(audio)
        except Exception as e:
            print(f"Error processing user audio: {e}")
            return None
    
    def calculate_similarity(self, song_features: dict, user_features: dict) -> float:
        """Calculate similarity score between song and user input."""
        try:
            song_pitches = song_features.get('relative_pitches', [])
            user_pitches = user_features.get('relative_pitches', [])
            
            if not song_pitches or not user_pitches:
                return 0.0
            
            # Calculate tempo similarity
            song_tempo = song_features.get('tempo', 120)
            user_tempo = user_features.get('tempo', 120)
            
            tempo_diff = abs(song_tempo - user_tempo)
            tempo_similarity = max(0, 1.0 - tempo_diff / max(song_tempo, user_tempo))
            
            # Calculate pitch sequence similarity using dynamic time warping (DTW)
            if len(song_pitches) > 0 and len(user_pitches) > 0:
                # Simple correlation-based similarity
                min_len = min(len(song_pitches), len(user_pitches))
                song_segment = np.array(song_pitches[:min_len])
                user_segment = np.array(user_pitches[:min_len])
                
                if np.std(song_segment) > 0 and np.std(user_segment) > 0:
                    pitch_corr = np.corrcoef(song_segment, user_segment)[0, 1]
                    if np.isnan(pitch_corr):
                        pitch_similarity = 0
                    else:
                        pitch_similarity = max(0, pitch_corr)
                else:
                    pitch_similarity = 0.5
            else:
                pitch_similarity = 0
            
            # Combine scores (60% pitch similarity, 40% tempo similarity)
            similarity = (0.6 * pitch_similarity + 0.4 * tempo_similarity) * 100
            
            return max(0, min(100, similarity))
        except Exception as e:
            print(f"Error calculating similarity: {e}")
            return 0.0
    
    def find_best_matches(self, user_features: dict, database: list, top_n: int = 3) -> list:
        """Find best matching songs from database."""
        matches = []
        
        for song in database:
            similarity = self.calculate_similarity(song, user_features)
            matches.append({
                'name': song.get('name', 'Unknown'),
                'path': song.get('path', ''),
                'similarity': round(similarity, 1),
                'tempo': song.get('tempo', 0),
                'pitch_count': song.get('pitch_count', 0)
            })
        
        # Sort by similarity
        matches.sort(key=lambda x: x['similarity'], reverse=True)
        
        return matches[:top_n]
    
    
    