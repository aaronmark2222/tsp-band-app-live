"""Practice-audio export for TSPWork (agreed with Aaron, 7 Nov 2026).

For one song it renders, through Live's own File > Export Audio/Video dialog
(Rendered Track = Main, Encode MP3 on, Encode PCM off: set once by Aaron):

  * Stems     STEMS > BASS / DRUMS / OTHER / VOCALS
  * Parts     LIVE CHANNELS > <X> Live (fed by PARTS > <X> Part; Drums also by
              Drums Midi Part), so the part's track must be on
  * Backing   one file: for each of MUSIC / BACKING VOCALS / PERCUSSION / SFX,
              MIXED BACKING's track if it has clips in the song, otherwise the
              BACKING TRACKS group of that name
  * CPC       the CPC group with Backup Que switched off
  * Mixdown   Parts + Backing + CPC, with STEMS filling gaps: DRUMS if no drum
              part, OTHER if no guitar and no keyboard part, BASS if no bass
              part, VOCALS unless every vocal part is Completed in TSP Work

Each element is rendered by soloing its tracks and exporting Main over the
song's range (loop brace + Edit > Select Loop). Every solo, track on/off state,
the loop brace, the selected track and the playhead are put back afterwards.
The Live set is never saved.
"""
import os
import re
import subprocess
import threading
import time
try:
    import queue
except ImportError:  # pragma: no cover
    import Queue as queue

EXPORT_ROOT = os.path.expanduser('~/Music/TSP Exports')
UPLOAD_TMP = os.path.join('/tmp', 'tspwork-upload')
AAC_BITRATE = 128000

STEMS = [('BASS', 'Bass'), ('DRUMS', 'Drums'), ('OTHER', 'Other'), ('VOCALS', 'Vocals')]
# key, label, PARTS source track names, LIVE CHANNELS track, TSP Work task key
PARTS = [
    ('bass', 'Bass', ['Bass Part'], 'BASS Live', 'bass_part'),
    ('keyboard', 'Keyboard', ['Keyboard Part'], 'KEYBOARD Live', 'keyboard_part'),
    ('guitar', 'Guitar', ['Guitar Part'], 'GUITAR Live', 'guitar_part'),
    ('violin', 'Violin', ['Violin Part'], 'VIOLIN Live', 'violin_part'),
    ('percussion', 'Percussion', ['Percussion Part'], 'PERCUSSION Live', 'percussion_part'),
    ('drums', 'Drums', ['Drums Part', 'Drums Midi Part'], 'DRUMS Live', 'drums_part'),
    ('dale', 'Dale Vox', ['Dale Vox Part'], 'DALE VOX Live', 'vox_dale'),
    ('anston', 'Anston Vox', ['Anston Vox Part'], 'ANSTON VOX Live', 'vox_anston'),
]
BACKING = ['MUSIC', 'BACKING VOCALS', 'PERCUSSION', 'SFX']
# PARTS tracks that must be soloed too (not just on): Drums Midi Part only
# feeds Drums Part (which feeds DRUMS Live) when it is soloed itself.
EXTRA_SOLO = {'drums': ['Drums Midi Part']}
# A track is exported only if it has an active (not deactivated) clip with at
# least this much inside the song; muted-only or sliver-only tracks are skipped.
MIN_CLIP_BEATS = 0.25
# A part with less than this much active audio in the song (in beats; 16 = 4
# bars of 4/4) is a stray clip and counts as missing: no part file, and its
# stem fills the mixdown. Measured on the set (7 Nov 2026): strays are one
# clip of 3-8 beats; the shortest real parts (e.g. a violin lead) are 20+.
MIN_PART_BEATS = 16.0

