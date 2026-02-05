// Global variables
let mediaRecorder;
let audioChunks = [];
let recordingTimeout;
let timerInterval;
let startTime;
let selectedDuration = 10;
let currentAudioBlob = null;
let currentMode = 'record'; // 'record' or 'upload'
let audioContext;
let analyser;
let visualizerInterval;

// DOM Elements
const recordModeBtn = document.getElementById('recordModeBtn');
const uploadModeBtn = document.getElementById('uploadModeBtn');
const recordMode = document.getElementById('recordMode');
const uploadMode = document.getElementById('uploadMode');
const recordBtn = document.getElementById('recordBtn');
const durationSelect = document.getElementById('duration');
const timer = document.getElementById('timer');
const recordedAudioPlayer = document.getElementById('recordedAudioPlayer');
const recordedAudio = document.getElementById('recordedAudio');
const uploadArea = document.getElementById('uploadArea');
const audioFileInput = document.getElementById('audioFileInput');
const uploadedAudioPlayer = document.getElementById('uploadedAudioPlayer');
const uploadedAudio = document.getElementById('uploadedAudio');
const uploadedFileName = document.getElementById('uploadedFileName');
const loadingIndicator = document.getElementById('loadingIndicator');
const resultsSection = document.getElementById('resultsSection');
const resultsList = document.getElementById('resultsList');
const noResults = document.getElementById('noResults');
const analysisSection = document.getElementById('analysisSection');
const analysisGrid = document.getElementById('analysisGrid');
const visualizer = document.getElementById('visualizer');
const currentPath = document.getElementById('currentPath');

// Match Section Elements
const recordMatchSection = document.getElementById('recordMatchSection');
const findMatchesBtn = document.getElementById('findMatchesBtn');
const tryAgainBtn = document.getElementById('tryAgainBtn');
const uploadMatchSection = document.getElementById('uploadMatchSection');
const uploadFindMatchesBtn = document.getElementById('uploadFindMatchesBtn');
const uploadTryAgainBtn = document.getElementById('uploadTryAgainBtn');
const recordStatus = document.getElementById('recordStatus');
const uploadStatus = document.getElementById('uploadStatus');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    updatePath('Record Mode');
    showWelcomeMessage();
    
    // Initialize audio context for visualizer
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn('Web Audio API not supported');
    }
    
    // Check if Web Audio API is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showStatus('record', 'Your browser does not support audio recording. Please use Chrome, Firefox, or Edge.', 'error');
        recordBtn.disabled = true;
    }
    
    // Handle logo image error
    const logoImg = document.querySelector('.logo-img');
    if (logoImg) {
        logoImg.onerror = function() {
            // Create fallback logo icon
            const fallbackLogo = document.createElement('div');
            fallbackLogo.className = 'logo-icon-fallback';
            fallbackLogo.innerHTML = '<i class="fas fa-music"></i>';
            fallbackLogo.style.cssText = `
                width: 50px;
                height: 50px;
                background: #ef3f65;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid #ef3f65;
            `;
            logoImg.parentNode.replaceChild(fallbackLogo, logoImg);
        };
    }
});

