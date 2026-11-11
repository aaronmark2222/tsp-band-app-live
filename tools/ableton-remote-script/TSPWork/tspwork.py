"""TSPWork: a small local bridge between the TSP Work app and Ableton Live.

Safety rules (agreed with Aaron, 6 Nov 2026):
  * Listens on 127.0.0.1 only: nothing outside this Mac can reach it.
  * Accepts requests only from the TSP Work site (and localhost for testing).
  * Lyrics writeback is enabled only for the explicitly guarded master-project
    path; every other set is refused. Other commands only move the playhead,
    select a track or time region and zoom. The loop brace is restored.
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
VERSION = '1.27'
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
MAIN_ALS_PATH = '/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als'
DEFAULT_ALS = MAIN_ALS_PATH
CONFIG_FILE = os.path.expanduser('~/.tspwork.json')  # optional {"als_path": "..."}


def als_path():
    # Hard safety boundary: Sync reads/writes only the explicitly selected
    # master project; every other open set is refused.
    return MAIN_ALS_PATH

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
        self._reading_since = None  # set while /snapshot reads the saved set
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
            if job and job.state['state'] in ('starting', 'running', 'uploading'):
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
                'als_path': path, 'open_als_path': getattr(self.song(), 'file_path', ''), 'als_saved_at': saved}

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
                'review': self._review_state(start) if self._review else None}

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

    def _review_state(self, pos=None):
        song = self.song()
        rv = self._review
        clips = self._review_clips() if rv else []
        # A locator jump lands a moment later, so the caller can pass the target.
        if pos is None:
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
            if job and job.state['state'] in ('starting', 'running', 'uploading'):
                if payload.get('after_song'):
                    # Finish the song being exported, then stop (1.17).
                    job.stop_after_song = not bool(payload.get('undo'))
                    job.state['stop_after_song'] = job.stop_after_song
                else:
                    job.cancelled = True
            return {'ok': True, 'job': job.state if job else None}
        if job and job.state['state'] in ('starting', 'running', 'uploading'):
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
        root = str(payload.get('export_root') or '').strip()
        if root:
            root = os.path.expanduser(root)
            if not os.path.isabs(root) or '..' in root.split('/'):
                return {'ok': False, 'error': 'bad_export_folder'}
            # The drive (e.g. /Volumes/AARON SSD) must be plugged in; the last
            # folder level is created if needed.
            if not os.path.isdir(os.path.dirname(root.rstrip('/'))):
                return {'ok': False, 'error': 'export_folder_missing', 'folder': root}
        uploads = payload.get('uploads') if isinstance(payload.get('uploads'), dict) else {}
        if self._busy:
            return {'ok': False, 'error': 'busy'}
        import importlib
        from . import exporter
        importlib.reload(exporter)
        self._run_on_main(self._end_review)
        self._busy = True
        self._export = exporter.ExportJob(self, songs, root or None, uploads)
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

    # ------------------------------------------------------------ musician lyric writeback (master project only)
    def _cmd_prepare_lyrics_writeback(self, edits):
        expected = os.path.realpath(MAIN_ALS_PATH)
        opened = os.path.realpath(getattr(self.song(), 'file_path', '') or '')
        if opened != expected:
            return {'ok': False, 'error': 'wrong_open_set', 'expected_path': MAIN_ALS_PATH,
                    'open_path': getattr(self.song(), 'file_path', '')}
        if not os.path.exists(MAIN_ALS_PATH):
            return {'ok': False, 'error': 'main_set_not_found', 'expected_path': MAIN_ALS_PATH}
        tracks = [t for t in self._all_tracks() if '+LYRICS' in (t.name or '').upper()]
        by_slug = {}
        for track in tracks:
            label = re.split(r'\s+\+', track.name, maxsplit=1)[0].strip()
            slug = re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
            by_slug.setdefault(slug, track)
        song_track = self._find_track(None, 'SONG ID')
        if song_track is None:
            return {'ok': False, 'error': 'song_id_track_missing'}
        sections_track = self._find_track(None, 'SECTIONS')
        regions = {}
        for clip in song_track.arrangement_clips:
            if not clip.muted and SONG_ID_RE.match(clip.name or ''):
                regions.setdefault(clip.name, (clip.start_time, clip.end_time))
        plans = []
        create_plans = []
        delete_plans = []
        # Preflight every requested track before changing any clip.
        for item in edits:
            song_id = str(item.get('song_id', ''))
            slug = str(item.get('track_slug', ''))
            base = item.get('base_lines') or []
            desired = item.get('lines') or []
            if not SONG_ID_RE.match(song_id) or song_id not in regions:
                return {'ok': False, 'error': 'song_not_found', 'song_id': song_id}
            track = by_slug.get(slug)
            if track is None:
                return {'ok': False, 'error': 'lyrics_track_not_found', 'song_id': song_id, 'track_slug': slug}
            additions = [line for line in desired if line.get('is_new_clip') is True]
            existing_desired = [line for line in desired if line.get('is_new_clip') is not True]
            if additions and slug not in ('drums', 'percussion'):
                return {'ok': False, 'error': 'clip_add_not_supported', 'song_id': song_id, 'track_slug': slug}
            if len(existing_desired) > len(base) or (len(existing_desired) != len(base) and slug not in ('drums', 'percussion')):
                return {'ok': False, 'error': 'line_count_changed', 'song_id': song_id, 'track_slug': slug,
                        'message': 'Existing MIDI clips can only be removed from Drums or Percussion; edits remain saved in Practice.'}
            start, end = regions[song_id]
            clips = sorted([c for c in track.arrangement_clips
                            if not c.muted and c.end_time > start and c.start_time < end
                            and (c.name or '').strip()], key=lambda c: c.start_time)
            base = sorted(base, key=lambda x: float(x.get('t', 0)))
            existing_desired = sorted(existing_desired, key=lambda x: float(x.get('t', 0)))
            desired_by_base = {}
            for new in existing_desired:
                try:
                    target_t = float(new.get('t', 0))
                except (TypeError, ValueError):
                    target_t = None
                matches = [(abs(float(old.get('t', 0)) - target_t), i) for i, old in enumerate(base)
                           if i not in desired_by_base and target_t is not None]
                if not matches or min(matches)[0] > 0.03:
                    return {'ok': False, 'error': 'source_changed', 'song_id': song_id, 'track_slug': slug,
                            'message': 'A Practice clip no longer matches its original Ableton timing.'}
                desired_by_base[min(matches)[1]] = new
            removed_indices = [i for i in range(len(base)) if i not in desired_by_base]
            if removed_indices and slug not in ('drums', 'percussion'):
                return {'ok': False, 'error': 'clip_remove_not_supported', 'song_id': song_id, 'track_slug': slug}
            already_created = []
            if additions:
                if sections_track is None:
                    return {'ok': False, 'error': 'sections_track_missing', 'song_id': song_id, 'track_slug': slug}
                if not callable(getattr(track, 'create_midi_clip', None)) or not callable(getattr(track, 'delete_clip', None)):
                    return {'ok': False, 'error': 'clip_create_unsupported', 'song_id': song_id, 'track_slug': slug,
                            'message': 'This Ableton version does not expose safe arrangement MIDI clip creation.'}
                sections = sorted([c for c in sections_track.arrangement_clips
                                   if not c.muted and c.end_time > start and c.start_time < end], key=lambda c: c.start_time)
                all_track_clips = [c for c in track.arrangement_clips
                                   if not c.muted and c.end_time > start and c.start_time < end]
                seen_sections = set()
                for new in additions:
                    text = str(new.get('text', '')).strip()
                    try:
                        section_index = int(new.get('section_index'))
                    except (TypeError, ValueError):
                        section_index = -1
                    if not text or len(text) > 12000:
                        return {'ok': False, 'error': 'invalid_lyrics_text', 'song_id': song_id, 'track_slug': slug}
                    if section_index < 0 or section_index >= len(sections) or section_index in seen_sections:
                        return {'ok': False, 'error': 'invalid_section_clip', 'song_id': song_id, 'track_slug': slug}
                    seen_sections.add(section_index)
                    section = sections[section_index]
                    clip_start = max(start, section.start_time)
                    clip_end = min(end, section.end_time)
                    if clip_end <= clip_start:
                        return {'ok': False, 'error': 'invalid_section_clip', 'song_id': song_id, 'track_slug': slug}
                    removing_ids = set(id(clips[i]) for i in removed_indices if i < len(clips))
                    overlapping = [c for c in all_track_clips if id(c) not in removing_ids
                                   if c.end_time > clip_start + 0.01 and c.start_time < clip_end - 0.01]
                    exact = [c for c in overlapping
                             if (c.name or '') == text and abs(c.start_time - clip_start) <= 0.02
                             and abs(c.end_time - clip_end) <= 0.02]
                    if len(exact) == 1:
                        # A previous attempt may have created the clip but failed
                        # during save/readback. Recognize it and avoid duplication.
                        already_created.append(exact[0])
                        continue
                    if overlapping:
                        return {'ok': False, 'error': 'section_clip_exists', 'song_id': song_id,
                                'track_slug': slug, 'section': section_index + 1,
                                'message': 'That section already has a MIDI clip. The Practice edit was kept.'}
                    create_plans.append((track, clip_start, clip_end - clip_start, text, song_id, slug))
            already_created_ids = set(id(c) for c in already_created)
            clips_for_baseline = [c for c in clips if id(c) not in already_created_ids]
            if len(clips_for_baseline) != len(base):
                return {'ok': False, 'error': 'clip_count_mismatch', 'song_id': song_id, 'track_slug': slug}
            if removed_indices and not callable(getattr(track, 'delete_clip', None)):
                return {'ok': False, 'error': 'clip_remove_unsupported', 'song_id': song_id, 'track_slug': slug,
                        'message': 'This Ableton version does not expose arrangement clip removal.'}
            for i, (clip, old) in enumerate(zip(clips_for_baseline, base)):
                new = desired_by_base.get(i)
                if (clip.name or '') not in (str(old.get('text', '')), str(new.get('text', '')) if new else ''):
                    return {'ok': False, 'error': 'source_changed', 'song_id': song_id, 'track_slug': slug,
                            'line': i + 1, 'message': 'The Ableton clip changed since this Practice edit was based on it.'}
                if new is None:
                    delete_plans.append((track, clip, clip.start_time, clip.end_time - clip.start_time,
                                         clip.name, getattr(clip, 'color', None), song_id, slug))
                    continue
                text = str(new.get('text', '')).strip()
                if not text or len(text) > 12000:
                    return {'ok': False, 'error': 'invalid_lyrics_text', 'song_id': song_id, 'track_slug': slug, 'line': i + 1}
                if text != clip.name:
                    plans.append((clip, clip.name, text, song_id, slug))
        return {'ok': True, 'plans': plans, 'create_plans': create_plans, 'delete_plans': delete_plans,
                'count': len(plans) + len(create_plans) + len(delete_plans), 'added': len(create_plans), 'removed': len(delete_plans)}

    def _cmd_apply_lyrics_writeback(self, plans, create_plans=None, delete_plans=None):
        opened = os.path.realpath(getattr(self.song(), 'file_path', '') or '')
        if opened != os.path.realpath(MAIN_ALS_PATH):
            return {'ok': False, 'error': 'wrong_open_set', 'open_path': getattr(self.song(), 'file_path', '')}
        changed = []
        created = []
        deleted = []
        try:
            for clip, old, new, song_id, slug in plans:
                clip.name = new
                changed.append((clip, old))
            for track, start, length, text, song_id, slug in (create_plans or []):
                clip = track.create_midi_clip(start, length)
                created.append((track, clip))
                # New cue clips use their lyrics track's color (Drums red,
                # Percussion dark red) so they match the established set.
                track_color = getattr(track, 'color', None)
                if track_color is not None:
                    clip.color = track_color
                clip.name = text
            for track, clip, start, length, text, color, song_id, slug in (delete_plans or []):
                track.delete_clip(clip)
                deleted.append((track, start, length, text, color, song_id, slug))
        except Exception as err:
            for track, start, length, text, color, song_id, slug in reversed(deleted):
                try:
                    restored = track.create_midi_clip(start, length)
                    if color is not None:
                        restored.color = color
                    restored.name = text
                except Exception as rollback_err:
                    self.log_message('TSPWork could not roll back removed %s clip: %r' % (slug, rollback_err))
            for track, clip in reversed(created):
                try:
                    track.delete_clip(clip)
                except Exception as rollback_err:
                    self.log_message('TSPWork could not roll back new %s clip: %r' % (slug, rollback_err))
            for clip, old in reversed(changed):
                try:
                    clip.name = old
                except Exception:
                    pass
            return {'ok': False, 'error': 'clip_write_failed', 'detail': str(err)[:200]}
        return {'ok': True, 'changed': len(changed) + len(created) + len(deleted), 'added': len(created), 'removed': len(deleted)}

    def _sync_lyrics(self, edits):
        if not isinstance(edits, list) or len(edits) > 1000:
            return {'ok': False, 'error': 'invalid_edits'}
        pre = self._run_on_main(self._cmd_prepare_lyrics_writeback, edits, timeout=15)
        if not pre.get('ok'):
            return pre
        plans = pre.pop('plans', [])
        create_plans = pre.pop('create_plans', [])
        delete_plans = pre.pop('delete_plans', [])
        applied = self._run_on_main(self._cmd_apply_lyrics_writeback, plans, create_plans, delete_plans, timeout=15)
        if not applied.get('ok'):
            return applied
        # Change only the open Live session. The musician chooses when to save;
        # the app confirms persistence later by reading the saved .als file.
        return {'ok': True, 'changed': applied.get('changed', 0), 'saved': False,
                'awaiting_manual_save': applied.get('changed', 0) > 0,
                'message': 'Clip names changed in Live memory. Save the set manually when ready.'}

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
            conn.settimeout(15)
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
            # /export carries a batch of signed upload links (~1 MB for every song).
            limit = 4 * 1024 * 1024 if path.startswith(('/export', '/sync-lyrics')) else 4096
            length = min(int(headers.get('content-length', '0') or 0), limit)
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
            if method == 'GET' and path.startswith('/status') and self._export and self._export.state['state'] in ('starting', 'running', 'uploading'):
                # Live is busy rendering; answer without waiting for its main thread.
                return self._reply(conn, 200, {'ok': True, 'version': VERSION, 'https': self._tls is not None,
                                               'exporting': self._export.state}, origin)
            if method == 'GET' and path.startswith('/status'):
                if self._reading_since:
                    # A read is running (maybe from another window): say so straight away.
                    prog = None
                    try:
                        from . import alsreader
                        prog = dict(alsreader.PROGRESS)
                    except Exception:
                        pass
                    return self._reply(conn, 200, {'ok': True, 'version': VERSION, 'https': self._tls is not None,
                                                   'reading_since': self._reading_since, 'reading_progress': prog}, origin)
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
            if not path.startswith(('/snapshot', '/sync-lyrics')) and not SONG_ID_RE.match(song_id):
                return self._reply(conn, 400, {'ok': False, 'error': 'bad_song_id'}, origin)
            if self._busy:
                return self._reply(conn, 409, {'ok': False, 'error': 'busy'}, origin)
            self._busy = True
            try:
                if path.startswith('/sync-lyrics'):
                    result = self._sync_lyrics(payload.get('edits', []))
                elif path.startswith('/snapshot'):
                    self._reading_since = time.time()
                    try:
                        result = self._snapshot()
                    finally:
                        self._reading_since = None
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