# Fixed AppleScripts: data (folder, file name) is passed as arguments, never
# pasted into the script text.
OPEN_AND_EXPORT = '''
on run argv
    set folderPath to item 1 of argv
    set fileName to item 2 of argv
    tell application "System Events"
        set p to first application process whose bundle identifier is "com.ableton.live"
        set frontmost of p to true
        delay 0.3
        if not (frontmost of p) then return "not_front"
        tell p
            set fm to menu 1 of menu bar item "File" of menu bar 1
            set items_ to (menu items of fm whose name starts with "Export Audio")
            if (count of items_) is 0 then return "no_export_item"
            click item 1 of items_
        end tell
        -- Live's own dialogs are not always in "windows"; look at every
        -- top-level element, and inside only small windows (the dialog is
        -- ~300 px wide), so the big main window is never searched.
        set dlg to missing value
        set exportButton to missing value
        set seen to ""
        repeat 60 times
            delay 0.15
            set cands to {}
            tell p
                try
                    set cands to cands & (windows)
                end try
                try
                    set cands to cands & (UI elements whose role is "AXWindow")
                end try
            end tell
            set seen to ""
            repeat with w in cands
                try
                    set sz to size of w
                    set seen to seen & (item 1 of sz as text) & "x" & (item 2 of sz as text) & " "
                    if (item 1 of sz) < 600 then
                        set hits to {}
                        try
                            set hits to (buttons of group 1 of w whose name is "Export")
                        end try
                        if (count of hits) is 0 then
                            try
                                set hits to (buttons of group 1 of w whose title is "Export")
                            end try
                        end if
                        if (count of hits) is 0 then
                            try
                                set allEls to entire contents of w
                                repeat with el in allEls
                                    try
                                        if role of el is "AXButton" and (name of el is "Export" or title of el is "Export" or description of el is "Export") then
                                            set hits to {el}
                                            exit repeat
                                        end if
                                    end try
                                end repeat
                            end try
                        end if
                        if (count of hits) > 0 then
                            set dlg to w
                            set exportButton to item 1 of hits
                            exit repeat
                        end if
                    end if
                end try
            end repeat
            if dlg is not missing value then exit repeat
        end repeat
        if dlg is missing value then return "no_export_dialog (windows: " & seen & ")"
        set chooser to ""
        try
            set chooser to value of (first pop up button of group 1 of dlg whose description is "Rendered Track Chooser")
        end try
        if chooser is "" then
            try
                set chooser to value of pop up button 1 of group 1 of dlg
            end try
        end if
        if chooser is not "" and chooser is not "Main" then
            try
                click (first button of group 1 of dlg whose name is "Cancel")
            end try
            return "chooser_not_main:" & chooser
        end if
        ignoring application responses
            click exportButton
        end ignoring
        set savePanel to missing value
        repeat 80 times
            delay 0.1
            tell p
                if exists window "Save" then
                    set savePanel to window "Save"
                    exit repeat
                end if
            end tell
        end repeat
        if savePanel is missing value then return "no_save_panel"
        delay 0.3
        keystroke "g" using {command down, shift down}
        delay 0.6
        keystroke folderPath
        delay 0.3
        key code 36
        delay 1.0
        keystroke "a" using command down
        delay 0.3
        keystroke fileName
        delay 0.4
        key code 36
    end tell
    return "ok"
end run
'''

CLOSE_DIALOGS = '''
tell application "System Events"
    set p to first application process whose bundle identifier is "com.ableton.live"
    tell p
        if exists window "Save" then
            try
                click button "Cancel" of window "Save"
            end try
            delay 0.5
        end if
        repeat with w in (UI elements whose role is "AXWindow")
            try
                if (item 1 of (size of w as list)) < 600 then
                    repeat with el in (entire contents of w)
                        try
                            if role of el is "AXButton" and name of el is "Cancel" then
                                click el
                                exit repeat
                            end if
                        end try
                    end repeat
                end if
            end try
        end repeat
    end tell
end tell
return "ok"
'''

