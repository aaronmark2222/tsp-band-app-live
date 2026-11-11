"""Bridge request handling, authorization and the lyric conflict guard.

Live is stubbed; requests go through an in-process socket pair, so nothing
listens on a real port and no Ableton set is opened or changed.
"""
import json
import socket
import time
import types
import unittest

from test_lyrics_sync_save import load_tspwork

ORIGIN = 'https://aaronmark2222.github.io'
TOKEN = 'aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc'
OTHER = 'dddddddddddd.eeeeeeeeeeee.ffffffffffff'


class Clip:
    def __init__(self, name, start, end, muted=False):
        self.name, self.start_time, self.end_time, self.muted = name, start, end, muted


class Track:
    def __init__(self, name, clips):
        self.name, self.arrangement_clips, self.group_track = name, clips, None


def make_bridge(module, verdicts=None, open_path=None, tracks=None):
    bridge = object.__new__(module.TSPWork)
    bridge._stop = False
    bridge._servers = []
    bridge._busy = False
    bridge._export = None
    bridge._reading_since = None
    bridge._tls = None
    bridge._review = None
    bridge.calls = []
    bridge.auth_checks = []
    bridge._debug = lambda line: None
    bridge.log_message = lambda *a: None
    song = types.SimpleNamespace(file_path=open_path or module.MAIN_ALS_PATH, tracks=tracks or [])
    bridge.song = lambda: song

    def run_on_main(fn, *args, **kwargs):
        bridge.calls.append(fn.__name__)
        if fn.__name__ in ('_cmd_prepare_lyrics_writeback', '_cmd_apply_lyrics_writeback'):
            return fn(*args)
        return {'ok': True, 'ran': fn.__name__}

    def check(token):
        bridge.auth_checks.append(token)
        return (verdicts or {}).get(token, False)

    bridge._run_on_main = run_on_main
    bridge._check_admin_online = check
    return bridge


def request(bridge, method='POST', path='/jump', body=None, origin=ORIGIN, raw=None, content_length=None):
    a, b = socket.socketpair()
    try:
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else b'')
        head = '%s %s HTTP/1.1\r\nHost: 127.0.0.1\r\n' % (method, path)
        if origin:
            head += 'Origin: %s\r\n' % origin
        head += 'Content-Length: %d\r\n\r\n' % (len(data) if content_length is None else content_length)
        a.sendall(head.encode() + data)
        bridge._handle(b)
        a.settimeout(2)
        out = b''
        while True:
            chunk = a.recv(65536)
            if not chunk:
                break
            out += chunk
    finally:
        a.close()
    status = int(out.split(b' ', 2)[1])
    payload = out.split(b'\r\n\r\n', 1)[1]
    return status, (json.loads(payload) if payload else None), out


