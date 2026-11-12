"""A Song ID jump must never interrupt playback, and only the Ableton Sync
page's own jump starts a review session."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_lyrics_sync_save import load_tspwork  # noqa: E402


class Clip:
    def __init__(self, name, start, end):
        self.name, self.start_time, self.end_time, self.muted, self.color = name, start, end, False, 1


class Track:
    def __init__(self, name, clips):
        self.name, self.arrangement_clips, self.group_track, self.color = name, clips, None, 1


class View:
    def __init__(self):
        self.follow_song = False


class AppView:
    def __init__(self):
        self.shown = []

    def show_view(self, name):
        self.shown.append(name)


class Song:
    def __init__(self, playing):
        self.is_playing = playing
        self.current_song_time = 0.0
        self.cue_points = []
        self.view = View()
        self.tracks = [Track('SONG ID', [Clip('E3', 16, 32)]), Track('SECTIONS', [Clip('Verse', 16, 32)])]


class JumpGuardTests(unittest.TestCase):
    def bridge(self, playing):
        module = load_tspwork()
        bridge = object.__new__(module.TSPWork)
        song = Song(playing)
        app = type('App', (), {'view': AppView()})()
        bridge.song = lambda: song
        bridge.application = lambda: app
        bridge.log_message = lambda *a: None
        bridge.schedule_message = lambda *a, **k: None
        bridge._review = None
        bridge._solo_saved = []
        bridge._loop_saved = None
        return bridge, song

    def test_a_jump_while_live_is_playing_changes_nothing(self):
        bridge, song = self.bridge(True)
        out = bridge._cmd_jump('E3', False)
        self.assertEqual(out, {'ok': True, 'skipped': 'playing'})
        self.assertEqual(song.current_song_time, 0.0)
        self.assertTrue(song.is_playing)

    def test_the_sync_page_jump_is_held_back_too(self):
        bridge, song = self.bridge(True)
        self.assertEqual(bridge._cmd_jump('E3', True)['skipped'], 'playing')
        self.assertEqual(song.current_song_time, 0.0)

    def test_a_stopped_live_moves_to_the_song(self):
        bridge, song = self.bridge(False)
        out = bridge._cmd_jump('E3', False)
        self.assertTrue(out['ok'])
        self.assertEqual(song.current_song_time, 16)

    def test_a_plain_song_id_jump_starts_no_review(self):
        bridge, _ = self.bridge(False)
        out = bridge._cmd_jump('E3', False)
        self.assertIsNone(out['review'])
        self.assertIsNone(bridge._review)

    def test_the_sync_page_jump_still_starts_one(self):
        bridge, _ = self.bridge(False)
        out = bridge._cmd_jump('E3', True)
        self.assertIsNotNone(out['review'])
        self.assertEqual(bridge._review['song_id'], 'E3')

    def test_a_plain_jump_leaves_a_running_review_alone(self):
        bridge, _ = self.bridge(False)
        bridge._review = {'song_id': 'E9', 'task_key': 'song', 'tracks': [], 'region': (0, 8)}
        bridge._cmd_jump('E3', False)
        self.assertEqual(bridge._review['song_id'], 'E9')

    def test_an_unknown_song_is_reported(self):
        bridge, _ = self.bridge(False)
        self.assertEqual(bridge._cmd_jump('E99', False), {'ok': False, 'error': 'song_not_found'})


if __name__ == '__main__':
    unittest.main()