ZOOM_SELECTION = '''
tell application "System Events"
    set p to first application process whose bundle identifier is "com.ableton.live"
    tell p
        set viewMenu to menu 1 of menu bar item "View" of menu bar 1
        set zoomItems to (menu items of viewMenu whose name contains "Time Selection")
        if (count of zoomItems) is 0 then return "no_zoom_item"
        if not (enabled of item 1 of zoomItems) then return "zoom_disabled"
        click item 1 of zoomItems
    end tell
end tell
return "ok"
'''

SELECT_LOOP = '''
tell application "System Events"
    set p to first application process whose bundle identifier is "com.ableton.live"
    set frontmost of p to true
    delay 0.2
    tell p
        set editMenu to menu 1 of menu bar item "Edit" of menu bar 1
        set selectItems to (menu items of editMenu whose name contains "Select Loop")
        if (count of selectItems) is 0 then return "no_select_loop"
        click item 1 of selectItems
    end tell
end tell
return "ok"
'''


def osascript(script, *args, timeout=40):
    try:
        out = subprocess.run(['/usr/bin/osascript', '-e', script] + [str(a) for a in args],
                             capture_output=True, text=True, timeout=timeout)
    except Exception as err:
        return 'osascript_failed: %s' % err
    if out.returncode != 0:
        err = (out.stderr or '').strip()
        if '-1719' in err or '-25211' in err or 'assistive' in err.lower() or 'not allowed' in err.lower():
            return 'accessibility_needed'
        return 'osascript_error: %s' % err[:200]
    return (out.stdout or '').strip()


def safe_name(text):
    text = re.sub(r'[\\/:*?"<>|]+', ' ', str(text or '')).strip()
    return re.sub(r'\s+', ' ', text)[:80] or 'Song'