class BridgeRequestTests(unittest.TestCase):
    def setUp(self):
        self.m = load_tspwork()

    def test_wrong_or_missing_origin_is_refused_before_anything_runs(self):
        bridge = make_bridge(self.m, {TOKEN: True})
        for origin in ('https://evil.example', 'https://aaronmark2222.github.io.evil.example', None, 'null'):
            status, body, raw = request(bridge, body={'song_id': 'E1', '_auth': TOKEN}, origin=origin)
            self.assertEqual((status, body['error']), (403, 'origin_not_allowed'))
            self.assertNotIn(b'Access-Control-Allow-Origin', raw)
        self.assertEqual(bridge.calls, [])
        self.assertEqual(bridge.auth_checks, [])

    def test_missing_or_malformed_credentials(self):
        bridge = make_bridge(self.m, {TOKEN: True})
        for auth in (None, '', 'not-a-token', 123, 'a.b.c', TOKEN + '"\nheader = x'):
            body = {'song_id': 'E1'}
            if auth is not None:
                body['_auth'] = auth
            status, out, _ = request(bridge, body=body)
            self.assertEqual((status, out['error']), (401, 'auth_required'))
        self.assertEqual(bridge.calls, [])
        self.assertEqual(bridge.auth_checks, [], 'malformed tokens never reach curl')

    def test_non_admin_token_is_refused_on_every_command(self):
        bridge = make_bridge(self.m, {OTHER: False})
        for path, body in (('/jump', {'song_id': 'E1'}), ('/sync-lyrics', {'edits': []}), ('/snapshot', {}),
                           ('/export', {'songs': [{'song_id': 'E1'}]}), ('/transport', {'action': 'toggle'}),
                           ('/export/cancel', {}), ('/select', {'song_id': 'E1', 'task_key': 'lyrics'})):
            status, out, _ = request(bridge, path=path, body=dict(body, _auth=OTHER))
            self.assertEqual((status, out['error']), (401, 'not_admin'), path)
        self.assertEqual(bridge.calls, [])

    def test_admin_token_is_accepted_and_cached(self):
        bridge = make_bridge(self.m, {TOKEN: True})
        for _ in range(3):
            status, out, _ = request(bridge, body={'song_id': 'E1', '_auth': TOKEN})
            self.assertEqual((status, out['ok']), (200, True))
        self.assertEqual(bridge.calls, ['_cmd_jump'] * 3)
        self.assertEqual(len(bridge.auth_checks), 1)

    def test_expired_token_is_refused_after_the_cache_window(self):
        verdicts = {TOKEN: True}
        bridge = make_bridge(self.m, verdicts)
        request(bridge, body={'song_id': 'E1', '_auth': TOKEN})
        verdicts[TOKEN] = False  # Supabase now says the token is no longer valid
        for key in bridge._auth_cache:
            bridge._auth_cache[key] = time.time() - self.m.AUTH_CACHE_SECONDS - 1
        status, out, _ = request(bridge, body={'song_id': 'E1', '_auth': TOKEN})
        self.assertEqual((status, out['error']), (401, 'not_admin'))

    def test_offline_grace_only_for_a_recently_confirmed_token(self):
        verdicts = {TOKEN: None, OTHER: None}
        bridge = make_bridge(self.m, verdicts)
        status, out, _ = request(bridge, body={'song_id': 'E1', '_auth': TOKEN})
        self.assertEqual((status, out['error']), (401, 'auth_unreachable'))
        verdicts[TOKEN] = True
        request(bridge, body={'song_id': 'E1', '_auth': TOKEN})
        verdicts[TOKEN] = None
        for key in bridge._auth_cache:
            bridge._auth_cache[key] = time.time() - 3600  # confirmed an hour ago, now offline
        self.assertEqual(request(bridge, body={'song_id': 'E1', '_auth': TOKEN})[0], 200)
        self.assertEqual(request(bridge, body={'song_id': 'E1', '_auth': OTHER})[1]['error'], 'auth_unreachable')
        for key in bridge._auth_cache:
            bridge._auth_cache[key] = time.time() - self.m.AUTH_OFFLINE_GRACE_SECONDS - 1
        self.assertEqual(request(bridge, body={'song_id': 'E1', '_auth': TOKEN})[1]['error'], 'auth_unreachable')

    def test_malformed_and_oversized_requests(self):
        bridge = make_bridge(self.m, {TOKEN: True})
        self.assertEqual(request(bridge, raw=b'{not json')[1]['error'], 'bad_json')
        self.assertEqual(request(bridge, raw=b'[1,2]')[1]['error'], 'bad_json')
        self.assertEqual(request(bridge, body={'song_id': 'E1'}, content_length=5000)[0], 413)
        self.assertEqual(request(bridge, path='/export', raw=b'', content_length=5 * 1024 * 1024)[0], 413)
        self.assertEqual(request(bridge, body={'song_id': '../../x', '_auth': TOKEN})[1]['error'], 'bad_song_id')
        self.assertEqual(request(bridge, path='/transport', body={'action': 'rm -rf', '_auth': TOKEN})[1]['error'], 'bad_action')
        self.assertEqual(request(bridge, path='/nope', body={'song_id': 'E1', '_auth': TOKEN})[0], 404)
        self.assertEqual(bridge.calls, [])

    def test_status_needs_the_origin_but_reports_how_to_authorize(self):
        bridge = make_bridge(self.m)
        bridge._cmd_status = lambda: {'ok': True, 'auth': 'supabase-admin'}
        bridge._run_on_main = lambda fn, *a, **k: fn(*a)
        self.assertEqual(request(bridge, method='GET', path='/status', origin='https://evil.example')[0], 403)
        self.assertEqual(request(bridge, method='GET', path='/status')[1]['auth'], 'supabase-admin')

    def test_wrong_project_path_is_refused(self):
        bridge = make_bridge(self.m, {TOKEN: True}, open_path='/Users/aaron/Desktop/Some Other Set.als')
        status, out, _ = request(bridge, path='/sync-lyrics', body={'edits': [], '_auth': TOKEN})
        self.assertEqual(out['error'], 'wrong_open_set')
        self.assertEqual(bridge.calls, ['_cmd_prepare_lyrics_writeback'])

    def test_export_uploads_must_point_at_the_r2_bucket(self):
        host = 'https://' + '0123456789abcdef' * 2 + '.r2.cloudflarestorage.com/tsp-practice/songs/E1/'
        good = {'E1': {'Mixdown': {'put': host + 'mixdown.m4a?X-Amz-Signature=abc', 'del': host + 'mixdown.m4a?X-Amz-Signature=d',
                                   'del_old': host + 'mixdown.mp3?X-Amz-Signature=e'}}}
        self.assertTrue(self.m.upload_links_ok(good))
        bad_urls = ['https://evil.example/upload', 'http://' + host[8:] + 'mixdown.m4a?x=1',
                    host.replace('.r2.cloudflarestorage.com', '.r2.cloudflarestorage.com.evil.example') + 'mixdown.m4a?x=1',
                    host.replace('tsp-practice', 'other-bucket') + 'mixdown.m4a?x=1',
                    host.replace('/E1/', '/E2/') + 'mixdown.m4a?x=1', host + '../../x.m4a?x=1', 'file:///etc/passwd',
                    host + 'mixdown.m4a?x=1 -o /tmp/x']
        for url in bad_urls:
            self.assertFalse(self.m.upload_links_ok({'E1': {'Mixdown': {'put': url}}}), url)
        self.assertFalse(self.m.upload_links_ok({'E1': {'Mixdown': {'run': good['E1']['Mixdown']['put']}}}))
        bridge = make_bridge(self.m, {TOKEN: True})
        status, out, _ = request(bridge, path='/export', body={'songs': [{'song_id': 'E1'}], 'uploads': {'E1': {'Mixdown': {'put': bad_urls[0]}}}, '_auth': TOKEN})
        self.assertEqual(out['error'], 'bad_upload_url')
        status, out, _ = request(bridge, path='/export', body={'songs': [{'song_id': 'E1'}], 'export_root': '/etc/tsp', '_auth': TOKEN})
        self.assertEqual(out['error'], 'bad_export_folder')


