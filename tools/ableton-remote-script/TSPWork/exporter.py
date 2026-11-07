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

EXPORT_ROOT = os.path.expanduser('~/Music/TSP Exports')

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
        set dlg to missing value
        repeat 60 times
            delay 0.1
            tell p
                repeat with w in windows
                    try
                        if (count of (buttons of group 1 of w whose title is "Export")) > 0 then
                            set dlg to w
                            exit repeat
                        end if
                    end try
                end repeat
            end tell
            if dlg is not missing value then exit repeat
        end repeat
        if dlg is missing value then return "no_export_dialog"
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
                click (first button of group 1 of dlg whose title is "Cancel")
            end try
            return "chooser_not_main:" & chooser
        end if
        set exportButton to first button of group 1 of dlg whose title is "Export"
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
        delay 0.8
        keystroke "a" using command down
        keystroke fileName
        delay 0.2
        key code 36
    end tell
    return "ok"
end run
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
    def __init__(self, surface, song_id, song_name, vocals_complete):
        self.s = surface
        self.song_id = song_id
        self.song_name = song_name
        self.vocals_complete = set(vocals_complete or [])
        self.state = {'state': 'starting', 'song_id': song_id, 'done': [], 'skipped': [],
                      'current': None, 'total': 0, 'error': None, 'folder': None,
                      'started_at': time.time()}
        self._saved = None
        self.thread = threading.Thread(target=self.run, name='TSPWorkExport')
        self.thread.daemon = True

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
                    if not c.muted and c.end_time > s + 0.5 and c.start_time < e - 0.5:
                        return True
            except Exception:
                continue
        return False

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
            parts[key] = (live, src, task_key)
            elements.append(('Part - %s' % label, [live], [live] + src))
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
            live, src, _ = parts[key]
            mix.append(live)
            need_on += [live] + src
        vocal_parts = [parts[k] for k in ('dale', 'anston') if k in parts]
        vocals_done = bool(vocal_parts) and all(p[2] in self.vocals_complete for p in vocal_parts)
        if vocals_done:
            for live, src, _ in vocal_parts:
                mix.append(live)
                need_on += [live] + src
        fill = []
        if 'drums' not in parts:
            fill.append('DRUMS')
        if 'guitar' not in parts and 'keyboard' not in parts:
            fill.append('OTHER')
        if 'bass' not in parts:
            fill.append('BASS')
        if not vocals_done:
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
        self.mix_notes = {'stems_used': [n for n in fill if n in stems], 'vocal_parts_used': vocals_done}
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

    def _wait_for_file(self, folder, base, timeout=1200):
        started = time.time()
        last, stable = -1, 0
        while time.time() - started < timeout:
            time.sleep(1.0)
            found = [f for f in os.listdir(folder) if f.startswith(base + '.') and not f.startswith('.')]
            if not found:
                continue
            size = os.path.getsize(os.path.join(folder, found[0]))
            if size > 0 and size == last:
                stable += 1
                if stable >= 3:
                    return found[0]
            else:
                stable = 0
            last = size
        raise RuntimeError('export_timeout')

    def run(self):
        st = self.state
        try:
            plan = self._main(self.plan)
            folder = os.path.join(EXPORT_ROOT, safe_name('%s %s' % (self.song_id, self.song_name)))
            os.makedirs(folder, exist_ok=True)
            st.update({'state': 'running', 'folder': folder, 'total': len(plan['elements']),
                       'elements': plan['elements'], 'mix': self.mix_notes})
            self._main(self.save_state)
            for i, (label, _, _) in enumerate(self.elements):
                base = safe_name('%s - %s' % (self.song_id, label))
                st['current'] = label
                for f in os.listdir(folder):
                    if f.startswith(base + '.'):
                        os.remove(os.path.join(folder, f))
                self._main(self.setup_element, i)
                time.sleep(0.3)
                out = osascript(SELECT_LOOP)
                if out != 'ok':
                    raise RuntimeError(out)
                time.sleep(0.3)
                out = osascript(OPEN_AND_EXPORT, folder, base, timeout=60)
                if out != 'ok':
                    raise RuntimeError(out)
                name = self._wait_for_file(folder, base)
                st['done'].append({'label': label, 'file': name})
            st['current'] = None
            st['state'] = 'done'
        except Exception as err:
            st['state'] = 'error'
            st['error'] = str(err)[:300]
        finally:
            try:
                self.s._run_on_main(self.restore_state, timeout=10.0)
            except Exception:
                pass
            st['finished_at'] = time.time()
            self.s._export_finished(self)
