"""TSPWork: a small local bridge between the TSP Work app and Ableton Live.

Safety rules (agreed with Aaron, 6 Nov 2026):
  * Listens on 127.0.0.1 only: nothing outside this Mac can reach it.
  * Accepts requests only from the TSP Work site (and localhost for testing).
  * Never edits the set. It only moves the playhead, selects a track,
    selects a time region and zooms. The loop brace is borrowed for the
    selection and restored exactly afterwards.
  * Zooming uses Live's own menu commands, clicked by name through macOS
    UI scripting (never a raw "z" keystroke), and only when Live is in front.
"""
import json
import os
import re
import socket
import threading
import time

try:
    import queue
except ImportError:  # pragma: no cover
    import Queue as queue

try:
    import subprocess
except Exception:  # pragma: no cover
    subprocess = None

import Live
from _Framework.ControlSurface import ControlSurface

PORT = 47710
TLS_PORT = 47711
VERSION = '1.14.3'
DEBUG_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'requests.log')
# https listener for the live site in Safari. Certificate made for 127.0.0.1 /
# localhost only, trusted once in this Mac's Keychain. Files sit next to this
# script (they are not in the repo).
CERT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tspwork-localhost.crt')
KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tspwork-localhost.key')
ALLOWED_ORIGINS = (
    'https://aaronmark2222.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
)
SONG_ID_RE = re.compile(r'^[A-Z][A-Za-z]*[0-9]+$')
DEFAULT_ALS = os.path.expanduser(
    '~/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als')
CONFIG_FILE = os.path.expanduser('~/.tspwork.json')  # optional {"als_path": "..."}


def als_path():
    try:
        with open(CONFIG_FILE) as fh:
            path = json.load(fh).get('als_path')
            if path:
                return os.path.expanduser(path)
    except Exception:
        pass
    return DEFAULT_ALS

# task key -> (parent group name or None, track name prefix)
TASK_TRACKS = {
    'sections': (None, 'SECTIONS'),
    'chords': (None, 'Chords'),
    'lyrics': (None, 'Lyrics'),
    'guitar': (None, 'Guitar +'),
    'keyboard': (None, 'Keyboard +'),
    'drums': (None, 'Drums +'),
    'guitar_tone_midi': (None, 'GUITAR TONE'),
    'prompts': (None, 'PROMPTS'),
    'song_cue': (None, 'Vocal Prompts'),
    'backup_que': (None, 'Backup Que'),
    # Backing work is reviewed in the production groups (agreed 7 Nov 2026);
    # the 'Set Mixed' check uses the MIXED BACKING group (mixed_backing).
    'backing_music': ('BACKING TRACKS', 'MUSIC'),
    'backing_vocals_dale': ('BACKING VOCALS', 'Dale'),
    'backing_vocals_anston': ('BACKING VOCALS', 'Anston'),
    'backing_percussion': ('BACKING TRACKS', 'PERCUSSION'),
    'backing_sfx': ('BACKING TRACKS', 'SFX'),
    'mixed_backing': (None, 'MIXED BACKING'),
    'bass_part': ('PARTS', 'Bass Part'),
    'keyboard_part': ('PARTS', 'Keyboard Part'),
    'guitar_part': ('PARTS', 'Guitar Part'),
    'violin_part': ('PARTS', 'Violin Part'),
    'percussion_part': ('PARTS', 'Percussion Part'),
    'drums_part': ('PARTS', 'Drums Part'),
    'vox_dale': ('PARTS', 'Dale Vox Part'),
    'vox_anston': ('PARTS', 'Anston Vox Part'),
}

