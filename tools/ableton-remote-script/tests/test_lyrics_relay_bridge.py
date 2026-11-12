"""The real bridge preflight/apply code against a fake Live set (no Ableton).

Covers the cases the Mac relay depends on: an edit against the saved set, a
repeat edit against what was applied, a Live that was reopened without saving,
and a hand edit on the clip Practice changed.
"""
import os
import sys
import tempfile
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


class Song:
    def __init__(self, path, tracks):
        self.file_path, self.tracks = path, tracks


def L(t, text):
    return {'t': t, 'e': t + 2, 'text': text}


class RelayBridgeTests(unittest.TestCase):
    def setUp(self):
        self.module = load_tspwork()
        self.temp = tempfile.TemporaryDirectory()
        als = Path(self.temp.name) / 'set.als'
        als.write_bytes(b'fixture')
        self.module.MAIN_ALS_PATH = str(als)
        self.chords = Track('Chords +LYRICS', [Clip('saved one', 0, 4), Clip('saved two', 4, 8), Clip('saved three', 8, 12)])
        self.live = Song(str(als), [Track('SONG ID', [Clip('E3', 0, 16)]), Track('SECTIONS', [Clip('Verse', 0, 16)]), self.chords])
        self.bridge = object.__new__(self.module.TSPWork)
        self.bridge.song = lambda: self.live
        self.bridge.log_message = lambda *a: None
        self.bridge._run_on_main = lambda fn, *args, **kw: fn(*args)
        self.mtime = os.stat(als).st_mtime
        self.als = als

    def tearDown(self):
        self.assertEqual(os.stat(self.als).st_mtime, self.mtime, 'the saved set must never be touched')
        self.temp.cleanup()

    def names(self):
        return [c.name for c in self.chords.arrangement_clips]

    def send(self, base, lines):
        return self.bridge._sync_lyrics([{'song_id': 'E3', 'track_slug': 'chords', 'base_lines': base, 'lines': lines}])

    SAVED = [L(0, 'saved one'), L(2, 'saved two'), L(4, 'saved three')]

    def test_edit_against_saved_set_renames_only_the_changed_clip(self):
        out = self.send(self.SAVED, [L(0, 'saved one'), L(2, 'EDIT two'), L(4, 'saved three')])
        self.assertTrue(out['ok'])
        self.assertFalse(out['saved'])
        self.assertEqual(self.names(), ['saved one', 'EDIT two', 'saved three'])

    def test_repeat_edit_against_applied_state(self):
        v1 = [L(0, 'saved one'), L(2, 'EDIT two'), L(4, 'saved three')]
        self.send(self.SAVED, v1)
        out = self.send(v1, [L(0, 'saved one'), L(2, 'EDIT two again'), L(4, 'EDIT three')])
        self.assertTrue(out['ok'])
        self.assertEqual(self.names(), ['saved one', 'EDIT two again', 'EDIT three'])

    def test_sending_again_changes_nothing(self):
        v1 = [L(0, 'saved one'), L(2, 'EDIT two'), L(4, 'saved three')]
        self.send(self.SAVED, v1)
        out = self.send(self.SAVED, v1)
        self.assertTrue(out['ok'])
        self.assertEqual(out['changed'], 0)

    def test_live_reopened_without_saving(self):
        v1 = [L(0, 'saved one'), L(2, 'EDIT two'), L(4, 'saved three')]
        # Live is back at the saved set. Described against the applied state
        # nothing differs, so the bridge changes nothing (why the relay must
        # re-check against the saved set).
        out = self.send(v1, v1)
        self.assertTrue(out['ok'])
        self.assertEqual(out['changed'], 0)
        self.assertEqual(self.names(), ['saved one', 'saved two', 'saved three'])
        # Described against the saved set, the edit goes back in.
        out = self.send(self.SAVED, v1)
        self.assertTrue(out['ok'])
        self.assertEqual(self.names(), ['saved one', 'EDIT two', 'saved three'])

    def test_new_work_after_reopen_is_refused_against_applied_then_fits_saved(self):
        v1 = [L(0, 'saved one'), L(2, 'EDIT two'), L(4, 'saved three')]
        v2 = [L(0, 'saved one'), L(2, 'EDIT two again'), L(4, 'saved three')]
        out = self.send(v1, v2)  # Live holds "saved two", not "EDIT two"
        self.assertFalse(out['ok'])
        self.assertEqual((out['error'], out['song_id'], out['track_slug']), ('source_changed', 'E3', 'chords'))
        self.assertEqual(self.names(), ['saved one', 'saved two', 'saved three'])
        self.assertTrue(self.send(self.SAVED, v2)['ok'])
        self.assertEqual(self.names(), ['saved one', 'EDIT two again', 'saved three'])

    def test_hand_edit_on_the_same_clip_is_a_conflict_and_nothing_changes(self):
        self.chords.arrangement_clips[1].name = 'typed by hand in Live'
        out = self.send(self.SAVED, [L(0, 'EDIT one'), L(2, 'EDIT two'), L(4, 'saved three')])
        self.assertFalse(out['ok'])
        self.assertEqual(out['error'], 'source_changed')
        self.assertEqual(self.names(), ['saved one', 'typed by hand in Live', 'saved three'])

    def test_hand_edit_on_another_clip_is_kept(self):
        self.chords.arrangement_clips[2].name = 'typed by hand in Live'
        out = self.send(self.SAVED, [L(0, 'EDIT one'), L(2, 'saved two'), L(4, 'saved three')])
        self.assertTrue(out['ok'])
        self.assertEqual(self.names(), ['EDIT one', 'saved two', 'typed by hand in Live'])

    def test_another_set_open_is_refused(self):
        self.live.file_path = '/somewhere/else.als'
        out = self.send(self.SAVED, [L(0, 'EDIT one'), L(2, 'saved two'), L(4, 'saved three')])
        self.assertEqual(out['error'], 'wrong_open_set')
        self.assertEqual(self.names(), ['saved one', 'saved two', 'saved three'])

    # ---- 1.30: accept lists, conflict details, per-clip decision ----
    def A(self, t, text, accept, untouched=False, **extra):
        return dict({'t': t, 'e': t + 2, 'text': text, 'accept': accept, 'untouched': untouched}, **extra)

    def test_conflict_reports_every_clip_with_all_three_texts_and_changes_nothing(self):
        self.chords.arrangement_clips[1].name = 'hand two'
        self.chords.arrangement_clips[2].name = 'hand three'
        out = self.send(self.SAVED, [self.A(0, 'EDIT one', ['saved one']), self.A(2, 'EDIT two', ['saved two']), self.A(4, 'EDIT three', ['saved three'])])
        self.assertEqual(out['error'], 'source_changed')
        self.assertEqual([(c['line'], c['base_text'], c['practice_text'], c['live_text']) for c in out['conflicts']],
                         [(2, 'saved two', 'EDIT two', 'hand two'), (3, 'saved three', 'EDIT three', 'hand three')])
        self.assertEqual(self.names(), ['saved one', 'hand two', 'hand three'])

    def test_hand_change_after_the_edit_was_applied_is_a_conflict(self):
        self.chords.arrangement_clips[1].name = 'hand two'
        out = self.send(self.SAVED, [self.A(0, 'saved one', ['saved one'], True), self.A(2, 'EDIT two', ['saved two', 'EDIT two']), self.A(4, 'saved three', ['saved three'], True)])
        self.assertEqual(out['error'], 'source_changed')
        self.assertEqual(out['conflicts'][0]['live_text'], 'hand two')

    def test_reopened_live_with_accept_list_gets_the_edit_back_in_one_request(self):
        applied = [L(0, 'saved one'), L(2, 'EDIT two'), L(4, 'saved three')]
        out = self.send(applied, [self.A(0, 'saved one', ['saved one'], True), self.A(2, 'EDIT two', ['saved two', 'EDIT two']), self.A(4, 'saved three', ['saved three'], True)])
        self.assertTrue(out['ok'])
        self.assertEqual(self.names(), ['saved one', 'EDIT two', 'saved three'])

    def test_decision_use_practice_overwrites_the_hand_edit(self):
        self.chords.arrangement_clips[1].name = 'hand two'
        out = self.send(self.SAVED, [self.A(0, 'saved one', ['saved one'], True), self.A(2, 'EDIT two', ['saved two'], force=True), self.A(4, 'saved three', ['saved three'], True)])
        self.assertTrue(out['ok'])
        self.assertEqual(self.names(), ['saved one', 'EDIT two', 'saved three'])

    def test_decision_keep_ableton_leaves_live_alone(self):
        self.chords.arrangement_clips[1].name = 'hand two'
        out = self.send(self.SAVED, [self.A(0, 'EDIT one', ['saved one']), self.A(2, 'hand two', ['saved two']), self.A(4, 'saved three', ['saved three'], True)])
        self.assertTrue(out['ok'])
        self.assertEqual(self.names(), ['EDIT one', 'hand two', 'saved three'])

    def test_restore_to_the_saved_text_undoes_an_applied_edit_but_not_a_hand_edit(self):
        self.chords.arrangement_clips[0].name = 'EDIT one'      # applied earlier by the relay
        self.chords.arrangement_clips[2].name = 'hand three'    # typed in Live
        out = self.send(self.SAVED, [self.A(0, 'saved one', ['saved one', 'EDIT one'], True), self.A(2, 'saved two', ['saved two'], True), self.A(4, 'saved three', ['saved three'], True)])
        self.assertTrue(out['ok'])
        self.assertEqual(self.names(), ['saved one', 'saved two', 'hand three'])


if __name__ == '__main__':
    unittest.main()
