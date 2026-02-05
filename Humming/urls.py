from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from . import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.home, name='home'),
    path('upload/', views.upload_audio, name='upload_audio'),
    path('record/', views.record_audio, name='record_audio'),
    path('match/', views.match_song, name='match_song'),
    path('get_songs/', views.get_songs, name='get_songs'),
    path('play_song/<path:song_path>/', views.play_song, name='play_song'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)