# Extra tracks soloed with a task's track while reviewing it.
EXTRA_SOLO = {'drums_part': [('PARTS', 'Drums Midi Part')]}
# Tasks you review by listening: their track is soloed (and un-soloed after).
LISTEN_TASKS = {
    'song_cue', 'backup_que', 'prompts', 'backing_music', 'backing_vocals_dale',
    'backing_vocals_anston', 'backing_percussion', 'backing_sfx', 'mixed_backing',
    'bass_part', 'keyboard_part', 'guitar_part', 'violin_part', 'percussion_part',
    'drums_part', 'vox_dale', 'vox_anston',
}
# Tasks you review by reading: AbleSet's floating window shows this lyrics track.
LYRICS_SLUG = {
    'sections': 'chords', 'chords': 'chords', 'lyrics': 'lyrics',
    'guitar': 'guitar', 'keyboard': 'keyboard', 'drums': 'drums',
}
ABLESET_OSC = ('127.0.0.1', 39051)
# AbleSet targets devices by name or IP; the floating window runs on this Mac.
DEFAULT_ABLESET_DEVICES = ['127.0.0.1', '::1', '::ffff:127.0.0.1']


def _osc_str(text):
    data = text.encode('utf-8') + b'\0'
    return data + b'\0' * (-len(data) % 4)


def osc_message(address, *args):
    return _osc_str(address) + _osc_str(',' + 's' * len(args)) + b''.join(_osc_str(str(a)) for a in args)


def ableset_devices():
    try:
        with open(os.path.expanduser('~/.tspwork.json')) as fh:
            names = json.load(fh).get('ableset_devices')
            if isinstance(names, list) and names:
                return [str(n) for n in names][:5]
    except Exception:
        pass
    return DEFAULT_ABLESET_DEVICES


# Fixed AppleScripts: no request data is ever inserted into them.
SELECT_LOOP = '''
tell application "System Events"
    set liveProc to first application process whose bundle identifier is "com.ableton.live"
    set frontmost of liveProc to true
    repeat 20 times
        if frontmost of liveProc then exit repeat
        delay 0.05
    end repeat
    if not (frontmost of liveProc) then return "not_front"
    tell liveProc
        set editMenu to menu 1 of menu bar item "Edit" of menu bar 1
        set selectItems to (menu items of editMenu whose name contains "Select Loop")
        if (count of selectItems) is 0 then return "no_select_loop"
        click item 1 of selectItems
    end tell
end tell
return "ok"
'''

ZOOM_SELECTION = '''
tell application "System Events"
    set liveProc to first application process whose bundle identifier is "com.ableton.live"
    if not (frontmost of liveProc) then return "lost_focus"
    tell liveProc
        set viewMenu to menu 1 of menu bar item "View" of menu bar 1
        set zoomItems to (menu items of viewMenu whose name contains "Time Selection")
        if (count of zoomItems) is 0 then return "no_zoom_item"
        if not (enabled of item 1 of zoomItems) then return "zoom_disabled"
        click item 1 of zoomItems
    end tell
end tell
return "ok"
'''

FRONT_ONLY = '''
tell application "System Events"
    set liveProc to first application process whose bundle identifier is "com.ableton.live"
    set frontmost of liveProc to true
end tell
return "ok"
'''


