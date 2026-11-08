"""Read-only parser for the TSP master Live Set (.als), used by TSPWork.

Ported from tsp_ableton_sync.py. It opens the saved .als file, never writes
it, and returns per-song metadata (locator name, duration, tempo map, starting
key), evidence of finished work per track, and housekeeping warnings.
"""
import datetime as dt
import difflib
import gzip
import hashlib
import math
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

SONG_ID_RE = re.compile(r'^[A-Z][A-Za-z]*[0-9]+$')
EPS = 0.01  # beats

# ---------------------------------------------------------------- track map
# Track names in the master project (top-level group, track name prefix).
TRACKS = {
    'song_id':    ('SONG DETAILS', 'SONG ID'),
    'sections':   ('ABLESET', 'SECTIONS'),
    'chords':     ('ABLESET', 'Chords'),
    'lyrics':     ('ABLESET', 'Lyrics'),
    'guitar':     ('ABLESET', 'Guitar +'),
    'keyboard':   ('ABLESET', 'Keyboard +'),
    'drums':      ('ABLESET', 'Drums +'),
    'tone':       ('ABLESET', 'GUITAR TONE'),
    'prompts':    ('CPC', 'PROMPTS'),
    'song_cue':   ('CPC', 'Vocal Prompts'),
    'backup_que': ('CPC', 'Backup Que'),
    'mx_bgv':     ('MIXED BACKING', 'BACKING VOCALS'),
    'mx_music':   ('MIXED BACKING', 'MUSIC'),
    'mx_perc':    ('MIXED BACKING', 'PERCUSSION'),
    'mx_sfx':     ('MIXED BACKING', 'SFX'),
}
SHARP = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'}


# ================================================================ .als parse
def _val(el, path, default=None):
    node = el.find(path)
    return node.get('Value') if node is not None else default


def _clip_notes(c, cstart, cend):
    """Enabled notes of a short MIDI clip as (arrangement_beat, key, velocity,
    length_beats), following the clip's start marker and looping."""
    def f(path, default=0.0):
        try:
            return float(_val(c, path, default))
        except (TypeError, ValueError):
            return default
    looped = _val(c, 'Loop/LoopOn', 'false') == 'true'
    loop_start, loop_end = f('Loop/LoopStart'), f('Loop/LoopEnd')
    marker = f('Loop/StartMarker', loop_start)
    raw = []
    for kt in c.iter('KeyTrack'):
        try:
            key = int(_val(kt, 'MidiKey', '-1'))
        except ValueError:
            continue
        for n in kt.iter('MidiNoteEvent'):
            if n.get('IsEnabled', 'true') != 'true':
                continue
            raw.append((float(n.get('Time', '0')), key, int(float(n.get('Velocity', '100'))), float(n.get('Duration', '0.25'))))
    out = []
    if not looped or loop_end - loop_start <= 1e-6:
        for t, key, vel, dur in raw:
            pos = cstart + (t - marker)
            if cstart - 1e-6 <= pos < cend - 1e-6:
                out.append((pos, key, vel, dur))
    else:
        length = loop_end - loop_start
        # first pass runs from the start marker to the loop end, then repeats the loop
        for t, key, vel, dur in raw:
            if marker - 1e-6 <= t < loop_end - 1e-6:
                pos = cstart + (t - marker)
                if pos < cend - 1e-6:
                    out.append((pos, key, vel, dur))
        rep_start = cstart + (loop_end - marker)
        k = 0
        while rep_start + k * length < cend - 1e-6 and k < 256:
            for t, key, vel, dur in raw:
                if loop_start - 1e-6 <= t < loop_end - 1e-6:
                    pos = rep_start + k * length + (t - loop_start)
                    if pos < cend - 1e-6:
                        out.append((pos, key, vel, dur))
            k += 1
    out.sort()
    return out


# Clip parts that change what it sounds like (not its name, colour or view).
SOUND_PARTS = ('Loop', 'Disabled', 'SampleRef', 'WarpMarkers', 'IsWarped', 'WarpMode', 'PitchCoarse',
               'PitchFine', 'SampleVolume', 'Fades', 'Envelopes', 'Notes', 'StartMarker', 'EndMarker')


def _esc_text(t):
    # As ElementTree._escape_cdata (Python 3.9-3.13).
    if '&' in t:
        t = t.replace('&', '&amp;')
    if '<' in t:
        t = t.replace('<', '&lt;')
    if '>' in t:
        t = t.replace('>', '&gt;')
    return t


def _esc_attr(t):
    # As ElementTree._escape_attrib (Python 3.9-3.13, incl. Live 12's 3.11).
    t = _esc_text(t)
    if '"' in t:
        t = t.replace('"', '&quot;')
    if '\r' in t:
        t = t.replace('\r', '&#13;')
    if '\n' in t:
        t = t.replace('\n', '&#10;')
    if '\t' in t:
        t = t.replace('\t', '&#09;')
    return t


def _xml_bytes(node):
    """Same bytes as ET.tostring(node) for .als elements (no namespaces,
    comments or PIs), several times faster: one list, no writer setup."""
    out = []
    add = out.append
    esc_text = _esc_text
    esc_attr = _esc_attr

    def walk(el):
        tag = el.tag
        add('<' + tag)
        for k, v in el.attrib.items():
            add(' %s="%s"' % (k, esc_attr(v)))
        text = el.text
        if text or len(el):
            add('>')
            if text:
                add(esc_text(text))
            for child in el:
                walk(child)
            add('</' + tag + '>')
        else:
            add(' />')
        if el.tail:
            add(esc_text(el.tail))
    walk(node)
    return ''.join(out).encode('ascii', 'xmlcharrefreplace')