class LyricConflictGuardTests(unittest.TestCase):
    """The preflight must keep hand edits on clips Practice left alone, and
    refuse (keeping the edit queued) when the very clip Practice changed was
    also changed in Live."""

    def setUp(self):
        self.m = load_tspwork()
        self.m.MAIN_ALS_PATH = __file__  # any existing file stands in for the set

    def bridge(self, clip_names):
        clips = [Clip(name, i * 8.0, i * 8.0 + 8.0) for i, name in enumerate(clip_names)]
        tracks = [Track('SONG ID', [Clip('E1', 0.0, 64.0)]), Track('Guitar +LYRICS', clips)]
        return make_bridge(self.m, {}, open_path=__file__, tracks=tracks), clips

    @staticmethod
    def lines(*texts):
        return [{'t': i * 4.0, 'text': text} for i, text in enumerate(texts)]

    def edit(self, base, desired):
        return [{'song_id': 'E1', 'track_slug': 'guitar', 'base_lines': self.lines(*base), 'lines': self.lines(*desired)}]

    def test_unrelated_hand_edit_is_preserved(self):
        bridge, clips = self.bridge(['one', 'HAND EDIT', 'three'])
        pre = bridge._cmd_prepare_lyrics_writeback(self.edit(['one', 'two', 'three'], ['one', 'two', 'THREE edited']))
        self.assertTrue(pre['ok'], pre)
        self.assertEqual([(clip.name, new) for clip, old, new, s, t in pre['plans']], [('three', 'THREE edited')])
        applied = bridge._cmd_apply_lyrics_writeback(pre['plans'], pre['create_plans'], pre['delete_plans'])
        self.assertTrue(applied['ok'])
        self.assertEqual([c.name for c in clips], ['one', 'HAND EDIT', 'THREE edited'])

    def test_conflict_on_the_edited_clip_is_refused_and_nothing_changes(self):
        bridge, clips = self.bridge(['one', 'two', 'HAND EDIT'])
        pre = bridge._cmd_prepare_lyrics_writeback(self.edit(['one', 'two', 'three'], ['ONE edited', 'two', 'THREE edited']))
        self.assertEqual((pre['ok'], pre['error']), (False, 'source_changed'))
        self.assertEqual((pre['song_id'], pre['track_slug']), ('E1', 'guitar'))
        self.assertEqual([c.name for c in clips], ['one', 'two', 'HAND EDIT'], 'preflight must not change any clip')

    def test_retry_after_apply_is_a_no_op(self):
        bridge, clips = self.bridge(['one', 'two', 'THREE edited'])
        pre = bridge._cmd_prepare_lyrics_writeback(self.edit(['one', 'two', 'three'], ['one', 'two', 'THREE edited']))
        self.assertTrue(pre['ok'])
        self.assertEqual(pre['count'], 0)

    def test_added_or_removed_clip_in_live_is_refused(self):
        bridge, clips = self.bridge(['one', 'two'])
        pre = bridge._cmd_prepare_lyrics_writeback(self.edit(['one', 'two', 'three'], ['one', 'two', 'x']))
        self.assertEqual(pre['error'], 'clip_count_mismatch')


if __name__ == '__main__':
    unittest.main()