// Event Listeners
function initializeEventListeners() {
    // Mode toggle
    recordModeBtn.addEventListener('click', () => {
        switchMode('record');
        updatePath('Record Mode');
    });
    uploadModeBtn.addEventListener('click', () => {
        switchMode('upload');
        updatePath('Upload Mode');
    });

    // Duration selector
    durationSelect.addEventListener('change', (e) => {
        selectedDuration = parseInt(e.target.value);
    });

    // Record button
    recordBtn.addEventListener('click', toggleRecording);

    // Upload area
    uploadArea.addEventListener('click', () => audioFileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // File input
    audioFileInput.addEventListener('change', handleFileSelect);

    // Match buttons
    findMatchesBtn.addEventListener('click', () => {
        updatePath('Processing...');
        processCurrentAudio('record');
    });
    tryAgainBtn.addEventListener('click', () => {
        resetRecordMode();
        updatePath('Record Mode');
    });
    uploadFindMatchesBtn.addEventListener('click', () => {
        updatePath('Processing...');
        processCurrentAudio('upload');
    });
    uploadTryAgainBtn.addEventListener('click', () => {
        resetUploadMode();
        updatePath('Upload Mode');
    });

    // Theme toggle
    document.querySelector('.header-btn[title="Settings"]')?.addEventListener('click', () => {
        // Toggle theme
        document.body.classList.toggle('light-theme');
        const themeIcon = document.querySelector('.header-btn[title="Settings"] i');
        if (document.body.classList.contains('light-theme')) {
            themeIcon.className = 'fas fa-moon';
        } else {
            themeIcon.className = 'fas fa-sun';
        }
    });

    // Help button
    document.querySelector('.header-btn[title="Help"]')?.addEventListener('click', () => {
        showStatus(currentMode, 
            'Need help? 1. Record or upload audio 2. Click Find Matches 3. View results and play songs', 
            'info');
    });

    // Window resize handling
    window.addEventListener('resize', handleResize);
}

// Update path in header
function updatePath(path) {
    if (currentPath) {
        currentPath.textContent = path;
        // Add animation
        currentPath.style.animation = 'none';
        setTimeout(() => {
            currentPath.style.animation = 'fadeIn 0.3s ease';
        }, 10);
    }
}

// Handle window resize
function handleResize() {
    // Adjust visualizer size on resize
    if (visualizerInterval) {
        // Force re-render of visualizer
        const bars = visualizer.querySelectorAll('.bar');
        bars.forEach(bar => {
            bar.style.transform = 'scale(1)';
        });
    }
}

// Show welcome message
function showWelcomeMessage() {
    console.log('HumSearch initialized. Ready to find songs!');
    showStatus('record', 'Welcome to HumSearch! Click the microphone to start recording.', 'info');
}

// Mode Switching
function switchMode(mode) {
    currentMode = mode;
    
    // Reset all content animations
    document.querySelectorAll('.mode-content').forEach(content => {
        content.classList.remove('content-fade-in');
        void content.offsetWidth; // Trigger reflow
        content.classList.add('content-fade-in');
    });
    
    if (mode === 'record') {
        recordModeBtn.classList.add('active');
        uploadModeBtn.classList.remove('active');
        recordMode.classList.add('active');
        uploadMode.classList.remove('active');
        resetUploadMode();
    } else {
        uploadModeBtn.classList.add('active');
        recordModeBtn.classList.remove('active');
        uploadMode.classList.add('active');
        recordMode.classList.remove('active');
        resetRecordMode();
    }
    hideResults();
    hideAnalysis();
    hideMatchSection();
}

// Recording Functions
async function toggleRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        await startRecording();
        updatePath('Recording...');
    } else {
        stopRecording();
        updatePath('Record Mode');
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                sampleRate: 22050,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });

        // Set up visualizer
        if (audioContext) {
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            
            visualizer.style.display = 'flex';
            startVisualizer();
        }

        // Use webm format which is widely supported
        const options = { 
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 128000
        };
        
        // Fallback to default if the specified mimeType is not supported
        let mediaRecorderOptions = options;
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn('Preferred mimeType not supported, using default');
            mediaRecorderOptions = {};
        }
        
        mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            try {
                currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                
                // Show audio player immediately
                const audioUrl = URL.createObjectURL(currentAudioBlob);
                recordedAudio.src = audioUrl;
                recordedAudioPlayer.classList.remove('hidden');
                
                // Show match section
                showMatchSection('record');
                
                // Show success message
                showStatus('record', 'Recording completed! Click "Find Matching Songs" to search.', 'success');
                
            } catch (error) {
                console.error('Error processing recording:', error);
                showStatus('record', 'Error processing recording. Please try again.', 'error');
            }
            
            stream.getTracks().forEach(track => track.stop());
            stopVisualizer();
        };

        mediaRecorder.start(100); // Collect data every 100ms
        updateRecordButton(true);
        startTimer();

        recordingTimeout = setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording();
                updatePath('Record Mode');
            }
        }, selectedDuration * 1000);

    } catch (error) {
        console.error('Error accessing microphone:', error);
        showStatus('record', 'Unable to access microphone. Please check your permissions.', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        clearTimeout(recordingTimeout);
        clearInterval(timerInterval);
        updateRecordButton(false);
        visualizer.style.display = 'none';
        stopVisualizer();
    }
}