def _sample_identity(node):
    """What a clip's audio file *is*, not where it lives: file name, size,
    checksum, length and rate. Paths and modification dates change when the
    project is moved or collected (Collect All and Save) without the sound
    changing, so they are left out."""
    ref = node.find('FileRef')
    path = ''
    if ref is not None:
        path = _val(ref, 'Path', '') or _val(ref, 'RelativePath', '') or ''
    parts = [os.path.basename(path.replace('\\', '/')),
             _val(ref, 'OriginalFileSize', '') if ref is not None else '',
             _val(ref, 'OriginalCrc', '') if ref is not None else '',
             _val(node, 'DefaultDuration', ''), _val(node, 'DefaultSampleRate', '')]
    return ('SampleRef|' + '|'.join(str(p or '') for p in parts)).encode('utf-8')


def _clip_sound_hash(c):
    h = hashlib.sha1()
    for tag in SOUND_PARTS:
        node = c.find(tag)
        if node is not None:
            h.update(_sample_identity(node) if tag == 'SampleRef' else _xml_bytes(node))
    return h.hexdigest()[:12]


def _clips(track_el, sound=True):
    """Arrangement clips of a track (not session or freeze clips). sound=False
    skips the sound hash (lyrics/marker tracks: thousands of clips, no audio)."""
    seq = track_el.find('DeviceChain/MainSequencer')
    out = []
    if seq is None:
        return out
    for arr in seq.iter('ArrangerAutomation'):
        events = arr.find('Events')
        if events is None:
            continue
        for c in events:
            if c.tag not in ('MidiClip', 'AudioClip'):
                continue
            start = c.find('CurrentStart')
            end = c.find('CurrentEnd')
            if start is None or end is None:
                continue
            notes = sum(1 for _ in c.iter('MidiNoteEvent')) if c.tag == 'MidiClip' else None
            midi = _clip_notes(c, float(start.get('Value')), float(end.get('Value'))) if c.tag == 'MidiClip' and notes and notes <= 16 else []
            out.append({
                'start': float(start.get('Value')),
                'end': float(end.get('Value')),
                'name': _val(c, 'Name', '') or '',
                'disabled': _val(c, 'Disabled', 'false') == 'true',
                'color': _val(c, 'Color', None),
                'notes': notes,
                'midi': midi,
                'file': (_val(c, 'SampleRef/FileRef/Path', '') or _val(c, 'SampleRef/FileRef/RelativePath', '') or '')
                        if c.tag == 'AudioClip' else '',
                'h': _clip_sound_hash(c) if sound else '',
            })
    out.sort(key=lambda c: (c['start'], c['end']))
    return out


def _events(main_el, param):
    """Automation events for a main-track parameter (Tempo, TimeSignature)."""
    target = main_el.find(f'DeviceChain/Mixer/{param}/AutomationTarget')
    if target is None:
        target = main_el.find(f'.//{param}/AutomationTarget')
    manual = main_el.find(f'.//{param}/Manual')
    tid = target.get('Id') if target is not None else None
    for env in main_el.iter('AutomationEnvelope'):
        if _val(env, 'EnvelopeTarget/PointeeId') == tid:
            ev = [(float(e.get('Time')), float(e.get('Value')))
                  for e in env.find('Automation/Events')
                  if e.get('Time') is not None]
            if ev:
                return ev
    return [(-63072000.0, float(manual.get('Value')))] if manual is not None else []


def _track_entry(el):
    tname = _val(el, 'Name/EffectiveName', '') or ''
    sound = not ('+LYRICS' in tname.upper() or tname.strip().upper().startswith(('SECTIONS', 'SONG ID', 'GUITAR TONE')))
    return {
        'id': el.get('Id'), 'type': el.tag,
        'name': _val(el, 'Name/EffectiveName', ''),
        'group': _val(el, 'TrackGroupId', '-1'),
        'color': _val(el, 'Color', None),
        'mix': '|'.join(str(_val(el, 'DeviceChain/Mixer/%s/Manual' % k, '')) for k in ('Volume', 'Pan')),
        'clips': _clips(el, sound),
    }


_TRACK_START = re.compile(rb'\n\t\t\t<(\w+Track)[ >]')


def _parse_piece(data, a, b):
    """Parse data[a:b] with the C parser, 1 MB at a time so Live's own
    Python work gets a turn between pieces."""
    parser = ET.XMLParser()
    view = memoryview(data)
    step = 1 << 20
    for i in range(a, b, step):
        parser.feed(bytes(view[i:min(i + step, b)]))
    return parser.close()


def _read_als_fast(path):
    """Unzip once, cut the file into its top-level tracks by Ableton's tab
    indentation, and parse each piece with the C parser (one track in memory
    at a time). Returns None if the layout isn't what's expected."""
    _progress('open', 0, 0)
    with gzip.open(path, 'rb') as fh:
        data = fh.read()
    a = data.find(b'\n\t\t<Tracks>')
    b = data.find(b'\n\t\t</Tracks>', a)
    if a < 0 or b < 0:
        return None
    starts = [m.start() for m in _TRACK_START.finditer(data, a, b)]
    if not starts:
        return None
    tracks = []
    for i, s0 in enumerate(starts):
        if i % 5 == 0:
            _progress('tracks', i, len(starts))
        e0 = starts[i + 1] if i + 1 < len(starts) else b
        el = _parse_piece(data, s0, e0)
        tracks.append(_track_entry(el))
        del el

    def block(tag):
        s0 = data.find(b'\n\t\t<' + tag, b)
        if s0 < 0:
            return None
        head_end = data.find(b'>', s0)
        if data[head_end - 1:head_end] == b'/':  # <Tag ... />
            return _parse_piece(data, s0, head_end + 1)
        e0 = data.find(b'\n\t\t</' + tag + b'>', s0)
        return _parse_piece(data, s0, e0 + len(tag) + 6) if e0 >= 0 else None

    tempo, timesig, locators = [], [], []
    for tag in (b'MainTrack', b'MasterTrack'):
        main = block(tag)
        if main is not None:
            tempo = _events(main, 'Tempo')
            timesig = _events(main, 'TimeSignature')
    loc_el = block(b'Locators')
    if loc_el is not None:
        for loc in loc_el.iter('Locator'):
            locators.append((float(_val(loc, 'Time', '0')), _val(loc, 'Name', '')))
    locators.sort()
    tempo.sort(key=lambda e: e[0])
    timesig.sort(key=lambda e: e[0])
    return {'tracks': tracks, 'locators': locators, 'tempo': tempo, 'timesig': timesig}