class TSPWork(ControlSurface):

    def __init__(self, c_instance):
        ControlSurface.__init__(self, c_instance)
        self._jobs = queue.Queue()
        self._busy = False
        self._stop = False
        self._servers = []
        self._review = None        # what is being reviewed (song, task, tracks)
        self._solo_saved = []      # [(track, previous solo)] to put back
        self._loop_saved = None    # loop brace before 'Loop clip'
        self._export = None        # running/last practice-audio export job
        self._tls = self._tls_context()
        self._thread = threading.Thread(target=self._serve, args=(PORT, None), name='TSPWorkBridge')
        self._thread.daemon = True
        self._thread.start()
        if self._tls is not None:
            t2 = threading.Thread(target=self._serve, args=(TLS_PORT, self._tls), name='TSPWorkBridgeTLS')
            t2.daemon = True
            t2.start()
        self.schedule_message(1, self._tick)
        self.log_message('TSPWork %s: listening on 127.0.0.1:%d (http)%s' % (
            VERSION, PORT, ' and :%d (https)' % TLS_PORT if self._tls else ', no https certificate'))
        self.show_message('TSPWork %s: connected to TSP Work on this Mac' % VERSION)

    # ------------------------------------------------------------ Live hooks
    def disconnect(self):
        self._stop = True
        try:
            self._end_review()
        except Exception:
            pass
        # Stopping TSPWork mid-export: cancel it and put Live's state back now
        # (this runs on Live's main thread).
        try:
            job = self._export
            if job and job.state['state'] in ('starting', 'running'):
                job.cancelled = True
                job.restore_state()
        except Exception:
            pass
        for srv in self._servers:
            try:
                srv.close()
            except Exception:
                pass
        ControlSurface.disconnect(self)

    def _debug(self, line):
        # Small rolling request log next to the script, for connection troubleshooting.
        try:
            if os.path.exists(DEBUG_LOG) and os.path.getsize(DEBUG_LOG) > 200000:
                os.rename(DEBUG_LOG, DEBUG_LOG + '.old')
            with open(DEBUG_LOG, 'a') as fh:
                fh.write('%s %s\n' % (time.strftime('%H:%M:%S'), line))
        except Exception:
            pass

    def _tls_context(self):
        if not (os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)):
            return None
        try:
            import ssl
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            ctx.load_cert_chain(CERT_FILE, KEY_FILE)
            return ctx
        except Exception as err:
            self.log_message('TSPWork https disabled: %r' % (err,))
            return None

    def _tick(self):
        # Runs on Live's main thread about every 100 ms (same loop AbleSet uses).
        if self._stop:
            return
        try:
            self._drain()
        finally:
            self.schedule_message(1, self._tick)

    def _drain(self):
        for _ in range(4):
            try:
                job = self._jobs.get_nowait()
            except queue.Empty:
                break
            try:
                job['result'] = job['fn'](*job['args'])
            except Exception as err:
                job['result'] = {'ok': False, 'error': 'live_error', 'detail': str(err)}
                self.log_message('TSPWork error: %r' % (err,))
            job['done'].set()

    # ------------------------------------------------------------ helpers
    def _run_on_main(self, fn, *args, timeout=4.0):
        job = {'fn': fn, 'args': args, 'done': threading.Event(), 'result': None}
        self._jobs.put(job)
        if not job['done'].wait(timeout):
            return {'ok': False, 'error': 'timeout'}
        return job['result']

    def _all_tracks(self):
        return list(self.song().tracks)

    def _find_track(self, group, prefix):
        for track in self._all_tracks():
            if not track.name.startswith(prefix):
                continue
            if group is None:
                return track
            parent = track.group_track
            while parent is not None:
                if parent.name == group:
                    return track
                parent = parent.group_track
        return None

    def _unfold_parents(self, track):
        # A track inside a folded group can't be selected; open its groups.
        opened = []
        parent = track.group_track
        while parent is not None:
            try:
                if parent.is_foldable and parent.fold_state:
                    parent.fold_state = 0
                    opened.append(parent.name)
            except Exception:
                pass
            parent = parent.group_track
        return opened

    def _song_region(self, song_id):
        track = self._find_track(None, 'SONG ID')
        if track is None:
            return None
        for clip in track.arrangement_clips:
            if clip.name == song_id and not clip.muted:
                return clip.start_time, clip.end_time
        return None

    # ------------------------------------------------------------ commands
    def _cmd_status(self):
        region_track = self._find_track(None, 'SONG ID')
        count = 0
        if region_track is not None:
            count = sum(1 for c in region_track.arrangement_clips if SONG_ID_RE.match(c.name or ''))
        path = als_path()
        saved = None
        try:
            saved = os.path.getmtime(path)
        except Exception:
            pass
        return {'ok': True, 'version': VERSION, 'https': self._tls is not None, 'songs': count, 'playing': self.song().is_playing,
                'als_path': path, 'als_saved_at': saved}

    def _cmd_jump(self, song_id):
        self._end_review()
        region = self._song_region(song_id)
        if region is None:
            return {'ok': False, 'error': 'song_not_found'}
        start = region[0]
        song = self.song()
        cue = None
        for point in song.cue_points:
            if abs(point.time - start) < 0.01:
                cue = point
                break
        # Show the Arrangement but do not give it keyboard focus: Live 12 only
        # scrolls its view to a remote-controlled position when it is unfocused.
        self.application().view.show_view('Arranger')
        if cue is not None:
            cue.jump()  # same as clicking the locator (how AbleSet jumps)
        else:
            song.current_song_time = start
        # Song review: the bar's prev/next step through the song's sections.
        sections = self._find_track(None, 'SECTIONS')
        if sections is not None:
            self._review = {'song_id': song_id, 'task_key': 'song', 'tracks': [sections], 'region': tuple(region)}
        # Nudge Follow so the view scrolls to the new position.
        if song.view.follow_song:
            song.view.follow_song = False
            self.schedule_message(1, self._follow_on)
        return {'ok': True, 'start_beat': start, 'locator': cue is not None,
                'review': self._review_state() if self._review else None}

    def _follow_on(self):
        try:
            self.song().view.follow_song = True
        except Exception:
            pass

    def _cmd_prepare_select(self, song_id, task_key, rng=None):
        region = self._song_region(song_id)
        if region is None:
            return {'ok': False, 'error': 'song_not_found'}
        group, prefix = TASK_TRACKS[task_key]
        track = self._find_track(group, prefix)
        if track is None:
            return {'ok': False, 'error': 'track_not_found', 'track': prefix}
        song = self.song()
        saved = (song.loop_start, song.loop_length, song.loop)
        start, end = region
        if rng:
            # Zoom to part of the song (e.g. a chord mismatch), kept inside it.
            a, b = max(start, rng[0]), min(end, rng[1])
            if b - a > 0.5:
                start, end = a, b
        self._unfold_parents(track)
        song.view.selected_track = track
        if not song.is_playing:
            song.current_song_time = start
        song.loop_start = start
        song.loop_length = end - start
        view = self.application().view
        view.show_view('Arranger')
        # The Up/Down keys must reach the Arrangement, so give it focus here
        # (song-title jumps deliberately leave it unfocused so Live scrolls).
        view.focus_view('Arranger')
        return {'ok': True, 'saved_loop': saved, 'track': track.name, 'start': start, 'region': list(region)}

    def _cmd_finish(self, task_key, start, song_id=None, region=None, review=False, keep_start=False):
        # After zooming: clear the time selection by moving the playhead, and
        # leave the task's track highlighted (selected). In review mode the
        # playhead lands on the track's first clip in the song (Space plays it)
        # and listening tasks get their track soloed until the review ends.
        group, prefix = TASK_TRACKS[task_key]
        track = self._find_track(group, prefix)
        song = self.song()
        land = start
        info = {}
        if review and track is not None and region:
            self._end_review()
            tracks = [track] + [t for t in (self._find_track(g, p) for g, p in EXTRA_SOLO.get(task_key, [])) if t is not None]
            self._review = {'song_id': song_id, 'task_key': task_key, 'tracks': tracks, 'region': tuple(region)}
            clips = self._review_clips()
            if clips and not keep_start:
                land = max(region[0], clips[0][0])
            elif keep_start:
                land = start + 4  # a bar into the zoomed range (the spot in question)
            if task_key in LISTEN_TASKS:
                self._set_solo(True)
            info = {'clips': len(clips), 'solo': bool(self._solo_saved)}
        if not song.is_playing or review:
            song.current_song_time = land
        if track is not None:
            song.view.selected_track = track
        info.update({'ok': True, 'landed_beat': land})
        return info

    # ------------------------------------------------------------ review mode
    def _descendants(self, group):
        out = []
        for t in self._all_tracks():
            parent = t.group_track
            while parent is not None:
                if parent == group:
                    out.append(t)
                    break
                parent = parent.group_track
        return out

    def _review_clips(self):
        """(start, end) of active clips on the reviewed track(s) in the song,
        merged across a group's tracks, in time order."""
        rv = self._review
        if not rv:
            return []
        s, e = rv['region']
        spans = set()
        for track in rv['tracks']:
            pool = self._descendants(track) if getattr(track, 'is_foldable', False) else [track]
            for t in pool:
                try:
                    clips = t.arrangement_clips
                except Exception:
                    continue
                for c in clips:
                    try:
                        if c.muted or c.end_time <= s or c.start_time >= e or c.end_time - c.start_time < 0.01:
                            continue
                        spans.add((round(max(s, c.start_time), 4), round(min(e, c.end_time), 4)))
                    except Exception:
                        continue
        return sorted(spans)

    def _set_solo(self, on):
        song = self.song()
        if not on:
            for t, prev in self._solo_saved:
                try:
                    t.solo = prev
                except Exception:
                    pass
            self._solo_saved = []
            return
        if self._solo_saved or not self._review:
            return
        targets = self._review['tracks']
        saved = []
        for t in list(song.tracks) + list(song.return_tracks):
            try:
                want = any(t == x for x in targets)
                if t.solo != want:
                    saved.append((t, t.solo))
                    t.solo = want
            except Exception:
                pass
        self._solo_saved = saved

    def _set_clip_loop(self, on):
        song = self.song()
        if not on:
            if self._loop_saved is not None:
                ls, ll, lo = self._loop_saved
                song.loop_start = ls
                song.loop_length = ll
                song.loop = lo
                self._loop_saved = None
            return
        clips = self._review_clips()
        pos = song.current_song_time
        clip = next((c for c in clips if c[0] - 0.01 <= pos < c[1]), None) or next((c for c in clips if c[0] >= pos), None)
        if clip is None:
            return
        if self._loop_saved is None:
            self._loop_saved = (song.loop_start, song.loop_length, song.loop)
        song.loop_start = clip[0]
        song.loop_length = clip[1] - clip[0]
        song.loop = True
        if not (clip[0] <= pos < clip[1]):
            song.current_song_time = clip[0]

    def _end_review(self):
        self._set_solo(False)
        self._set_clip_loop(False)
        self._review = None

    def _review_state(self):
        song = self.song()
        rv = self._review
        clips = self._review_clips() if rv else []
        pos = song.current_song_time
        index = None
        for i, c in enumerate(clips):
            if c[0] - 0.01 <= pos:
                index = i
        return {'ok': True, 'active': bool(rv), 'song_id': rv and rv['song_id'], 'task_key': rv and rv['task_key'],
                'playing': song.is_playing, 'beat': pos, 'clip': None if index is None else index + 1,
                'clips': len(clips), 'solo': bool(self._solo_saved), 'loop': self._loop_saved is not None}

    def _cmd_transport(self, action):
        song = self.song()
        rv = self._review
        if action == 'toggle':
            if song.is_playing:
                song.stop_playing()
            else:
                song.start_playing()
        elif action == 'stop':
            song.stop_playing()
        elif action in ('next', 'prev', 'first'):
            clips = self._review_clips()
            pos = song.current_song_time
            target = None
            if action == 'first' and clips:
                target = clips[0][0]
            elif action == 'next':
                target = next((c[0] for c in clips if c[0] > pos + 0.01), None)
            else:
                # Back one clip; from inside a clip's first 2 beats, to the one before.
                earlier = [c[0] for c in clips if c[0] < pos - 2]
                target = earlier[-1] if earlier else (clips[0][0] if clips else None)
            if target is not None:
                song.current_song_time = target
        elif action == 'back2':
            bar = song.signature_numerator * 4.0 / max(1, song.signature_denominator)
            floor = rv['region'][0] - 2 * bar if rv else 0
            song.current_song_time = max(0.0, floor, song.current_song_time - 2 * bar)
        elif action == 'loop':
            self._set_clip_loop(self._loop_saved is None)
        elif action == 'solo':
            if rv:
                self._set_solo(not self._solo_saved)
        elif action == 'end':
            self._end_review()
        elif action != 'state':
            return {'ok': False, 'error': 'unknown_action'}
        return self._review_state()

    def _export_request(self, path, payload):
        job = self._export
        if path.startswith('/export/state'):
            return {'ok': True, 'job': job.state if job else None}
        if path.startswith('/export/cancel'):
            if job and job.state['state'] in ('starting', 'running'):
                job.cancelled = True
            return {'ok': True, 'job': job.state if job else None}
        if job and job.state['state'] in ('starting', 'running'):
            return {'ok': False, 'error': 'export_running', 'job': job.state}
        raw = payload.get('songs')
        if not isinstance(raw, list):
            raw = [payload]
        songs = []
        for item in raw[:100]:
            if not isinstance(item, dict):
                continue
            song_id = str(item.get('song_id', ''))
            if not SONG_ID_RE.match(song_id):
                return {'ok': False, 'error': 'bad_song_id'}
            songs.append({'song_id': song_id, 'song_name': str(item.get('song_name', ''))[:80],
                          'vocals_complete': [str(v) for v in (item.get('vocals_complete') or []) if str(v) in ('vox_dale', 'vox_anston')],
                          'instrumental': bool(item.get('instrumental'))})
        if not songs:
            return {'ok': False, 'error': 'no_songs'}
        if self._busy:
            return {'ok': False, 'error': 'busy'}
        import importlib
        from . import exporter
        importlib.reload(exporter)
        self._run_on_main(self._end_review)
        self._busy = True
        self._export = exporter.ExportJob(self, songs)
        self._export.thread.start()
        return {'ok': True, 'job': self._export.state}

    def _export_finished(self, job):
        self._busy = False
        st = job.state
        msg = 'TSPWork %s: export %s: %d of %d songs done' % (VERSION, st['state'], sum(1 for r in st['results'] if r['state'] == 'done'), len(st['queue']))
        if st.get('error'):
            msg += ': ' + st['error'][:80]
        self._debug(msg)
        try:
            self._run_on_main(self._status, msg)
        except Exception:
            pass

    def _show_lyrics(self, task_key):
        slug = LYRICS_SLUG.get(task_key)
        if not slug:
            return None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                sock.sendto(osc_message('/floatingWindow', 'show'), ABLESET_OSC)
                for device in ableset_devices():
                    sock.sendto(osc_message('/devices/showPage', device, 'lyrics/' + slug), ABLESET_OSC)
            finally:
                sock.close()
            self._debug('ableset lyrics -> %s' % slug)
            return slug
        except Exception as err:
            self._debug('ableset osc failed: %r' % (err,))
            return None

    def _status(self, message):
        self.log_message(message)
        self.show_message(message)
        return {'ok': True}

    def _cmd_restore_loop(self, saved):
        song = self.song()
        loop_start, loop_length, loop_on = saved
        song.loop_start = loop_start
        song.loop_length = loop_length
        song.loop = loop_on
        return {'ok': True}

    def _osascript(self, script):
        if subprocess is None:
            return 'no_subprocess'
        try:
            out = subprocess.run(['/usr/bin/osascript', '-e', script],
                                 capture_output=True, text=True, timeout=6)
        except Exception as err:
            return 'osascript_failed: %s' % err
        if out.returncode != 0:
            err = (out.stderr or '').strip()
            if '-1719' in err or '-25211' in err or 'assistive' in err.lower() or 'not allowed' in err.lower():
                return 'accessibility_needed'
            return 'osascript_error: %s' % err[:200]
        return (out.stdout or '').strip()

    def _select(self, song_id, task_key, rng=None, review=False):
        prep = self._run_on_main(self._cmd_prepare_select, song_id, task_key, rng)
        if not prep or not prep.get('ok'):
            return prep or {'ok': False, 'error': 'timeout'}
        time.sleep(0.2)  # let Live unfold groups and redraw the loop brace
        outcome = self._osascript(SELECT_LOOP)
        if outcome == 'ok':
            time.sleep(0.3)  # let Live finish making the selection
            outcome = self._osascript(ZOOM_SELECTION)
        time.sleep(0.2)
        self._run_on_main(self._cmd_restore_loop, prep['saved_loop'])
        fin = self._run_on_main(self._cmd_finish, task_key, prep['start'], song_id, prep.get('region'), review, rng is not None) or {}
        lyrics = self._show_lyrics(task_key) if review else None
        message = 'TSPWork %s: %s, zoomed to %s on %s' % (VERSION, outcome, song_id, prep['track'])
        self._run_on_main(self._status, message)
        result = {'ok': outcome == 'ok', 'track': prep['track'], 'lyrics': lyrics,
                  'review': self._run_on_main(self._review_state) if review else None,
                  'landed_beat': fin.get('landed_beat')}
        if outcome != 'ok':
            result['error'] = outcome
        return result

    # ------------------------------------------------------------ .als reading
    def _snapshot(self):
        # Reads the SAVED .als file (read-only) in this background thread.
        path = als_path()
        if not os.path.exists(path):
            return {'ok': False, 'error': 'als_not_found', 'als_path': path}
        try:
            import importlib
            from . import alsreader
            # Live keeps imported modules cached; reload so an updated
            # alsreader.py is used without restarting Live.
            importlib.reload(alsreader)
            started = time.time()
            snapshot = alsreader.build_snapshot(path)
            self._run_on_main(self._status, 'TSPWork %s: read %d songs from the saved set in %.0fs'
                              % (VERSION, len(snapshot['songs']), time.time() - started))
            return {'ok': True, 'snapshot': snapshot}
        except Exception as err:
            self.log_message('TSPWork snapshot error: %r' % (err,))
            return {'ok': False, 'error': 'als_read_failed', 'detail': str(err)[:300]}

    # ------------------------------------------------------------ HTTP bridge
    def _serve(self, port, tls):
        try:
            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            srv.bind(('127.0.0.1', port))
            srv.listen(8)
            srv.settimeout(1.0)
            self._servers.append(srv)
        except Exception as err:
            self.log_message('TSPWork could not open port %d: %r' % (port, err))
            return
        while not self._stop:
            try:
                conn, _ = srv.accept()
            except socket.timeout:
                continue
            except Exception:
                if self._stop:
                    break
                continue
            worker = threading.Thread(target=self._handle, args=(conn, tls))
            worker.daemon = True
            worker.start()

    def _handle(self, conn, tls=None):
        try:
            conn.settimeout(5)
            if tls is not None:
                try:
                    conn = tls.wrap_socket(conn, server_side=True)
                except Exception as err:
                    # Untrusted certificate probes and plain-http hits land here.
                    self._debug('tls handshake failed: %r' % (err,))
                    try:
                        conn.close()
                    except Exception:
                        pass
                    return
            data = b''
            while b'\r\n\r\n' not in data and len(data) < 16384:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                data += chunk
            head, _, body = data.partition(b'\r\n\r\n')
            lines = head.decode('latin-1').split('\r\n')
            method, path = (lines[0].split(' ') + ['', ''])[:2]
            headers = {}
            for line in lines[1:]:
                if ':' in line:
                    k, v = line.split(':', 1)
                    headers[k.strip().lower()] = v.strip()
            length = min(int(headers.get('content-length', '0') or 0), 4096)
            while len(body) < length:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                body += chunk
            origin = headers.get('origin', '')
            allowed = origin in ALLOWED_ORIGINS
            self._debug('%s %s %s origin=%s allowed=%s ua=%s' % (
                'https' if tls is not None else 'http', method, path, origin or '-', allowed,
                headers.get('user-agent', '-')[:80]))
            if method == 'OPTIONS':
                return self._reply(conn, 204, None, origin if allowed else None)
            if not allowed:
                return self._reply(conn, 403, {'ok': False, 'error': 'origin_not_allowed'}, None)
            if method == 'GET' and path.startswith('/status') and self._export and self._export.state['state'] in ('starting', 'running'):
                # Live is busy rendering; answer without waiting for its main thread.
                return self._reply(conn, 200, {'ok': True, 'version': VERSION, 'https': self._tls is not None,
                                               'exporting': self._export.state}, origin)
            if method == 'GET' and path.startswith('/status'):
                return self._reply(conn, 200, self._run_on_main(self._cmd_status), origin)
            if method != 'POST':
                return self._reply(conn, 404, {'ok': False, 'error': 'not_found'}, origin)
            try:
                payload = json.loads(body[:length].decode('utf-8') or '{}')
            except Exception:
                return self._reply(conn, 400, {'ok': False, 'error': 'bad_json'}, origin)
            song_id = str(payload.get('song_id', ''))
            if path.startswith('/export'):
                return self._reply(conn, 200, self._export_request(path, payload), origin)
            if path.startswith('/transport'):
                action = str(payload.get('action', ''))
                if not re.match(r'^[a-z0-9]{1,12}$', action):
                    return self._reply(conn, 400, {'ok': False, 'error': 'bad_action'}, origin)
                if self._busy and action != 'state':
                    return self._reply(conn, 409, {'ok': False, 'error': 'busy'}, origin)
                return self._reply(conn, 200, self._run_on_main(self._cmd_transport, action), origin)
            if not path.startswith('/snapshot') and not SONG_ID_RE.match(song_id):
                return self._reply(conn, 400, {'ok': False, 'error': 'bad_song_id'}, origin)
            if self._busy:
                return self._reply(conn, 409, {'ok': False, 'error': 'busy'}, origin)
            self._busy = True
            try:
                if path.startswith('/snapshot'):
                    result = self._snapshot()
                elif path.startswith('/jump'):
                    result = self._run_on_main(self._cmd_jump, song_id)
                elif path.startswith('/select'):
                    task_key = str(payload.get('task_key', ''))
                    if task_key not in TASK_TRACKS:
                        return self._reply(conn, 400, {'ok': False, 'error': 'unknown_task'}, origin)
                    rng = None
                    try:
                        if payload.get('from_beat') is not None and payload.get('to_beat') is not None:
                            rng = (float(payload['from_beat']), float(payload['to_beat']))
                    except (TypeError, ValueError):
                        rng = None
                    result = self._select(song_id, task_key, rng, bool(payload.get('review')))
                else:
                    return self._reply(conn, 404, {'ok': False, 'error': 'not_found'}, origin)
            finally:
                self._busy = False
            return self._reply(conn, 200, result, origin)
        except Exception as err:
            self.log_message('TSPWork request error: %r' % (err,))
            try:
                self._reply(conn, 500, {'ok': False, 'error': 'server_error'}, None)
            except Exception:
                pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _reply(self, conn, code, obj, origin):
        reason = {200: 'OK', 204: 'No Content', 400: 'Bad Request', 403: 'Forbidden',
                  404: 'Not Found', 409: 'Conflict', 500: 'Server Error'}.get(code, 'OK')
        body = b'' if obj is None else json.dumps(obj).encode('utf-8')
        head = ['HTTP/1.1 %d %s' % (code, reason),
                'Content-Type: application/json',
                'Content-Length: %d' % len(body),
                'Cache-Control: no-store',
                'Connection: close',
                'Vary: Origin']
        if origin:
            head += ['Access-Control-Allow-Origin: %s' % origin,
                     'Access-Control-Allow-Methods: GET, POST, OPTIONS',
                     'Access-Control-Allow-Headers: Content-Type',
                     'Access-Control-Allow-Private-Network: true',
                     'Access-Control-Max-Age: 600']
        conn.sendall(('\r\n'.join(head) + '\r\n\r\n').encode('latin-1') + body)