class ExportJob(object):
    def __init__(self, surface, songs, root=None, uploads=None):
        """songs: [{'song_id', 'song_name', 'vocals_complete', 'instrumental'}],
        exported one after another in this order, into `root` (default
        ~/Music/TSP Exports). uploads: {song_id: {element: {'put', 'del'}}}
        signed R2 links; each file is uploaded as soon as it is exported, in
        a separate thread, while the next one renders."""
        self.s = surface
        self.songs = songs
        self.root = root or EXPORT_ROOT
        self.uploads = uploads or {}
        self.upload_queue = queue.Queue()
        self.upload_thread = None
        self.caffeinate = None
        self.state = {'state': 'starting', 'song_id': songs[0]['song_id'], 'done': [], 'skipped': [],
                      'current': None, 'total': 0, 'error': None, 'folder': None,
                      'queue': [x['song_id'] for x in songs], 'song_index': 0, 'results': [],
                      'root': root or EXPORT_ROOT, 'upload': bool(uploads),
                      'uploaded': 0, 'upload_failed': [], 'upload_pending': 0, 'uploaded_bytes': 0,
                      'started_at': time.time()}
        self._saved = None
        self.cancelled = False
        self.thread = threading.Thread(target=self.run, name='TSPWorkExport')
        self.thread.daemon = True

    def _select_song(self, song):
        self.song_id = song['song_id']
        self.song_name = song.get('song_name', '')
        self.vocals_complete = set(song.get('vocals_complete') or [])
        self.instrumental = bool(song.get('instrumental'))   # 'I' songs: no vocals in the mixdown

    # ------------------------------------------------------------ track helpers (main thread)
    def _tracks(self):
        return list(self.s.song().tracks)

    def _named(self, name, ancestor=None):
        for t in self._tracks():
            if t.name.strip() != name:
                continue
            if ancestor is None:
                return t
            parent = t.group_track
            while parent is not None:
                if parent.name.strip() == ancestor:
                    return t
                parent = parent.group_track
        return None

    def _has_clips(self, track, s, e):
        if track is None:
            return False
        pool = self.s._descendants(track) if getattr(track, 'is_foldable', False) else [track]
        for t in pool:
            try:
                for c in t.arrangement_clips:
                    # Only active clips count, and only if more than a sliver of
                    # them (a quarter beat) falls inside the song.
                    if c.muted:
                        continue
                    if min(e, c.end_time) - max(s, c.start_time) >= MIN_CLIP_BEATS:
                        return True
            except Exception:
                continue
        return False

    def _coverage(self, tracks, s, e):
        spans = []
        for track in tracks:
            pool = self.s._descendants(track) if getattr(track, 'is_foldable', False) else [track]
            for t in pool:
                try:
                    for c in t.arrangement_clips:
                        if not c.muted:
                            a, b = max(s, c.start_time), min(e, c.end_time)
                            if b - a >= MIN_CLIP_BEATS:
                                spans.append((a, b))
                except Exception:
                    continue
        total, end = 0.0, s
        for a, b in sorted(spans):
            if b <= end:
                continue
            total += b - max(a, end)
            end = b
        return total

    def _ancestors(self, track):
        out = []
        parent = track.group_track
        while parent is not None:
            out.append(parent)
            parent = parent.group_track
        return out

    # ------------------------------------------------------------ planning (main thread)
    def plan(self):
        region = self.s._song_region(self.song_id)
        if region is None:
            return {'ok': False, 'error': 'song_not_found'}
        s, e = region
        elements = []   # (file label, [tracks to solo], [tracks that must be on])
        stems = {}
        for name, label in STEMS:
            t = self._named(name, 'STEMS')
            if self._has_clips(t, s, e):
                stems[name] = t
                elements.append(('Stem - %s' % label, [t], [t]))
        parts = {}
        for key, label, sources, live_name, task_key in PARTS:
            src = [x for x in (self._named(n, 'PARTS') for n in sources) if x is not None]
            live = self._named(live_name, 'LIVE CHANNELS')
            if live is None or not any(self._has_clips(x, s, e) for x in src):
                continue
            if self._coverage(src, s, e) < MIN_PART_BEATS:
                self.state['skipped'].append('Part - %s (only stray clips)' % label)
                continue
            extra = [x for x in src if x.name.strip() in EXTRA_SOLO.get(key, [])]
            parts[key] = (live, src, task_key, extra)
            elements.append(('Part - %s' % label, [live] + extra, [live] + src))
        backing = []
        for comp in BACKING:
            mixed = self._named(comp, 'MIXED BACKING')
            if self._has_clips(mixed, s, e):
                backing.append(mixed)
                continue
            group = self._named(comp, 'BACKING TRACKS')
            if self._has_clips(group, s, e):
                backing.append(group)
        if backing:
            elements.append(('Backing', backing, list(backing)))
        cpc = self._named('CPC')
        backup = self._named('Backup Que', 'CPC')
        if self._has_clips(cpc, s, e):
            elements.append(('CPC', [cpc], [cpc]))
        # Mixdown: parts + backing + CPC, STEMS only to fill gaps.
        mix, need_on = [], []
        for key in parts:
            if key in ('dale', 'anston'):
                continue
            live, src, _, extra = parts[key]
            mix += [live] + extra
            need_on += [live] + src
        vocal_parts = [parts[k] for k in ('dale', 'anston') if k in parts]
        vocals_done = bool(vocal_parts) and all(p[2] in self.vocals_complete for p in vocal_parts)
        if vocals_done:
            for live, src, _, extra in vocal_parts:
                mix += [live] + extra
                need_on += [live] + src
        fill = []
        if 'drums' not in parts:
            fill.append('DRUMS')
        if 'guitar' not in parts and 'keyboard' not in parts:
            fill.append('OTHER')
        if 'bass' not in parts:
            fill.append('BASS')
        if not vocals_done and not self.instrumental:
            fill.append('VOCALS')
        for name in fill:
            if name in stems:
                mix.append(stems[name])
                need_on.append(stems[name])
        mix += backing
        need_on += backing
        if any(el[0] == 'CPC' for el in elements):
            mix.append(cpc)
            need_on.append(cpc)
        if mix:
            elements.append(('Mixdown', mix, need_on))
        self.region = region
        self.elements = elements
        self.backup = backup
        self.mix_notes = {'stems_used': [n for n in fill if n in stems], 'vocal_parts_used': vocals_done,
                          'instrumental': self.instrumental}
        return {'ok': True, 'elements': [el[0] for el in elements]}

    def save_state(self):
        song = self.s.song()
        all_tracks = list(song.tracks) + list(song.return_tracks)
        self._saved = {
            'solo': [(t, t.solo) for t in all_tracks],
            'mute': [(t, t.mute) for t in all_tracks],
            'loop': (song.loop_start, song.loop_length, song.loop),
            'selected': song.view.selected_track,
            'time': song.current_song_time,
        }
        if song.is_playing:
            song.stop_playing()
        if self.backup is not None:
            self.backup.mute = True
        return {'ok': True}

    def restore_state(self):
        if not self._saved:
            return {'ok': True}
        song = self.s.song()
        sv = self._saved
        for t, v in sv['solo']:
            try:
                if t.solo != v:
                    t.solo = v
            except Exception:
                pass
        for t, v in sv['mute']:
            try:
                if t.mute != v:
                    t.mute = v
            except Exception:
                pass
        ls, ll, lo = sv['loop']
        song.loop_start, song.loop_length, song.loop = ls, ll, lo
        try:
            if sv['selected'] is not None:
                song.view.selected_track = sv['selected']
        except Exception:
            pass
        song.current_song_time = sv['time']   # also clears the time selection
        self._saved = None
        return {'ok': True}

    def setup_element(self, index):
        label, solo, need_on = self.elements[index]
        song = self.s.song()
        targets = list(solo)
        for t in list(song.tracks) + list(song.return_tracks):
            want = any(t == x for x in targets)
            try:
                if t.solo != want:
                    t.solo = want
            except Exception:
                pass
        for t in need_on:
            for x in [t] + self._ancestors(t):
                try:
                    if x.mute:
                        x.mute = False
                except Exception:
                    pass
        if self.backup is not None:
            self.backup.mute = True
        s, e = self.region
        song.loop_start = s
        song.loop_length = e - s
        song.current_song_time = s
        self.s._unfold_parents(solo[0])
        song.view.selected_track = solo[0]
        view = self.s.application().view
        view.show_view('Arranger')
        view.focus_view('Arranger')
        return {'ok': True}

    # ------------------------------------------------------------ the job (worker thread)
    def _main(self, fn, *args):
        result = self.s._run_on_main(fn, *args, timeout=8.0)
        if not result or not result.get('ok'):
            raise RuntimeError((result or {}).get('error') or (result or {}).get('detail') or 'live_timeout')
        return result

    def _wait_for_file(self, folder, base, before, timeout=900):
        """Wait for the new audio file to appear and stop growing. Typed file
        names can lose characters, so any new file in the folder counts; it
        is then renamed to the intended name."""
        started = time.time()
        last, stable, found = -1, 0, None
        while time.time() - started < timeout:
            time.sleep(1.0)
            if self.cancelled:
                raise RuntimeError('cancelled')
            new = [f for f in os.listdir(folder)
                   if not f.startswith('.') and f not in before and os.path.isfile(os.path.join(folder, f))]
            if not new:
                continue
            found = sorted(new, key=lambda f: os.path.getmtime(os.path.join(folder, f)))[-1]
            size = os.path.getsize(os.path.join(folder, found))
            if size > 0 and size == last:
                stable += 1
                if stable >= 3:
                    ext = os.path.splitext(found)[1] or '.mp3'
                    target = base + ext
                    if found != target:
                        if os.path.exists(os.path.join(folder, target)):
                            os.remove(os.path.join(folder, target))
                        os.rename(os.path.join(folder, found), os.path.join(folder, target))
                    return target
            else:
                stable = 0
            last = size
        raise RuntimeError('export_timeout (no new file in %s; check the Save window)' % folder)

    def _export_song(self):
        st = self.state
        plan = self._main(self.plan)
        folder = os.path.join(self.root, safe_name('%s %s' % (self.song_id, self.song_name)))
        os.makedirs(folder, exist_ok=True)
        st.update({'state': 'running', 'folder': folder, 'total': len(plan['elements']),
                   'elements': plan['elements'], 'mix': self.mix_notes, 'done': []})
        if self._saved is None:
            self._main(self.save_state)
        # Clean up a file left with a damaged name by an earlier run.
        for f in os.listdir(folder):
            if f.startswith(' - ') or f.startswith('- '):
                os.remove(os.path.join(folder, f))
        # Show the song first (zoomed to its whole range) so it's visible
        # which song is being exported.
        if self.elements:
            self._main(self.setup_element, 0)
            time.sleep(0.3)
            if osascript(SELECT_LOOP) == 'ok':
                time.sleep(0.3)
                osascript(ZOOM_SELECTION)
            time.sleep(1.0)
        for i, (label, _, _) in enumerate(self.elements):
            if self.cancelled:
                raise RuntimeError('cancelled')
            base = safe_name('%s - %s' % (self.song_id, label))
            st['current'] = label
            file_started = time.time()
            for f in os.listdir(folder):
                if f.startswith(base + '.'):
                    os.remove(os.path.join(folder, f))
            before = set(os.listdir(folder))
            self._main(self.setup_element, i)
            time.sleep(0.3)
            out = osascript(SELECT_LOOP)
            if out != 'ok':
                raise RuntimeError(out)
            time.sleep(0.3)
            out = osascript(OPEN_AND_EXPORT, folder, base, timeout=60)
            if out != 'ok':
                raise RuntimeError(out)
            name = self._wait_for_file(folder, base, before)
            st['done'].append({'label': label, 'file': name, 'seconds': round(time.time() - file_started, 1)})
            self._queue_upload(label, os.path.join(folder, name))
        st['current'] = None
        # Files from an earlier export that this run no longer makes (e.g. a
        # stray part) are removed from the band app too.
        links = self.uploads.get(self.song_id) or {}
        made = set(el[0] for el in self.elements)
        for label, link in links.items():
            if label in made:
                continue
            for key in ('del', 'del_old'):
                if link.get(key):
                    self.upload_queue.put(('delete', self.song_id, label, None, link[key]))
                    st['upload_pending'] += 1

    # ------------------------------------------------------------ uploads (own thread)
    def _queue_upload(self, label, path):
        link = (self.uploads.get(self.song_id) or {}).get(label)
        if not link or not link.get('put'):
            return
        self.state['upload_pending'] += 1
        self.upload_queue.put(('put', self.song_id, label, path, link['put'], link.get('del_old')))

    def _upload_worker(self):
        st = self.state
        while True:
            job = self.upload_queue.get()
            if job is None:
                return
            kind, song_id, label, path, url = job[:5]
            del_old = job[5] if len(job) > 5 else None
            tmp = None
            try:
                if kind == 'put':
                    # The band app gets AAC 128 kbps (~40% of the 320 kbps MP3):
                    # macOS's own afconvert, so nothing to install.
                    tmp = os.path.join(UPLOAD_TMP, '%s-%d.m4a' % (re.sub(r'[^A-Za-z0-9]+', '-', '%s %s' % (song_id, label)), int(time.time() * 1000)))
                    os.makedirs(UPLOAD_TMP, exist_ok=True)
                    conv = subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(AAC_BITRATE), '-s', '0', path, tmp],
                                          capture_output=True, text=True, timeout=600)
                    if conv.returncode != 0 or not os.path.exists(tmp):
                        raise RuntimeError('convert failed: ' + (conv.stderr or '').strip()[:120])
                    cmd = ['/usr/bin/curl', '-sS', '-f', '--retry', '3', '--retry-delay', '5', '-X', 'PUT',
                           '-H', 'Content-Type: audio/mp4', '-T', tmp, url]
                else:
                    cmd = ['/usr/bin/curl', '-sS', '-f', '--retry', '2', '-X', 'DELETE', url]
                out = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
                if out.returncode != 0:
                    raise RuntimeError((out.stderr or 'curl %d' % out.returncode).strip()[:160])
                if kind == 'put':
                    st['uploaded'] += 1
                    st['uploaded_bytes'] += os.path.getsize(tmp)
                    if del_old:   # an older MP3 of the same track: remove it (no duplicates)
                        subprocess.run(['/usr/bin/curl', '-sS', '-X', 'DELETE', del_old], capture_output=True, timeout=120)
            except Exception as err:
                st['upload_failed'].append({'song_id': song_id, 'label': label, 'error': str(err)[:160]})
            finally:
                st['upload_pending'] = max(0, st['upload_pending'] - 1)
                if tmp and os.path.exists(tmp):
                    try:
                        os.remove(tmp)
                    except Exception:
                        pass

    def _keep_awake(self, on):
        # Stops the Mac idle-sleeping during an overnight run (screen may sleep).
        try:
            if on and self.caffeinate is None:
                self.caffeinate = subprocess.Popen(['/usr/bin/caffeinate', '-i', '-w', str(os.getpid())])
            elif not on and self.caffeinate is not None:
                self.caffeinate.terminate()
                self.caffeinate = None
        except Exception:
            self.caffeinate = None

    def run(self):
        st = self.state
        self._keep_awake(True)
        if self.uploads:
            self.upload_thread = threading.Thread(target=self._upload_worker, name='TSPWorkUpload')
            self.upload_thread.daemon = True
            self.upload_thread.start()
        try:
            for index, song in enumerate(self.songs):
                if self.cancelled:
                    st['results'].append({'song_id': song['song_id'], 'state': 'cancelled', 'files': 0})
                    continue
                song_started = time.time()
                self._select_song(song)
                st.update({'song_index': index, 'song_id': self.song_id, 'error': None,
                           'done': [], 'skipped': [], 'total': 0, 'current': None, 'folder': None,
                           'song_started_at': song_started})
                try:
                    self._export_song()
                    st['results'].append({'song_id': self.song_id, 'state': 'done', 'files': len(st['done']),
                                          'skipped': list(st['skipped']),
                                          # timing, logged by the app for time-left estimates
                                          'started_at': song_started, 'finished_at': time.time(),
                                          'seconds': round(time.time() - song_started, 1),
                                          'file_seconds': [[d['label'], d.get('seconds')] for d in st['done']]})
                except Exception as err:
                    st['error'] = str(err)[:300]
                    st['results'].append({'song_id': self.song_id, 'state': 'error', 'files': len(st['done']),
                                          'error': st['error'], 'started_at': song_started, 'finished_at': time.time(),
                                          'seconds': round(time.time() - song_started, 1)})
                    osascript(CLOSE_DIALOGS, timeout=20)  # don't leave Export/Save open
            failed = [r for r in st['results'] if r['state'] != 'done']
            st['state'] = 'error' if failed else 'done'
            if failed and not st.get('error'):
                st['error'] = '%d song(s) not exported' % len(failed)
        except Exception as err:
            st['state'] = 'error'
            st['error'] = str(err)[:300]
        finally:
            try:
                self.s._run_on_main(self.restore_state, timeout=10.0)
            except Exception:
                pass
            st['current'] = None
            if self.upload_thread is not None:
                # Ableton is done; let the last uploads finish.
                final = st['state']
                st['state'] = 'uploading'
                self.upload_queue.put(None)
                self.upload_thread.join(timeout=3600)
                st['state'] = 'error' if (final == 'error' or st['upload_failed']) else 'done'
                if st['upload_failed'] and not st.get('error'):
                    st['error'] = '%d upload(s) failed' % len(st['upload_failed'])
            self._keep_awake(False)
            st['finished_at'] = time.time()
            self.s._export_finished(self)