def read_als(path):
    try:
        fast = _read_als_fast(path)
    except Exception:
        fast = None
    return fast if fast is not None else _read_als_stream(path)


def _read_als_stream(path):
    """Stream-parse the .als and return tracks, locators, tempo, time sigs."""
    tracks, locators, tempo, timesig = [], [], [], []
    stack = []
    with gzip.open(path, 'rb') as fh:
        for ev, el in ET.iterparse(fh, events=('start', 'end')):
            if ev == 'start':
                stack.append(el.tag)
                continue
            stack.pop()
            depth = len(stack)
            if depth == 3 and stack[2] == 'Tracks' and el.tag.endswith('Track'):
                tname = _val(el, 'Name/EffectiveName', '') or ''
                sound = not ('+LYRICS' in tname.upper() or tname.strip().upper().startswith(('SECTIONS', 'SONG ID', 'GUITAR TONE')))
                tracks.append({
                    'id': el.get('Id'), 'type': el.tag,
                    'name': _val(el, 'Name/EffectiveName', ''),
                    'group': _val(el, 'TrackGroupId', '-1'),
                    'color': _val(el, 'Color', None),
                    'mix': '|'.join(str(_val(el, 'DeviceChain/Mixer/%s/Manual' % k, '')) for k in ('Volume', 'Pan')),
                    'clips': _clips(el, sound),
                })
                el.clear()
            elif depth == 2 and el.tag in ('MainTrack', 'MasterTrack'):
                tempo = _events(el, 'Tempo')
                timesig = _events(el, 'TimeSignature')
                el.clear()
            elif depth == 2 and el.tag == 'Locators':
                for loc in el.iter('Locator'):
                    locators.append((float(_val(loc, 'Time', '0')), _val(loc, 'Name', '')))
                el.clear()
    locators.sort()
    tempo.sort(key=lambda e: e[0])
    timesig.sort(key=lambda e: e[0])
    return {'tracks': tracks, 'locators': locators, 'tempo': tempo, 'timesig': timesig}


