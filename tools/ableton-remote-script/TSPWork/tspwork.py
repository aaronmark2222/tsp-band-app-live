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
VERSION = '1.0'
ALLOWED_ORIGINS = (
    'https://aaronmark2222.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
)
SONG_ID_RE = re.compile(r'^[A-Z][A-Za-z]*[0-9]+$')

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
    'backing_music': ('MIXED BACKING', 'MUSIC'),
    'backing_vocals_dale': ('MIXED BACKING', 'BACKING VOCALS'),
    'backing_vocals_anston': ('MIXED BACKING', 'BACKING VOCALS'),
    'backing_percussion': ('MIXED BACKING', 'PERCUSSION'),
    'backing_sfx': ('MIXED BACKING', 'SFX'),
    'bass_part': ('PARTS', 'Bass Part'),
    'keyboard_part': ('PARTS', 'Keyboard Part'),
    'guitar_part': ('PARTS', 'Guitar Part'),
    'violin_part': ('PARTS', 'Violin Part'),
    'percussion_part': ('PARTS', 'Percussion Part'),
    'drums_part': ('PARTS', 'Drums Part'),
    'vox_dale': ('PARTS', 'Dale Vox Part'),
    'vox_anston': ('PARTS', 'Anston Vox Part'),
}

# Fixed AppleScript: no request data is ever inserted into it.
SELECT_AND_ZOOM = '''
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
        delay 0.15
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
        self._server = None
        self._thread = threading.Thread(target=self._serve, name='TSPWorkBridge')
        self._thread.daemon = True
        self._thread.start()
        self.log_message('TSPWork %s: listening on 127.0.0.1:%d' % (VERSION, PORT))
        self.show_message('TSPWork: connected to TSP Work on this Mac')

    # ------------------------------------------------------------ Live hooks
    def disconnect(self):
        self._stop = True
        try:
            if self._server:
                self._server.close()
        except Exception:
            pass
        ControlSurface.disconnect(self)

    def update_display(self):
        ControlSurface.update_display(self)
        # Runs on Live's main thread about every 100 ms.
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

    def _song_region(self, song_id):
        track = self._find_track(None, 'SONG ID')
        if track is None:
            return None
        for clip in track.arrangement_clips:
            if clip.name == song_id and not clip.muted:
                return clip.start_time, clip.end_time
        return None

    def _show_arranger(self):
        view = self.application().view
        view.show_view('Arranger')
        view.focus_view('Arranger')

    # ------------------------------------------------------------ commands
    def _cmd_status(self):
        region_track = self._find_track(None, 'SONG ID')
        count = 0
        if region_track is not None:
            count = sum(1 for c in region_track.arrangement_clips if SONG_ID_RE.match(c.name or ''))
        return {'ok': True, 'version': VERSION, 'songs': count, 'playing': self.song().is_playing}

    def _cmd_jump(self, song_id):
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
        if cue is not None and song.is_playing:
            cue.jump()  # quantized like a locator click while playing
        else:
            song.current_song_time = start
        self._show_arranger()
        return {'ok': True, 'start_beat': start}

    def _cmd_prepare_select(self, song_id, task_key):
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
        song.view.selected_track = track
        if not song.is_playing:
            song.current_song_time = start
        song.loop_start = start
        song.loop_length = end - start
        self._show_arranger()
        return {'ok': True, 'saved_loop': saved, 'track': track.name}

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

    def _select(self, song_id, task_key):
        prep = self._run_on_main(self._cmd_prepare_select, song_id, task_key)
        if not prep or not prep.get('ok'):
            return prep or {'ok': False, 'error': 'timeout'}
        time.sleep(0.15)  # let Live redraw with the new loop brace
        outcome = self._osascript(SELECT_AND_ZOOM)
        time.sleep(0.1)
        self._run_on_main(self._cmd_restore_loop, prep['saved_loop'])
        result = {'ok': outcome == 'ok', 'track': prep['track']}
        if outcome != 'ok':
            result['error'] = outcome
        return result

    # ------------------------------------------------------------ HTTP bridge
    def _serve(self):
        try:
            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            srv.bind(('127.0.0.1', PORT))
            srv.listen(8)
            srv.settimeout(1.0)
            self._server = srv
        except Exception as err:
            self.log_message('TSPWork could not open port %d: %r' % (PORT, err))
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
            worker = threading.Thread(target=self._handle, args=(conn,))
            worker.daemon = True
            worker.start()

    def _handle(self, conn):
        try:
            conn.settimeout(5)
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
            if method == 'OPTIONS':
                return self._reply(conn, 204, None, origin if allowed else None)
            if not allowed:
                return self._reply(conn, 403, {'ok': False, 'error': 'origin_not_allowed'}, None)
            if method == 'GET' and path.startswith('/status'):
                return self._reply(conn, 200, self._run_on_main(self._cmd_status), origin)
            if method != 'POST':
                return self._reply(conn, 404, {'ok': False, 'error': 'not_found'}, origin)
            try:
                payload = json.loads(body[:length].decode('utf-8') or '{}')
            except Exception:
                return self._reply(conn, 400, {'ok': False, 'error': 'bad_json'}, origin)
            song_id = str(payload.get('song_id', ''))
            if not SONG_ID_RE.match(song_id):
                return self._reply(conn, 400, {'ok': False, 'error': 'bad_song_id'}, origin)
            if self._busy:
                return self._reply(conn, 409, {'ok': False, 'error': 'busy'}, origin)
            self._busy = True
            try:
                if path.startswith('/jump'):
                    result = self._run_on_main(self._cmd_jump, song_id)
                elif path.startswith('/select'):
                    task_key = str(payload.get('task_key', ''))
                    if task_key not in TASK_TRACKS:
                        return self._reply(conn, 400, {'ok': False, 'error': 'unknown_task'}, origin)
                    result = self._select(song_id, task_key)
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
