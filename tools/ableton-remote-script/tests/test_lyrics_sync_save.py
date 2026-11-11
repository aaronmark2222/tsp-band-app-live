"""Focused regression tests for the TSPWork lyrics-sync save step.

These tests stub Live and never open or modify an Ableton Set.
"""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_tspwork():
    live = types.ModuleType("Live")
    framework = types.ModuleType("_Framework")
    control_surface = types.ModuleType("_Framework.ControlSurface")
    control_surface.ControlSurface = type("ControlSurface", (), {})
    sys.modules["Live"] = live
    sys.modules["_Framework"] = framework
    sys.modules["_Framework.ControlSurface"] = control_surface
    spec = importlib.util.spec_from_file_location("tspwork_under_test", ROOT / "TSPWork" / "tspwork.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_alsreader():
    spec = importlib.util.spec_from_file_location("alsreader_under_test", ROOT / "TSPWork" / "alsreader.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LyricsSyncSaveTests(unittest.TestCase):
    def setUp(self):
        self.module = load_tspwork()
        self.temp = tempfile.TemporaryDirectory()
        self.als_path = Path(self.temp.name) / "test.als"
        self.als_path.write_bytes(b"test fixture; never parsed")
        self.module.MAIN_ALS_PATH = str(self.als_path)
        self.bridge = object.__new__(self.module.TSPWork)
        self.saved_scripts = []

        def run_on_main(fn, *args, **kwargs):
            if fn.__name__ == "_cmd_prepare_lyrics_writeback":
                return {"ok": True, "plans": []}
            if fn.__name__ == "_cmd_apply_lyrics_writeback":
                return {"ok": True, "changed": 0}
            raise AssertionError("unexpected Live callback: " + fn.__name__)

        def osascript(script):
            self.saved_scripts.append(script)
            now = os.stat(self.als_path).st_mtime + 2
            os.utime(self.als_path, (now, now))
            return "ok"

        self.bridge._run_on_main = run_on_main
        self.bridge._osascript = osascript

    def tearDown(self):
        self.temp.cleanup()

    def test_empty_practice_edits_never_saves_live(self):
        before = self.als_path.stat().st_mtime
        result = self.bridge._sync_lyrics([])
        self.assertTrue(result["ok"])
        self.assertFalse(result["saved"])
        self.assertEqual(result["changed"], 0)
        self.assertFalse(result["awaiting_manual_save"])
        self.assertEqual(self.als_path.stat().st_mtime, before)
        self.assertEqual(self.saved_scripts, [])

    def test_wrong_open_set_stops_before_save(self):
        self.bridge._run_on_main = lambda *a, **k: {"ok": False, "error": "wrong_open_set"}
        result = self.bridge._sync_lyrics([])
        self.assertEqual(result["error"], "wrong_open_set")
        self.assertEqual(self.saved_scripts, [])

    def test_invalid_payload_stops_before_live_or_save(self):
        result = self.bridge._sync_lyrics({"not": "a list"})
        self.assertEqual(result["error"], "invalid_edits")
        self.assertEqual(self.saved_scripts, [])


class LyricsParserTests(unittest.TestCase):
    def test_short_lyric_clip_is_preserved_as_timed_practice_line(self):
        reader = load_alsreader()
        timeline = reader.Timeline([(-63072000.0, 120.0)], [(-63072000.0, 4.0)])
        parsed = reader._lyrics_for(
            [{"slug": "guitar", "label": "Guitar", "clips": [
                {"start": 4.0, "end": 8.0, "name": "Hi", "disabled": False, "color": 0}
            ]}],
            [],
            0.0,
            16.0,
            timeline,
        )
        self.assertEqual(parsed["tracks"][0]["slug"], "guitar")
        self.assertEqual(parsed["tracks"][0]["lines"][0]["text"], "Hi")
        self.assertEqual(parsed["tracks"][0]["lines"][0]["t"], 2.0)


if __name__ == "__main__":
    unittest.main()