# ================================================================ music math
class Timeline:
    def __init__(self, tempo, timesig):
        self.tempo = tempo or [(-63072000.0, 120.0)]
        self.timesig = timesig or [(-63072000.0, 201.0)]

    def bpm_at(self, t):
        """BPM at beat t (after any instant jump located exactly at t)."""
        ev = self.tempo
        last = None
        for i, (t0, v0) in enumerate(ev):
            if t0 <= t + 1e-9:
                last = i
            else:
                break
        if last is None:
            return ev[0][1]
        t0, v0 = ev[last]
        if last + 1 < len(ev) and t0 < t:
            t1, v1 = ev[last + 1]
            if t1 > t0:
                return v0 + (v1 - v0) * (t - t0) / (t1 - t0)
        return v0

    def seconds(self, a, b):
        """Exact playback seconds between beats a and b."""
        total = 0.0
        cuts = sorted({a, b, *[t for t, _ in self.tempo if a < t < b]})
        for x0, x1 in zip(cuts, cuts[1:]):
            v0 = self.bpm_at(x0 + 1e-7)
            v1 = self.bpm_at(x1 - 1e-7) if x1 - x0 > 2e-7 else v0
            length = x1 - x0
            if abs(v1 - v0) < 1e-6:
                total += 60.0 * length / v0
            else:
                total += 60.0 * length / (v1 - v0) * math.log(v1 / v0)
        return total

    @staticmethod
    def _sig(code):
        code = int(round(code))
        den = 2 ** (code // 99)
        num = code % 99 + 1
        return num, den

    def bar_of(self, beat, origin):
        """1-based bar number of `beat`, counting bars from `origin`."""
        start_sig = [v for t, v in self.timesig if t <= origin]
        pieces = [(origin, start_sig[-1] if start_sig else 201)]
        pieces += [(t, v) for t, v in self.timesig if origin < t <= beat]
        bars = 0
        for i, (t0, code) in enumerate(pieces):
            last = i + 1 == len(pieces)
            t1 = beat if last else pieces[i + 1][0]
            num, den = self._sig(code)
            n = (t1 - t0) / (num * 4.0 / den)
            # Ableton starts a new bar at every time-signature change
            bars += int(math.floor(n + 1e-6)) if last else int(math.ceil(n - 1e-6))
        return bars + 1

    def tempo_map(self, s, e):
        """Ordered tempo points inside [s, e) in the app's tempo_segments format."""
        # a jump placed a hair after the song start belongs to the start
        at_start = [v for t, v in self.tempo if abs(t - s) <= EPS]
        start_bpm = at_start[-1] if at_start else self.bpm_at(s)
        changes = []  # dicts: kind, t0, t1, before, after
        prev_t, prev_v = s, start_bpm
        for t, v in self.tempo:
            if not (s + EPS < t < e - EPS):
                if s - EPS < t <= s + EPS:
                    prev_t = s
                continue
            if abs(v - prev_v) > 1e-6:
                if abs(t - prev_t) <= 1e-6:
                    changes.append({'kind': 'instant', 't0': t, 't1': t, 'before': prev_v, 'after': v})
                else:
                    last = changes[-1] if changes else None
                    same_dir = last and last['kind'] == 'gradual' and abs(last['t1'] - prev_t) <= 1e-6 \
                        and (v - prev_v) * (last['after'] - last['before']) > 0
                    if same_dir:
                        last['t1'], last['after'] = t, v
                    else:
                        changes.append({'kind': 'gradual', 't0': prev_t, 't1': t, 'before': prev_v, 'after': v})
            prev_t, prev_v = t, v
        points = [{'bpm': _num(start_bpm)}]
        for c in changes:
            p = points[-1]
            p['transition_to_next'] = c['kind']
            p['change_start_bar'] = self.bar_of(c['t0'], s)
            p['change_end_bar'] = self.bar_of(c['t1'], s)
            p['change_start_beat'] = _num(c['t0'] - s)
            p['change_end_beat'] = _num(c['t1'] - s)
            points.append({'bpm': _num(c['after'])})
        points[-1]['transition_to_next'] = None
        return points


def _num(x):
    r = round(x)
    return int(r) if abs(x - r) < 1e-3 else round(x, 2)


# ================================================================ snapshot
def _find_track(tracks, group_name, prefix):
    by_id = {t['id']: t for t in tracks}

    def top_group(t):
        seen = set()
        while t['group'] not in ('-1', None) and t['group'] in by_id and t['id'] not in seen:
            seen.add(t['id'])
            t = by_id[t['group']]
        return t['name']

    for t in tracks:
        if t['type'] == 'GroupTrack':
            continue
        if t['name'].startswith(prefix) and (top_group(t) == group_name or
                                             by_id.get(t['group'], {}).get('name') == group_name):
            return t
    return None


SLIVER = 0.01  # beats; clips shorter than this are leftovers from cuts


def _in(clips, s, e):
    return [c for c in clips if not c['disabled'] and c['end'] - c['start'] >= SLIVER
            and c['start'] < e - EPS and c['end'] > s + EPS]


def _coverage(clips, s, e):
    """Fraction of [s, e) covered by active clips."""
    iv = sorted((max(s, c['start']), min(e, c['end'])) for c in _in(clips, s, e))
    total, cur = 0.0, s
    for a, b in iv:
        a = max(a, cur)
        if b > a:
            total += b - a
            cur = b
    return total / (e - s) if e > s else 0.0


CHORD_RE = re.compile(r'^(Key:|[A-G][#b]?[A-Za-z0-9#b/+\-]*)$')


def _fingerprint(clips, s, e):
    """Short hash of every clip touching [s, e): changes when a clip on that
    track is added, removed, moved, trimmed, renamed, (de)activated or replaced."""
    parts = ['%.3f|%.3f|%s|%s|%s|%s' % (max(s, c['start']) - s, min(e, c['end']) - s, c['name'],
                                        c.get('file', ''), c.get('notes'), c['disabled'])
             for c in clips if c['end'] > s and c['start'] < e]
    return hashlib.sha1('\n'.join(parts).encode('utf-8')).hexdigest()[:16]


def _annotations(name):
    """Player notes in a clip name: (instructions) and [non-chord labels]."""
    notes = set(m.strip().lower() for m in re.findall(r'\(([^)]*)\)', name) if m.strip())
    for tok in re.findall(r'\[([^\]]*)\]', name):
        tok = tok.strip()
        if tok and not tok.startswith('(') and not CHORD_RE.match(tok):
            notes.add(tok.lower())
    return notes


_CHORD_ONE = r'[A-G][#b]?(?:maj|min|m|dim|aug|sus|add|M|\+|°|ø)?[0-9]*(?:(?:sus|add|maj|b|#)?[0-9]+)*(?:/[A-G][#b]?)?'
CHORD_TOKEN_RE = re.compile(r'^(?:Key:|%s(?:-%s)*)-?$' % (_CHORD_ONE, _CHORD_ONE))


def _chord_seq(name):
    """Chord symbols of a clip name in order, without annotations, lyrics or
    the trailing '-' hold marks: '[Gm] Turn [C] on [Dm-]' -> 'Gm C Dm'."""
    out = []
    for tok in re.findall(r'\[([^\]]*)\]', name):
        tok = tok.strip()
        if CHORD_TOKEN_RE.match(tok):
            out.append(tok.rstrip('-'))
    return ' '.join(out)


def _chord_tokens(clips):
    """Every chord of a track in playing order, with the clip it sits in."""
    out = []
    for c in clips:
        for group in _chord_seq(c['name']).split():
            for chord in group.split('-'):
                if chord:
                    out.append((chord, c['start']))
    return out


def _chord_mismatches(chord_clips, player_clips, track_key, s, tl):
    """Where a player track's chord sequence differs from the Chords track.
    Compared as a sequence, so clips split or cut differently don't count;
    only added, missing or different chords do."""
    a = _chord_tokens(chord_clips)
    b = _chord_tokens(player_clips)
    sm = difflib.SequenceMatcher(None, [t[0] for t in a], [t[0] for t in b], autojunk=False)
    out = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal':
            continue
        pos = a[i1][1] if i1 < i2 else (b[j1][1] if j1 < j2 else s)
        kind = {'replace': 'differs', 'delete': 'missing', 'insert': 'extra'}[op]
        out.append({'track': track_key, 'kind': kind, 'beat': _num(pos), 'bar': tl.bar_of(pos, 0),
                    'song_bar': tl.bar_of(pos, s),
                    'chords': ' '.join(t[0] for t in a[i1:i2]), 'player': ' '.join(t[0] for t in b[j1:j2])})
    return out


def _custom_notes(player_clips, chord_clips):
    chord_notes = {}
    for c in chord_clips:
        chord_notes.setdefault(round(c['start'], 2), set()).update(_annotations(c['name']))
    return sum(1 for c in player_clips
               if _annotations(c['name']) - chord_notes.get(round(c['start'], 2), set()))


def _key_from(name):
    m = re.search(r'\[Key:\]\s*\[([A-G])([#b]?)(m?)\]', name)
    if not m:
        return None
    root = m.group(1) + m.group(2)
    root = SHARP.get(root, root)
    return root + m.group(3)


def _bar_starts(tl, a, b):
    """[seconds_from_start, numerator, denominator] for every bar of [a, b),
    starting a new bar at each time-signature change like Ableton does; plus
    the numbers of bars cut short by a change landing mid-bar."""
    def sig_at(t):
        code = 201
        for t0, v in tl.timesig:
            if t0 <= t + EPS:
                code = v
            else:
                break
        return tl._sig(code)
    changes = [t for t, _ in tl.timesig if a + EPS < t < b - EPS]
    out, short, pos, guard = [], [], a, 0
    while pos < b - EPS and guard < 5000:
        num, den = sig_at(pos)
        nxt = pos + num * 4.0 / den
        cut = [t for t in changes if pos + EPS < t < nxt - EPS]
        out.append([round(tl.seconds(a, pos), 3) if pos > a else 0.0, num, den])
        if cut:
            short.append(len(out))
        pos = cut[0] if cut else nxt
        guard += 1
    return out, short


def _key_marks(clips, a, b, tl):
    """[(bar, key, beat)] of every [Key:] clip in the song, same key repeats dropped."""
    marks = []
    for c in _in(clips, a, b):
        k = _key_from(c['name'])
        if k and (not marks or marks[-1][1] != k):
            marks.append((tl.bar_of(max(a, c['start']), a), k, max(a, c['start'])))
    return marks


def _lyrics_for(lyric_tracks, section_clips, a, b, tl):
    """Each +LYRICS clip in the song as a timed line (seconds from the song
    start, through the tempo map), like AbleSet shows them; plus sections."""
    def sec(beat):
        return round(tl.seconds(a, beat), 3) if beat > a else 0.0
    out = {'tracks': [], 'sections': []}
    for c in _in(section_clips, a, b):
        out['sections'].append({'t': sec(max(a, c['start'])), 'name': c['name'], 'c': _hex(c.get('color'))})
    for lt in lyric_tracks:
        lines = []
        for c in _in(lt['clips'], a, b):
            if not c['name'].strip():
                continue
            start = max(a, c['start'])
            lines.append({'t': sec(start), 'e': sec(min(b, c['end'])), 'text': c['name'], 'c': _hex(c.get('color'))})
        if lines:
            out['tracks'].append({'slug': lt['slug'], 'label': lt['label'], 'lines': lines})
    # Tempo in seconds from the song start (automation breakpoints, ramps
    # sampled every beat) so the practice player can show the live tempo.
    pts = [(0.0, tl.bpm_at(a + 1e-7))]
    events = [t for t, _ in tl.tempo if a < t < b]
    for t, v in tl.tempo:
        if a < t < b:
            pts.append((sec(t), v))
    beat = math.floor(a) + 1.0
    while beat < b:
        if any(abs(beat - t) < 1e-6 for t in events) is False:
            v0 = tl.bpm_at(beat - 1e-7)
            v1 = tl.bpm_at(beat + 1e-7)
            if abs(v1 - v0) < 1e-6 and abs(v0 - pts[-1][1]) > 0.05:
                pts.append((sec(beat), v0))
        beat += 1.0
    pts.sort(key=lambda p: p[0])
    out['tempo'] = [[round(t, 2), round(v, 2)] for t, v in pts]
    return out


# Live's 70-colour track palette (index stored as <Color Value=.../>).
LIVE_PALETTE = [
    'FF94A6', 'FFA529', 'CC9927', 'F7F47C', 'BFFB00', '1AFF2F', '25FFA8', '5CFFE8', '8BC5FF', '5480E4', '92A7FF', 'D86CE4', 'E553A0', 'FFFFFF',
    'FF3636', 'F66C03', '99724B', 'FFF034', '87FF67', '3DC300', '00BFAF', '19E9FF', '10A4EE', '007DC0', '886CE4', 'B677C6', 'FF39D4', 'D0D0D0',
    'E2675A', 'FFA374', 'D3AD71', 'EDFFAE', 'D2E498', 'BAD074', '9BC48D', 'D4FDE1', 'CDF1F8', 'B9C1E3', 'CDBBE4', 'AE98E5', 'E5DCE1', 'A9A9A9',
    'C6928B', 'B78256', '99836A', 'BFBA69', 'A6BE00', '7DB04D', '88C2BA', '9BB3C4', '85A5C2', '8393CC', 'A595B5', 'BF9FBE', 'BC7196', '7B7B7B',
    'AF3333', 'A95131', '724F41', 'DBC300', '85961F', '539F31', '0A9C8E', '236384', '1A2F96', '2F52A2', '624BAD', 'A34BAD', 'CC2E6E', '3C3C3C',
]
# Practice-page element -> (parent group, track name) whose colour it takes.
COLOR_SOURCES = {
    'Part - Bass': ('PARTS', 'Bass Part'), 'Part - Keyboard': ('PARTS', 'Keyboard Part'),
    'Part - Guitar': ('PARTS', 'Guitar Part'), 'Part - Violin': ('PARTS', 'Violin Part'),
    'Part - Percussion': ('PARTS', 'Percussion Part'), 'Part - Drums': ('PARTS', 'Drums Part'),
    'Part - Dale Vox': ('PARTS', 'Dale Vox Part'), 'Part - Anston Vox': ('PARTS', 'Anston Vox Part'),
    'Stem - Bass': ('STEMS', 'BASS'), 'Stem - Drums': ('STEMS', 'DRUMS'), 'Stem - Other': ('STEMS', 'OTHER'),
    'Stem - Vocals': ('STEMS', 'VOCALS'), 'Backing': (None, 'MIXED BACKING'), 'CPC': (None, 'CPC'),
}


def _hex(index):
    """Live palette index -> '#RRGGBB' (None if unknown)."""
    try:
        return '#' + LIVE_PALETTE[int(index)]
    except (TypeError, ValueError, IndexError):
        return None


# Practice-audio element -> tracks it is rendered from (mirrors exporter.py).
AUDIO_SOURCES = {
    'Stem - Bass': [('STEMS', 'BASS')], 'Stem - Drums': [('STEMS', 'DRUMS')],
    'Stem - Other': [('STEMS', 'OTHER')], 'Stem - Vocals': [('STEMS', 'VOCALS')],
    'Part - Bass': [('PARTS', 'Bass Part'), ('LIVE CHANNELS', 'BASS Live')],
    'Part - Keyboard': [('PARTS', 'Keyboard Part'), ('LIVE CHANNELS', 'KEYBOARD Live')],
    'Part - Guitar': [('PARTS', 'Guitar Part'), ('LIVE CHANNELS', 'GUITAR Live')],
    'Part - Violin': [('PARTS', 'Violin Part'), ('LIVE CHANNELS', 'VIOLIN Live')],
    'Part - Percussion': [('PARTS', 'Percussion Part'), ('LIVE CHANNELS', 'PERCUSSION Live')],
    'Part - Drums': [('PARTS', 'Drums Part'), ('PARTS', 'Drums Midi Part'), ('LIVE CHANNELS', 'DRUMS Live')],
    'Part - Dale Vox': [('PARTS', 'Dale Vox Part'), ('LIVE CHANNELS', 'DALE VOX Live')],
    'Part - Anston Vox': [('PARTS', 'Anston Vox Part'), ('LIVE CHANNELS', 'ANSTON VOX Live')],
    'Backing': [('*', 'MIXED BACKING'), ('*', 'BACKING TRACKS')],
    'CPC': [('*', 'CPC')],
}


def _audio_fingerprints(tracks, a, b):
    """Per song: a short hash per practice-audio element of the clips (what
    they sound like, where they sit) and mixer settings of the tracks it is
    rendered from. A different hash later = the uploaded file is out of date."""
    by_id = {t['id']: t for t in tracks}
    kids = {}
    for t in tracks:
        kids.setdefault(t['group'], []).append(t)

    def under(group_track):
        out, todo = [], [group_track]
        while todo:
            g = todo.pop()
            out.append(g)
            todo.extend(kids.get(g['id'], []))
        return out

    def find(parent, name):
        for t in tracks:
            if t['name'].strip() != name:
                continue
            par = by_id.get(t['group'])
            if parent == '*' or (par is not None and par['name'].strip() == parent):
                return t
        return None

    out = {}
    for element, sources in AUDIO_SOURCES.items():
        chosen = []
        for parent, name in sources:
            t = find(parent, name)
            if t is not None:
                chosen.extend(under(t) if parent == '*' else [t])
        if element == 'CPC':
            chosen = [t for t in chosen if t['name'].strip() != 'Backup Que']
        h = hashlib.sha1()
        content = False
        for t in sorted(chosen, key=lambda t: (t['name'], t['id'])):
            inside = [c for c in t['clips'] if c['end'] > a and c['start'] < b]
            if any(not c['disabled'] for c in inside):
                content = True
            h.update(('%s|%s\n' % (t['name'], t.get('mix', ''))).encode('utf-8'))
            for c in inside:
                h.update(('%.3f|%.3f|%s|%s\n' % (max(a, c['start']) - a, min(b, c['end']) - a, c['disabled'], c.get('h', ''))).encode('utf-8'))
        out[element] = h.hexdigest()[:12] if content else None
    parts = [out[k] or '-' for k in sorted(out)]
    out['Mixdown'] = hashlib.sha1('|'.join(parts).encode('utf-8')).hexdigest()[:12] if any(v for v in out.values()) else None
    return out


def _track_colors(tracks):
    by_id = {t['id']: t for t in tracks}
    out = {}
    for element, (group, name) in COLOR_SOURCES.items():
        for t in tracks:
            if t['name'].strip() != name:
                continue
            parent = by_id.get(t['group'])
            if group is not None and (parent is None or parent['name'].strip() != group):
                continue
            try:
                out[element] = '#' + LIVE_PALETTE[int(t['color'])]
            except (TypeError, ValueError, IndexError):
                pass
            break
    return out


# Inside Live, Python shares time with Live itself and reads run ~10x slower,
# so hand the read to a separate Python on this Mac when there is one.
_PYTHONS = ('/opt/homebrew/bin/python3', '/usr/local/bin/python3',
            '/Library/Developer/CommandLineTools/usr/bin/python3',
            '/Applications/Xcode.app/Contents/Developer/usr/bin/python3')
LAST_READ = {'how': None, 'error': None}
# Live progress of the current read: stage, done, total (TSPWork's /status shows it).
PROGRESS = {'stage': None, 'done': 0, 'total': 0}
_CHILD = False


def _progress(stage, done=0, total=0):
    PROGRESS.update(stage=stage, done=done, total=total)
    if _CHILD:  # tell the parent (TSPWork inside Live) on stderr
        try:
            sys.stderr.write('P\t%s\t%d\t%d\n' % (stage, done, total))
            sys.stderr.flush()
        except Exception:
            pass


def _external_python():
    for p in _PYTHONS:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def build_snapshot(als_path):
    if 'Live' in sys.modules:
        py = _external_python()
        if py:
            try:
                import json
                import threading
                _progress('open', 0, 0)
                proc = subprocess.Popen([py, '-I', os.path.abspath(__file__), '--snapshot', als_path],
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                result = {}
                reader = threading.Thread(target=lambda: result.update(out=proc.stdout.read()))
                reader.daemon = True
                reader.start()
                errors = []
                for raw in iter(proc.stderr.readline, b''):
                    line = raw.decode('utf-8', 'replace').rstrip('\n')
                    parts = line.split('\t')
                    if len(parts) == 4 and parts[0] == 'P':
                        PROGRESS.update(stage=parts[1], done=int(parts[2]), total=int(parts[3]))
                    else:
                        errors.append(line)
                proc.wait(timeout=900)
                reader.join(timeout=60)
                if proc.returncode == 0 and result.get('out'):
                    LAST_READ.update(how=py, error=None)
                    snap = json.loads(result['out'].decode('utf-8'))
                    snap['reader'] = py
                    _progress('done', 0, 0)
                    return snap
                LAST_READ.update(how='in Live', error='\n'.join(errors)[-300:])
            except Exception as err:
                LAST_READ.update(how='in Live', error=repr(err)[:300])
        else:
            LAST_READ.update(how='in Live', error='no separate python3 found')
    snap = _build_snapshot(als_path)
    _progress('done', 0, 0)
    snap['reader'] = 'in Live' + (' (%s)' % LAST_READ['error'][:120] if LAST_READ.get('error') else '')
    return snap


def _build_snapshot(als_path):
    raw = read_als(als_path)
    tl = Timeline(raw['tempo'], raw['timesig'])
    tracks = raw['tracks']
    found = {k: _find_track(tracks, g, p) for k, (g, p) in TRACKS.items()}
    warnings = []
    for k, t in found.items():
        if t is None:
            warnings.append({'kind': 'track_missing', 'msg': f'Track for "{k}" ({TRACKS[k][1]}… in {TRACKS[k][0]}) not found; that check was skipped.'})
    clips = {k: (t['clips'] if t else []) for k, t in found.items()}
    # AbleSet lyrics tracks: every track flagged +LYRICS (Chords, Guitar, ...).
    lyric_tracks = []
    for t in tracks:
        if '+LYRICS' in t['name'].upper():
            label = re.split(r'\s+\+', t['name'], maxsplit=1)[0].strip()
            lyric_tracks.append({'slug': re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-'),
                                 'label': label, 'name': t['name'], 'clips': t['clips']})

    def where(t):
        return f'bar {tl.bar_of(t, 0)} (beat {_num(t)})'

    # --- song regions from SONG ID clips
    songs, seen = [], {}
    for c in clips['song_id']:
        length = c['end'] - c['start']
        if c['disabled']:
            warnings.append({'kind': 'song_id_disabled', 'msg': f'SONG ID clip "{c["name"]}" at {where(c["start"])} is deactivated and was ignored.'})
            continue
        if not SONG_ID_RE.match(c['name']):
            warnings.append({'kind': 'song_id_stray', 'msg': f'SONG ID track has a clip named "{c["name"]}" at {where(c["start"])}, {length:.6f} beats long. It is not a Song ID, so it was ignored. Delete it in Ableton if it is not needed.'})
            continue
        if length < 1:
            warnings.append({'kind': 'song_id_tiny', 'msg': f'SONG ID clip "{c["name"]}" at {where(c["start"])} is only {length:.6f} beats long.'})
        if c['name'] in seen:
            warnings.append({'kind': 'song_id_duplicate', 'msg': f'Song ID {c["name"]} appears twice (at {where(seen[c["name"]])} and {where(c["start"])}); only the first was used.'})
            continue
        seen[c['name']] = c['start']
        songs.append({'id': c['name'], 'start': c['start'], 'end': c['end']})

    for a, b in zip(songs, songs[1:]):
        if b['start'] < a['end'] - EPS:
            warnings.append({'kind': 'overlap', 'msg': f'{a["id"]} and {b["id"]} overlap on the SONG ID track ({where(b["start"])}).'})
        elif b['start'] > a['end'] + EPS:
            gap_locs = [n for t, n in raw['locators'] if a['end'] - EPS <= t < b['start'] - EPS]
            if not any('prelude' in n.lower() for n in gap_locs):
                warnings.append({'kind': 'gap', 'msg': f'Gap between {a["id"]} and {b["id"]} on the SONG ID track ({where(a["end"])}–{where(b["start"])}).'})

    loc_at = {}
    for t, n in raw['locators']:
        loc_at.setdefault(round(t, 2), n)
    starts = {round(s['start'], 2) for s in songs}
    for t, n in raw['locators']:
        low = n.strip().lower()
        if round(t, 2) in starts or low in ('>', 'song end') or 'prelude' in low or not low:
            continue
        inside = any(s['start'] < t < s['end'] for s in songs)
        if not inside:
            warnings.append({'kind': 'locator_orphan', 'msg': f'Locator "{n}" at {where(t)} is not at the start of any Song ID clip.'})

    # --- slivers (near-zero-length clips) on synced tracks, grouped per track
    for k, cl in clips.items():
        tiny = [c for c in cl if not c['disabled'] and c['end'] - c['start'] < SLIVER]
        if tiny and k != 'song_id':
            bars = ', '.join(str(tl.bar_of(c['start'], 0)) for c in tiny[:12]) + (' …' if len(tiny) > 12 else '')
            warnings.append({'kind': 'slivers', 'msg': f'{TRACKS[k][1]} track has {len(tiny)} near-invisible sliver clip(s) (under 0.01 beats, usually left over from cutting clips) at bar(s) {bars}. They are ignored by the sync; delete them in Ableton when convenient.'})

    # --- per song metadata + evidence
    out = {}
    for n, s in enumerate(songs):
        _progress('songs', n, len(songs))
        a, b = s['start'], s['end']
        loc = loc_at.get(round(a, 2))
        if loc is None:
            warnings.append({'kind': 'locator_missing', 'msg': f'{s["id"]} has no locator at its start ({where(a)}).'})
        ch = _in(clips['chords'], a, b)
        key = next((k for k in (_key_from(c['name']) for c in ch) if k), None)
        # Key changes (from the Chords track), with the bar they start on.
        marks = _key_marks(clips['chords'], a, b, tl)
        key_segments = [{'key': k, 'bar': bar, 'beat': _num(beat - a), 't': round(tl.seconds(a, beat), 2) if beat > a else 0.0}
                        for bar, k, beat in marks]
        label = f'{s["id"]} ({loc_at.get(round(a, 2)) or "?"})'
        if marks and marks[0][0] != 1:
            warnings.append({'kind': 'key_late', 'msg': f'{label}: the first [Key:] marker on the Chords track is at bar {marks[0][0]}, not bar 1.'})
        ref = [(bar, k) for bar, k, _ in marks]
        for lt in lyric_tracks:
            if lt['slug'] not in ('guitar', 'keyboard', 'lyrics'):
                continue
            other = [(bar, k) for bar, k, _ in _key_marks(lt['clips'], a, b, tl)]
            if ref and other != ref:
                fmt = lambda xs: ', '.join(f'{k} @ bar {bar}' for bar, k in xs) or 'none'
                warnings.append({'kind': 'key_mismatch', 'msg': f'{label}: {lt["label"]} track key markers ({fmt(other)}) differ from the Chords track ({fmt(ref)}).'})
        # Guitar tone changes (notes on GUITAR TONE Midi) for the practice page.
        tone = []
        for c in _in(clips['tone'], a, b):
            if c['disabled']:
                continue
            for pos, key, vel, dur in c.get('midi') or []:
                if a - 1e-6 <= pos < b - 1e-6:
                    tone.append({'t': round(tl.seconds(a, pos), 3) if pos > a else 0.0, 'bar': tl.bar_of(pos, a),
                                 'n': key, 'v': vel, 'd': round(tl.seconds(pos, pos + dur), 3)})
        tone.sort(key=lambda e: e['t'])
        # Time-signature changes that land mid-bar cut the bar short.
        bars, short = _bar_starts(tl, a, b)
        for bar_no in short:
            warnings.append({'kind': 'timesig_midbar', 'msg': f'{label}: a time-signature change lands in the middle of bar {bar_no}, so that bar is cut short.'})
        tmap = tl.tempo_map(a, b)
        ev = {
            'sections': len(_in(clips['sections'], a, b)) >= 2,
            'chords': any(re.search(r'\[', re.sub(r'\[Key:\]\s*\[[^\]]*\]', '', c['name'])) for c in ch),
            'lyrics': any(re.sub(r'\[[^\]]*\]', '', c['name']).strip() for c in _in(clips['lyrics'], a, b)),
            'guitar': _custom_notes(_in(clips['guitar'], a, b), ch) >= 1,
            'keyboard': _custom_notes(_in(clips['keyboard'], a, b), ch) >= 1,
            'drums': len(_in(clips['drums'], a, b)) >= 1,
            'tone': len(_in(clips['tone'], a, b)) >= 1,
            'prompts': len(_in(clips['prompts'], a, b)) >= 1,
            'song_cue': len(_in(clips['song_cue'], a, b)) >= 1,
            'backup_que': len(_in(clips['backup_que'], a, b)) >= 1,
        }
        for k in ('mx_bgv', 'mx_music', 'mx_perc', 'mx_sfx'):
            # a stem must cover most of the song; tails of the previous song don't count
            ev[k] = _coverage(clips[k], a, b) >= 0.5
        fp = {k: _fingerprint(clips[k], a, b) for k in clips if k != 'song_id'}
        mism = []
        for pk in ('guitar', 'keyboard'):
            mism += _chord_mismatches(ch, _in(clips[pk], a, b), pk, a, tl)
        odd = [p['bpm'] for p in tmap if p['bpm'] != int(p['bpm'])]
        if odd:
            warnings.append({'kind': 'fractional_bpm', 'msg': f'{s["id"]} ({loc}) uses a non-whole tempo: {", ".join(str(x) for x in odd)} BPM. Check the tempo automation if that is not intended.'})
        out[s['id']] = {
            'locator': loc,
            'start_beat': _num(a), 'end_beat': _num(b),
            'start_bar': tl.bar_of(a, 0),
            'duration_seconds': int(round(tl.seconds(a, b))),
            'tempo_segments': tmap,
            'tempo_start': int(round(tmap[0]['bpm'])),
            'tempo_end': int(round(tmap[-1]['bpm'])) if len(tmap) > 1 else None,
            'tempo_change': 'none' if len(tmap) == 1 else ('ramp' if tmap[0]['transition_to_next'] == 'gradual' else 'jump'),
            'start_key': key,
            'key_segments': key_segments,
            'evidence': ev,
            'fingerprints': fp,
            'chord_mismatches': mism,
            'lyrics': _lyrics_for(lyric_tracks, clips['sections'], a, b, tl),
            'bars': bars,
            'tone': tone,
            'audio_fp': _audio_fingerprints(tracks, a, b),
        }
    return {
        'als_path': os.path.abspath(als_path),
        'als_modified_at': dt.datetime.fromtimestamp(os.path.getmtime(als_path), dt.timezone.utc).isoformat(),
        'als_size': os.path.getsize(als_path),
        'read_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'songs': out,
        'track_colors': _track_colors(tracks),
        'warnings': warnings,
    }


if __name__ == '__main__' and len(sys.argv) == 3 and sys.argv[1] == '--snapshot':
    import json
    _CHILD = True
    sys.stdout.write(json.dumps(_build_snapshot(sys.argv[2])))