function startVisualizer() {
    if (!analyser) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bars = visualizer.querySelectorAll('.bar');
    
    visualizerInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        
        // Update bar heights
        bars.forEach((bar, index) => {
            const barIndex = Math.floor((index / bars.length) * bufferLength);
            const height = (dataArray[barIndex] / 255) * 30;
            bar.style.height = Math.max(10, height) + 'px';
            bar.style.opacity = Math.max(0.5, dataArray[barIndex] / 255);
            bar.style.backgroundColor = `rgba(239, 63, 101, ${0.5 + (dataArray[barIndex] / 255) * 0.5})`;
        });
    }, 100);
}

function stopVisualizer() {
    if (visualizerInterval) {
        clearInterval(visualizerInterval);
        visualizerInterval = null;
    }
    
    // Reset bar heights
    const bars = visualizer.querySelectorAll('.bar');
    bars.forEach(bar => {
        bar.style.height = '10px';
        bar.style.opacity = '1';
        bar.style.backgroundColor = '#ef3f65';
    });
}

function updateRecordButton(isRecording) {
    if (isRecording) {
        recordBtn.classList.add('recording');
        recordBtn.innerHTML = `
            <div class="record-icon">
                <i class="fas fa-stop-circle"></i>
            </div>
            <span>Stop Recording</span>
        `;
    } else {
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = `
            <div class="record-icon">
                <i class="fas fa-microphone"></i>
            </div>
            <span>Start Recording</span>
        `;
    }
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = selectedDuration - elapsed;

        if (remaining <= 0) {
            timer.textContent = '00:00';
            clearInterval(timerInterval);
        } else {
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            // Color change when time is running out
            if (remaining <= 5) {
                timer.style.color = '#ff0000';
                timer.style.textShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
            } else if (remaining <= 10) {
                timer.style.color = '#ffa500';
                timer.style.textShadow = '0 0 10px rgba(255, 165, 0, 0.5)';
            } else {
                timer.style.color = '#ef3f65';
                timer.style.textShadow = '0 0 10px rgba(239, 63, 101, 0.5)';
            }
        }
    }, 100);
}

// Upload Functions
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('audio/')) {
        showStatus('upload', 'Please upload a valid audio file (MP3, WAV, OGG, M4A)', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showStatus('upload', 'File size must be less than 10MB', 'error');
        return;
    }

    currentAudioBlob = file;
    const audioUrl = URL.createObjectURL(file);
    uploadedAudio.src = audioUrl;
    uploadedFileName.textContent = file.name;
    uploadedAudioPlayer.classList.remove('hidden');
    
    // Show match section
    showMatchSection('upload');
    
    // Show success message
    showStatus('upload', 'File uploaded successfully! Click "Find Matching Songs" to search.', 'success');
}

// Show/Hide Match Section
function showMatchSection(mode) {
    if (mode === 'record') {
        recordMatchSection.classList.remove('hidden');
    } else {
        uploadMatchSection.classList.remove('hidden');
    }
}

function hideMatchSection() {
    recordMatchSection.classList.add('hidden');
    uploadMatchSection.classList.add('hidden');
}

// Status Messages
function showStatus(mode, message, type) {
    const statusElement = mode === 'record' ? recordStatus : uploadStatus;
    
    statusElement.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;
    statusElement.className = `status-message status-${type}`;
    statusElement.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusElement.classList.add('hidden');
    }, 5000);
}

