"""The live arrangement playhead the app follows: which song it is in, and
where, reported with the transport state."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_lyrics_sync_save import load_tspwork  # noqa: E402


class Clip:
    def __init__(self, name, start, end, muted=False):
        self.name, self.start_time, self.end_time, self.muted, self.color = name, start, end, muted, 1


class Track:
    def __init__(self, name, clips):
        self.name, self.arrangement_clips, self.group_track, self.color = name, clips, None, 1


class Song:
    def __init__(self, beat, playing=True):
        self.current_song_time = beat
        self.is_playing = playing
        self.tempo = 128.0
        self.tracks = [Track('SONG ID', [Clip('E3', 0, 128), Clip('I3', 128, 320), Clip('OLD', 320, 384, muted=True)])]


class FollowTransportTests(unittest.TestCase):
    def state(self, beat, playing=True):
        module = load_tspwork()
        bridge = object.__new__(module.TSPWork)
        song = Song(beat, playing)
        bridge.song = lambda: song
        bridge.log_message = lambda *a: None
        bridge._review = None
        bridge._solo_saved = []
        bridge._loop_saved = None
        return bridge._review_state()

    def test_the_playhead_inside_a_song_is_reported_with_its_bounds(self):
        out = self.state(200)
        self.assertEqual(out['live_song'], 'I3')
        self.assertEqual(out['live_start'], 128)
        self.assertEqual(out['live_end'], 320)
        self.assertEqual(out['live_beat'], 200)
        self.assertTrue(out['playing'])
        self.assertEqual(out['tempo'], 128.0)

    def test_the_first_beat_of_a_song_counts_as_inside_it(self):
        self.assertEqual(self.state(128)['live_song'], 'I3')

    def test_a_gap_between_songs_reports_no_song(self):
        out = self.state(900)
        self.assertIsNone(out['live_song'])
        self.assertEqual(out['live_beat'], 900)

    def test_a_muted_clip_is_not_a_song(self):
        self.assertIsNone(self.state(340)['live_song'])

    def test_a_stopped_transport_still_reports_where_it_stands(self):
        out = self.state(10, playing=False)
        self.assertFalse(out['playing'])
        self.assertEqual(out['live_song'], 'E3')


if __name__ == '__main__':
    unittest.main()
