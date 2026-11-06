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


def _clips(track_el):
    """Arrangement clips of a track (not session or freeze clips)."""
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
            out.append({
                'start': float(start.get('Value')),
                'end': float(end.get('Value')),
                'name': _val(c, 'Name', '') or '',
                'disabled': _val(c, 'Disabled', 'false') == 'true',
                'notes': notes,
                'file': (_val(c, 'SampleRef/FileRef/Path', '') or _val(c, 'SampleRef/FileRef/RelativePath', '') or '')
                        if c.tag == 'AudioClip' else '',
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


def read_als(path):
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
                tracks.append({
                    'id': el.get('Id'), 'type': el.tag,
                    'name': _val(el, 'Name/EffectiveName', ''),
                    'group': _val(el, 'TrackGroupId', '-1'),
                    'clips': _clips(el),
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


def build_snapshot(als_path):
    raw = read_als(als_path)
    tl = Timeline(raw['tempo'], raw['timesig'])
    tracks = raw['tracks']
    found = {k: _find_track(tracks, g, p) for k, (g, p) in TRACKS.items()}
    warnings = []
    for k, t in found.items():
        if t is None:
            warnings.append({'kind': 'track_missing', 'msg': f'Track for "{k}" ({TRACKS[k][1]}… in {TRACKS[k][0]}) not found; that check was skipped.'})
    clips = {k: (t['clips'] if t else []) for k, t in found.items()}

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
    for s in songs:
        a, b = s['start'], s['end']
        loc = loc_at.get(round(a, 2))
        if loc is None:
            warnings.append({'kind': 'locator_missing', 'msg': f'{s["id"]} has no locator at its start ({where(a)}).'})
        ch = _in(clips['chords'], a, b)
        key = next((k for k in (_key_from(c['name']) for c in ch) if k), None)
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
            'evidence': ev,
            'fingerprints': fp,
            'chord_mismatches': mism,
        }
    return {
        'als_path': os.path.abspath(als_path),
        'als_modified_at': dt.datetime.fromtimestamp(os.path.getmtime(als_path), dt.timezone.utc).isoformat(),
        'als_size': os.path.getsize(als_path),
        'read_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'songs': out,
        'warnings': warnings,
    }