// Audio Processing and Matching
async function processCurrentAudio(mode) {
    if (!currentAudioBlob) {
        showStatus(mode, 'No audio available. Please record or upload first.', 'error');
        updatePath(mode === 'record' ? 'Record Mode' : 'Upload Mode');
        return;
    }
    
    showLoading();
    hideResults();
    hideAnalysis();
    
    try {
        const formData = new FormData();
        
        // Handle different blob types
        if (currentAudioBlob instanceof File) {
            // Uploaded file
            formData.append('audio', currentAudioBlob);
        } else if (currentAudioBlob instanceof Blob) {
            // Recorded audio
            const filename = mode === 'record' ? 'recording.webm' : 'audio.webm';
            formData.append('audio', currentAudioBlob, filename);
        }
        
        const endpoint = mode === 'record' ? '/record/' : '/upload/';
        
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show analysis
            showAnalysis(data.features);
            
            // Show matches
            displayResults(data.matches);
            
            // Hide match section after processing
            hideMatchSection();
            
            // Update path
            updatePath('Results');
            
        } else {
            showStatus(mode, data.error || 'Error processing audio', 'error');
            showNoResults();
            updatePath(mode === 'record' ? 'Record Mode' : 'Upload Mode');
        }
        
    } catch (error) {
        console.error('Processing error:', error);
        showStatus(mode, 'Error processing audio. Please try again.', 'error');
        showNoResults();
        updatePath(mode === 'record' ? 'Record Mode' : 'Upload Mode');
    }
    
    hideLoading();
}

function showAnalysis(features) {
    if (!features) return;
    
    analysisGrid.innerHTML = '';
    
    const analysisData = [
        { label: 'Detected Tempo', value: `${features.tempo?.toFixed(1) || 'N/A'} BPM`, icon: 'fas fa-tachometer-alt' },
        { label: 'Duration', value: `${features.duration?.toFixed(1) || 'N/A'} seconds`, icon: 'fas fa-clock' },
        { label: 'Pitch Features', value: features.pitch_count || 0, icon: 'fas fa-music' },
        { label: 'Onset Count', value: features.onset_count || 'N/A', icon: 'fas fa-wave-square' },
        { label: 'Frequency Range', value: features.freq_range || 'N/A', icon: 'fas fa-chart-line' },
        { label: 'Energy', value: features.energy ? `${(features.energy * 100).toFixed(1)}%` : 'N/A', icon: 'fas fa-bolt' }
    ];
    
    analysisData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'analysis-item';
        div.innerHTML = `
            <div class="analysis-label">
                <i class="${item.icon}"></i> ${item.label}
            </div>
            <div class="analysis-value">${item.value}</div>
        `;
        analysisGrid.appendChild(div);
    });
    
    analysisSection.classList.add('active');
    analysisSection.classList.add('content-fade-in');
}

function hideAnalysis() {
    analysisSection.classList.remove('active');
    analysisSection.classList.remove('content-fade-in');
}

function displayResults(matches) {
    if (!matches || matches.length === 0) {
        showNoResults();
        return;
    }
    
    resultsList.innerHTML = '';
    noResults.classList.add('hidden');
    
    matches.forEach((match, index) => {
        const resultCard = document.createElement('div');
        resultCard.className = 'result-card content-fade-in';
        resultCard.style.animationDelay = `${index * 0.1}s`;
        
        // Search YouTube URL
        const youtubeQuery = encodeURIComponent(match.name + ' official audio');
        const youtubeUrl = `https://www.youtube.com/results?search_query=${youtubeQuery}`;
        
        // Determine color based on similarity
        let similarityColor = '#ef3f65'; // pink for low-medium
        if (match.similarity > 80) similarityColor = '#10b981'; // green for high
        else if (match.similarity > 60) similarityColor = '#f59e0b'; // yellow for medium
        
        // Get rank emoji
        const rankEmoji = ['🥇', '🥈', '🥉'][index] || '🎵';
        
        // Get genre color
        const genreColors = {
            'pop': '#ef4444',
            'rock': '#f97316',
            'jazz': '#10b981',
            'classical': '#3b82f6',
            'hiphop': '#8b5cf6',
            'electronic': '#ec4899'
        };
        
        const genre = match.genre?.toLowerCase() || 'pop';
        const genreColor = genreColors[genre] || '#ef3f65';
        
        resultCard.innerHTML = `
            <div style="font-size: 2rem; color: ${genreColor};">${rankEmoji}</div>
            <div class="similarity-badge" style="background: linear-gradient(135deg, ${similarityColor}, #ef3f65);">
                ${match.similarity}% Match
            </div>
            <div style="flex: 1;">
                <div class="song-name">${match.name}</div>
                <div class="song-info">
                    <i class="fas fa-user"></i> ${match.artist || 'Unknown Artist'} 
                    | <i class="fas fa-music"></i> ${genre} 
                    | <i class="fas fa-tachometer-alt"></i> ${match.tempo ? match.tempo.toFixed(1) : 'N/A'} BPM
                </div>
                ${match.year ? `<div class="song-info"><i class="fas fa-calendar"></i> Released: ${match.year}</div>` : ''}
            </div>
            <div class="match-actions">
                <button class="play-btn" onclick="playSong('${match.path}')">
                    <i class="fas fa-play"></i>
                    Play
                </button>
                <a href="${youtubeUrl}" target="_blank" class="youtube-btn">
                    <i class="fab fa-youtube"></i>
                    YouTube
                </a>
            </div>
        `;
        
        resultsList.appendChild(resultCard);
    });
    
    resultsSection.classList.add('active');
}

function showNoResults() {
    resultsList.innerHTML = '';
    noResults.classList.remove('hidden');
    resultsSection.classList.add('active');
    noResults.classList.add('content-fade-in');
}

function hideResults() {
    resultsSection.classList.remove('active');
    noResults.classList.add('hidden');
}

// Utility Functions
function showLoading() {
    loadingIndicator.classList.add('active');
    // Disable match buttons during processing
    findMatchesBtn.disabled = true;
    uploadFindMatchesBtn.disabled = true;
}

function hideLoading() {
    loadingIndicator.classList.remove('active');
    // Re-enable match buttons
    findMatchesBtn.disabled = false;
    uploadFindMatchesBtn.disabled = false;
}

function resetRecordMode() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    }
    recordedAudioPlayer.classList.add('hidden');
    timer.textContent = '00:00';
    timer.style.color = '#ef3f65';
    timer.style.textShadow = '0 0 10px rgba(239, 63, 101, 0.5)';
    audioChunks = [];
    currentAudioBlob = null;
    visualizer.style.display = 'none';
    hideResults();
    hideAnalysis();
    hideMatchSection();
    recordStatus.classList.add('hidden');
}

function resetUploadMode() {
    uploadedAudioPlayer.classList.add('hidden');
    audioFileInput.value = '';
    currentAudioBlob = null;
    hideResults();
    hideAnalysis();
    hideMatchSection();
    uploadStatus.classList.add('hidden');
}

// Song playback function
function playSong(songPath) {
    const audio = new Audio(`/play_song/${encodeURIComponent(songPath)}`);
    audio.play().catch(e => {
        console.error('Error playing song:', e);
        showStatus(currentMode, 'Could not play song. The file might not exist on the server.', 'error');
    });
}

// Test function for debugging
window.testRecording = async function() {
    console.log('Testing recording functionality...');
    
    // Show loading state
    showLoading();
    showStatus('record', 'Generating test audio...', 'info');
    
    setTimeout(() => {
        hideLoading();
        showMatchSection('record');
        showStatus('record', 'Test recording ready! Click "Find Matching Songs".', 'success');
        updatePath('Results');
        
        // Show sample results for testing
        const testMatches = [
            { 
                name: "Imagine - John Lennon", 
                artist: "John Lennon",
                similarity: 85, 
                tempo: 76, 
                path: "sample_songs/imagine.mp3",
                genre: "pop",
                year: 1971
            },
            { 
                name: "Bohemian Rhapsody - Queen", 
                artist: "Queen",
                similarity: 72, 
                tempo: 144, 
                path: "sample_songs/bohemian.mp3",
                genre: "rock",
                year: 1975
            },
            { 
                name: "Yesterday - The Beatles", 
                artist: "The Beatles",
                similarity: 68, 
                tempo: 94, 
                path: "sample_songs/yesterday.mp3",
                genre: "pop",
                year: 1965
            }
        ];
        
        const testFeatures = {
            tempo: 120.5,
            duration: 12.3,
            pitch_count: 45,
            onset_count: 28,
            freq_range: "120-880 Hz",
            energy: 0.75
        };
        
        showAnalysis(testFeatures);
        displayResults(testMatches);
        hideMatchSection();
    }, 1500);
};

// Export for debugging
window.appState = {
    currentMode,
    selectedDuration,
    hasAudio: !!currentAudioBlob,
    updatePath
};