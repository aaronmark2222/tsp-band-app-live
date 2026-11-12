import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0';

// Capture recovery callback state before Supabase Auth consumes and cleans the URL fragment.
const initialAuthCallback = new URLSearchParams(window.location.hash.slice(1));
const initialAuthQuery = new URLSearchParams(window.location.search);
const initialRecoveryError = initialAuthCallback.get('error_description') || initialAuthQuery.get('error_description') || '';
let recoveryCallbackActive = initialAuthCallback.get('type') === 'recovery'
  || initialAuthQuery.get('type') === 'recovery'
  || initialAuthCallback.get('error_code') === 'otp_expired'
  || initialAuthQuery.get('error_code') === 'otp_expired'
  || /invalid.*expired|expired.*invalid/i.test(initialRecoveryError);

const SUPABASE_URL = 'https://hzvfrvjuqvmkeqbrgmqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bXd0ymwEnYNqQCq1EwH2AA_0HajJecU';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
db.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryCallbackActive = true;
    showPasswordRecovery();
  }
});
const $ = (selector) => document.querySelector(selector);
// Task accents use the Ableton colors shown in the user's Live 12 screenshots.
const ABLETON_TASK_COLORS = {
  sections: { index: '', color: '#00FFFF' },
  lyrics: { index: '', color: '#EB4CCE' },
  chords: { index: '', color: '#F7F48D' },
  guitar: { index: '', color: '#E5742E' },
  keyboard: { index: '', color: '#77FB58' },
  drums: { index: '', color: '#EB4A41' },
  guitar_tone_midi: { index: 2, color: '#E5742E' },
  prompts: { index: '', color: '#D36E60' },
  backing_music: { index: 5, color: '#77FB58' },
  backing_vocals_dale: { index: 26, color: '#EB4CCE' },
  backing_vocals_anston: { index: 66, color: '#5E4CA7' },
  backing_percussion: { index: 28, color: '#D36E60' },
  backing_sfx: { index: 27, color: '#D0D0D0' },
  bass_part: { index: 22, color: '#4BA1E8' },
  keyboard_part: { index: 5, color: '#77FB58' },
  guitar_part: { index: 15, color: '#E5742E' },
  violin_part: { index: 24, color: '#836DDD' },
  percussion_part: { index: 56, color: '#A13D38' },
  drums_part: { index: 14, color: '#EB4A41' },
  vox_dale: { index: 11, color: '#CA72DE' },
  vox_anston: { index: 66, color: '#5E4CA7' }
};
// Language accents match the clip colors on the LANGUAGE track in the master ALS.
// Tamil and Malayalam clips are labeled "Other" there, so those use close neutral variants.
const LANGUAGE_COLORS = {
  E: '#31E9FD',   // English — clip color 21
  H: '#FEEE4A',   // Hindi — clip color 17
  K: '#32FD42',   // Konkani — clip color 5
  Kn: '#FDA378',  // Kannada — clip color 29
  T: '#D8D0C4',   // Tamil — inferred from the ALS "Other" gray
  Ml: '#D0D0D0'   // Malayalam — ALS "Other", clip color 27
};
const STATUS_COLORS = {
  Completed: '#A5D17D', Incomplete: '#F27A73', Corrections: '#F6CAAE',
  Finished: '#F6CAAE', Recorded: '#F6CAAE', Draft: '#FBE6A8', Review: '#FBE6A8', No: '#D0D0D0'
};
const BACKING_TRACK_COLORS = { 'Not Finished': '#F27A73', Finished: '#F6CAAE', 'Sent to Mix': '#7FA8D8', Mixed: '#A5D17D' };
const state = { member: null, members: [], songs: [], tasks: [], taskTypes: [], languages: [], languageOptions: [], setlists: [], gigs: [], activeSetlist: null, activeSetlistItems: [], originalSetlistItems: [], setlistOrderDirty: false, originalSetlistName: '', setlistNameDraft: '', view: 'songs', expandedSongIds: new Set(), setlistEditMode: false, dashboardScope: 'gig', dashboardMemberId: null, accessMembers: [], newSetlistSongIds: [] };
let draggedItemId = null;
let savingSetlistOrder = false;
let deletingSetlist = false;
let dashboardRenderRequest = 0;

function showNotice(message, isError = false) {
  const box = $('#notice');
  box.textContent = message;
  box.classList.toggle('error-notice', isError);
  box.classList.remove('hidden');
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => box.classList.add('hidden'), isError ? 12000 : 4200);
}

function fail(message, error) {
  console.error(message, error);
  showNotice(message, true);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function secondsLabel(seconds) {
  if (seconds == null) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function songTypeLabel(song) {
  if (!song) return 'Song';
  return song.is_medley ? 'Medley' : song.type === 'Inst' ? 'Instrumental' : 'Standalone';
}

// The app always opens at the very top (logo and tabs), never where the
// browser last left the page.
try { history.scrollRestoration = 'manual'; } catch { /* ignore */ }
function scrollToTopSoon() {
  window.scrollTo(0, 0);
  setTimeout(() => window.scrollTo(0, 0), 0);
  setTimeout(() => window.scrollTo(0, 0), 350);
}
function showWorkspace() {
  scrollToTopSoon();
  $('#loading').classList.add('hidden');
  $('#login-screen').classList.add('hidden');
  $('#first-login-screen').classList.add('hidden');
  $('#password-recovery-screen').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  // Guests (e.g. Kenneth) only get the Practice page.
  document.body.classList.toggle('guest-mode', isGuest());
  if (isGuest() && state.view !== 'practice') setTimeout(() => setView('practice'), 0);
  $('#member-access-open').classList.toggle('hidden', !state.member.is_admin);
  $('#new-song-open').classList.toggle('hidden', !state.member.is_admin);
  $('#sync-tab').classList.toggle('hidden', !state.member.is_admin);
  loadSyncLogo();
  $('#new-song-open').onclick = openNewSongDialog;
  $('#member-name').textContent = state.member.name;
  $('#member-badge').textContent = state.member.name.slice(0, 1).toUpperCase();
  startSharedAbletonPresence();
  startAbletonBridge();
  activityStart();
  setTimeout(() => { if (typeof ptMediaFlush === 'function') ptMediaFlush(); }, 3000);
  // Wake the member-access function in the background so the dialog opens fast.
  if (state.member.is_admin && navigator.onLine !== false) setTimeout(() => { fetchAccessMembers().catch(() => {}); }, 4000);
}

let accessMembersFetch = null;
async function memberAccessErrorMessage(error) {
  const response = error?.context;
  let body = null;
  if (response && typeof response.clone === 'function') {
    try { body = await response.clone().json(); } catch { /* keep the SDK message */ }
  }
  const detail = body?.error || body?.message || error?.message || '';
  if (response?.status === 401 || /session not found|please sign in again|invalid jwt|valid bearer token/i.test(detail)) {
    return 'Your sign-in session has expired. Sign out, sign back in, and try again.';
  }
  return detail || 'Could not update member access. Please try again.';
}

function fetchAccessMembers(force = false) {
  if (!force && accessMembersFetch && Date.now() - accessMembersFetch.at < 120000) return accessMembersFetch.promise;
  const promise = db.functions.invoke('member-access-admin', { body: { action: 'list_members' } })
    .then(async ({ data, error }) => { if (error) throw new Error(await memberAccessErrorMessage(error)); return data.members || []; });
  accessMembersFetch = { at: Date.now(), promise };
  promise.catch(() => { accessMembersFetch = null; });
  return promise;
}

function showLogin() {
  $('#loading').classList.add('hidden');
  $('#workspace').classList.add('hidden');
  $('#first-login-screen').classList.add('hidden');
  $('#password-recovery-screen').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

function showPasswordRecovery() {
  $('#loading').classList.add('hidden');
  $('#login-screen').classList.add('hidden');
  $('#first-login-screen').classList.add('hidden');
  $('#workspace').classList.add('hidden');
  $('#password-recovery-screen').classList.remove('hidden');
  $('#recovery-error').textContent = '';
}

function showFirstLoginPasswordSetup() {
  $('#loading').classList.add('hidden');
  $('#login-screen').classList.add('hidden');
  $('#workspace').classList.add('hidden');
  $('#password-recovery-screen').classList.add('hidden');
  $('#first-login-screen').classList.remove('hidden');
  $('#password-setup-error').textContent = '';
}

// ---------------------------------------------------------------------------
// Offline: the last loaded data is kept on the device so the app (and the
// Practice page with saved audio) opens without a connection, read-only.
const DATA_CACHE_KEY = 'tsp-data-cache-v1';
const DATA_CACHE = 'tsp-offline-data-v1';
const appOffline = { active: false };
function isNetworkError(error) {
  const msg = String(error?.message || error || '');
  return !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|internet connection|fetch failed|timed out/i.test(msg);
}
function dataCacheGet() { try { return JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null'); } catch { return null; } }
function dataCacheSet(patch) {
  try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ ...(dataCacheGet() || {}), ...patch, at: new Date().toISOString() })); } catch (error) { console.warn('Offline data not saved', error); }
}
async function jsonCacheGet(key) {
  try { const res = await (await caches.open(DATA_CACHE)).match(`https://tsp-offline.local/data/${key}`); return res ? await res.json() : null; } catch { return null; }
}
async function jsonCachePut(key, value) {
  try { await (await caches.open(DATA_CACHE)).put(`https://tsp-offline.local/data/${key}`, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })); } catch { /* ignore */ }
}
function enterOfflineMode() {
  if (appOffline.active) return;
  appOffline.active = true;
  document.body.classList.add('app-offline');
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.textContent = `You're offline — showing what was saved on this device${dataCacheGet()?.at ? ` (${new Date(dataCacheGet().at).toLocaleString()})` : ''}. Changes need a connection.`;
  document.body.prepend(banner);
}
window.addEventListener('online', () => {
  if (!appOffline.active) return;
  const banner = $('#offline-banner');
  if (!banner) return;
  banner.classList.add('online');
  banner.innerHTML = '<span>Back online — reload to get the latest data.</span><button type="button" class="button primary" data-offline-reload>Reload</button>';
  banner.querySelector('[data-offline-reload]')?.addEventListener('click', () => location.reload());
});

async function loadMember(user) {
  const { data, error } = await db.from('members').select('id,name,slug,instrument,is_admin,must_change_password,role').eq('user_id', user.id).maybeSingle();
  if (error) {
    const cached = dataCacheGet();
    if (isNetworkError(error) && cached?.member && cached.user_id === user.id) {
      state.member = cached.member;
      state.dashboardMemberId = cached.member.id;
      enterOfflineMode();
      return;
    }
    throw error;
  }
  if (!data) throw new Error('This account is not linked to a band member. Ask Aaron to check the account setup.');
  // A different person signed in on this device: drop the previous person's saved data first.
  const previous = dataCacheGet();
  if (previous?.user_id && previous.user_id !== user.id) await clearDeviceData({ keepAudio: false });
  state.member = data;
  state.dashboardMemberId = data.id;
  dataCacheSet({ member: data, user_id: user.id });
}

async function loadAllSongTasks() {
  const pageSize = 500;
  const allTasks = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await db.from('song_tasks')
      .select('song_id,task_key,status,updated_at')
      .order('song_id')
      .order('task_key')
      .range(offset, offset + pageSize - 1);
    if (result.error) return result;
    allTasks.push(...result.data);
    if (result.data.length < pageSize) return { data: allTasks, error: null };
  }
}

async function loadData() {
  const [songs, tasks, taskTypes, languages, languageOptions, setlists, gigs, members] = await Promise.all([
    db.from('songs').select('id,name,type,is_medley,keys,key_segments,tempo_start,tempo_end,tempo_change,tempo_segments,duration_seconds,backing_track_manual,sort_order').order('sort_order'),
    loadAllSongTasks(),
    db.from('task_types').select('key,label,category,owner_member_id,allowed_statuses,done_statuses,sort_order').order('sort_order'),
    db.from('song_languages').select('song_id,language_code,position,languages(code,short_label)').order('position'),
    db.from('languages').select('code,name,short_label').order('sort_order'),
    db.from('setlists').select('id,name,description,created_at').order('created_at'),
    db.from('gigs').select('id,name,event_date,start_time,location,setlist_id,notes,completed').order('event_date'),
    db.from('members').select('id,name,is_admin,sort_order,role').order('sort_order')
  ]);
  const failed = [songs, tasks, taskTypes, languages, setlists, gigs, members, languageOptions].find((result) => result.error);
  let loaded;
  if (failed) {
    const cached = dataCacheGet()?.data;
    if (!isNetworkError(failed.error) || !cached) throw failed.error;
    loaded = cached;
    enterOfflineMode();
  } else {
    loaded = { songs: songs.data, tasks: tasks.data, taskTypes: taskTypes.data, languages: languages.data, languageOptions: languageOptions.data, setlists: setlists.data, gigs: gigs.data, members: members.data };
    dataCacheSet({ data: loaded });
  }
  Object.assign(state, { ...loaded, songs: [...loaded.songs].sort(compareSongLibraryOrder) });
  state.members = (state.members || []).filter((member) => member.role !== 'guest'); // guests aren't band members
  $('#song-count').textContent = state.songs.length;
  $('#song-total').textContent = `· ${state.songs.length} tracks`;
  renderSongs();
  renderLanguageFilter();
  renderSetlistOptions();
  renderGigs();
}

function taskOwnerForStatus(type, status) {
  const adminMember = state.members.find((member) => member.is_admin);
  const handedToAdmin = status === 'Recorded'
    || (type.key === 'song_cue' && status === 'Completed')
    || (type.key === 'guitar_tone_midi' && ['Finished', 'Completed'].includes(status));
  return handedToAdmin && adminMember ? adminMember.id : type.owner_member_id;
}

function taskEditable(type, current) {
  return state.member.is_admin || taskOwnerForStatus(type, current) === state.member.id;
}

function statusControl(songId, type, current) {
  const options = type.allowed_statuses.map((status) => {
    const label = status;
    const color = STATUS_COLORS[status] || '#D0D0D0';
    return `<option ${status === current ? 'selected' : ''} value="${escapeHtml(status)}" style="color:${color};background-color:#19231c">${escapeHtml(label)}</option>`;
  }).join('');
  return `<select class="status-select" data-song="${escapeHtml(songId)}" data-task="${escapeHtml(type.key)}" data-status="${escapeHtml(current)}" aria-label="${escapeHtml(type.label)} status for ${escapeHtml(songId)}" ${taskEditable(type, current) ? '' : 'disabled'}>${options}</select>`;
}

function languageColor(code) {
  return LANGUAGE_COLORS[code] || '#D0D0D0';
}

function backingTrackControl(song, readiness) {
  const manual = song.backing_track_manual || '';
  const derived = readiness?.backing_track || '—';
  const choices = [
    `<option value="" ${manual ? '' : 'selected'} style="color:#D0D0D0;background-color:#19231c">${escapeHtml(manual ? 'Auto' : derived)}</option>`,
    `<option value="Sent to Mix" ${manual === 'Sent to Mix' ? 'selected' : ''} style="color:${BACKING_TRACK_COLORS['Sent to Mix']};background-color:#19231c">Sent to Mix</option>`,
    `<option value="Mixed" ${manual === 'Mixed' ? 'selected' : ''} style="color:#A5D17D;background-color:#19231c">Mixed</option>`
  ].join('');
  const current = manual || derived;
  return `<select class="status-select backing-track-select" data-song="${escapeHtml(song.id)}" data-manual="${escapeHtml(manual)}" data-status="${escapeHtml(current)}" aria-label="Backing Track status for ${escapeHtml(song.id)}" ${state.member.is_admin ? '' : 'disabled'}>${choices}</select>`;
}

function labelAutoBackingOption(select, showAuto) {
  const option = select.querySelector('option[value=""]');
  if (!option) return;
  const derived = (state.readiness || []).find((row) => row.song_id === select.dataset.song)?.backing_track || '—';
  const auto = showAuto || select.value !== '';
  option.textContent = auto ? 'Auto' : derived;
  option.style.color = auto ? '#D0D0D0' : (BACKING_TRACK_COLORS[derived] || '#D0D0D0');
}

function songReadinessStatus(songId) {
  const applicable = songWorkItems(songId);
  const readiness = (state.readiness || []).find((row) => row.song_id === songId);
  const ready = !!readiness?.ready;
  const allRequiredWorkDone = applicable.every(isWorkItemDone);
  const hasAbleSetWork = applicable.some((item) => item.category === 'ableset');
  const finishedBacking = !ready && readiness?.backing_track === 'Finished' && allRequiredWorkDone;
  const sentToMixOnly = !ready && readiness?.backing_track === 'Sent to Mix' && hasAbleSetWork && allRequiredWorkDone;
  const label = ready ? 'Ready' : finishedBacking ? 'Finished' : sentToMixOnly ? 'Sent to Mix' : '';
  return { ready, finishedBacking, sentToMixOnly, label };
}

function songProgress(songId, songName) {
  const applicable = songWorkItems(songId);
  const mine = applicable.filter((item) => item.owner_member_id === state.member.id);
  const myDone = mine.filter(isWorkItemDone).length;
  const bandDone = applicable.filter(isWorkItemDone).length;
  const myRemaining = mine.length - myDone;
  const bandRemaining = applicable.length - bandDone;
  const personalPercent = mine.length ? Math.round((myDone / mine.length) * 100) : 100;
  const bandPercent = applicable.length ? Math.round((bandDone / applicable.length) * 100) : 100;
  const readiness = (state.readiness || []).find((row) => row.song_id === songId);
  const hasAbleSetWork = applicable.some((item) => item.category === 'ableset');
  const allRequiredWorkDone = applicable.every(isWorkItemDone);
  const ready = !!readiness?.ready;
  const finishedBacking = !ready && readiness?.backing_track === 'Finished' && allRequiredWorkDone;
  const sentToMixOnly = !ready && readiness?.backing_track === 'Sent to Mix' && hasAbleSetWork && allRequiredWorkDone;
  if (ready) return '<span class="song-status-indicator" data-status="Ready">Ready</span>';
  if (finishedBacking) return '<span class="song-status-indicator" data-status="Finished">Finished</span>';
  if (sentToMixOnly) return '<span class="song-status-indicator" data-status="Sent to Mix">Sent to Mix</span>';
  const label = `Status: In progress. Work remaining for ${songName}: You have ${mine.length ? `${myRemaining} of ${mine.length} tasks left` : 'no assigned tasks'}; the band has ${applicable.length ? `${bandRemaining} of ${applicable.length} tasks left` : 'no tasks'}.`;
  return `<span class="song-progress-lines" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span class="song-progress-line song-progress-line-band" style="--progress:${bandPercent}%"></span><span class="song-progress-line song-progress-line-personal" style="--progress:${personalPercent}%"></span></span>`;
}
function songPhraseInitials(phrase, phraseIndex) {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  const base = words.map((word) => Array.from(word)[0].toUpperCase()).join('');
  const peers = [...new Set(state.songs.flatMap((song) => String(song.name).split('/').map((part, index) => index === phraseIndex ? part.trim() : null).filter(Boolean))
    .filter((part) => part.split(/\s+/).filter(Boolean).map((word) => Array.from(word)[0].toUpperCase()).join('') === base))];
  if (peers.length < 2) return base;
  const peerWords = peers.map((part) => part.split(/\s+/).filter(Boolean));
  let distinction = null;
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const tokens = peerWords.map((parts) => parts[wordIndex]);
    if (tokens.some((token) => !token) || new Set(tokens.map((token) => token.toLocaleLowerCase())).size !== tokens.length) continue;
    const lengths = tokens.map((token, index) => {
      for (let length = 1; length <= token.length; length += 1) {
        const prefix = token.slice(0, length).toLocaleLowerCase();
        if (tokens.every((other, otherIndex) => otherIndex === index || !other.toLocaleLowerCase().startsWith(prefix))) return length;
      }
      return token.length;
    });
    const score = lengths.reduce((sum, length) => sum + length, 0) + (wordIndex === 0 ? 1 : 0);
    if (!distinction || score < distinction.score) distinction = { wordIndex, lengths, score, tokens };
  }
  if (!distinction) return base;
  return words.map((word, index) => {
    if (index !== distinction.wordIndex) return Array.from(word)[0].toUpperCase();
    const prefix = word.slice(0, distinction.lengths[peers.indexOf(phrase.trim())] || 1);
    return /^[A-Z0-9]+$/.test(word) ? prefix.toUpperCase() : prefix[0].toUpperCase() + prefix.slice(1).toLocaleLowerCase();
  }).join('');
}

function songTitleMarkup(name, className) {
  const initials = String(name).split('/').map((phrase, index) => songPhraseInitials(phrase, index)).join(' / ');
  return `<span class="${className} song-title-container"><span class="song-title-full" data-title-full>${escapeHtml(name)}</span><span class="song-title-initials" aria-hidden="true">${escapeHtml(initials)}</span></span>`;
}

function updateSongTitleAbbreviations() {
  document.querySelectorAll('.song-summary-toggle').forEach((button) => {
    const fullTitle = button.querySelector('[data-title-full]');
    if (!fullTitle) return;
    // Full song names everywhere: long names wrap instead of turning into initials.
    button.classList.remove('song-title-abbreviated');
  });
}

let songTitleResizeObserver = null;
function observeSongTitleAbbreviations() {
  if (!window.ResizeObserver) return;
  if (!songTitleResizeObserver) songTitleResizeObserver = new ResizeObserver(() => requestAnimationFrame(updateSongTitleAbbreviations));
  songTitleResizeObserver.disconnect();
  document.querySelectorAll('.song-summary-toggle').forEach((button) => songTitleResizeObserver.observe(button));
}
window.addEventListener('resize', () => requestAnimationFrame(updateSongTitleAbbreviations));
if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(updateSongTitleAbbreviations));
function remainingWork(songId, memberOnly = false) {
  const open = songWorkItems(songId).filter((item) => !isWorkItemDone(item));
  return memberOnly ? open.filter((item) => item.owner_member_id === state.member.id).length : open.length;
}

function songWorkItems(songId, includeParts = false) {
  const songTasks = new Map(state.tasks.filter((task) => task.song_id === songId).map((task) => [task.task_key, task]));
  return state.taskTypes
    .filter((type) => includeParts || type.category !== 'part')
    .map((type) => {
      const status = songTasks.get(type.key)?.status || 'Incomplete';
      return { type, status, owner_member_id: taskOwnerForStatus(type, status), category: type.category };
    })
    .filter((item) => item.status !== 'No');
}

function isWorkItemDone(item) {
  return item.status !== 'Corrections' && item.type.done_statuses.includes(item.status);
}

function updateFilterButton(buttonId, count) {
  $(`#${buttonId}`).textContent = count ? `Filters (${count})` : 'Filters';
}

function toggleFilterPanel(buttonId, panelId) {
  const panel = $(`#${panelId}`);
  const expanded = panel.classList.toggle('hidden') === false;
  $(`#${buttonId}`).setAttribute('aria-expanded', String(expanded));
}

function renderSongDetails(songId, context = 'songs') {
  const song = state.songs.find((item) => item.id === songId);
  const languages = state.languages.filter((row) => row.song_id === songId).map((row) => `<span class="language-chip" style="--language-color:${languageColor(row.language_code)}">${escapeHtml(row.languages?.short_label || row.language_code)}</span>`).join('');
  const scales = Array.isArray(song?.keys) && song.keys.length ? song.keys.join(', ') : 'Not set';
  const songTasks = new Map(state.tasks.filter((task) => task.song_id === songId).map((task) => [task.task_key, task]));
  const readiness = (state.readiness || []).find((row) => row.song_id === songId);
  const groups = [
    ['ableset', 'AbleSet'],
    ['utility', 'Utility'],
    ['backing', 'Backing tracks & vocals'],
    ['part', 'Band parts · Optional']
  ];
  const songEditButton = state.member?.is_admin
    ? `<button type="button" class="song-edit-button" data-song-edit="${escapeHtml(songId)}">Edit</button>`
    : '';
  return `<div class="song-detail-metadata"><span>${songTypeLabel(song)}</span><span class="language-chips">${languages || '<span>No language set</span>'}</span><span>${secondsLabel(song?.duration_seconds)}</span>${songTempoMarkup(song)}<span class="song-scale-info">Scale(s): ${escapeHtml(scales)}</span>${songEditButton}</div><div class="song-details-overview"><span>Backing Track</span>${backingTrackControl(song, readiness)}</div><div class="task-groups">${groups.map(([category, label]) => {
    const types = state.taskTypes.filter((type) => type.category === category);
    if (!types.length) return '';
    return `<section class="task-group"><h3>${label}</h3><div class="task-grid">${types.map((type) => {
      const row = songTasks.get(type.key);
      const status = row?.status || 'Incomplete';
      const ownerMemberId = taskOwnerForStatus(type, status);
      const unfinished = status !== 'No' && (status === 'Corrections' || !type.done_statuses.includes(status));
      const personalTask = type.category !== 'part' && ownerMemberId === state.member.id && unfinished;
      const trackColor = ABLETON_TASK_COLORS[type.key] || { index: '', color: '#a9a9a9' };
      return `<label class="task-detail ${personalTask ? 'task-detail-personal' : ''}" style="--task-color:${trackColor.color}" data-ableton-color-index="${trackColor.index}"><span class="task-label"><i aria-hidden="true"></i>${escapeHtml(type.label)}</span>${statusControl(songId, type, status)}</label>`;
    }).join('')}</div></section>`;
  }).join('')}</div>`;
}

async function toggleSongDetails(songId, view) {
  if (view === 'setlists' && state.setlistEditMode) return;
  const alreadyExpanded = state.expandedSongIds.has(songId);
  state.expandedSongIds.clear();
  if (!alreadyExpanded) state.expandedSongIds.add(songId);
  if (view === 'setlists') await renderActiveSetlist();
  else renderSongs();
  requestAnimationFrame(() => {
    const target = view === 'setlists'
      ? [...document.querySelectorAll('.setlist-song-toggle')].find((button) => button.dataset.songId === songId)?.closest('.setlist-row')
      : document.querySelector(`#song-detail-${CSS.escape(songId)}`)?.previousElementSibling;
    if (target && !alreadyExpanded) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function songSummaryLeadMarkup(songId) {
  return '<span class="song-id-cue" aria-hidden="true"><span class="song-disclosure"></span><span class="song-id">' + escapeHtml(songId) + '</span></span>';
}

function renderSongs() {
  const head = $('#songs-head');
  const body = $('#songs-body');
  head.innerHTML = '<tr><th><span class="song-head-row">SONG<span class="progress-legend" title="Work done on each song"><i class="band"></i>Band <i class="you"></i>Your work</span></span></th></tr>';
  const term = $('#song-search').value.trim().toLowerCase();
  const language = $('#language-filter').value;
  const performance = $('#performance-filter').value;
  const key = $('#key-filter').value;
  const sort = $('#song-sort').value;
  const readiness = new Map((state.readiness || []).map((row) => [row.song_id, row]));
  const filtered = state.songs.filter((song) => {
    const songLanguages = state.languages.filter((row) => row.song_id === song.id).map((row) => row.language_code);
    const words = `${song.id} ${song.name} ${(song.keys || []).join(' ')} ${songLanguages.join(' ')} ${songTypeLabel(song)}`.toLowerCase();
    return (!term || words.includes(term))
      && (!language || songLanguages.includes(language))
      && (!performance || (performance === 'medley' ? song.is_medley : !song.is_medley))
      && (!key || (song.keys || []).includes(key));
  });
  const sorted = [...filtered].sort((a, b) => {
    const original = compareSongLibraryOrder(a, b);
    switch (sort) {
      case 'name-asc': return a.name.localeCompare(b.name) || original;
      case 'name-desc': return b.name.localeCompare(a.name) || original;
      case 'performance': return Number(a.is_medley) - Number(b.is_medley) || original;
      case 'key': return (a.keys || [])[0]?.localeCompare((b.keys || [])[0] || '') || original;
      case 'duration-asc': return (a.duration_seconds ?? Number.MAX_SAFE_INTEGER) - (b.duration_seconds ?? Number.MAX_SAFE_INTEGER) || original;
      case 'duration-desc': return (b.duration_seconds ?? -1) - (a.duration_seconds ?? -1) || original;
      case 'remaining-desc': return remainingWork(b.id) - remainingWork(a.id) || original;
      case 'remaining-asc': return remainingWork(a.id) - remainingWork(b.id) || original;
      case 'ready': return Number(!!readiness.get(b.id)?.ready) - Number(!!readiness.get(a.id)?.ready) || original;
      default: return original;
    }
  });
  const anyFilter = !!(term || language || performance || key);
  updateFilterButton('song-filters-toggle', [language, performance, key].filter(Boolean).length);
  $('#clear-song-filters').classList.toggle('hidden', !anyFilter);
  body.innerHTML = sorted.map((song) => {
    const expanded = state.expandedSongIds.has(song.id);
    const detailId = `song-detail-${song.id}`;
    return `<tr class="song-overview"><td><div class="song-entry"><button type="button" class="song-summary-toggle ${expanded ? 'song-expanded' : ''}" data-song-id="${escapeHtml(song.id)}" data-view="songs" aria-expanded="${expanded}" aria-controls="${detailId}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeHtml(song.id)} ${escapeHtml(song.name)}">${songTitleMarkup(song.name, 'song-name')}</button><div class="song-entry-footer"><span class="song-entry-id">${escapeHtml(song.id)}</span><span class="song-progress">${songProgress(song.id, song.name)}</span></div></div></td></tr><tr id="${detailId}" class="song-detail-row ${expanded ? '' : 'hidden'}"><td colspan="1">${renderSongDetails(song.id)}</td></tr>`;
  }).join('');
  if (!sorted.length) body.innerHTML = '<tr><td colspan="1" class="empty-state">No songs match these filters.</td></tr>';
  requestAnimationFrame(() => { updateSongTitleAbbreviations(); observeSongTitleAbbreviations(); });
}

function renderLanguageFilter() {
  const options = [...new Map(state.languages.map((row) => [row.language_code, row.languages])).entries()]
    .filter(([, language]) => language).map(([code, language]) => `<option value="${escapeHtml(code)}" style="color:${languageColor(code)};background-color:#111a15">${escapeHtml(language.short_label)}</option>`).join('');
  $('#language-filter').innerHTML = `<option value="">All languages</option>${options}`;
  $('#setlist-language-filter').innerHTML = `<option value="">All languages</option>${options}`;
  const used = new Set(state.songs.flatMap((song) => song.keys || []));
  const keys = KEY_CHOICES.filter((key) => used.has(key));
  $('#key-filter').innerHTML = `<option value="">Any key / scale</option>${keys.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('')}`;
  $('#setlist-key-filter').innerHTML = `<option value="">Any key / scale</option>${keys.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('')}`;
}

async function loadReadiness() {
  const { data, error } = await db.from('song_readiness').select('song_id,backing_track,ready');
  if (error) {
    const cached = dataCacheGet()?.readiness;
    if (!isNetworkError(error) || !cached) throw error;
    state.readiness = cached;
    enterOfflineMode();
    return;
  }
  state.readiness = data;
  dataCacheSet({ readiness: data });
}

async function loadSetlistItems(setlistId) {
  if (!setlistId) return [];
  const { data, error } = await db.from('setlist_items').select('id,setlist_id,position,item_type,song_id,label,note,break_seconds,songs(id,name,type,is_medley,keys,duration_seconds)').eq('setlist_id', setlistId).order('position');
  if (error) throw error;
  return data;
}

function setlistFilterValues() {
  const term = $('#setlist-search').value.trim().toLowerCase();
  const language = $('#setlist-language-filter').value;
  const performance = $('#setlist-performance-filter').value;
  const key = $('#setlist-key-filter').value;
  return { term, language, performance, key, active: !!(term || language || performance || key) };
}

function setlistItemMatches(item, filters) {
  if (item.item_type !== 'song') return !filters.active;
  const song = item.songs || state.songs.find((row) => row.id === item.song_id);
  if (!song) return false;
  const languages = state.languages.filter((row) => row.song_id === item.song_id).map((row) => row.language_code);
  const words = `${item.song_id} ${song.name} ${(song.keys || []).join(' ')} ${languages.join(' ')} ${songTypeLabel(song)}`.toLowerCase();
  return (!filters.term || words.includes(filters.term))
    && (!filters.language || languages.includes(filters.language))
    && (!filters.performance || (filters.performance === 'medley' ? song.is_medley : !song.is_medley))
    && (!filters.key || (song.keys || []).includes(filters.key));
}

function renderSetlistItems(items, canEditSetlist) {
  const filters = setlistFilterValues();
  const matches = items.filter((item) => setlistItemMatches(item, filters));
  $('#setlist-filter-toolbar').classList.toggle('hidden', !state.activeSetlist || !items.length);
  updateFilterButton('setlist-filters-toggle', [filters.language, filters.performance, filters.key].filter(Boolean).length);
  $('#clear-setlist-filters').classList.toggle('hidden', !filters.active);
  $('#setlist-filter-hint').classList.toggle('hidden', !canEditSetlist || !filters.active);
  const includedSongIds = new Set(items.filter((item) => item.item_type === 'song').map((item) => item.song_id));
  const repertoireRows = canEditSetlist
    ? state.songs.filter((song) => !includedSongIds.has(song.id)).map((song) =>
      `<li class="setlist-repertoire-row"><span class="setlist-repertoire-id">${escapeHtml(song.id)}</span><span class="setlist-repertoire-name">${escapeHtml(song.name)}</span><button class="add-repertoire-song" type="button" data-song-id="${escapeHtml(song.id)}" aria-label="Add ${escapeHtml(song.id)} · ${escapeHtml(song.name)} to setlist" title="Add to setlist">+</button></li>`
    ).join('')
    : '';
  $('#setlist-items').innerHTML = items.map((item, index) => {
    const isSong = item.item_type === 'song';
    const title = isSong ? item.songs?.name || item.song_id : item.label || (item.item_type === 'break' ? 'Break' : 'Note');
    const detail = isSong ? item.song_id : item.item_type === 'break' ? `${item.note || 'Set break'}${item.break_seconds ? ` · ${secondsLabel(item.break_seconds)}` : ''}` : item.note || 'Setlist note';
    const duration = isSong ? item.songs?.duration_seconds : item.item_type === 'break' ? item.break_seconds : null;
    const expanded = !canEditSetlist && state.expandedSongIds.has(item.song_id);
    const canDrag = canEditSetlist && !filters.active;
    const summary = isSong
      ? canEditSetlist
        ? `<div class="setlist-song-edit-summary"><span class="song-id">${escapeHtml(item.song_id)}</span>${songTitleMarkup(title, 'item-title song-title')}</div>`
        : `<button type="button" class="song-summary-toggle setlist-song-toggle ${expanded ? 'song-expanded' : ''}" data-song-id="${escapeHtml(item.song_id)}" data-view="setlists" aria-expanded="${expanded}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeHtml(item.song_id)} ${escapeHtml(title)}">${songTitleMarkup(title, 'item-title song-title')}<span class="song-entry-footer"><span class="song-entry-id">${escapeHtml(item.song_id)}</span><span class="song-progress">${songProgress(item.song_id, title)}</span></span></button>`
      : `<div><div class="item-title">${escapeHtml(title)}</div><div class="item-detail">${escapeHtml(detail)}</div></div>`;
    const controls = canEditSetlist ? `<div class="item-controls">${canDrag ? `<button class="drag-handle" type="button" data-id="${item.id}" aria-label="Drag ${escapeHtml(title)} to reorder" title="Drag to reorder">⠿</button>` : ''}<button class="icon-button remove-item" data-id="${item.id}" title="Remove item" aria-label="Remove ${escapeHtml(title)}" >×</button></div>` : '';
    const details = isSong && expanded ? `<div class="setlist-song-details">${renderSongDetails(item.song_id, 'setlists')}</div>` : '';
    const rowClass = `${setlistItemMatches(item, filters) ? 'setlist-row' : 'setlist-row hidden'}${canEditSetlist ? ' editing' : ''}`;
    return `<li class="${rowClass}" data-id="${item.id}" ${canDrag ? 'draggable="true"' : ''}><div class="setlist-item-summary">${summary}</div><span class="position">${String(index + 1).padStart(2, '0')}</span><div class="item-actions">${!isSong ? `<span class="duration">${secondsLabel(duration)}</span>` : ''}${controls}</div>${details}</li>`;
  }).join('') + repertoireRows;
  requestAnimationFrame(() => { updateSongTitleAbbreviations(); observeSongTitleAbbreviations(); });
  $('#setlist-items').classList.toggle('hidden', !items.length && !repertoireRows);
  $('#setlist-empty').classList.toggle('hidden', !!items.length || !!repertoireRows);
  $('#setlist-filter-empty').classList.toggle('hidden', !items.length || !!matches.length);
}
function renderSetlistOptions() {
  const select = $('#setlist-select');
  // First visit: open the setlist of the next gig rather than the first one made.
  const current = state.activeSetlist || nextDashboardGig()?.setlist_id || select.value;
  select.innerHTML = state.setlists.map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join('');
  if (!state.setlists.length) {
    select.innerHTML = '<option value="">No setlists yet</option>';
    state.activeSetlist = null;
    renderActiveSetlist();
    return;
  }
  const selected = state.setlists.find((list) => list.id === current) || state.setlists[0];
  state.activeSetlist = selected.id;
  select.value = selected.id;
  renderActiveSetlist();
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function gigCard(gig, canEdit) {
  const setlist = state.setlists.find((item) => item.id === gig.setlist_id);
  const date = new Date(`${gig.event_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' });
  const details = [date, gig.start_time?.slice(0, 5), gig.location].filter(Boolean).join(' · ');
  const past = gig.event_date < localDateString();
  const daysAway = Math.round((new Date(`${gig.event_date}T12:00:00`) - new Date(`${localDateString()}T12:00:00`)) / 86400000);
  const countdown = gig.completed || daysAway < 0 ? '' : daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `In ${daysAway} days`;
  const completeButton = canEdit && past && !gig.completed
    ? `<button type="button" class="button quiet" data-complete-gig="${escapeHtml(gig.id)}">Mark as Complete</button>`
    : '';
  const editButton = canEdit ? `<button type="button" class="button quiet" data-edit-gig="${escapeHtml(gig.id)}">Edit gig</button>` : '';
  return `<article class="gig-list-card ${gig.completed ? 'is-completed' : ''}"><div class="gig-list-card-main"><div><h2>${escapeHtml(gig.name)}${countdown ? ` <span class="gig-countdown">${countdown}</span>` : ''}</h2><p>${escapeHtml(details)}</p></div><div class="gig-list-card-actions">${completeButton}${editButton}</div></div>${gig.notes ? `<p class="gig-list-notes">${escapeHtml(gig.notes)}</p>` : ''}<div class="gig-setlist-link"><span>Setlist</span>${setlist ? `<button type="button" class="text-button" data-open-gig-setlist="${escapeHtml(setlist.id)}">${escapeHtml(setlist.name)} →</button>` : '<em>No setlist attached</em>'}</div></article>`;
}

function renderGigs() {
  const canEdit = !!state.member?.is_admin;
  $('#new-gig').classList.toggle('hidden', !canEdit);
  const active = state.gigs.filter((gig) => !gig.completed)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.name.localeCompare(b.name));
  const completed = state.gigs.filter((gig) => gig.completed)
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || a.name.localeCompare(b.name));
  const activeCards = active.map((gig) => gigCard(gig, canEdit)).join('') || '<div class="empty-state">No active gigs.</div>';
  const completedCards = completed.map((gig) => gigCard(gig, canEdit)).join('') || '<div class="empty-state">No completed gigs yet.</div>';
  $('#gig-list').innerHTML = `<section class="gig-section"><h2>Gigs</h2><div class="gig-list">${activeCards}</div></section><section class="gig-section completed-gigs"><h2>Completed Gigs</h2><div class="gig-list">${completedCards}</div></section>`;
}
function openGigForm(gig = null) {
  const form = $('#gig-form');
  form.reset();
  $('#gig-id').value = gig?.id || '';
  $('#gig-name').value = gig?.name || '';
  $('#gig-date').value = gig?.event_date || '';
  $('#gig-time').value = gig?.start_time?.slice(0, 5) || '';
  $('#gig-location').value = gig?.location || '';
  $('#gig-notes').value = gig?.notes || '';
  $('#gig-setlist').innerHTML = state.setlists.map((setlist) => `<option value="${escapeHtml(setlist.id)}">${escapeHtml(setlist.name)}</option>`).join('');
  if (gig?.setlist_id) $('#gig-setlist').value = gig.setlist_id;
  $('#gig-setlist-field').classList.toggle('hidden', !gig);
  $('#gig-setlist').required = !!gig;
  $('#gig-auto-setlist-note').classList.toggle('hidden', !!gig);
  $('#delete-gig').classList.toggle('hidden', !gig || !state.member?.is_admin);
  $('#gig-form').classList.remove('hidden');
  $('#gig-name').focus();
}

async function renderActiveSetlist() {
  const setlist = state.setlists.find((item) => item.id === state.activeSetlist);
  $('#active-setlist-name').textContent = setlist?.name || 'Choose a setlist';
  const canEditSetlist = state.member.is_admin && state.setlistEditMode;
  $('#active-setlist-name').classList.toggle('hidden', canEditSetlist);
  const nameInput = $('#setlist-name-input');
  nameInput.classList.toggle('hidden', !canEditSetlist);
  if (document.activeElement !== nameInput) nameInput.value = state.setlistNameDraft || setlist?.name || '';
  $('#setlist-edit-toggle').classList.toggle('hidden', !state.member.is_admin);
  $('#setlist-edit-toggle').textContent = state.setlistEditMode ? (hasSetlistChanges() ? 'Save' : 'Done editing') : 'Edit setlist';
  $('#setlist-edit-toggle').disabled = savingSetlistOrder;
  $('#discard-setlist-order').classList.toggle('hidden', !canEditSetlist || !hasSetlistChanges());
  $('#setlist-delete-controls').classList.toggle('hidden', !canEditSetlist || !setlist || deletingSetlist);
  $('#delete-setlist').disabled = deletingSetlist;
  $('#setlist-edit-toggle').setAttribute('aria-pressed', String(state.setlistEditMode));
  $('#new-setlist').classList.toggle('hidden', !state.member.is_admin);
  $('#new-setlist').disabled = !state.member.is_admin;
  if (!setlist) {
    state.activeSetlistItems = [];
    $('#setlist-items').innerHTML = '';
    $('#setlist-filter-toolbar').classList.add('hidden');
    $('#setlist-filter-empty').classList.add('hidden');
    $('#setlist-empty').classList.remove('hidden');
    $('#setlist-summary').textContent = 'Create your first setlist.';
    return;
  }
  try {
    const [items, summary] = await Promise.all([
      loadSetlistItems(setlist.id),
      db.from('setlist_summary').select('song_count,total_seconds').eq('setlist_id', setlist.id).maybeSingle()
    ]);
    if (summary.error) throw summary.error;
    const total = summary.data?.total_seconds ?? 0;
    $('#setlist-summary').textContent = `${summary.data?.song_count || 0} songs · ${secondsLabel(total)} running time`;
    // Staged (unsaved) edits survive switching tabs and coming back.
    const keepStaged = canEditSetlist && state.setlistOrderDirty;
    if (!keepStaged) state.activeSetlistItems = items;
    if (canEditSetlist && !state.setlistOrderDirty) state.originalSetlistItems = [...items];
    renderSetlistItems(state.activeSetlistItems, canEditSetlist);
  } catch (error) { fail('Could not load this setlist.', error); }
}

function nextDashboardGig() {
  const activeGigs = state.gigs.filter((gig) => !gig.completed);
  const today = localDateString();
  const upcoming = activeGigs.filter((gig) => gig.event_date >= today && gig.setlist_id).sort((a, b) => a.event_date.localeCompare(b.event_date));
  return upcoming[0] || [...activeGigs].sort((a, b) => b.event_date.localeCompare(a.event_date))[0] || null;
}

function renderDashboardTabs() {
  const upcomingGig = nextDashboardGig();
  if (state.dashboardScope === 'gig') state.dashboardScope = upcomingGig ? `gig:${upcomingGig.id}` : 'total';
  const activeGigs = state.gigs.filter((gig) => !gig.completed);
  const availableScopes = new Set(activeGigs.map((gig) => `gig:${gig.id}`).concat('total'));
  if (!availableScopes.has(state.dashboardScope)) state.dashboardScope = upcomingGig ? `gig:${upcomingGig.id}` : 'total';
  const gigs = activeGigs.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.name.localeCompare(b.name));
  const tabs = gigs.map((gig) => {
    const date = new Date(`${gig.event_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const label = upcomingGig?.id === gig.id ? `Upcoming · ${date}` : date;
    const scope = `gig:${gig.id}`;
    return `<button class="dashboard-tab ${scope === state.dashboardScope ? 'active' : ''}" type="button" role="tab" aria-selected="${scope === state.dashboardScope}" data-dashboard-scope="${escapeHtml(scope)}"><span>${escapeHtml(gig.name)}</span><small>${escapeHtml(label)}</small></button>`;
  }).join('');
  const totalActive = state.dashboardScope === 'total';
  $('#dashboard-tabs').innerHTML = `${tabs}<button class="dashboard-tab ${totalActive ? 'active' : ''}" type="button" role="tab" aria-selected="${totalActive}" data-dashboard-scope="total"><span>Total Setlist</span><small>Entire repertoire</small></button>`;
}

function renderDashboardTaskGroups(items, song, viewedMemberId) {
  if (!items.length) return '<p class="dashboard-all-done">All required work is complete.</p>';
  const groups = new Map();
  for (const item of items) {
    const key = item.owner_member_id || 'unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => Number(b === viewedMemberId) - Number(a === viewedMemberId)).map(([ownerId, ownerItems]) => {
    const owner = ownerId === 'unassigned' ? null : state.members.find((member) => member.id === ownerId);
    const isViewedMember = owner?.id === viewedMemberId;
    return `<section class="dashboard-owner ${isViewedMember ? 'mine' : ''}"><h4>${escapeHtml(owner?.name || 'Unassigned')}</h4><div class="dashboard-owner-tasks">${ownerItems.map((item) => `<div class="dashboard-task-row"><span>${escapeHtml(item.type.label)}</span>${statusControl(song.id, item.type, item.status)}</div>`).join('')}</div></section>`;
  }).join('');
}

function dashboardWorkCategory(item) {
  if (['prompts', 'song_cue', 'backup_que'].includes(item.type.key)) return 'playback';
  if (item.category === 'ableset') return 'ableset';
  if (item.status === 'Recorded') return 'other';
  if (item.category === 'backing') return 'backing';
  return 'other';
}

function renderDashboardWorkWidget(title, category, items) {
  const bySong = new Map();
  for (const item of items) {
    if (!bySong.has(item.song.id)) bySong.set(item.song.id, { song: item.song, items: [] });
    bySong.get(item.song.id).items.push(item);
  }
  const content = items.length ? [...bySong.values()].map(({ song, items: songItems }) => `<section class="dashboard-member-song-group"><button type="button" class="dashboard-open-song" data-song-id="${escapeHtml(song.id)}" title="Open ${escapeHtml(song.name)} in Songs"><span class="song-id">${escapeHtml(song.id)}</span><strong class="song-title">${escapeHtml(song.name)}</strong></button><div class="dashboard-member-task-list">${songItems.map((item) => `<div class="dashboard-member-task-row"><span>${escapeHtml(item.type.label)}</span>${statusControl(item.song.id, item.type, item.status)}</div>`).join('')}</div></section>`).join('') : '<p class="dashboard-widget-empty">Nothing remaining here.</p>';
  return `<section class="dashboard-work-widget dashboard-work-widget-${category}"><header><h2>${title}</h2><span>${items.length} ${items.length === 1 ? 'task' : 'tasks'}</span></header><div class="dashboard-member-work-list">${content}</div></section>`;
}

function renderDashboardSong(song, viewedMemberId) {
  const required = songWorkItems(song.id).filter((item) => !isWorkItemDone(item));
  const optionalParts = songWorkItems(song.id, true).filter((item) => item.category === 'part' && !isWorkItemDone(item));
  const readiness = (state.readiness || []).find((row) => row.song_id === song.id);
  const ready = !!readiness?.ready;
  const waitingForMix = song.backing_track_manual === 'Sent to Mix';
  const readinessLabel = ready ? 'Ready' : waitingForMix && !required.length ? 'Waiting on mix' : `${required.length} required ${required.length === 1 ? 'task' : 'tasks'} left`;
  const workLabel = required.length ? `${required.length} remaining` : waitingForMix ? 'Waiting on mix' : 'Complete';
  return `<article class="dashboard-song-card"><div class="dashboard-song-heading"><div class="dashboard-song-name"><button type="button" class="dashboard-open-song" data-song-id="${escapeHtml(song.id)}" title="Open ${escapeHtml(song.name)} in Songs"><span class="song-id">${escapeHtml(song.id)}</span><strong class="song-title">${escapeHtml(song.name)}</strong></button><span class="dashboard-song-type">${songTypeLabel(song)}</span></div><div class="dashboard-song-state"><span class="dashboard-ready ${ready ? 'is-ready' : ''}">${readinessLabel}</span><label class="dashboard-backing"><span>Backing Track</span>${backingTrackControl(song, readiness)}</label></div></div><div class="dashboard-work"><div class="dashboard-work-heading"><h3>Required work</h3><span>${workLabel}</span></div>${renderDashboardTaskGroups(required, song, viewedMemberId)}</div>${optionalParts.length ? `<details class="dashboard-optional"><summary>Optional Parts <span>${optionalParts.length} remaining</span></summary>${renderDashboardTaskGroups(optionalParts, song, viewedMemberId)}</details>` : '<div class="dashboard-optional complete">Optional Parts · all complete</div>'}</article>`;
}

async function renderDashboard() {
  const requestId = ++dashboardRenderRequest;
  const memberSelect = $('#dashboard-member-select');
  const membersMarkup = state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}${member.id === state.member.id ? ' (You)' : ''}</option>`).join('');
  if (memberSelect.dataset.members !== membersMarkup) {
    memberSelect.innerHTML = membersMarkup;
    memberSelect.dataset.members = membersMarkup;
  }
  if (!state.dashboardMemberId || !state.members.some((member) => member.id === state.dashboardMemberId)) state.dashboardMemberId = state.member.id;
  memberSelect.value = state.dashboardMemberId;
  const viewedMember = state.members.find((member) => member.id === state.dashboardMemberId) || state.member;
  renderDashboardTabs();
  const selectedGig = state.gigs.find((gig) => !gig.completed && state.dashboardScope === `gig:${gig.id}`) || null;
  let songs = state.songs;
  if (selectedGig) {
    if (!selectedGig.setlist_id) {
      songs = [];
      $('#dashboard-caption').textContent = `${selectedGig.name} · No setlist is attached to this gig.`;
    } else {
      try {
        const items = await loadSetlistItems(selectedGig.setlist_id);
        if (requestId !== dashboardRenderRequest) return;
        const songIds = [...new Set(items.filter((item) => item.item_type === 'song' && item.song_id).map((item) => item.song_id))];
        songs = songIds.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
      } catch (error) {
        fail(`Could not load the ${selectedGig.name} setlist.`, error);
        return;
      }
      const setlistName = state.setlists.find((list) => list.id === selectedGig.setlist_id)?.name || 'linked setlist';
      $('#dashboard-caption').textContent = `${selectedGig.name} · ${new Date(`${selectedGig.event_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })} · ${setlistName}`;
    }
  } else {
    $('#dashboard-caption').textContent = 'All songs in the repertoire, with optional Parts kept separate from required readiness work.';
  }
  if (requestId !== dashboardRenderRequest) return;
  const waitingOnMix = songs.filter((song) => song.backing_track_manual === 'Sent to Mix');
  songs = [...songs.filter((song) => song.backing_track_manual !== 'Sent to Mix'), ...waitingOnMix];
  const openItems = songs.flatMap((song) => songWorkItems(song.id).filter((item) => !isWorkItemDone(item)).map((item) => ({ ...item, song_id: song.id, song })));
  const memberOpenItems = openItems.filter((item) => item.owner_member_id === viewedMember.id);
  const assignedCategories = new Set(state.taskTypes
    .filter((type) => type.owner_member_id === viewedMember.id && type.category !== 'part')
    .map((type) => type.category === 'ableset' ? 'ableset' : ['prompts', 'song_cue', 'backup_que'].includes(type.key) ? 'playback' : type.category === 'backing' ? 'backing' : 'other'));
  // Recorded tasks are reassigned to the admin; include their current categories in the dashboard headings.
  for (const item of memberOpenItems) assignedCategories.add(dashboardWorkCategory(item));
  const widgets = [];
  if (assignedCategories.has('playback')) widgets.push(renderDashboardWorkWidget('Playback Work', 'playback', memberOpenItems.filter((item) => dashboardWorkCategory(item) === 'playback')));
  if (assignedCategories.has('ableset')) widgets.push(renderDashboardWorkWidget('AbleSet Work', 'ableset', memberOpenItems.filter((item) => dashboardWorkCategory(item) === 'ableset')));
  if (assignedCategories.has('backing')) widgets.push(renderDashboardWorkWidget('Backing Work', 'backing', memberOpenItems.filter((item) => dashboardWorkCategory(item) === 'backing')));
  const otherItems = memberOpenItems.filter((item) => dashboardWorkCategory(item) === 'other');
  if (assignedCategories.has('other')) {
    const otherTitle = assignedCategories.size === 1 ? 'Work Remaining' : 'Other Work';
    widgets.push(renderDashboardWorkWidget(otherTitle, 'other', otherItems));
  }
  $('#dashboard-work-widgets').innerHTML = widgets.join('');
  const readyCount = songs.filter((song) => (state.readiness || []).find((row) => row.song_id === song.id)?.ready).length;
  const personalLabel = viewedMember.id === state.member.id ? 'Personal tasks left' : `${escapeHtml(viewedMember.name)}'s personal tasks left`;
  $('#dashboard-summary').innerHTML = `<article class="dashboard-stat"><span>${personalLabel}</span><strong>${memberOpenItems.length}</strong></article><article class="dashboard-stat"><span>Band Required Tasks Left</span><strong>${openItems.length}</strong></article><article class="dashboard-stat"><span>Songs Ready</span><strong>${readyCount}<small> / ${songs.length}</small></strong></article>`;
  $('#dashboard-song-list').innerHTML = songs.length ? songs.map((song) => renderDashboardSong(song, viewedMember.id)).join('') : '<div class="empty-state">There are no songs on this list.</div>';
}

async function saveStatus(select) {
  const previous = select.dataset.status;
  const { error } = await db.from('song_tasks').update({ status: select.value }).eq('song_id', select.dataset.song).eq('task_key', select.dataset.task);
  if (error) {
    select.value = previous;
    fail(`Could not update ${select.dataset.song}.`, error);
    return;
  }
  const task = state.tasks.find((item) => item.song_id === select.dataset.song && item.task_key === select.dataset.task);
  if (task) task.status = select.value;
  select.dataset.status = select.value;
  select.classList.add('saved');
  setTimeout(() => select.classList.remove('saved'), 700);
  await loadReadiness();
  renderSongs();
  if (state.view === 'setlists') await renderActiveSetlist();
  if (state.view === 'dashboard') await renderDashboard();
}

async function saveBackingTrackStatus(select) {
  const previous = select.dataset.manual;
  const value = select.value || null;
  const { error } = await db.from('songs').update({ backing_track_manual: value }).eq('id', select.dataset.song);
  if (error) {
    select.value = previous;
    fail(`Could not update Backing Track for ${select.dataset.song}.`, error);
    return;
  }
  const song = state.songs.find((item) => item.id === select.dataset.song);
  if (song) song.backing_track_manual = value;
  await loadReadiness();
  renderSongs();
  if (state.view === 'setlists') await renderActiveSetlist();
  if (state.view === 'dashboard') await renderDashboard();
  showNotice('Backing Track status updated.');
}

async function stageSongInSetlist(songId) {
  if (!state.member.is_admin || !state.setlistEditMode || !state.activeSetlist) return false;
  if (state.activeSetlistItems.some((item) => item.item_type === 'song' && item.song_id === songId)) {
    showNotice('That song is already in this setlist.', true);
    return false;
  }
  const song = state.songs.find((item) => item.id === songId);
  if (!song) {
    showNotice('Choose a song to add.', true);
    return false;
  }
  state.activeSetlistItems.push({
    id: `pending:${crypto.randomUUID()}`,
    setlist_id: state.activeSetlist,
    position: state.activeSetlistItems.length + 1,
    item_type: 'song',
    song_id: songId,
    songs: song
  });
  refreshSetlistDirtyState();
  renderSetlistItems(state.activeSetlistItems, true);
  updateSetlistEditControls();
  return true;
}

function hasSetlistChanges() {
  return state.setlistOrderDirty || state.setlistNameDraft.trim() !== state.originalSetlistName.trim();
}

async function saveSetlistOrder(items) {
  if (!state.member.is_admin || !state.setlistEditMode || savingSetlistOrder || !hasSetlistChanges()) return;
  const nextName = state.setlistNameDraft.trim();
  if (!nextName) { $('#setlist-name-input').focus(); showNotice('Enter a setlist name before saving.', true); return; }
  savingSetlistOrder = true;
  $('#setlist-items').classList.add('saving-order');
  try {
    // One database call saves the name and the whole running order together.
    const originalIds = new Set(state.originalSetlistItems.map((item) => item.id));
    const payload = items.map((item) => ({
      id: originalIds.has(item.id) ? item.id : null,
      item_type: item.item_type || 'song', song_id: item.song_id ?? null,
      label: item.label ?? null, note: item.note ?? null, break_seconds: item.break_seconds ?? null
    }));
    const { error } = await db.rpc('save_setlist', { p_setlist_id: state.activeSetlist, p_name: nextName, p_items: payload });
    if (error) throw error;
    state.setlists = state.setlists.map((list) => list.id === state.activeSetlist ? { ...list, name: nextName } : list);
    const selectedOption = $('#setlist-select').selectedOptions[0];
    if (selectedOption) selectedOption.textContent = nextName;
    state.setlistOrderDirty = false;
    state.setlistEditMode = false;
    state.originalSetlistItems = [];
    state.originalSetlistName = nextName;
    state.setlistNameDraft = nextName;
      showNotice('Setlist changes saved.');
    await renderActiveSetlist();
  } catch (error) {
    fail('Could not save the setlist changes. Your staged edits are still here; try saving again.', error);
  } finally {
    savingSetlistOrder = false;
    $('#setlist-items').classList.remove('saving-order');
    updateSetlistEditControls();
  }
}
function refreshSetlistDirtyState() {
  const original = state.originalSetlistItems.map((item) => item.id);
  const current = state.activeSetlistItems.map((item) => item.id);
  state.setlistOrderDirty = original.length !== current.length || original.some((id, index) => id !== current[index]);
}
function updateSetlistEditControls() {
  const toggle = $('#setlist-edit-toggle');
  const discard = $('#discard-setlist-order');
  if (toggle) {
    toggle.textContent = !state.setlistEditMode ? 'Edit setlist' : hasSetlistChanges() ? 'Save' : 'Done editing';
    toggle.disabled = savingSetlistOrder;
  }
  if (discard) discard.classList.toggle('hidden', !state.setlistEditMode || !hasSetlistChanges() || savingSetlistOrder);
}

function dropSetlistItem(event) {
  event.preventDefault();
  const row = event.target.closest('.setlist-row');
  if (!state.setlistEditMode || setlistFilterValues().active || !row || !draggedItemId || row.dataset.id === draggedItemId || savingSetlistOrder) return;
  const order = [...$('#setlist-items').querySelectorAll('.setlist-row')].map((item) => item.dataset.id);
  const from = order.indexOf(draggedItemId);
  let to = order.indexOf(row.dataset.id);
  if (event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2) to += 1;
  if (from < 0) return;
  const [movingId] = order.splice(from, 1);
  if (to > from) to -= 1;
  order.splice(Math.max(0, Math.min(to, order.length)), 0, movingId);
  const byId = new Map(state.activeSetlistItems.map((item) => [item.id,item]));
  state.activeSetlistItems = order.map((id) => byId.get(id)).filter(Boolean);
  refreshSetlistDirtyState();
  renderSetlistItems(state.activeSetlistItems, true);
  updateSetlistEditControls();
}
function removeSetlistItem(id) {
  if (!state.member.is_admin || !state.setlistEditMode) return;
  state.activeSetlistItems = state.activeSetlistItems.filter((item) => item.id !== id);
  refreshSetlistDirtyState();
  renderSetlistItems(state.activeSetlistItems, true);
  updateSetlistEditControls();
}


const KEY_CHOICES = ['A','Am','A#','A#m','B','Bm','C','Cm','C#','C#m','D','Dm','D#','D#m','E','Em','F','Fm','F#','F#m','G','Gm','G#','G#m'];
let newSongIdQuery = '';
let newSongIdSuggestionAccepted = false;
function nextAvailableSongIds(query = newSongIdQuery) {
  const families = new Map();
  state.songs.forEach((song) => {
    const match = String(song.id || '').match(/^([A-Z][A-Za-z]*?)(\d+)$/i);
    if (!match) return;
    const normalized = match[1].toUpperCase();
    const number = Number(match[2]);
    const family = families.get(normalized);
    if (!family || number > family.max) families.set(normalized, { prefix: family?.prefix || match[1], max: number });
  });
  const selectedCodes = [...document.querySelectorAll('input[name="new-song-language"]:checked')].map((input) => input.value);
  const selectedPrefixes = $('#new-song-type')?.value === 'Inst'
    ? ['I', 'IM']
    : selectedCodes.length ? [selectedCodes.join(''), selectedCodes.join('') + 'M'] : [];
  selectedPrefixes.forEach((selectedPrefix) => {
    const normalized = selectedPrefix.toUpperCase();
    if (!families.has(normalized)) families.set(normalized, { prefix: selectedPrefix, max: 0 });
  });
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  return [...families.values()]
    .map(({ prefix, max }) => prefix + (max + 1))
    .filter((id) => !normalizedQuery || id.toLocaleLowerCase().startsWith(normalizedQuery))
    .sort((a, b) => a.replace(/\d+$/, '').length - b.replace(/\d+$/, '').length || a.localeCompare(b))
    .slice(0, 12);
}

function renderNewSongIdSuggestions() {
  const list = $('#new-song-id-suggestions');
  const input = $('#new-song-id-prefix');
  if (!list || !input) return;
  const options = nextAvailableSongIds(newSongIdQuery);
  const query = newSongIdQuery.trim();
  if (options.length) {
    list.innerHTML = `<span class="song-id-suggestion-label">${query ? 'Suggested next Song IDs · select a prefix' : 'Possible next Song IDs'}</span>${options.map((id, index) => `<button id="new-song-id-option-${index}" type="button" role="option" aria-selected="${index === 0}" data-song-id-suggestion="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join('')}`;
    input.setAttribute('aria-activedescendant', 'new-song-id-option-0');
  } else if (query) {
    list.innerHTML = '<span class="song-id-suggestion-empty">No next-ID match. The number is assigned from the selected prefix.</span>';
    input.removeAttribute('aria-activedescendant');
  } else {
    list.innerHTML = '<span class="song-id-suggestion-empty">Type the alphabetic prefix. The next number is assigned automatically.</span>';
    input.removeAttribute('aria-activedescendant');
  }
  input.setAttribute('aria-expanded', options.length ? 'true' : 'false');
}
function idPrefixFromId(id) { return String(id || '').replace(/\d+$/, ''); }
function compareSongIdsNaturally(a, b) {
  const prefixOrder = idPrefixFromId(a.id).localeCompare(idPrefixFromId(b.id));
  if (prefixOrder) return prefixOrder;
  const numberA = Number(String(a.id).match(/\d+$/)?.[0] || 0);
  const numberB = Number(String(b.id).match(/\d+$/)?.[0] || 0);
  return numberA - numberB;
}
function compareSongLibraryOrder(a, b) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSongIdsNaturally(a, b);
}
function nextSongNumber(prefix) {
  const max = state.songs.filter((song) => idPrefixFromId(song.id).toUpperCase() === prefix.toUpperCase())
    .reduce((value, song) => Math.max(value, Number(String(song.id).match(/\d+$/)?.[0] || 0)), 0);
  return max + 1;
}
function canonicalSongPrefix(prefix) {
  const existing = state.songs.find((song) => idPrefixFromId(song.id).toUpperCase() === prefix.toUpperCase());
  if (existing) return idPrefixFromId(existing.id);
  const selectedCodes = [...document.querySelectorAll('input[name="new-song-language"]:checked')].map((input) => input.value);
  const selectedPrefix = $('#new-song-type')?.value === 'Inst' ? 'I' : selectedCodes.length ? selectedCodes.join('') : '';
  return selectedPrefix.toUpperCase() === prefix.toUpperCase() ? selectedPrefix : prefix.toUpperCase();
}

function updateGeneratedSongId() {
  const input = $('#new-song-id-prefix');
  if (!input) return;
  const typed = input.value.replace(/[^a-z]/gi, '').toUpperCase();
  const prefix = typed ? canonicalSongPrefix(typed) : '';
  const number = prefix ? nextSongNumber(prefix) : '';
  const generatedId = prefix && number ? `${prefix}${number}` : '';
  $('#new-song-id').value = generatedId;
  input.value = generatedId;
  if (document.activeElement === input) input.setSelectionRange(prefix.length, prefix.length);
}
function acceptSongIdSuggestion(id) {
  const input = $('#new-song-id-prefix');
  const prefix = idPrefixFromId(id).toUpperCase();
  input.value = prefix;
  newSongIdQuery = prefix;
  updateGeneratedSongId();
  renderNewSongIdSuggestions();
  input.focus();
  input.setSelectionRange(prefix.length, prefix.length);
}
function renderNewSongFields() {
  $('#new-song-language-options').innerHTML = state.languageOptions.map((language) =>
    `<label class="editor-option" style="--language-color:${languageColor(language.code)}"><input type="checkbox" name="new-song-language" value="${escapeHtml(language.code)}"><span>${escapeHtml(language.name)} <small>${escapeHtml(language.code)}</small></span></label>`).join('');
  $('#new-song-key-options').innerHTML = KEY_CHOICES.map((key) => `<label class="editor-option key-choice"><input type="checkbox" name="new-song-key" value="${escapeHtml(key)}"><span>${escapeHtml(key)}</span></label>`).join('');
  updateNewSongKeySummary();
  renderTempoPoints([{ bpm: '', transition_to_next: null }]);
  const taskTypes = Array.isArray(state.taskTypes) ? state.taskTypes : [];
  $('#new-song-task-statuses').innerHTML = taskTypes.map((type) => {
    const allowedStatuses = Array.isArray(type.allowed_statuses) && type.allowed_statuses.length
      ? type.allowed_statuses
      : ['Incomplete'];
    const defaultStatus = allowedStatuses.includes('Incomplete') ? 'Incomplete' : allowedStatuses[0];
    const defaultColor = STATUS_COLORS[defaultStatus] || '#D0D0D0';
    const options = allowedStatuses.map((status) => `<option value="${escapeHtml(status)}" style="color:${STATUS_COLORS[status] || '#D0D0D0'};background-color:#19231c" ${status === defaultStatus ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('');
    return `<label class="new-song-task-row"><span>${escapeHtml(type.label)}</span><select class="new-song-task-status" data-task-key="${escapeHtml(type.key)}" data-status="${escapeHtml(defaultStatus)}" style="color:${defaultColor};border-color:${defaultColor}">${options}</select></label>`;
  }).join('');
  updateNewSongIdPreview();
  renderNewSongIdSuggestions();
}
function updateNewSongIdPreview() {
  const type = $('#new-song-type')?.value || 'Vox';
  const codes = [...document.querySelectorAll('input[name="new-song-language"]:checked')].map((input) => input.value);
  $('#new-song-id-preview').textContent = type === 'Inst'
    ? 'Usual prefix: I (IM for an instrumental medley).'
    : codes.length ? `Usual prefix: ${codes.join('')} (${codes.join('')}M for a medley).` : 'Tick the languages to see the usual prefix.';
  renderNewSongIdSuggestions();
}

function songTempoChanges(song) {
  const points = Array.isArray(song?.tempo_segments) ? song.tempo_segments : [];
  if (points.length && points.some((point) => point?.from_bpm != null || point?.to_bpm != null)) {
    return points.map((point) => ({
      fromBpm: Number(point.from_bpm),
      toBpm: Number(point.to_bpm),
      transition: point.transition_to_next || (point.kind === 'ramp' ? 'gradual' : point.kind === 'jump' ? 'instant' : null),
      startBar: point.change_start_bar ?? point.start_bar ?? point.bar ?? null,
      endBar: point.change_end_bar ?? point.end_bar ?? point.bar ?? null
    })).filter((point) => Number.isFinite(point.fromBpm) && Number.isFinite(point.toBpm));
  }
  const changes = [];
  for (let i = 0; i < points.length - 1; i++) {
    const point = points[i] || {};
    const next = points[i + 1] || {};
    const transition = point.transition_to_next;
    if (!transition || point.bpm == null || next.bpm == null) continue;
    changes.push({
      fromBpm: Number(point.bpm),
      toBpm: Number(next.bpm),
      transition,
      startBar: point.change_start_bar ?? point.start_bar ?? null,
      endBar: point.change_end_bar ?? point.end_bar ?? null
    });
  }
  if (changes.length) return changes;
  if (song?.tempo_start == null || song?.tempo_end == null || song.tempo_change === 'none') return [];
  return [{
    fromBpm: Number(song.tempo_start),
    toBpm: Number(song.tempo_end),
    transition: song.tempo_change === 'ramp' ? 'gradual' : 'instant',
    startBar: null,
    endBar: null
  }];
}
function tempoTransitionIcon(change) {
  const gradual = change.transition === 'gradual';
  const descending = change.toBpm < change.fromBpm;
  const path = gradual ? 'M2 16 H16 L32 4 H46' : 'M2 16 H24 V4 H46';
  const direction = descending ? ' tempo-transition-down' : '';
  return `<svg class="tempo-transition-icon${direction}" viewBox="0 0 48 20" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}
function songTempoMarkup(song) {
  if (song?.tempo_start == null) return '<span class="tempo-info-label">Tempo not set</span>';
  const changes = songTempoChanges(song);
  const firstBpm = Number(song.tempo_start);
  const sequence = [`<span class="tempo-bpm">${escapeHtml(firstBpm)} BPM</span>`];
  const detailMarkup = [];
  changes.forEach((change, index) => {
    const direction = change.toBpm > change.fromBpm ? 'increase' : change.toBpm < change.fromBpm ? 'decrease' : 'change';
    const style = change.transition === 'gradual' ? 'Gradual' : 'Immediate';
    let location = 'bar location unavailable';
    if (change.startBar != null && change.endBar != null) {
      location = change.transition === 'gradual'
        ? `from bar ${escapeHtml(change.startBar)} to bar ${escapeHtml(change.endBar)}`
        : `at bar ${escapeHtml(change.startBar)}`;
    }
    const detail = `${style} ${direction}: ${escapeHtml(change.fromBpm)} to ${escapeHtml(change.toBpm)} BPM, ${location}.`;
    const label = `Show ${style.toLowerCase()} ${direction} from ${change.fromBpm} to ${change.toBpm} BPM details`;
    sequence.push(
      `<button type="button" class="tempo-change-trigger" data-tempo-change-toggle="${index}" aria-label="${escapeHtml(label)}" aria-expanded="false">${tempoTransitionIcon(change)}</button>`,
      `<span class="tempo-bpm">${escapeHtml(change.toBpm)} BPM</span>`
    );
    detailMarkup.push(`<li data-tempo-change-detail="${index}" hidden>${detail}</li>`);
  });
  const details = detailMarkup.join('');
  const panel = changes.length ? `<ul class="tempo-info-details" hidden>${details}</ul>` : '';
  return `<div class="tempo-info"><div class="tempo-chain">${sequence.join('')}</div>${panel}</div>`;
}
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('.tempo-change-trigger');
  if (!trigger) return;
  const info = trigger.closest('.tempo-info');
  const panel = info?.querySelector('.tempo-info-details');
  if (!panel) return;
  const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
  info.querySelectorAll('.tempo-change-trigger').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  panel.querySelectorAll('[data-tempo-change-detail]').forEach((item) => { item.hidden = true; });
  if (wasOpen) {
    panel.hidden = true;
    return;
  }
  const detail = panel.querySelector(`[data-tempo-change-detail="${trigger.dataset.tempoChangeToggle}"]`);
  if (!detail) return;
  detail.hidden = false;
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
});
function songTempoLabel(song) {
  let points = Array.isArray(song?.tempo_segments) ? song.tempo_segments : [];
  if (!points.length && song?.tempo_start != null) {
    points = [{ bpm:song.tempo_start, transition_to_next:song.tempo_change === 'ramp' ? 'gradual' : song.tempo_change === 'jump' ? 'instant' : null }];
    if (song.tempo_end != null) points.push({ bpm:song.tempo_end, transition_to_next:null });
  }
  if (!points.length) return 'Tempo not set';
  return points.map((point,index) => `${point.bpm} BPM${index < points.length - 1 ? ` ${point.transition_to_next === 'gradual' ? '→ gradual →' : '→ instant →'} ` : ''}`).join('');
}
function updateNewSongKeySummary() {
  const selected = orderedCheckedKeys('new-song-key');
  $('#new-song-key-summary').textContent = selected.length ? selected.join(', ') : 'Choose keys';
}
function tempoEditorTransitionIcon(transition) {
  const path = transition === 'gradual' ? 'M2 16 H16 L32 4 H46' : 'M2 16 H24 V4 H46';
  return '<svg class="tempo-editor-option-icon" viewBox="0 0 48 20" aria-hidden="true" focusable="false"><path d="' + path + '"/></svg>';
}
function renderTempoPoints(points, containerId = 'new-song-tempo-points') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = points.length ? points : [{ bpm: '', transition_to_next: null }];
  const barField = (index, type, label, value) =>
    '<label class="tempo-bar-field">' + label +
    '<input class="tempo-bar-number" type="number" min="1" step="1" inputmode="numeric" data-tempo-index="' + index +
    '" data-tempo-bar="' + type + '" value="' + escapeHtml(value ?? '') + '" aria-label="' + label + '"></label>';
  container.innerHTML = rows.map((point, index) => {
    const hasNextTempo = index < rows.length - 1;
    const selectedTransition = hasNextTempo ? point.transition_to_next : null;
    const optionButton = (transition, label) => {
      const selected = selectedTransition === transition;
      return '<button type="button" class="tempo-transition-option' + (selected ? ' selected' : '') +
        '" data-tempo-transition="' + transition + '" data-tempo-index="' + index +
        '" aria-label="' + label + '" aria-pressed="' + selected + '">' +
        tempoEditorTransitionIcon(transition) + '</button>';
    };
    const startBar = hasNextTempo && selectedTransition
      ? barField(index, 'start', selectedTransition === 'instant' ? 'At bar' : 'From bar', point.change_start_bar)
      : '';
    const endBar = hasNextTempo && selectedTransition === 'gradual'
      ? barField(index, 'end', 'To bar', point.change_end_bar)
      : '';
    const rowAttributes = ' data-original-start-bar="' + escapeHtml(point.original_change_start_bar ?? point.change_start_bar ?? '') +
      '" data-original-end-bar="' + escapeHtml(point.original_change_end_bar ?? point.change_end_bar ?? '') +
      '" data-change-start-beat="' + escapeHtml(point.change_start_beat ?? '') +
      '" data-change-end-beat="' + escapeHtml(point.change_end_beat ?? '') + '"';
    return '<div class="tempo-point"' + rowAttributes + '><div class="tempo-input-wrap">' +
      '<label class="tempo-input-field">Tempo ' + (index + 1) + ' (BPM)' +
      '<input class="tempo-point-bpm" data-tempo-index="' + index +
      '" type="number" min="1" step="1" inputmode="numeric" value="' +
      escapeHtml(point.bpm ?? '') + '" aria-label="Tempo ' + (index + 1) + ' in BPM"></label></div>' + startBar +
      '<div class="tempo-transition-options" role="group" aria-label="Change after tempo ' + (index + 1) + '">' +
      optionButton('instant', 'Add an immediate tempo change after tempo ' + (index + 1)) +
      optionButton('gradual', 'Add a gradual tempo change after tempo ' + (index + 1)) +
      '</div>' + endBar + '</div>';
  }).join('');
}
function readTempoPoints(containerId = 'new-song-tempo-points') {
  const container = document.getElementById(containerId);
  if (!container) return [];
  const rows = [...container.querySelectorAll('.tempo-point')];
  return rows.map((row, index) => ({
    bpm: row.querySelector('.tempo-point-bpm')?.value.trim() || '',
    transition_to_next: index < rows.length - 1
      ? row.querySelector('.tempo-transition-option[aria-pressed="true"]')?.dataset.tempoTransition || null
      : null,
    change_start_bar: row.querySelector('[data-tempo-bar="start"]')?.value.trim() || '',
    change_end_bar: row.querySelector('[data-tempo-bar="end"]')?.value.trim() || '',
    original_change_start_bar: row.dataset.originalStartBar || '',
    original_change_end_bar: row.dataset.originalEndBar || '',
    change_start_beat: row.dataset.changeStartBeat || '',
    change_end_beat: row.dataset.changeEndBeat || ''
  }));
}
function handleTempoPointsClick(event, containerId) {
  const container = document.getElementById(containerId);
  const transitionButton = event.target.closest('[data-tempo-transition]');
  if (transitionButton) {
    const points = readTempoPoints(containerId);
    const index = Number(transitionButton.dataset.tempoIndex);
    if (!points[index]) return;
    const selectedTransition = transitionButton.getAttribute('aria-pressed') === 'true';
    if (selectedTransition) {
      if (index < points.length - 1) {
        const following = points[index + 1];
        points.splice(index + 1, 1);
        points[index].transition_to_next = following.transition_to_next || null;
        points[index].change_start_bar = following.change_start_bar || '';
        points[index].change_end_bar = following.change_end_bar || '';
        points[index].original_change_start_bar = following.original_change_start_bar || '';
        points[index].original_change_end_bar = following.original_change_end_bar || '';
        points[index].change_start_beat = following.change_start_beat || '';
        points[index].change_end_beat = following.change_end_beat || '';
      } else {
        points[index].transition_to_next = null;
      }
    } else {
      points[index].transition_to_next = transitionButton.dataset.tempoTransition;
      if (index === points.length - 1) points.push({ bpm: '', transition_to_next: null });
    }
    renderTempoPoints(points, containerId);
    if (!selectedTransition) {
      container.querySelector('.tempo-point-bpm[data-tempo-index="' + (index + 1) + '"]')?.focus();
    } else {
      container.querySelector('.tempo-point-bpm[data-tempo-index="' + Math.min(index + 1, points.length - 1) + '"]')?.focus();
    }
    return;
  }
}
function validateTempoRows(tempoRows) {
  const hasTempo = tempoRows.some((point) => point.bpm !== '') || tempoRows.length > 1;
  if (hasTempo && tempoRows.some((point) => !point.bpm || !Number.isFinite(Number(point.bpm)) || Number(point.bpm) <= 0)) {
    return 'Complete each tempo value or remove the empty tempo row.';
  }
  for (let index = 0; index < tempoRows.length - 1; index++) {
    const point = tempoRows[index];
    if (!['instant', 'gradual'].includes(point.transition_to_next)) return 'Choose a tempo-change type between each tempo.';
    const hasStart = point.change_start_bar !== '';
    const hasEnd = point.change_end_bar !== '';
    const validBar = (bar) => /^\d+$/.test(bar) && Number(bar) >= 1;
    if (hasStart && !validBar(point.change_start_bar)) return 'Bar numbers must be whole numbers starting at 1.';
    if (point.transition_to_next === 'instant') continue;
    if (hasStart !== hasEnd) return 'Enter both the start and end bars for a gradual tempo change, or leave both blank.';
    if (hasEnd && !validBar(point.change_end_bar)) return 'Bar numbers must be whole numbers starting at 1.';
    if (hasStart && Number(point.change_end_bar) < Number(point.change_start_bar)) return 'The end bar must be the same as or later than the start bar.';
  }
  return '';
}
function tempoSegmentsFromRows(tempoRows) {
  const hasTempo = tempoRows.some((point) => point.bpm !== '') || tempoRows.length > 1;
  if (!hasTempo) return [];
  return tempoRows.map((point, index) => {
    const transition = index < tempoRows.length - 1 ? point.transition_to_next : null;
    const segment = { bpm: Number(point.bpm), transition_to_next: transition };
    if (transition) {
      const start = point.change_start_bar === '' ? null : Number(point.change_start_bar);
      const end = transition === 'instant'
        ? start
        : point.change_end_bar === '' ? null : Number(point.change_end_bar);
      if (start !== null) {
        segment.change_start_bar = start;
        segment.change_end_bar = end;
      }
      const unchangedBars = String(start ?? '') === point.original_change_start_bar
        && String(end ?? '') === point.original_change_end_bar;
      if (unchangedBars && point.change_start_beat !== '' && point.change_end_beat !== '') {
        segment.change_start_beat = Number(point.change_start_beat);
        segment.change_end_beat = Number(point.change_end_beat);
      }
    }
    return segment;
  });
}

function openNewSongDialog() {
  if (!state.member?.is_admin) return;
  const dialog = $('#song-editor-dialog');
  if (!dialog.open) dialog.showModal();
  try {
    $('#new-song-form').reset();
    newSongIdQuery = '';
    $('#new-song-id-prefix').value = '';
    updateGeneratedSongId();
    $('#new-song-error').textContent = '';
    $('#new-song-type').value = 'Vox';
    $('#new-song-backing').value = '';
    renderNewSongFields();
    $('#new-song-id-prefix').focus();
  } catch (error) {
    console.error('Could not prepare the new-song form.', error);
    $('#new-song-error').textContent = error.message || 'Some song form options could not be loaded. Refresh and try again.';
  }
}
window.openNewSongDialog = openNewSongDialog;
async function saveNewSong(event) {
  event.preventDefault();
  if (!state.member?.is_admin) return;
  const id = $('#new-song-id').value.trim();
  const name = $('#new-song-name').value.trim();
  const idPattern = /^[A-Z][A-Za-z]*[0-9]+$/;
  if (!idPattern.test(id)) { $('#new-song-error').textContent = 'Type the Song ID letters (for example E, EM or HM) at the top; the number is added for you.'; $('#new-song-id-prefix').focus(); return; }
  if (state.songs.some((song) => song.id.toLowerCase() === id.toLowerCase())) { $('#new-song-error').textContent = 'That Song ID is already in use.'; return; }
  if ($('#new-song-type').value === 'Vox' && !document.querySelector('input[name="new-song-language"]:checked')) { $('#new-song-error').textContent = 'Choose at least one language for a vocal song.'; return; }
  const keys = orderedCheckedKeys('new-song-key');
  const invalidKeys = keys.filter((key) => !KEY_CHOICES.includes(key));
  if (invalidKeys.length) { $('#new-song-error').textContent = `Unknown key: ${invalidKeys.join(', ')}.`; return; }
  const tempoRows = readTempoPoints('new-song-tempo-points');
  const tempoError = validateTempoRows(tempoRows);
  if (tempoError) { $('#new-song-error').textContent = tempoError; return; }
  const tempoSegments = tempoSegmentsFromRows(tempoRows);
  const tempoStart = tempoSegments[0]?.bpm ?? null;
  const tempoEnd = tempoSegments.length > 1 ? tempoSegments.at(-1).bpm : null;
  const tempoChange = tempoSegments.length > 1 ? (tempoSegments[0].transition_to_next === 'gradual' ? 'ramp' : 'jump') : 'none';
  const durationText = $('#new-song-duration').value.trim();
  const durationMatch = durationText.match(/^(\d+):([0-5]\d)$/);
  const duration = durationMatch ? Number(durationMatch[1]) * 60 + Number(durationMatch[2]) : null;
  if (durationText && !durationMatch) { $('#new-song-error').textContent = 'Enter duration as minutes:seconds, for example 4:22.'; return; }
  const languageCodes = [...document.querySelectorAll('input[name="new-song-language"]:checked')].map((input) => input.value);
  const prefix = idPrefixFromId(id);
  const songNumber = Number(id.match(/\d+$/)?.[0] || 0);
  const familySongs = state.songs
    .filter((song) => idPrefixFromId(song.id).toLowerCase() === prefix.toLowerCase())
    .sort((a, b) => Number(a.id.match(/\d+$/)?.[0] || 0) - Number(b.id.match(/\d+$/)?.[0] || 0));
  const nextFamilySong = familySongs.find((song) => Number(song.id.match(/\d+$/)?.[0] || 0) > songNumber);
  const previousFamilySong = [...familySongs].reverse().find((song) => Number(song.id.match(/\d+$/)?.[0] || 0) < songNumber);
  const familySortOrder = nextFamilySong?.sort_order ?? previousFamilySong?.sort_order;
  const payload = {
    id, name, type: $('#new-song-type').value, is_medley: /M$/i.test(idPrefixFromId(id)),
    keys, tempo_start: tempoStart, tempo_end: tempoEnd, tempo_change: tempoChange, tempo_segments: tempoSegments,
    duration_seconds: duration, backing_track_manual: $('#new-song-backing').value || null,
    sort_order: familySortOrder ?? (Math.max(0, ...state.songs.map((song) => song.sort_order || 0)) + 1)
  };
  const saveButton = $('#new-song-form button[type="submit"]');
  saveButton.disabled = true;
  let createdSongId = null;
  $('#new-song-error').textContent = '';
  try {
    const { data: song, error } = await db.from('songs').insert(payload).select('id').single();
    if (error) throw error;
    createdSongId = song.id;
    if (languageCodes.length) {
      const { error: languageError } = await db.from('song_languages').insert(languageCodes.map((language_code, position) => ({ song_id: song.id, language_code, position })));
      if (languageError) throw languageError;
    }
    const statusChanges = [...document.querySelectorAll('.new-song-task-status')].map((select) => ({ task_key: select.dataset.taskKey, status: select.value })).filter((task) => task.status !== 'Incomplete');
    for (const task of statusChanges) {
      const { error: taskError } = await db.from('song_tasks').update({ status: task.status }).eq('song_id', song.id).eq('task_key', task.task_key);
      if (taskError) throw taskError;
    }
    $('#song-editor-dialog').close();
    await Promise.all([loadData(), loadReadiness()]);
    renderSongs();
    if (state.view === 'setlists') await renderActiveSetlist();
    showNotice(`${id} added to the repertoire.`);
  } catch (error) {
    if (createdSongId) {
      const { error: cleanupError } = await db.from('songs').delete().eq('id', createdSongId);
      if (cleanupError) console.error('Could not clean up the partially added song.', cleanupError);
    }
    $('#new-song-error').textContent = error.message || 'Could not add this song.';
  } finally { saveButton.disabled = false; }
}
function renderNewSetlistSongChoices() {
  const search = $('#new-setlist-search').value.trim().toLocaleLowerCase();
  const selected = new Set(state.newSetlistSongIds);
  const songs = state.songs.filter((song) => `${song.id} ${song.name}`.toLocaleLowerCase().includes(search));
  $('#new-setlist-song-options').innerHTML = songs.map((song) =>
    `<label class="setlist-song-choice"><input type="checkbox" data-new-setlist-song="${escapeHtml(song.id)}" ${selected.has(song.id) ? 'checked' : ''}><span class="song-id">${escapeHtml(song.id)}</span><span>${escapeHtml(song.name)}</span></label>`).join('') || '<p class="muted">No songs match.</p>';
  $('#new-setlist-count').textContent = `${state.newSetlistSongIds.length} selected`;
  $('#new-setlist-selected').innerHTML = state.newSetlistSongIds.map((songId, index) => {
    const song = state.songs.find((item) => item.id === songId);
    if (!song) return '';
    return `<li><span class="position">${String(index + 1).padStart(2, '0')}</span><span class="song-id">${escapeHtml(song.id)}</span><span>${escapeHtml(song.name)}</span><span class="selected-song-controls"><button type="button" data-new-setlist-move="${escapeHtml(songId)}" data-direction="-1" aria-label="Move ${escapeHtml(song.name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-new-setlist-move="${escapeHtml(songId)}" data-direction="1" aria-label="Move ${escapeHtml(song.name)} down" ${index === state.newSetlistSongIds.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-new-setlist-remove="${escapeHtml(songId)}" aria-label="Remove ${escapeHtml(song.name)}">×</button></span></li>`;
  }).join('');
}
function openNewSetlistDialog() {
  if (!state.member?.is_admin) return;
  state.newSetlistSongIds = [];
  $('#new-setlist-form').reset();
  $('#new-setlist-error').textContent = '';
  $('#new-setlist-copy').innerHTML = '<option value="">Empty setlist</option>'
    + state.setlists.map((list) => `<option value="${escapeHtml(list.id)}">Copy of ${escapeHtml(list.name)}</option>`).join('');
  renderNewSetlistSongChoices();
  $('#setlist-create-dialog').showModal();
  $('#new-setlist-name').focus();
}
async function deleteActiveSetlist() {
  if (!state.member?.is_admin || !state.setlistEditMode || deletingSetlist || !state.activeSetlist) return;
  const setlist = state.setlists.find((item) => item.id === state.activeSetlist);
  if (!setlist) return;
  const linkedGigs = state.gigs.filter((gig) => gig.setlist_id === setlist.id);
  const linkedGigNote = linkedGigs.length
    ? ` Linked gigs will remain but will no longer have an attached setlist: ${linkedGigs.map((gig) => gig.name).join(', ')}.`
    : '';
  const message = `Delete “${setlist.name}”? Its running order and setlist deadlines will be deleted.${linkedGigNote} This cannot be undone.`;
  if (!window.confirm(message)) return;
  deletingSetlist = true;
  $('#delete-setlist').disabled = true;
  try {
    const { error } = await db.from('setlists').delete().eq('id', setlist.id);
    if (error) throw error;
    state.setlistEditMode = false;
    state.setlistOrderDirty = false;
    state.originalSetlistItems = [];
    state.activeSetlistItems = [];
      await loadData();
    if (state.view === 'dashboard') await renderDashboard();
    showNotice(`Deleted “${setlist.name}”.${linkedGigs.length ? ' Linked gigs remain without a setlist.' : ''}`);
  } catch (error) {
    fail(`Could not delete “${setlist.name}”.`, error);
  } finally {
    deletingSetlist = false;
    await renderActiveSetlist();
  }
}

let editingSongId = null;
// Keys keep the song's own order (first key = the key the song starts in);
// newly ticked keys are added in the order they were ticked.
function orderedCheckedKeys(name, original = []) {
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)];
  const values = new Set(checked.map((input) => input.value));
  const kept = (original || []).filter((key) => values.has(key));
  const added = checked.filter((input) => !kept.includes(input.value))
    .sort((a, b) => Number(a.dataset.at || 0) - Number(b.dataset.at || 0)).map((input) => input.value);
  return [...kept, ...added];
}
document.addEventListener('change', (event) => {
  const input = event.target;
  if (input?.name !== 'edit-song-key' && input?.name !== 'new-song-key') return;
  if (input.checked) input.dataset.at = String(Date.now()); else delete input.dataset.at;
}, true);
function updateEditSongKeySummary() {
  const song = state.songs.find((item) => item.id === editingSongId);
  const selected = orderedCheckedKeys('edit-song-key', song?.keys);
  $('#edit-song-key-summary').textContent = selected.length ? selected.join(', ') : 'Choose scales';
}
function renderEditSongFields(song) {
  $('#edit-song-language-options').innerHTML = state.languageOptions.map((language) =>
    `<label class="editor-option" style="--language-color:${languageColor(language.code)}"><input type="checkbox" name="edit-song-language" value="${escapeHtml(language.code)}"><span>${escapeHtml(language.name)} <small>${escapeHtml(language.code)}</small></span></label>`).join('');
  const selectedLanguages = new Set(state.languages.filter((row) => row.song_id === song.id).map((row) => row.language_code));
  document.querySelectorAll('input[name="edit-song-language"]').forEach((input) => { input.checked = selectedLanguages.has(input.value); });
  $('#edit-song-key-options').innerHTML = KEY_CHOICES.map((key) =>
    `<label class="editor-option key-choice"><input type="checkbox" name="edit-song-key" value="${escapeHtml(key)}"><span>${escapeHtml(key)}</span></label>`).join('');
  const selectedKeys = new Set(song.keys || []);
  document.querySelectorAll('input[name="edit-song-key"]').forEach((input) => { input.checked = selectedKeys.has(input.value); });
  updateEditSongKeySummary();
}
function openSongEditor(songId) {
  if (!state.member?.is_admin) return;
  const song = state.songs.find((item) => item.id === songId);
  if (!song) return;
  editingSongId = songId;
  $('#edit-song-title').textContent = 'Edit song details';
  $('#edit-song-error').textContent = '';
  $('#edit-song-name').value = song.name || '';
  $('#edit-song-id-value').textContent = songId;
  $('#edit-song-type-value').textContent = songTypeLabel(song);
  $('#edit-song-duration').value = song.duration_seconds == null ? '' : secondsLabel(Math.round(song.duration_seconds));
  $('#edit-song-backing').value = song.backing_track_manual || '';
  renderEditSongFields(song);
  let points = Array.isArray(song.tempo_segments) ? song.tempo_segments.map((point) => ({ ...point })) : [];
  if (!points.length && song.tempo_start != null) {
    const transition = song.tempo_change === 'ramp' ? 'gradual' : song.tempo_change === 'jump' ? 'instant' : null;
    points = [{ bpm: song.tempo_start, transition_to_next: transition }];
    if (song.tempo_end != null) points.push({ bpm: song.tempo_end, transition_to_next: null });
  }
  renderTempoPoints(points, 'edit-song-tempo-points');
  $('#edit-song-dialog').showModal();
  $('#edit-song-name').focus();
}
async function deleteSongFromEditor() {
  if (!state.member?.is_admin || !editingSongId) return;
  const songId = editingSongId;
  const song = state.songs.find((item) => item.id === songId);
  if (!song) return;
  const prefix = idPrefixFromId(songId);
  const number = Number(songId.match(/\d+$/)?.[0] || 0);
  const followingCount = state.songs.filter((item) =>
    idPrefixFromId(item.id).toLowerCase() === prefix.toLowerCase()
    && Number(item.id.match(/\d+$/)?.[0] || 0) > number
  ).length;
  const shiftedSummary = followingCount
    ? `${followingCount} later song${followingCount === 1 ? '' : 's'} in the ${prefix} ID group will shift down by one.`
    : `No later songs in the ${prefix} ID group need renumbering.`;
  const confirmed = window.confirm(
    `Are you sure you want to delete ${songId} — ${song.name}?\n\nThis permanently removes it from the repertoire and all setlists. ${shiftedSummary} This cannot be undone.`
  );
  if (!confirmed) return;

  const button = $('#delete-song-button');
  button.disabled = true;
  $('#edit-song-error').textContent = '';
  try {
    const { data: shiftedCount, error } = await db.rpc('delete_song_and_shift_ids', { p_song_id: songId });
    if (error) throw error;
    editingSongId = null;
    state.expandedSongIds.clear();
    $('#edit-song-dialog').close();
    await loadData();
    await loadReadiness();
    if (state.view === 'setlists') await renderActiveSetlist();
    if (state.view === 'dashboard') await renderDashboard();
    const count = Number(shiftedCount) || 0;
    showNotice(count
      ? `Deleted ${songId}. ${count} song${count === 1 ? '' : 's'} in the ${prefix} group renumbered.`
      : `Deleted ${songId} from the repertoire.`);
  } catch (error) {
    $('#edit-song-error').textContent = error.message || 'Could not delete this song.';
  } finally {
    button.disabled = false;
  }
}
async function saveSongMetadata(event) {
  event.preventDefault();
  if (!state.member?.is_admin || !editingSongId) return;
  const songId = editingSongId;
  const song = state.songs.find((item) => item.id === songId);
  if (!song) return;
  const name = $('#edit-song-name').value.trim();
  if (!name) { $('#edit-song-error').textContent = 'Enter a song name.'; return; }
  const languageCodes = [...document.querySelectorAll('input[name="edit-song-language"]:checked')].map((input) => input.value);
  if (song.type === 'Vox' && !languageCodes.length) { $('#edit-song-error').textContent = 'Choose at least one language for a vocal song.'; return; }
  const keys = orderedCheckedKeys('edit-song-key', song.keys);
  const invalidKeys = keys.filter((key) => !KEY_CHOICES.includes(key));
  if (invalidKeys.length) { $('#edit-song-error').textContent = `Unknown scale: ${invalidKeys.join(', ')}.`; return; }
  const durationValue = $('#edit-song-duration').value.trim();
  const durationMatch = durationValue.match(/^(\d+):([0-5]\d)$/);
  if (durationValue && !durationMatch) { $('#edit-song-error').textContent = 'Enter duration as minutes:seconds, for example 4:22.'; return; }
  const durationSeconds = durationMatch ? Number(durationMatch[1]) * 60 + Number(durationMatch[2]) : null;
  const tempoRows = readTempoPoints('edit-song-tempo-points');
  const tempoError = validateTempoRows(tempoRows);
  if (tempoError) { $('#edit-song-error').textContent = tempoError; return; }
  const tempoSegments = tempoSegmentsFromRows(tempoRows);
  const payload = {
    name,
    keys,
    duration_seconds: durationSeconds,
    tempo_start: tempoSegments[0]?.bpm ?? null,
    tempo_end: tempoSegments.length > 1 ? tempoSegments.at(-1).bpm : null,
    tempo_change: tempoSegments.length > 1
      ? tempoSegments[0].transition_to_next === 'gradual' ? 'ramp' : 'jump'
      : 'none',
    tempo_segments: tempoSegments,
    backing_track_manual: $('#edit-song-backing').value || null
  };
  const previousLanguageRows = state.languages.filter((row) => row.song_id === songId)
    .map((row) => ({ song_id: songId, language_code: row.language_code, position: row.position }));
  const nextLanguageRows = languageCodes.map((language_code, position) => ({ song_id: songId, language_code, position }));
  const button = $('#edit-song-form button[type="submit"]');
  button.disabled = true;
  $('#edit-song-error').textContent = '';
  let songUpdated = false;
  let languagesDeleted = false;
  try {
    const { data, error } = await db.from('songs').update(payload).eq('id', songId).select('*').single();
    if (error) throw error;
    songUpdated = true;
    const { error: deleteError } = await db.from('song_languages').delete().eq('song_id', songId);
    if (deleteError) throw deleteError;
    languagesDeleted = true;
    if (nextLanguageRows.length) {
      const { error: insertError } = await db.from('song_languages').insert(nextLanguageRows);
      if (insertError) throw insertError;
    }
    state.songs = state.songs.map((item) => item.id === songId ? { ...item, ...data } : item);
    const languageByCode = new Map(state.languageOptions.map((language) => [language.code, language]));
    const newLinks = nextLanguageRows.map((row) => {
      const language = languageByCode.get(row.language_code);
      return { ...row, languages: language ? { code: language.code, short_label: language.short_label } : null };
    });
    state.languages = [...state.languages.filter((row) => row.song_id !== songId), ...newLinks];
    try { await loadReadiness(); } catch (refreshError) { console.warn('Song saved, but readiness could not be refreshed.', refreshError); }
    editingSongId = null;
    $('#edit-song-dialog').close();
    renderSongs();
    if (state.view === 'setlists') await renderActiveSetlist();
    if (state.view === 'dashboard') renderDashboard();
    showNotice('Updated song details for ' + name + '.');
  } catch (error) {
    if (songUpdated) {
      try {
        const { error: rollbackError } = await db.from('songs').update({
          name: song.name, keys: song.keys, duration_seconds: song.duration_seconds,
          tempo_start: song.tempo_start, tempo_end: song.tempo_end, tempo_change: song.tempo_change,
          tempo_segments: song.tempo_segments, backing_track_manual: song.backing_track_manual
        }).eq('id', songId);
        if (rollbackError) throw rollbackError;
      } catch (rollbackError) { console.error('Could not restore song metadata after a failed language update.', rollbackError); }
    }
    if (languagesDeleted) {
      try {
        const { error: deleteRollbackError } = await db.from('song_languages').delete().eq('song_id', songId);
        if (deleteRollbackError) throw deleteRollbackError;
        if (previousLanguageRows.length) {
          const { error: insertRollbackError } = await db.from('song_languages').insert(previousLanguageRows);
          if (insertRollbackError) throw insertRollbackError;
        }
      } catch (rollbackError) { console.error('Could not restore song languages after a failed update.', rollbackError); }
    }
    $('#edit-song-error').textContent = error.message || 'Could not save song details.';
  } finally {
    button.disabled = false;
  }
}

async function saveNewSetlist(event) {
  event.preventDefault();
  if (!state.member?.is_admin) return;
  const name = $('#new-setlist-name').value.trim();
  if (!name) { $('#new-setlist-error').textContent = 'Enter a setlist name.'; return; }
  if (!state.newSetlistSongIds.length) { $('#new-setlist-error').textContent = 'Choose at least one song.'; return; }
  const saveButton = $('#new-setlist-form button[type="submit"]');
  saveButton.disabled = true;
  $('#new-setlist-error').textContent = '';
  let createdSetlistId = null;
  try {
    const { data, error } = await db.from('setlists').insert({ name, created_by: state.member.id }).select('id,name,description,created_at').single();
    if (error) throw error;
    createdSetlistId = data.id;
    const items = state.newSetlistSongIds.map((song_id, index) => ({ setlist_id: data.id, position: index + 1, item_type: 'song', song_id }));
    const { error: itemError } = await db.from('setlist_items').insert(items);
    if (itemError) throw itemError;
    $('#setlist-create-dialog').close();
    state.activeSetlist = data.id;
    state.setlistEditMode = true;
    await loadData();
    setView('setlists');
    showNotice('Setlist created with the selected running order.');
  } catch (error) {
    if (createdSetlistId) {
      await db.from('setlist_items').delete().eq('setlist_id', createdSetlistId);
      await db.from('setlists').delete().eq('id', createdSetlistId);
    }
    $('#new-setlist-error').textContent = error.message || 'Could not create this setlist.';
  } finally { saveButton.disabled = false; }
}


async function completeGig(gig) {
  if (!state.member?.is_admin || gig.completed || gig.event_date >= localDateString()) return;
  const { error } = await db.from('gigs').update({ completed: true }).eq('id', gig.id);
  if (error) return fail('Could not mark this gig complete.', error);
  gig.completed = true;
  renderGigs();
  if (state.view === 'dashboard') await renderDashboard();
  showNotice(`${gig.name} moved to Completed Gigs.`);
}

async function saveGig(event) {
  event.preventDefault();
  if (!state.member.is_admin) return;
  const id = $('#gig-id').value;
  const name = $('#gig-name').value.trim();
  const payload = {
    name,
    event_date: $('#gig-date').value,
    start_time: $('#gig-time').value || null,
    location: $('#gig-location').value.trim() || null,
    notes: $('#gig-notes').value.trim() || null
  };
  if (id) {
    const { error } = await db.from('gigs').update({ ...payload, setlist_id: $('#gig-setlist').value }).eq('id', id);
    if (error) return fail('Could not update this gig.', error);
  } else {
    const { data: newSetlist, error: setlistError } = await db.from('setlists')
      .insert({ name, created_by: state.member.id })
      .select('id')
      .single();
    if (setlistError) return fail('Could not create the gig’s setlist.', setlistError);
    const { error: gigError } = await db.from('gigs')
      .insert({ ...payload, setlist_id: newSetlist.id });
    if (gigError) {
      await db.from('setlists').delete().eq('id', newSetlist.id);
      return fail('Could not create this gig.', gigError);
    }
  }
  $('#gig-form').classList.add('hidden');
  await loadData();
  renderGigs();
  if (state.view === 'dashboard') await renderDashboard();
  showNotice(id ? 'Gig updated.' : 'Gig created with its own setlist.');
}

function isGuest() { return state.member?.role === 'guest'; }
function setView(view) {
  if (isGuest() && view !== 'practice') view = 'practice';
  if (view !== 'practice' && typeof lyricsFs !== 'undefined' && lyricsFs.on) lyricsFsExit();
  if (view !== 'setlists' && state.setlistEditMode && hasSetlistChanges()) {
    showNotice('Save or discard your staged setlist changes before leaving edit mode.', true);
    return;
  }
  state.view = view;
  activityView(view);
  if (view !== 'setlists') {
    state.setlistEditMode = false;
    state.originalSetlistItems = [];
    state.originalSetlistName = '';
    state.setlistNameDraft = '';
    }
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  $('#songs-view').classList.toggle('hidden', view !== 'songs');
  $('#setlists-view').classList.toggle('hidden', view !== 'setlists');
  $('#gigs-view').classList.toggle('hidden', view !== 'gigs');
  $('#dashboard-view').classList.toggle('hidden', view !== 'dashboard');
  $('#sync-view').classList.toggle('hidden', view !== 'sync');
  $('#practice-view').classList.toggle('hidden', view !== 'practice');
  if (view === 'sync') renderSyncPage();
  if (view === 'practice') { renderPracticePage(); setTimeout(lyricsFit, 50); }
  document.body.classList.toggle('view-practice', view === 'practice');
  renderReviewBar();
  if (view === 'setlists') renderActiveSetlist();
  if (view === 'gigs') renderGigs();
  if (view === 'dashboard') renderDashboard();
}


$('#forgot-password-open').addEventListener('click', () => {
  $('#login-form').classList.add('hidden');
  $('#reset-request-form').classList.remove('hidden');
  $('#reset-email').value = $('#email').value.trim();
  $('#reset-request-message').textContent = '';
});
$('#cancel-password-reset').addEventListener('click', () => {
  $('#reset-request-form').classList.add('hidden');
  $('#login-form').classList.remove('hidden');
  $('#login-error').textContent = '';
});
$('#reset-request-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#send-reset-link'), message = $('#reset-request-message');
  message.textContent = '';
  button.disabled = true;
  try {
    const { error } = await db.auth.resetPasswordForEmail($('#reset-email').value.trim(), {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    });
    if (error) throw error;
    message.textContent = 'If an account exists for that email, reset instructions will be sent.';
  } catch (error) {
    message.textContent = error.message || 'Could not send a reset email. Please try again.';
  } finally { button.disabled = false; }
});
$('#recovery-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('#recovery-new-password').value;
  $('#recovery-error').textContent = '';
  if (password !== $('#recovery-confirm-password').value) {
    $('#recovery-error').textContent = 'The passwords do not match.';
    return;
  }
  const button = $('#save-recovery-password');
  button.disabled = true;
  try {
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;
    if (state.member.must_change_password) {
      const { error: setupError } = await db.rpc('complete_password_setup');
      if (setupError) throw setupError;
    }
    state.member.must_change_password = false;
    window.history.replaceState(null, document.title, window.location.pathname);
    await Promise.all([loadData(), loadReadiness()]);
    showWorkspace();
    renderSongs();
    showNotice('Password updated.');
  } catch (error) {
    $('#recovery-error').textContent = error.message || 'Could not update the password. Please request a new reset link.';
  } finally { button.disabled = false; }
});
$('#recovery-sign-out').addEventListener('click', async () => {
  await db.auth.signOut();
  state.member = null;
  showLogin();
});
$('#member-access-open').addEventListener('click', async () => {
  if (!state.member?.is_admin) return;
  const dialog = $('#member-access-dialog');
  $('#access-message').textContent = 'Loading member accounts…';
  $('#temporary-password-result').classList.add('hidden');
  $('#temporary-password-value').textContent = '';
  $('#access-member-select').innerHTML = '<option value="">Loading…</option>';
  dialog.showModal();
  try {
    state.accessMembers = await fetchAccessMembers();
    $('#access-member-select').innerHTML = state.accessMembers.length
      ? '<option value="">Choose a band member</option>' + state.accessMembers.map((member) =>
          `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}${member.role === 'guest' ? ' (Guest: Practice only)' : ''}${member.linked ? (member.must_change_password ? ' · password change required' : '') : ' · sign-in not set up'}</option>`).join('')
      : '<option value="">No band members found</option>';
    $('#access-member-select').dispatchEvent(new Event('change'));
    $('#access-message').textContent = '';
  } catch (error) { $('#access-message').textContent = error.message || await memberAccessErrorMessage(error); }
});
function updateAccessMemberControls() {
  const member = state.accessMembers.find((item) => item.id === $('#access-member-select').value);
  const unlinked = Boolean(member && !member.linked);
  $('#access-email-label').classList.toggle('hidden', !unlinked);
  $('#access-member-email').classList.toggle('hidden', !unlinked);
  $('#access-member-email').required = unlinked;
  $('#access-member-email').value = unlinked ? (member.email || '') : '';
  $('#issue-temporary-password').textContent = unlinked ? 'Create sign-in + temporary password' : 'Create temporary password';
  $('#send-member-reset').classList.toggle('hidden', unlinked);
}
$('#access-member-select').addEventListener('change', updateAccessMemberControls);
async function runMemberAccessAction(action) {
  const memberId = $('#access-member-select').value;
  if (!memberId) { $('#access-message').textContent = 'Choose a band member first.'; return; }
  const member = state.accessMembers.find((item) => item.id === memberId);
  if (action === 'temporary_password' && member && !member.linked) action = 'create_member_login';
  const email = $('#access-member-email').value.trim();
  if (action === 'create_member_login' && !email) { $('#access-message').textContent = 'Enter the member’s sign-in email.'; return; }
  const who = member?.name || 'this member';
  const isSelf = memberId === state.member?.id;
  const question = action === 'send_reset'
    ? `Send a password reset email to ${who}?`
    : action === 'create_member_login'
      ? `Create a sign-in for ${who} with a temporary password?`
      : `Reset ${isSelf ? 'YOUR OWN' : `${who}’s`} password to a new temporary one?\n\n${isSelf ? 'You' : who} will need it to sign in next time${isSelf ? '' : ', so share it privately'}.`;
  if (!window.confirm(question)) return;
  accessMembersFetch = null;
  const buttons = [$('#issue-temporary-password'), $('#send-member-reset')];
  buttons.forEach((button) => { button.disabled = true; });
  $('#access-message').textContent = action === 'send_reset' ? 'Sending a reset email…' : 'Creating a temporary password…';
  $('#temporary-password-result').classList.add('hidden');
  $('#temporary-password-value').textContent = '';
  try {
    const { data, error } = await db.functions.invoke('member-access-admin', { body: { action, member_id: memberId, email } });
    if (error) throw error;
    if (action === 'temporary_password' || action === 'create_member_login') {
      $('#temporary-password-value').textContent = data.temporary_password;
      $('#temporary-password-result').classList.remove('hidden');
      $('#access-message').textContent = 'Share this password privately. The member must change it at their next sign-in.';
      if (member) {
        member.must_change_password = true;
        if (action === 'create_member_login') { member.linked = true; member.user_id = 'linked'; member.email = email; }
      }
      const option = $('#access-member-select').selectedOptions[0];
      if (option) {
        option.textContent = option.textContent.replace(' · sign-in not set up', '');
        if (!option.textContent.includes('password change required')) option.textContent += ' · password change required';
      }
      updateAccessMemberControls();
    } else { $('#access-message').textContent = 'Password reset email sent.'; }
  } catch (error) { $('#access-message').textContent = await memberAccessErrorMessage(error); }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
}
$('#issue-temporary-password').addEventListener('click', () => runMemberAccessAction('temporary_password'));
$('#send-member-reset').addEventListener('click', () => runMemberAccessAction('send_reset'));
$('#copy-temporary-password').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#temporary-password-value').textContent);
    $('#copy-temporary-password').textContent = 'Copied';
    setTimeout(() => { $('#copy-temporary-password').textContent = 'Copy'; }, 1600);
  } catch { $('#access-message').textContent = 'Select and copy the temporary password shown above.'; }
});
document.querySelector('[data-close-member-access]')?.addEventListener('click', () => $('#member-access-dialog').close());
// Anything the Content-Security-Policy blocks is reported here (helps diagnose a missing allow-list entry).
document.addEventListener('securitypolicyviolation', (event) => console.warn('Blocked by the page security policy:', event.violatedDirective, event.blockedURI));
$('#member-access-dialog').addEventListener('close', () => {
  $('#temporary-password-value').textContent = '';
  $('#temporary-password-result').classList.add('hidden');
  $('#access-message').textContent = '';
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#login-error').textContent = '';
  const { data, error } = await db.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
  if (error) { $('#login-error').textContent = error.message; return; }
  try {
    await loadMember(data.user);
    if (state.member.must_change_password) { showFirstLoginPasswordSetup(); return; }
    await Promise.all([loadData(), loadReadiness()]);
    showWorkspace();
    renderSongs();
  } catch (loadError) {
    await db.auth.signOut();
    $('#login-error').textContent = loadError.message || 'Could not open the band workspace.';
  }
});

$('#first-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('#new-password').value;
  $('#password-setup-error').textContent = '';
  if (password !== $('#confirm-password').value) {
    $('#password-setup-error').textContent = 'The passwords do not match.';
    return;
  }
  $('#save-password').disabled = true;
  try {
    const { error: passwordError } = await db.auth.updateUser({ password });
    if (passwordError) throw passwordError;
    const { error: completeError } = await db.rpc('complete_password_setup');
    if (completeError) throw completeError;
    state.member.must_change_password = false;
    await Promise.all([loadData(), loadReadiness()]);
    showWorkspace();
    renderSongs();
  } catch (error) {
    $('#password-setup-error').textContent = error.message || 'Could not finish password setup. Please try again.';
  } finally {
    $('#save-password').disabled = false;
  }
});

$('#password-setup-sign-out').addEventListener('click', async () => {
  await db.auth.signOut();
  state.member = null;
  showLogin();
});

// ---------------------------------------------------------------------------
// Sign-out: remove what this device saved about the band, so the next person
// to use it cannot open songs, tasks, lyrics or audio without signing in.
// The app shell (public files) stays so the sign-in page still opens offline.
function signOutKeysToRemove(keys, keepAudio) {
  // With "keep audio", only the two keys the saved audio needs survive.
  const keep = keepAudio ? new Set(['tsp-offline-v1', 'tsp-offline-manifest-v1']) : new Set();
  return keys.filter((key) => key.startsWith('tsp-') && !keep.has(key));
}
async function clearDeviceData({ keepAudio = false } = {}) {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const keys = [];
      for (let i = 0; i < store.length; i += 1) keys.push(store.key(i));
      signOutKeysToRemove(keys.filter(Boolean), keepAudio && store === localStorage).forEach((key) => store.removeItem(key));
    } catch { /* storage unavailable */ }
  }
  try { await caches.delete('tsp-offline-data-v1'); } catch { /* ignore */ }
  if (!keepAudio) {
    try { await caches.delete('tsp-practice-audio-v1'); } catch { /* ignore */ }
    try { memBlobs.clear(); offline.manifest = {}; } catch { /* not loaded yet */ }
    // Forget the chosen audio folder (files in that folder are the device owner's and stay).
    try { await new Promise((resolve) => { const req = indexedDB.deleteDatabase('tsp-offline'); req.onsuccess = req.onerror = req.onblocked = () => resolve(); }); } catch { /* ignore */ }
  }
}
function askSignOutChoice() {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'editor-dialog signout-dialog';
    const title = document.createElement('h2'); title.textContent = 'Sign out';
    const text = document.createElement('p');
    text.textContent = 'Signing out removes the band data saved on this device. Practice audio saved here can be removed too (best on a shared device) or kept so it does not download again. If you keep it, this device still holds those audio files.';
    const actions = document.createElement('div'); actions.className = 'signout-actions';
    const button = (label, value, cls) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `button ${cls}`; b.textContent = label;
      b.addEventListener('click', () => { dialog.close(); dialog.remove(); resolve(value); });
      actions.append(b);
    };
    button('Sign out and remove everything', 'all', 'primary');
    button('Sign out, keep saved audio', 'keep-audio', 'quiet');
    button('Cancel', null, 'quiet');
    dialog.addEventListener('cancel', () => { dialog.remove(); resolve(null); });
    dialog.append(title, text, actions);
    document.body.append(dialog);
    dialog.showModal();
  });
}
$('#sign-out').addEventListener('click', async () => {
  const choice = await askSignOutChoice();
  if (!choice) return;
  try { await activityEnd(); } catch { /* ignore */ }
  try { await db.auth.signOut(); } catch (error) { console.warn('Sign-out request failed; local session cleared anyway', error); }
  await clearDeviceData({ keepAudio: choice === 'keep-audio' });
  state.member = null;
  // Reload so nothing loaded for the previous member stays in memory.
  location.reload();
});
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$('#song-search').addEventListener('input', renderSongs);
$('#dashboard-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('.dashboard-tab');
  if (!button) return;
  state.dashboardScope = button.dataset.dashboardScope;
  renderDashboard();
});
$('#dashboard-member-select').addEventListener('change', (event) => {
  state.dashboardMemberId = event.target.value;
  renderDashboard();
});
$('#dashboard-song-list').addEventListener('change', (event) => {
  if (event.target.matches('.backing-track-select')) saveBackingTrackStatus(event.target);
  else if (event.target.matches('.status-select')) saveStatus(event.target);
});
$('#dashboard-work-widgets').addEventListener('change', (event) => {
  if (event.target.matches('.status-select')) saveStatus(event.target);
});
$('#dashboard-song-list').addEventListener('focusin', (event) => { if (event.target.matches('.backing-track-select')) labelAutoBackingOption(event.target, true); });
$('#dashboard-song-list').addEventListener('focusout', (event) => { if (event.target.matches('.backing-track-select')) labelAutoBackingOption(event.target, false); });
$('#dashboard-song-list').addEventListener('click', (event) => {
  const button = event.target.closest('.dashboard-open-song');
  if (!button) return;
  state.expandedSongIds.clear();
  state.expandedSongIds.add(button.dataset.songId);
  setView('songs');
  renderSongs();
});
$('#song-filters-toggle').addEventListener('click', () => toggleFilterPanel('song-filters-toggle', 'song-filter-panel'));
$('#language-filter').addEventListener('change', renderSongs);
$('#performance-filter').addEventListener('change', renderSongs);
$('#key-filter').addEventListener('change', renderSongs);
$('#song-sort').addEventListener('change', renderSongs);
$('#clear-song-filters').addEventListener('click', () => {
  $('#song-search').value = '';
  $('#language-filter').value = '';
  $('#performance-filter').value = '';
  $('#key-filter').value = '';
  $('#song-sort').value = 'original';
  renderSongs();
});
$('#setlist-search').addEventListener('input', () => renderSetlistItems(state.activeSetlistItems, state.member.is_admin && state.setlistEditMode));
$('#setlist-filters-toggle').addEventListener('click', () => toggleFilterPanel('setlist-filters-toggle', 'setlist-filter-panel'));
$('#setlist-language-filter').addEventListener('change', () => renderSetlistItems(state.activeSetlistItems, state.member.is_admin && state.setlistEditMode));
$('#setlist-performance-filter').addEventListener('change', () => renderSetlistItems(state.activeSetlistItems, state.member.is_admin && state.setlistEditMode));
$('#setlist-key-filter').addEventListener('change', () => renderSetlistItems(state.activeSetlistItems, state.member.is_admin && state.setlistEditMode));
$('#clear-setlist-filters').addEventListener('click', () => {
  $('#setlist-search').value = '';
  $('#setlist-language-filter').value = '';
  $('#setlist-performance-filter').value = '';
  $('#setlist-key-filter').value = '';
  renderSetlistItems(state.activeSetlistItems, state.member.is_admin && state.setlistEditMode);
});

$('#setlist-select').addEventListener('change', (event) => {
  if (hasSetlistChanges()) { event.target.value = state.activeSetlist; showNotice('Save or discard your staged changes before switching setlists.', true); return; }
  state.setlistEditMode = false;
  state.originalSetlistItems = [];
  state.originalSetlistName = '';
  state.setlistNameDraft = '';
  state.activeSetlist = event.target.value;
  renderActiveSetlist();
});
$('#setlist-edit-toggle').addEventListener('click', async () => {
  if (!state.member.is_admin || savingSetlistOrder) return;
  if (!state.setlistEditMode) {
    state.setlistEditMode = true;
    state.expandedSongIds.clear();
    state.originalSetlistItems = [...state.activeSetlistItems];
    const activeSetlist = state.setlists.find((item) => item.id === state.activeSetlist);
    state.originalSetlistName = activeSetlist?.name || '';
    state.setlistNameDraft = state.originalSetlistName;
    state.setlistOrderDirty = false;
      await renderActiveSetlist();
    updateSetlistEditControls();
    return;
  }
  if (hasSetlistChanges()) {
    await saveSetlistOrder([...state.activeSetlistItems]);
    return;
  }
  state.setlistEditMode = false;
  state.originalSetlistItems = [];
  state.originalSetlistName = '';
  state.setlistNameDraft = '';
  await renderActiveSetlist();
});
$('#setlist-name-input').addEventListener('input', (event) => {
  state.setlistNameDraft = event.target.value;
  updateSetlistEditControls();
});
$('#delete-setlist').addEventListener('click', deleteActiveSetlist);
$('#discard-setlist-order').addEventListener('click', () => {
  state.activeSetlistItems = [...state.originalSetlistItems];
  state.setlistNameDraft = state.originalSetlistName;
  state.setlistOrderDirty = false;
  state.setlistEditMode = false;
  state.originalSetlistItems = [];
  state.originalSetlistName = '';
  state.setlistNameDraft = '';
  renderActiveSetlist();
});
$('#new-setlist').addEventListener('click', openNewSetlistDialog);

$('#cancel-new-song').addEventListener('click', () => $('#song-editor-dialog').close());
$('#new-song-form').addEventListener('submit', saveNewSong);
$('#edit-song-form').addEventListener('submit', saveSongMetadata);
$('#delete-song-button').addEventListener('click', deleteSongFromEditor);
$('#cancel-edit-song').addEventListener('click', () => $('#edit-song-dialog').close());
$('#edit-song-key-options').addEventListener('change', updateEditSongKeySummary);
document.addEventListener('click', (event) => {
  const dropdown = $('#new-song-key-dropdown');
  if (dropdown?.open && !dropdown.contains(event.target)) dropdown.open = false;
});
document.addEventListener('click', (event) => { const button = event.target.closest('[data-song-edit]'); if (button) openSongEditor(button.dataset.songEdit); });
$('#new-song-id-prefix').addEventListener('input', (event) => {
  const input = event.target;
  newSongIdQuery = input.value.replace(/[^a-z]/gi, '').toUpperCase();
  updateGeneratedSongId();
  renderNewSongIdSuggestions();
});
$('#new-song-id-prefix').addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    const option = $('#new-song-id-suggestions [data-song-id-suggestion]');
    if (option) { event.preventDefault(); option.focus(); }
  } else if (event.key === 'Enter' && newSongIdQuery) {
    const suggestion = nextAvailableSongIds()[0];
    if (suggestion) { event.preventDefault(); acceptSongIdSuggestion(suggestion); }
  } else if (event.key === 'Escape') {
    $('#new-song-id-suggestions').innerHTML = '';
    event.target.setAttribute('aria-expanded', 'false');
  }
});
$('#new-song-id-suggestions').addEventListener('keydown', (event) => {
  const options = [...$('#new-song-id-suggestions').querySelectorAll('[data-song-id-suggestion]')];
  const index = options.indexOf(event.target.closest('[data-song-id-suggestion]'));
  if (event.key === 'ArrowDown' && index >= 0 && options[index + 1]) { event.preventDefault(); options[index + 1].focus(); }
  else if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); options[index - 1].focus(); }
  else if (event.key === 'ArrowUp' && index === 0) { event.preventDefault(); $('#new-song-id-prefix').focus(); }
});
$('#new-song-id-suggestions').addEventListener('click', (event) => {
  const option = event.target.closest('[data-song-id-suggestion]');
  if (option) acceptSongIdSuggestion(option.dataset.songIdSuggestion);
});
$('#new-song-type').addEventListener('change', updateNewSongIdPreview);
$('#new-song-language-options').addEventListener('change', updateNewSongIdPreview);
$('#new-song-key-options').addEventListener('change', updateNewSongKeySummary);
$('#new-song-tempo-points').addEventListener('click', (event) => handleTempoPointsClick(event, 'new-song-tempo-points'));
$('#edit-song-tempo-points').addEventListener('click', (event) => handleTempoPointsClick(event, 'edit-song-tempo-points'));
$('#new-song-task-statuses').addEventListener('change', (event) => {
  if (!event.target.matches('.new-song-task-status')) return;
  const color = STATUS_COLORS[event.target.value] || '#D0D0D0';
  event.target.dataset.status = event.target.value;
  event.target.style.color = color;
  event.target.style.borderColor = color;
});
$('#cancel-new-setlist').addEventListener('click', () => $('#setlist-create-dialog').close());
$('#new-setlist-copy').addEventListener('change', async (event) => {
  const setlistId = event.target.value;
  if (!setlistId) { state.newSetlistSongIds = []; renderNewSetlistSongChoices(); return; }
  try {
    const items = await loadSetlistItems(setlistId);
    state.newSetlistSongIds = items.filter((item) => item.item_type === 'song' && item.song_id).map((item) => item.song_id);
    const source = state.setlists.find((list) => list.id === setlistId);
    if (source && !$('#new-setlist-name').value.trim()) $('#new-setlist-name').value = `${source.name} (copy)`;
    renderNewSetlistSongChoices();
  } catch (error) { $('#new-setlist-error').textContent = error.message || 'Could not copy that setlist.'; }
});
$('#new-setlist-form').addEventListener('submit', saveNewSetlist);
$('#new-setlist-search').addEventListener('input', renderNewSetlistSongChoices);
$('#new-setlist-song-options').addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-new-setlist-song]');
  if (!checkbox) return;
  const songId = checkbox.dataset.newSetlistSong;
  state.newSetlistSongIds = checkbox.checked
    ? [...state.newSetlistSongIds.filter((id) => id !== songId), songId]
    : state.newSetlistSongIds.filter((id) => id !== songId);
  renderNewSetlistSongChoices();
});
$('#new-setlist-selected').addEventListener('click', (event) => {
  const moveButton = event.target.closest('[data-new-setlist-move]');
  const removeButton = event.target.closest('[data-new-setlist-remove]');
  if (removeButton) {
    state.newSetlistSongIds = state.newSetlistSongIds.filter((id) => id !== removeButton.dataset.newSetlistRemove);
    renderNewSetlistSongChoices();
  } else if (moveButton) {
    const index = state.newSetlistSongIds.indexOf(moveButton.dataset.newSetlistMove);
    const next = index + Number(moveButton.dataset.direction);
    if (index >= 0 && next >= 0 && next < state.newSetlistSongIds.length) {
      const ids = [...state.newSetlistSongIds];
      [ids[index], ids[next]] = [ids[next], ids[index]];
      state.newSetlistSongIds = ids;
      renderNewSetlistSongChoices();
    }
  }
});
$('#new-gig').addEventListener('click', () => openGigForm());
$('#gig-form').addEventListener('submit', saveGig);
$('#cancel-gig-edit').addEventListener('click', () => $('#gig-form').classList.add('hidden'));
// Delete a gig (e.g. cancelled). Its setlist is kept in Setlists.
$('#delete-gig').addEventListener('click', async () => {
  const id = $('#gig-id').value;
  const gig = state.gigs.find((item) => item.id === id);
  if (!gig || !state.member.is_admin) return;
  const setlist = state.setlists.find((item) => item.id === gig.setlist_id);
  if (!window.confirm(`Delete the gig "${gig.name}"?${setlist ? `\n\nIts setlist "${setlist.name}" stays in Setlists.` : ''}`)) return;
  const { error } = await db.from('gigs').delete().eq('id', id);
  if (error) return fail('Could not delete this gig.', error);
  $('#gig-form').classList.add('hidden');
  await loadData();
  renderGigs();
  if (state.view === 'dashboard') await renderDashboard();
  showNotice(`Deleted the gig "${gig.name}".${setlist ? ' Its setlist is still in Setlists.' : ''}`);
});
$('#gig-list').addEventListener('click', (event) => {
  const completeButton = event.target.closest('[data-complete-gig]');
  if (completeButton) {
    const gig = state.gigs.find((item) => item.id === completeButton.dataset.completeGig);
    if (gig) completeGig(gig);
    return;
  }
  const editButton = event.target.closest('[data-edit-gig]');
  if (editButton) {
    const gig = state.gigs.find((item) => item.id === editButton.dataset.editGig);
    if (gig) openGigForm(gig);
    return;
  }
  const setlistButton = event.target.closest('[data-open-gig-setlist]');
  if (setlistButton) {
    state.activeSetlist = setlistButton.dataset.openGigSetlist;
    renderSetlistOptions();
    setView('setlists');
  }
});
$('#songs-body').addEventListener('change', (event) => {
  if (event.target.matches('.backing-track-select')) saveBackingTrackStatus(event.target);
  else if (event.target.matches('.status-select')) saveStatus(event.target);
});
$('#songs-body').addEventListener('focusin', (event) => { if (event.target.matches('.backing-track-select')) labelAutoBackingOption(event.target, true); });
$('#songs-body').addEventListener('focusout', (event) => { if (event.target.matches('.backing-track-select')) labelAutoBackingOption(event.target, false); });
$('#songs-body').addEventListener('click', (event) => {
  const button = event.target.closest('.song-summary-toggle');
  if (button) toggleSongDetails(button.dataset.songId, 'songs');
});
$('#setlist-items').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.matches('.song-summary-toggle')) { toggleSongDetails(button.dataset.songId, 'setlists'); return; }
  if (button.matches('.remove-item')) removeSetlistItem(button.dataset.id);
  if (button.matches('.add-repertoire-song')) stageSongInSetlist(button.dataset.songId);
});
$('#setlist-items').addEventListener('change', (event) => {
  if (event.target.matches('.backing-track-select')) saveBackingTrackStatus(event.target);
  else if (event.target.matches('.status-select')) saveStatus(event.target);
});
$('#setlist-items').addEventListener('focusin', (event) => { if (event.target.matches('.backing-track-select')) labelAutoBackingOption(event.target, true); });
$('#setlist-items').addEventListener('focusout', (event) => { if (event.target.matches('.backing-track-select')) labelAutoBackingOption(event.target, false); });
$('#setlist-items').addEventListener('dragstart', (event) => {
  const row = event.target.closest('.setlist-row');
  if (!state.member.is_admin || !state.setlistEditMode || !row || savingSetlistOrder || !event.target.closest('.drag-handle, .setlist-row')) { event.preventDefault(); return; }
  draggedItemId = row.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedItemId);
  event.dataTransfer.setDragImage(row, Math.min(event.clientX - row.getBoundingClientRect().left, row.offsetWidth - 1), Math.min(event.clientY - row.getBoundingClientRect().top, row.offsetHeight - 1));
  row.classList.add('dragging');
});
$('#setlist-items').addEventListener('dragover', (event) => {
  if (!draggedItemId || savingSetlistOrder) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const target = event.target.closest('.setlist-row');
  document.querySelectorAll('.setlist-row.drop-before, .setlist-row.drop-after').forEach((row) => row.classList.remove('drop-before', 'drop-after'));
  if (target && target.dataset.id !== draggedItemId) {
    const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    target.classList.add(after ? 'drop-after' : 'drop-before');
  }
});
$('#setlist-items').addEventListener('drop', dropSetlistItem);
$('#setlist-items').addEventListener('dragend', () => {
  draggedItemId = null;
  document.querySelectorAll('.setlist-row.dragging, .setlist-row.drop-before, .setlist-row.drop-after').forEach((row) => row.classList.remove('dragging', 'drop-before', 'drop-after'));
});

document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
}));
document.addEventListener('click', (event) => {
  const form = $('#gig-form');
  if (form && !form.classList.contains('hidden') && !event.target.closest('#gig-form') && !event.target.closest('#new-gig,[data-edit-gig]')) form.classList.add('hidden');
});
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
}));
document.addEventListener('click', (event) => {
  const form = $('#gig-form');
  if (form && !form.classList.contains('hidden') && !event.target.closest('#gig-form') && !event.target.closest('#new-gig,[data-edit-gig]')) form.classList.add('hidden');
});
// Keep the app itself on the device (service worker) so it opens offline.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker not registered', error));
  window.addEventListener('load', () => setTimeout(async () => {
    try {
      // Make sure what this page is running right now is in the offline copy.
      const cache = await caches.open('tsp-app-shell-v1');
      const urls = new Set([new URL('./', location.href).href, new URL('index.html', location.href).href]);
      for (const entry of performance.getEntriesByType('resource')) {
        const u = new URL(entry.name);
        if ((u.origin === location.origin && !u.pathname.endsWith('sw.js')) || u.hostname === 'esm.sh') urls.add(u.href);
      }
      for (const el of document.querySelectorAll('script[src], link[rel=stylesheet][href], img[src], link[rel~=icon][href]')) urls.add(new URL(el.src || el.href, location.href).href);
      await Promise.all([...urls].map((u) => cache.match(u).then((hit) => hit || cache.add(u)).catch(() => {})));
    } catch { /* ignore */ }
  }, 3000));
}

db.auth.getSession().then(async ({ data, error }) => {
  if (error || !data.session) {
    if (recoveryCallbackActive) {
      showPasswordRecovery();
      $('#recovery-error').textContent = initialRecoveryError
        ? 'This reset link has expired or was already used. Request a new reset email to continue.'
        : 'The reset link could not be verified. Request a new reset email to continue.';
      return;
    }
    // Offline with an expired sign-in: open read-only from the saved copy.
    const cached = dataCacheGet();
    if ((!navigator.onLine || (error && isNetworkError(error))) && cached?.member && cached?.data) {
      state.member = cached.member;
      state.dashboardMemberId = cached.member.id;
      enterOfflineMode();
      try { await Promise.all([loadData(), loadReadiness()]); showWorkspace(); renderSongs(); return; } catch { /* fall through */ }
    }
    return showLogin();
  }
  try {
    await loadMember(data.session.user);
    if (recoveryCallbackActive || new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery') return showPasswordRecovery();
    if (state.member.must_change_password) return showFirstLoginPasswordSetup();
    await Promise.all([loadData(), loadReadiness()]);
    if (recoveryCallbackActive) return showPasswordRecovery();
    showWorkspace();
    renderSongs();
  } catch (loadError) {
    if (isNetworkError(loadError)) { showLogin(); $('#login-error').textContent = 'No connection, and nothing saved on this device yet. Open TSP Work once while online.'; return; }
    await db.auth.signOut(); showLogin(); $('#login-error').textContent = loadError.message || 'Could not open the band workspace.';
  }
});


// ---------------------------------------------------------------------------
// Ableton bridge (admin's Mac only). The TSPWork control surface inside Ableton
// listens on 127.0.0.1 and stays private to this Mac. Other signed-in devices
// share lyric edits through Supabase; this Mac applies them while the master set
// is open. Clicking a song/work title still controls only this local Live app.
// https (47711) is tried first: Safari won't let the live https site talk to
// plain http. The http port (47710) stays for Chrome and the local test copy.
const ABLETON_BRIDGE_URLS = ['https://127.0.0.1:47711', 'http://127.0.0.1:47710'];
const ABLETON_PRESENCE_KEY = 'ableton_bridge_presence';
const ABLETON_PRESENCE_TTL_MS = 45000;
const abletonBridge = { connected: false, timer: null, busy: false, started: false, base: null };
const abletonPresence = { available: false, awaitingSave: false, needsAttention: false, timer: null, lastHeartbeat: 0, lastSync: null };
const autoLyricsSync = { channel: null, timer: null, busy: false, started: false, rerun: false, lastErrorAt: 0, retryAfter: 0, session: null, lastFullAt: 0, forceFull: true, refusedRows: new Map(), refused: [] };

function abletonMainProjectOpen(status = abletonBridge.status) {
  return !!status?.ok && status.open_als_path === status.als_path
    && status.open_als_path === '/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als'
    && status.https === true;
}

function abletonBridgeEligible() {
  const isMac = /Mac/.test(navigator.platform || navigator.userAgent || '') && (navigator.maxTouchPoints || 0) < 2;
  return !!state.member?.is_admin && isMac;
}

// TSPWork 1.28+ runs a command only when it carries the signed-in admin's
// short-lived Supabase token, which TSPWork confirms with Supabase itself.
// Nothing long-lived is stored for this; the token comes from the live session.
const ABLETON_AUTH_ERRORS = { auth_required: 'TSPWork needs you to be signed in as the band admin.', not_admin: 'TSPWork only accepts commands from the band admin’s sign-in. Sign out and in again if this is your account.', auth_unreachable: 'TSPWork could not confirm your sign-in with Supabase (is this Mac online?).' };
async function abletonAuthToken(refresh = false) {
  try {
    const { data } = refresh ? await db.auth.refreshSession() : await db.auth.getSession();
    return data?.session?.access_token || null;
  } catch { return null; }
}
async function abletonRequest(path, body, timeoutMs) {
  if (!body) return abletonRequestRaw(path, body, timeoutMs);
  let result = await abletonRequestRaw(path, { ...body, _auth: await abletonAuthToken() }, timeoutMs);
  if (result && ['auth_required', 'not_admin'].includes(result.error)) {
    // The token may have just expired: refresh once and try again.
    result = await abletonRequestRaw(path, { ...body, _auth: await abletonAuthToken(true) }, timeoutMs);
  }
  if (result && ABLETON_AUTH_ERRORS[result.error]) result.message = ABLETON_AUTH_ERRORS[result.error];
  return result;
}
async function abletonRequestRaw(path, body, timeoutMs) {
  if (!body && !abletonBridge.base) {
    // Status probe with no known address yet: try each until one answers.
    let lastError;
    for (const base of ABLETON_BRIDGE_URLS) {
      try {
        const result = await abletonFetch(base, path, body, timeoutMs);
        abletonBridge.base = base;
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
  try {
    return await abletonFetch(abletonBridge.base || ABLETON_BRIDGE_URLS[0], path, body, timeoutMs);
  } catch (error) {
    if (!body) abletonBridge.base = null;
    throw error;
  }
}

async function abletonFetch(base, path, body, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || (body ? 9000 : 1500));
  try {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'text/plain' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal
    });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function setAbletonConnected(connected) {
  abletonBridge.connected = connected;
  const localMasterOpen = connected && abletonMainProjectOpen();
  const visible = localMasterOpen || abletonPresence.available;
  // Keep Live-control click targets local; the shared chip is informational.
  document.body.classList.toggle('ableton-connected', localMasterOpen);
  let chip = document.querySelector('#ableton-chip');
  if (!chip) {
    chip = document.createElement('span');
    chip.id = 'ableton-chip';
    chip.className = 'ableton-chip hidden';
    chip.title = 'The Ableton Master Project is open on Aaron’s Mac';
    chip.textContent = 'Ableton';
    $('#sign-out')?.before(chip);
  }
  chip.classList.toggle('hidden', !visible);
  chip.dataset.remote = localMasterOpen ? 'false' : 'true';
  chip.classList.toggle('needs-attention', abletonPresence.available && abletonPresence.needsAttention);
  const localAwaitingSave = localMasterOpen && abletonPresence.awaitingSave;
  chip.textContent = abletonPresence.needsAttention ? 'Ableton ·' : localAwaitingSave ? 'Ableton · Sync' : 'Ableton';
  chip.title = abletonPresence.needsAttention
    ? 'Ableton is open, but a lyric edit needs attention. The edit is still saved in Practice.'
    : localAwaitingSave ? 'Lyrics were applied to the open Live set in memory. Save the set manually in Live, then choose Sync Ableton Set to confirm it.'
    : localMasterOpen ? 'Ableton Master Project is open on this Mac. Click song/work names to control Live.'
      : abletonPresence.available ? 'Ableton Master Project is open on Aaron’s Mac.' : 'Ableton Master Project is not connected.';
  if (!connected) abletonBridge.status = null;
}

async function publishAbletonPresence(available) {
  if (!abletonBridgeEligible() || Date.now() - abletonPresence.lastHeartbeat < 18000) return;
  abletonPresence.lastHeartbeat = Date.now();
  abletonPresence.available = !!available;
  const value = {
    available: !!available,
    version: abletonBridge.status?.version || null,
    last_sync_at: abletonPresence.lastSync,
    needs_attention: abletonPresence.needsAttention,
    awaiting_manual_save: abletonPresence.awaitingSave
  };
  const { error } = await db.from('app_meta').upsert({ key: ABLETON_PRESENCE_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.warn('Ableton availability was not shared', error.message || error);
}

async function refreshSharedAbletonPresence() {
  if (!state.member?.id) return;
  try {
    const { data, error } = await db.from('app_meta').select('value,updated_at').eq('key', ABLETON_PRESENCE_KEY).maybeSingle();
    if (error) throw error;
    const fresh = data && Date.now() - Date.parse(data.updated_at) < ABLETON_PRESENCE_TTL_MS;
    abletonPresence.available = !!(fresh && data.value?.available === true);
    abletonPresence.awaitingSave = !!(fresh && data.value?.awaiting_manual_save === true);
    abletonPresence.needsAttention = !!(fresh && data.value?.needs_attention === true);
    abletonPresence.lastSync = fresh ? data.value?.last_sync_at || null : null;
    setAbletonConnected(abletonBridge.connected);
    if (state.view === 'sync') refreshSyncLyricsPendingBadge();
  } catch (error) { console.warn('Could not refresh shared Ableton availability', error?.message || error); }
}

function startSharedAbletonPresence() {
  if (abletonPresence.timer) return;
  refreshSharedAbletonPresence();
  abletonPresence.timer = setInterval(refreshSharedAbletonPresence, 12000);
  window.addEventListener('focus', refreshSharedAbletonPresence);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSharedAbletonPresence(); });
}

function scheduleAutoLyricsSync(delay = 700) {
  if (!autoLyricsSync.started || !abletonBridgeEligible() || Date.now() < autoLyricsSync.retryAfter) return;
  clearTimeout(autoLyricsSync.timer);
  autoLyricsSync.timer = setTimeout(() => {
    autoLyricsSync.timer = null;
    runAutoLyricsSync();
  }, delay);
}

function startAutoLyricsSync() {
  if (!abletonBridgeEligible() || autoLyricsSync.started) return;
  autoLyricsSync.started = true;
  autoLyricsSync.channel = db.channel('mac-auto-ableton-lyrics')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'song_lyrics_edits' }, () => scheduleAutoLyricsSync())
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') scheduleAutoLyricsSync(250);
    });
}

async function runAutoLyricsSync() {
  if (!abletonBridgeEligible()) return;
  if (autoLyricsSync.busy || sync.reading || abletonBridge.busy) {
    autoLyricsSync.rerun = true;
    return;
  }
  autoLyricsSync.busy = true;
  try {
    const status = await abletonRequest('/status', null, 1500);
    abletonBridge.status = status?.ok ? status : null;
    const masterOpen = abletonMainProjectOpen(status);
    await publishAbletonPresence(masterOpen);
    setAbletonConnected(!!status?.ok);
    if (!masterOpen) { autoLyricsSync.forceFull = true; return; } // re-check everything when the master set is back
    const pending = await pendingAbletonLyricsEdits();
    if (!pending.updates.length) {
      if (abletonPresence.needsAttention || abletonPresence.awaitingSave) {
        abletonPresence.needsAttention = false;
        abletonPresence.awaitingSave = false;
        abletonPresence.lastHeartbeat = 0;
        await publishAbletonPresence(true);
        setAbletonConnected(true);
      }
      return;
    }
    // A full check re-sends every queued edit (the bridge changes nothing when
    // Live already matches): when TSPWork was reloaded (Live or the set
    // reopened, so Live's memory may be back at the saved set), when this app
    // has just opened, and every two minutes. Otherwise only new work is sent.
    const session = status.session || null;
    const full = autoLyricsSync.forceFull || session !== autoLyricsSync.session
      || Date.now() - (autoLyricsSync.lastFullAt || 0) > 120000;
    for (const [key, held] of autoLyricsSync.refusedRows) {
      if (!pending.updates.some((row) => `${row.song_id}|${row.track_slug}` === key && row.updated_at === held.updated_at)) autoLyricsSync.refusedRows.delete(key);
    }
    const plan = lyricsRelayPlan(pending.updates, { full, refused: autoLyricsSync.refusedRows });
    let outcome = { applied: [], refused: [], busy: false };
    if (plan.send.length) {
      outcome = await relayLyricsRows(plan.send, (edits) => abletonRequest('/sync-lyrics', { edits }, SET_READ_TIMEOUT_MS));
      if (outcome.applied.length) await persistAppliedLyricsRelayState(outcome.applied);
      for (const item of outcome.refused) autoLyricsSync.refusedRows.set(`${item.song_id}|${item.track_slug}`, { updated_at: item.updated_at, until: Date.now() + 60000, error: item.error });
      for (const row of outcome.applied) autoLyricsSync.refusedRows.delete(`${row.song_id}|${row.track_slug}`);
      await persistRefusedLyricsRelayState(outcome.refused, pending.updates);
    }
    if (outcome.busy) { autoLyricsSync.rerun = true; autoLyricsSync.rerunDelay = 3000; } // Live was busy (a jump or a set read): try again shortly
    else if (full) { autoLyricsSync.session = session; autoLyricsSync.lastFullAt = Date.now(); autoLyricsSync.forceFull = false; }
    const problems = [...(pending.problems || []), ...[...autoLyricsSync.refusedRows].map(([key, held]) => ({ song_id: key.split('|')[0], track_slug: key.split('|')[1], error: held.error }))];
    autoLyricsSync.refused = problems;
    // The queued DB rows are the durable pending marker. This also restores
    // the warning after the Mac app or browser restarts.
    abletonPresence.awaitingSave = pending.updates.some((row) => !autoLyricsSync.refusedRows.has(`${row.song_id}|${row.track_slug}`));
    abletonPresence.needsAttention = problems.some((item) => !lyricsRelayIsMismatch(item.error));
    loadLyricConflicts();
    abletonPresence.lastHeartbeat = 0;
    setAbletonConnected(true);
    await publishAbletonPresence(true);
    refreshSyncLyricsPendingBadge();
  } catch (error) {
    abletonPresence.needsAttention = true;
    abletonPresence.lastHeartbeat = 0;
    autoLyricsSync.retryAfter = Date.now() + 15000; // connection or bridge trouble: try again soon
    publishAbletonPresence(abletonMainProjectOpen());
    if (Date.now() - autoLyricsSync.lastErrorAt > 30000) {
      autoLyricsSync.lastErrorAt = Date.now();
      console.warn('Automatic Ableton lyrics sync failed; the shared edit was kept for retry.', error?.message || error);
    }
  } finally {
    autoLyricsSync.busy = false;
    if (autoLyricsSync.rerun) {
      autoLyricsSync.rerun = false;
      scheduleAutoLyricsSync(autoLyricsSync.rerunDelay || 250);
      autoLyricsSync.rerunDelay = 0;
    }
  }
}
async function probeAbletonBridge() {
  if (!abletonBridgeEligible()) return setAbletonConnected(false);
  try {
    const status = await abletonRequest('/status');
    abletonBridge.status = status?.ok ? status : null;
    if (status?.version) abletonBridge.version = status.version; // kept even if a later probe misses
    setAbletonConnected(!!status?.ok);
    const masterOpen = abletonMainProjectOpen(status);
    abletonPresence.lastHeartbeat = 0;
    await publishAbletonPresence(masterOpen);
    setAbletonConnected(!!status?.ok);
    if (masterOpen) scheduleAutoLyricsSync(250);
    if (status?.exporting && !exportJob.timer) { exportJob.state = status.exporting; exportJob.timer = setInterval(pollExport, 4000); }
    if (state.view === 'sync') {
      const remote = !!status?.reading_since;
      if (remote !== !!abletonBridge.wasRemoteReading) { abletonBridge.wasRemoteReading = remote; renderSyncPage(); }
      else { renderSyncStatus(); renderExportPanel(); }
    }
  } catch {
    abletonBridge.status = null;
    autoLyricsSync.forceFull = true; // Live or TSPWork went away: re-check everything when it is back
    setAbletonConnected(false);
    abletonPresence.lastHeartbeat = 0;
    publishAbletonPresence(false);
  }
}

function startAbletonBridge() {
  if (!abletonBridgeEligible()) return;
  startAutoLyricsSync();
  probeAbletonBridge();
  if (abletonBridge.started) return;
  abletonBridge.started = true;
  abletonBridge.timer = setInterval(probeAbletonBridge, 15000);
  window.addEventListener('focus', probeAbletonBridge);
}

const ABLETON_ERRORS = {
  song_not_found: 'That song has no Song ID clip in the open Ableton set.',
  track_not_found: 'That track was not found in the open Ableton set.',
  busy: 'Ableton is still finishing the last jump.',
  timeout: 'Ableton did not respond in time.',
  not_front: 'Ableton could not come to the front. The region is not selected.',
  no_select_loop: 'Ableton\'s Edit › Select Loop command was not found.',
  no_zoom_item: 'Selected in Ableton, but the zoom command was not found. Press Z.',
  zoom_disabled: 'Selected in Ableton, but zoom was unavailable. Press Z.'
};

async function sendAbletonCommand(path, body) {
  if (abletonBridge.busy) return;
  abletonBridge.busy = true;
  try {
    const result = await abletonRequest(path, body);
    if (result?.review) showReviewBar(result.review, result);
    if (result?.ok) return result;
    const error = String(result?.error || '');
    if (error === 'accessibility_needed') {
      showNotice('TSP Work needs Accessibility access for Ableton Live to select and zoom (System Settings › Privacy & Security › Accessibility). Your loop brace was left unchanged.', true);
    } else {
      showNotice(ABLETON_ERRORS[error] || `Ableton: ${error || 'unknown error'}`, true);
    }
  } catch {
    setAbletonConnected(false);
    showNotice('Lost the connection to Ableton. Is the TSPWork control surface on?', true);
  } finally {
    abletonBridge.busy = false;
  }
}

document.addEventListener('click', (event) => {
  if (!abletonBridge.connected || event.target.closest('select, input, option')) return;
  const workLabel = event.target.closest('.task-detail .task-label, .dashboard-task-row > span:first-child, .dashboard-member-task-row > span:first-child');
  if (workLabel) {
    const select = workLabel.parentElement?.querySelector('.status-select');
    if (!select?.dataset.song || !select.dataset.task) return;
    event.preventDefault(); // keep the label from opening the status menu
    sendAbletonCommand('/select', { song_id: select.dataset.song, task_key: select.dataset.task, review: true });
    return;
  }
  const title = event.target.closest('.song-summary-toggle, .dashboard-open-song');
  // Songs-page title clicks only expand/collapse their details; they should not
  // start an Ableton review session or display its transport bar.
  if (title?.matches('.song-summary-toggle[data-view="songs"]')) return;
  // Clicking a song title no longer moves Ableton (Aaron, 12 Nov 2026): it only
  // opens the song in the app. Review clicks on work titles are unchanged.
}, true);

// ---------------------------------------------------------------------------
// Review bar: appears after clicking a work title while Ableton is connected.
// The playhead sits on the task track's first clip in the song (Space plays);
// listening tasks are soloed until the review ends; text tasks open AbleSet's
// floating window on the matching lyrics track.
const review = { state: null, timer: null, label: '', sending: false };

function reviewTaskLabel(songId, taskKey) {
  const song = state.songs.find((item) => item.id === songId);
  const type = state.taskTypes.find((item) => item.key === taskKey);
  const label = taskKey === 'song' ? 'Song' : taskKey === 'mixed_backing' ? 'Mixed Backing' : (type?.label || taskKey);
  return { song, label };
}

function renderReviewBar() {
  let bar = $('#review-bar');
  const rv = review.state;
  if (!rv?.active || state.view === 'practice') { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'review-bar';
    bar.className = 'review-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Review in Ableton');
    document.body.append(bar);
  }
  const { song, label } = reviewTaskLabel(rv.song_id, rv.task_key);
  const task = state.tasks.find((item) => item.song_id === rv.song_id && item.task_key === rv.task_key);
  const type = state.taskTypes.find((item) => item.key === rv.task_key);
  const canComplete = task && type && task.status !== 'Completed' && task.status !== 'No' && (type.allowed_statuses || []).includes('Completed');
  const songMode = rv.task_key === 'song';
  const unit = songMode ? 'Section' : 'Clip';
  const clipText = rv.clips ? `${unit} ${rv.clip || '–'} / ${rv.clips}` : (songMode ? 'No sections marked' : 'No clips on this track');
  const lyricsText = review.lyrics ? ` · Lyrics: ${escapeHtml(review.lyrics)}` : '';
  bar.innerHTML = `<div class="review-what"><span class="song-id">${escapeHtml(rv.song_id)}</span> <b>${escapeHtml(label)}</b><span class="muted"> · ${escapeHtml(song?.name || '')}</span><small>${clipText}${task ? ` · ${escapeHtml(task.status)}` : ''}${lyricsText}</small></div>
    <div class="review-controls">
      <button type="button" data-review="prev" title="Previous ${unit.toLowerCase()}">⏮</button>
      <button type="button" data-review="back2" title="Back 2 bars">−2 bars</button>
      <button type="button" class="review-play" data-review="toggle" title="Play / stop (Space)">${rv.playing ? '⏸' : '▶'}</button>
      <button type="button" data-review="next" title="Next ${unit.toLowerCase()}">⏭</button>
      <button type="button" data-review="loop" class="${rv.loop ? 'on' : ''}" aria-pressed="${!!rv.loop}" title="Loop the ${unit.toLowerCase()} under the playhead">Loop ${unit.toLowerCase()}</button>
      ${songMode ? '' : `<button type="button" data-review="solo" class="${rv.solo ? 'on' : ''}" aria-pressed="${!!rv.solo}" title="Solo this track while reviewing">Solo</button>`}
      ${canComplete ? '<button type="button" class="review-complete" data-review-complete title="Mark this task Completed in TSP Work">Complete</button>' : ''}
      <button type="button" data-review="end" class="review-end" title="End review: un-solo and restore the loop">End</button>
    </div>`;
}

function showReviewBar(reviewState, result) {
  review.state = reviewState;
  review.lyrics = result?.lyrics || null;
  renderReviewBar();
  clearInterval(review.timer);
  if (reviewState?.active) review.timer = setInterval(pollReview, 1000);
}

function hideReviewBar() {
  clearInterval(review.timer);
  review.timer = null;
  review.state = null;
  renderReviewBar();
}

async function pollReview() {
  if (document.hidden || review.sending || !abletonBridge.connected) return;
  try {
    const result = await abletonRequest('/transport', { action: 'state' }, 1500);
    if (!result?.ok || !result.active) { hideReviewBar(); return; }
    const changed = ['playing', 'clip', 'solo', 'loop', 'clips'].some((key) => result[key] !== review.state?.[key]);
    review.state = result;
    if (changed) renderReviewBar();
  } catch { /* the badge probe reports lost connections */ }
}

async function reviewAction(action) {
  if (review.sending) return;
  review.sending = true;
  try {
    const result = await abletonRequest('/transport', { action }, 4000);
    if (!result?.ok) { showNotice(ABLETON_ERRORS[result?.error] || `Ableton: ${result?.error || 'no response'}`, true); return; }
    if (action === 'end' || !result.active) hideReviewBar(); else { review.state = result; renderReviewBar(); }
  } catch {
    showNotice('Lost the connection to Ableton. Is the TSPWork control surface on?', true);
  } finally {
    review.sending = false;
  }
}

async function reviewComplete() {
  const rv = review.state;
  if (!rv) return;
  const { error } = await db.from('song_tasks').update({ status: 'Completed' }).eq('song_id', rv.song_id).eq('task_key', rv.task_key);
  if (error) { fail(`Could not update ${rv.song_id}.`, error); return; }
  const task = state.tasks.find((item) => item.song_id === rv.song_id && item.task_key === rv.task_key);
  if (task) task.status = 'Completed';
  showNotice(`${rv.song_id} ${reviewTaskLabel(rv.song_id, rv.task_key).label} marked Completed.`);
  renderReviewBar();
  await loadReadiness();
  renderSongs();
  if (state.view === 'setlists') await renderActiveSetlist();
  if (state.view === 'dashboard') await renderDashboard();
  if (state.view === 'sync') renderSyncPage();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('#review-bar [data-review]');
  if (button) { reviewAction(button.dataset.review); return; }
  if (event.target.closest('#review-bar [data-review-complete]')) reviewComplete();
});

// Space in TSP Work plays/stops Ableton whenever Ableton is connected (not
// while typing). Captured so a focused button (e.g. the song title you just
// clicked) isn't pressed again by the Space key.
function spaceForAbleton(event) {
  if (state.view === 'practice') return false; // the Practice page's own transport takes Space
  if (!abletonBridge.connected || event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey) return false;
  return !event.target.closest?.('input, textarea, select, [contenteditable="true"]');
}
document.addEventListener('keydown', (event) => {
  if (!spaceForAbleton(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) reviewAction('toggle');
}, true);
document.addEventListener('keyup', (event) => {
  if (spaceForAbleton(event)) { event.preventDefault(); event.stopPropagation(); }
}, true);


// Use a logo file for the Sync tab if one has been added to assets/.
function loadSyncLogo() {
  if (loadSyncLogo.done) return;
  loadSyncLogo.done = true;
  const tryNext = (names) => {
    if (!names.length) return;
    const url = `assets/${names[0]}`;
    const img = new Image();
    img.onload = () => {
      document.documentElement.style.setProperty('--sync-logo-url', `url("${url}")`);
      document.body.classList.add('has-sync-logo');
    };
    img.onerror = () => tryNext(names.slice(1));
    img.src = url;
  };
  tryNext(['ableton-sync-logo.png']);
}

// ---------------------------------------------------------------------------
// Ableton Sync page (admin only). TSPWork reads the SAVED .als and returns a
// snapshot; the rules below (ported from tsp_ableton_sync.py) turn it into
// suggested task updates and song-detail changes that the admin confirms.
const SYNC_AUTO_TASKS = {
  sections: ['sections', 'Completed'], chords: ['chords', 'Completed'], lyrics: ['lyrics', 'Completed'],
  drums: ['drums', 'Completed'], guitar: ['guitar', 'Completed'], keyboard: ['keyboard', 'Completed'],
  prompts: ['prompts', 'Completed'], song_cue: ['song_cue', 'Completed'], backup_que: ['backup_que', 'Completed'],
  guitar_tone_midi: ['tone', 'Finished']
};
const SYNC_MIXED_STEMS = {
  backing_music: ['mx_music', 'MUSIC'], backing_vocals_dale: ['mx_bgv', 'BACKING VOCALS'],
  backing_vocals_anston: ['mx_bgv', 'BACKING VOCALS'], backing_percussion: ['mx_perc', 'PERCUSSION'], backing_sfx: ['mx_sfx', 'SFX']
};
const SYNC_AUTO_FIELDS = ['duration_seconds', 'tempo', 'keys'];
const SYNC_FIELD_LABELS = { name: 'Name', duration_seconds: 'Duration', tempo: 'Tempo', keys: 'Key' };
const sync = { snapshot: null, readAt: null, reading: false, writebackRows: null, applying: new Set(), snoozes: new Map(), snoozesLoaded: false, showSnoozed: false, dismissed: new Set() };

// Snooze: hide a task update until the clips on that song's track change.
// The fingerprint is a hash of those clips from the .als (TSPWork 1.9+).
function syncFingerprint(songId, taskKey) {
  const fp = sync.snapshot?.songs?.[songId]?.fingerprints;
  if (!fp) return null;
  if (taskKey === 'backing_track_manual') return ['mx_music', 'mx_bgv', 'mx_perc', 'mx_sfx'].map((key) => fp[key] || '').join('.');
  const evidenceKey = SYNC_AUTO_TASKS[taskKey]?.[0];
  if (!evidenceKey || !fp[evidenceKey]) return null;
  // Guitar/Keyboard Notes also come back when the Chords track changes.
  return ['guitar', 'keyboard'].includes(evidenceKey) ? `${fp[evidenceKey]}.${fp.chords || ''}` : fp[evidenceKey];
}

// Chord mismatches: the Chords track vs the Guitar + / Keyboard + tracks,
// compared as chord sequences by TSPWork (1.10+). "Allow" marks one as intended;
// it stays hidden while that exact difference is still there.
const SYNC_CHORD_TRACKS = { guitar: 'Guitar', keyboard: 'Keyboard' };

function syncHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function syncChordMismatches() {
  const out = [];
  for (const [songId, data] of Object.entries(sync.snapshot?.songs || {})) {
    const song = state.songs.find((item) => item.id === songId);
    if (!song) continue;
    const seen = new Map();
    for (const m of data.chord_mismatches || []) {
      const base = `chords:${m.track}:${syncHash(`${m.kind}|${m.chords}|${m.player}`)}`;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      const taskKey = n > 1 ? `${base}#${n}` : base;
      out.push({ ...m, songId, songName: song.name, taskKey, allowed: sync.snoozes.get(`${songId}:${taskKey}`) === 'allowed' });
    }
  }
  return out;
}

function syncChordText(value) {
  const chords = String(value || '').split(' ').filter(Boolean);
  if (!chords.length) return '—';
  return chords.length > 12 ? `${chords.slice(0, 12).join(' ')} … (+${chords.length - 12})` : chords.join(' ');
}

function syncChordDescription(m) {
  const who = SYNC_CHORD_TRACKS[m.track] || m.track;
  if (m.kind === 'missing') return `Chords has <b>${escapeHtml(syncChordText(m.chords))}</b>; ${who} track doesn't`;
  if (m.kind === 'extra') return `${who} track has <b>${escapeHtml(syncChordText(m.player))}</b>; Chords doesn't`;
  return `Chords <b>${escapeHtml(syncChordText(m.chords))}</b> · ${who} <b>${escapeHtml(syncChordText(m.player))}</b>`;
}

async function setChordAllowed(songId, taskKey, allowed) {
  const request = allowed
    ? db.from('ableton_sync_snoozes').upsert({ song_id: songId, task_key: taskKey, fingerprint: 'allowed', snoozed_at: new Date().toISOString() })
    : db.from('ableton_sync_snoozes').delete().eq('song_id', songId).eq('task_key', taskKey);
  const { error } = await request;
  if (error) { fail(`Could not save: ${error.message}`, error); return; }
  if (allowed) sync.snoozes.set(`${songId}:${taskKey}`, 'allowed'); else sync.snoozes.delete(`${songId}:${taskKey}`);
  renderSyncPage();
}

async function loadSyncSnoozes() {
  const { data, error } = await db.from('ableton_sync_snoozes').select('song_id, task_key, fingerprint');
  if (error) throw error;
  sync.snoozes = new Map((data || []).map((row) => [`${row.song_id}:${row.task_key}`, row.fingerprint]));
  sync.snoozesLoaded = true;
}

function syncIsSnoozed(item) {
  const saved = sync.snoozes.get(`${item.songId}:${item.taskKey}`);
  return !!saved && saved === syncFingerprint(item.songId, item.taskKey);
}

async function snoozeSyncTask(item) {
  const fingerprint = syncFingerprint(item.songId, item.taskKey);
  if (!fingerprint) { showNotice('Press Sync Ableton Set again (TSPWork 1.10.1 or later is needed for Snooze).', true); return; }
  const { error } = await db.from('ableton_sync_snoozes').upsert({ song_id: item.songId, task_key: item.taskKey, fingerprint, snoozed_at: new Date().toISOString() });
  if (error) { fail(`Could not snooze: ${error.message}`, error); return; }
  sync.snoozes.set(`${item.songId}:${item.taskKey}`, fingerprint);
  showNotice(`Snoozed ${item.songId} ${item.label}. It comes back when that track changes in Ableton.`);
  renderSyncPage();
}

async function unsnoozeSyncTask(songId, taskKey) {
  const { error } = await db.from('ableton_sync_snoozes').delete().eq('song_id', songId).eq('task_key', taskKey);
  if (error) { fail(`Could not unsnooze: ${error.message}`, error); return; }
  sync.snoozes.delete(`${songId}:${taskKey}`);
  renderSyncPage();
}

function syncLetters(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function syncAppCase(locator, appName) {
  const known = new Map((String(appName || '').match(/[\w'’-]+/g) || []).map((word) => [word.toLowerCase(), word]));
  return String(locator).trim().replace(/[\w'’-]+/g, (word) => known.get(word.toLowerCase())
    || word.split('-').map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()).join('-'));
}

function syncNormSegments(segments) {
  const keep = ['bpm', 'transition_to_next', 'change_start_bar', 'change_end_bar', 'change_start_beat', 'change_end_beat'];
  return JSON.stringify((segments || []).map((point) => Object.fromEntries(keep.filter((key) => point[key] !== null && point[key] !== undefined).map((key) => [key, point[key]]))));
}

function syncTempoLabel(segments) {
  return (segments || []).map((point) => {
    if (!point.transition_to_next) return String(point.bpm);
    const kind = point.transition_to_next === 'instant' ? 'jump' : 'ramp';
    const bars = point.change_start_bar === point.change_end_bar ? `${point.change_start_bar}` : `${point.change_start_bar}–${point.change_end_bar}`;
    return `${point.bpm} (${kind} bar ${bars})`;
  }).join(' → ');
}

function syncValueLabel(field, value) {
  if (field === 'duration_seconds') return secondsLabel(value);
  if (field === 'tempo') return syncTempoLabel(value);
  if (field === 'keys') return (value || []).join(', ') || '—';
  return value ?? '—';
}

function computeSyncDiff(snapshot) {
  const tasks = [];
  const meta = [];
  const notices = [];
  const allowed = new Map(state.taskTypes.map((type) => [type.key, new Set(type.allowed_statuses)]));
  const labels = new Map(state.taskTypes.map((type) => [type.key, type.label]));
  const status = new Map();
  for (const row of state.tasks) {
    if (!status.has(row.song_id)) status.set(row.song_id, new Map());
    status.get(row.song_id).set(row.task_key, row.status);
  }
  for (const song of state.songs) {
    if (!snapshot.songs[song.id]) notices.push(`${song.id} ${song.name} is in TSP Work but has no SONG ID clip in Ableton.`);
  }
  for (const [songId, data] of Object.entries(snapshot.songs)) {
    const song = state.songs.find((item) => item.id === songId);
    if (!song) { notices.push(`${songId} (${data.locator || 'no locator'}) is in Ableton but not in TSP Work. Add it in Songs first.`); continue; }
    const st = status.get(songId) || new Map();
    const evidence = data.evidence || {};
    for (const [taskKey, [evidenceKey, target]] of Object.entries(SYNC_AUTO_TASKS)) {
      const current = st.get(taskKey);
      if (!current || current === 'No' || !allowed.get(taskKey)?.has(target)) continue;
      const doneLike = target === 'Finished' ? ['Completed', 'Finished'] : ['Completed'];
      if (evidence[evidenceKey] && !doneLike.includes(current)) {
        tasks.push({ songId, songName: song.name, taskKey, label: labels.get(taskKey) || taskKey, from: current, to: target });
      } else if (!evidence[evidenceKey] && current === 'Completed' && taskKey !== 'guitar_tone_midi') {
        notices.push(`${songId} ${song.name}: ${labels.get(taskKey) || taskKey} is Completed in TSP Work, but Ableton has no matching clips.`);
      }
    }
    const needed = Object.keys(SYNC_MIXED_STEMS).filter((key) => st.has(key) && st.get(key) !== 'No');
    const stemsOk = needed.length > 0 && needed.every((key) => evidence[SYNC_MIXED_STEMS[key][0]]);
    if (song.backing_track_manual !== 'Mixed' && stemsOk) {
      tasks.push({ songId, songName: song.name, taskKey: 'backing_track_manual', label: 'Backing Track', from: song.backing_track_manual || 'Auto', to: 'Mixed' });
    } else if (song.backing_track_manual === 'Mixed' && !stemsOk) {
      const missing = [...new Set(needed.filter((key) => !evidence[SYNC_MIXED_STEMS[key][0]]).map((key) => SYNC_MIXED_STEMS[key][1]))];
      notices.push(`${songId} ${song.name} is Mixed in TSP Work, but MIXED BACKING has no ${missing.join(', ')} stem for it.`);
    }
    if (data.locator && syncLetters(data.locator) !== syncLetters(song.name)) {
      meta.push({ songId, songName: song.name, field: 'name', from: song.name, to: syncAppCase(data.locator, song.name), update: { name: syncAppCase(data.locator, song.name) } });
    }
    if (song.duration_seconds !== data.duration_seconds) {
      meta.push({ songId, songName: song.name, field: 'duration_seconds', from: song.duration_seconds, to: data.duration_seconds, update: { duration_seconds: data.duration_seconds } });
    }
    const tempoChanged = syncNormSegments(song.tempo_segments) !== syncNormSegments(data.tempo_segments)
      || song.tempo_start !== data.tempo_start || (song.tempo_end ?? null) !== (data.tempo_end ?? null) || song.tempo_change !== data.tempo_change;
    if (tempoChanged) {
      meta.push({ songId, songName: song.name, field: 'tempo', from: song.tempo_segments, to: data.tempo_segments,
        update: { tempo_segments: data.tempo_segments, tempo_start: data.tempo_start, tempo_end: data.tempo_end, tempo_change: data.tempo_change } });
    }
    // Keys come from the set: the [Key:] markers on the Chords track, with the
    // bar each one starts on.
    const keys = [...(song.keys || [])];
    const segs = Array.isArray(data.key_segments) ? data.key_segments : [];
    if (segs.length) {
      const next = [...new Set(segs.map((seg) => seg.key))];
      const segsJson = JSON.stringify(segs.map(({ key, bar, beat }) => [key, bar, beat]));
      const haveJson = JSON.stringify((song.key_segments || []).map(({ key, bar, beat }) => [key, bar, beat]));
      if (JSON.stringify(next) !== JSON.stringify(keys) || segsJson !== haveJson) {
        meta.push({ songId, songName: song.name, field: 'keys', from: keys, to: next, update: { keys: next, key_segments: segs } });
      }
    } else if (!data.start_key && evidence.chords) {
      notices.push(`${songId} ${song.name}: no [Key:] marker found on the Chords track.`);
    }
  }
  const snoozed = tasks.filter(syncIsSnoozed);
  return { tasks: tasks.filter((item) => !syncIsSnoozed(item)), meta, notices, snoozed };
}

function syncActionLabel(item) {
  if (item.to === 'Mixed') return 'Set Mixed';
  if (item.to === 'Finished') return 'Mark Finished';
  return 'Complete';
}

function renderSyncStatus() {
  const box = $('#sync-status');
  if (!box) return;
  const status = abletonBridge.status;
  const parts = [];
  if (!abletonBridge.connected || !status) {
    parts.push('Ableton is not connected. Open TSP Work on the Mac running Ableton, with TSPWork chosen as a Control Surface.');
  } else {
    parts.push(`Connected to Ableton (TSPWork ${escapeHtml(status.version || '')}).`);
    if (status.als_saved_at) parts.push(`Your set was last saved (⌘S) ${new Date(status.als_saved_at * 1000).toLocaleString()}.`);
  }
  if (sync.readAt) {
    const readOf = Date.parse(sync.snapshot?.als_modified_at || 0) / 1000;
    const stale = status?.als_saved_at && readOf && status.als_saved_at - readOf > 2;
    parts.push(`Last read ${sync.readAt.toLocaleTimeString()}${stale ? ' — <b>the set was saved again since; read again to see the changes</b>' : ' (up to date with the saved set)'}.`);
  }
  // A read TSPWork is doing for another window (or for this page before a reload).
  const elsewhere = !sync.reading && status?.reading_since;
  if (elsewhere) parts.push(`<b>TSPWork is already reading the set</b> (started ${new Date(status.reading_since * 1000).toLocaleTimeString()}, from another window or before the page reloaded). You can read again when it finishes.`);
  box.innerHTML = parts.join(' ');
  $('#sync-read').disabled = sync.reading || !!elsewhere;
  if (sync.reading || elsewhere) readProgressTick();
  else { $('#sync-read').textContent = 'Sync Ableton Set'; $('#sync-read').classList.remove('reading'); }
  // Check again soon so the button comes back as soon as that read ends.
  clearTimeout(renderSyncStatus.recheck);
  if (elsewhere && state.view === 'sync') renderSyncStatus.recheck = setTimeout(probeAbletonBridge, 2000);
}

let syncLyricsPendingChannel = null;
let syncLyricsPendingRequest = null;
async function refreshSyncLyricsPendingBadge() {
  loadLyricConflicts();
  const badge = $('#sync-lyrics-pending');
  if (!badge || state.view !== 'sync') return;
  if (syncLyricsPendingRequest) return syncLyricsPendingRequest;
  syncLyricsPendingRequest = (async () => {
    const { count, error } = await db.from('song_lyrics_edits').select('song_id,track_slug', { count: 'exact', head: true });
    if (state.view !== 'sync' || !badge.isConnected) return;
    if (error) {
      badge.textContent = 'Could not check Practice lyrics';
      badge.classList.add('error');
      badge.title = error.message || 'Could not read pending lyric edits';
      return;
    }
    const pending = Number(count || 0);
    badge.classList.remove('error');
    badge.classList.toggle('pending', pending > 0);
    badge.title = pending ? 'Saved Practice lyrics waiting to sync to Ableton' : '';
    badge.textContent = pending === 0 ? 'No Practice lyrics waiting to sync'
      : abletonPresence.awaitingSave
        ? `${pending} Practice lyric track${pending === 1 ? '' : 's'} applied in Live memory — save manually, then sync to confirm`
        : `${pending} Practice lyric track${pending === 1 ? '' : 's'} waiting to sync to Ableton`;
  })().catch((error) => {
    if (!badge.isConnected) return;
    badge.textContent = 'Could not check Practice lyrics';
    badge.classList.add('error');
    badge.title = error.message || 'Could not read pending lyric edits';
  }).finally(() => { syncLyricsPendingRequest = null; });
  return syncLyricsPendingRequest;
}
function watchSyncLyricsPendingBadge() {
  if (!syncLyricsPendingChannel) {
    syncLyricsPendingChannel = db.channel('sync-lyrics-pending-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'song_lyrics_edits' }, () => {
        if (state.view === 'sync') refreshSyncLyricsPendingBadge();
      }).subscribe();
  }
  refreshSyncLyricsPendingBadge();
}

function renderSyncPage() {
  watchSyncLyricsPendingBadge();
  renderSyncStatus();
  renderExportPanel();
  const content = $('#sync-content');
  if (sync.reading || abletonBridge.status?.reading_since) {
    content.innerHTML = `<div class="empty-state read-progress-card"><div id="read-progress-box"></div><p class="muted">You can use other pages meanwhile; the result shows here when it's done.</p></div>`;
    readProgressTick();
    return;
  }
  if (!sync.snapshot) {
    content.innerHTML = lyricMismatchSectionHtml() + '<div class="empty-state">Press <b>Sync Ableton Set</b> to read the set you last saved in Live and confirm any Practice lyric edits it contains. TSP Work never saves the set: save it yourself in Live first. Make sure Ableton has the main project open.</div>';
    return;
  }
  const { tasks, meta, notices, snoozed } = computeSyncDiff(sync.snapshot);
  const warnings = sync.snapshot.warnings || [];
  const busy = (key) => sync.applying.has(key) ? 'disabled' : '';
  const snoozedRows = snoozed.map((item) => `<li class="sync-row sync-snoozed"><button type="button" class="sync-song" data-sync-jump="${escapeHtml(item.songId)}" title="Jump to this song in Ableton"><span class="song-id">${escapeHtml(item.songId)}</span><span>${escapeHtml(item.songName)}</span></button><button type="button" class="sync-task" data-sync-select="${escapeHtml(item.songId)}" data-task="${escapeHtml(item.taskKey)}" title="Show this in Ableton">${escapeHtml(item.label)}</button><span class="sync-change">${escapeHtml(item.from)} → ${escapeHtml(item.to)}</span><button type="button" class="button quiet sync-apply" data-sync-unsnooze="${escapeHtml(`${item.songId}:${item.taskKey}`)}">Unsnooze</button></li>`).join('');
  const taskRows = tasks.map((item) => {
    const key = `t:${item.songId}:${item.taskKey}`;
    return `<li class="sync-row"><button type="button" class="sync-song" data-sync-jump="${escapeHtml(item.songId)}" title="Jump to this song in Ableton"><span class="song-id">${escapeHtml(item.songId)}</span><span>${escapeHtml(item.songName)}</span></button><button type="button" class="sync-task" data-sync-select="${escapeHtml(item.songId)}" data-task="${escapeHtml(item.taskKey)}" title="Show this in Ableton">${escapeHtml(item.label)}</button><span class="sync-change">${escapeHtml(item.from)} → <b>${escapeHtml(item.to)}</b></span><span class="sync-actions"><button type="button" class="button quiet sync-apply sync-snooze" data-sync-snooze="${escapeHtml(key)}" ${busy(key)} title="Hide until this track changes in Ableton">Snooze</button><button type="button" class="button sync-apply" data-sync-task="${escapeHtml(key)}" ${busy(key)}>${syncActionLabel(item)}</button></span></li>`;
  }).join('');
  const chordAll = syncChordMismatches();
  // Dismissed = fixed in Ableton; hidden until the next read of the set.
  const chordOpen = chordAll.filter((m) => !m.allowed && !sync.dismissed.has(`${m.songId}|${m.taskKey}`));
  const chordAllowed = chordAll.filter((m) => m.allowed);
  const chordRow = (m) => `<li class="sync-row sync-chord-row${m.allowed ? ' sync-snoozed' : ''}"><button type="button" class="sync-song" data-sync-jump="${escapeHtml(m.songId)}" title="Jump to this song in Ableton"><span class="song-id">${escapeHtml(m.songId)}</span><span>${escapeHtml(m.songName)}</span></button><button type="button" class="sync-task" data-sync-select="${escapeHtml(m.songId)}" data-task="${escapeHtml(m.track)}" data-from-beat="${Number(m.beat) || 0}" title="Show this bar on the ${SYNC_CHORD_TRACKS[m.track]} track in Ableton">Bar ${m.song_bar} <span class="muted">(${m.bar})</span></button><span class="sync-change">${syncChordDescription(m)}</span>${m.allowed ? '' : `<span class="sync-actions"><button type="button" class="button quiet sync-apply" data-sync-dismiss="${escapeHtml(`${m.songId}|${m.taskKey}`)}" title="Fixed it in Ableton: hide until the next Sync Ableton Set">Dismiss</button>`}<button type="button" class="button quiet sync-apply" data-sync-chord="${escapeHtml(`${m.songId}|${m.taskKey}`)}" data-allow="${m.allowed ? '0' : '1'}" title="${m.allowed ? 'Show this again' : 'This difference is intended; stop showing it'}">${m.allowed ? 'Undo' : 'Allow'}</button>${m.allowed ? '' : '</span>'}</li>`;
  const metaRows = meta.map((item) => {
    const key = `m:${item.songId}:${item.field}`;
    return `<li class="sync-row"><button type="button" class="sync-song" data-sync-jump="${escapeHtml(item.songId)}" title="Jump to this song in Ableton"><span class="song-id">${escapeHtml(item.songId)}</span><span>${escapeHtml(item.songName)}</span></button><span class="sync-field">${SYNC_FIELD_LABELS[item.field]}</span><span class="sync-change"><s>${escapeHtml(String(syncValueLabel(item.field, item.from)))}</s> → <b>${escapeHtml(String(syncValueLabel(item.field, item.to)))}</b></span><button type="button" class="button sync-apply" data-sync-meta="${escapeHtml(key)}" ${busy(key)}>Apply</button></li>`;
  }).join('');
  content.innerHTML = `
    ${lyricMismatchSectionHtml()}
    <section class="sync-card"><header><h2>Task updates <span>${tasks.length}</span></h2>${tasks.length ? '<button type="button" class="button" data-sync-all="tasks">Complete all</button>' : ''}</header>
      <p class="muted">Work Ableton shows as done. Click the task to see it in Ableton, then confirm.</p>
      ${tasks.length ? `<ul class="sync-list">${taskRows}</ul>` : '<p class="sync-empty">Nothing to update.</p>'}
      ${snoozed.length ? `<button type="button" class="sync-snoozed-toggle" data-sync-toggle-snoozed aria-expanded="${sync.showSnoozed}">${sync.showSnoozed ? 'Hide' : 'Show'} ${snoozed.length} snoozed</button>${sync.showSnoozed ? `<ul class="sync-list">${snoozedRows}</ul>` : ''}` : ''}</section>
    <section class="sync-card"><header><h2>Chord mismatches <span>${chordOpen.length}</span></h2></header>
      <p class="muted">Chords that differ between the Chords track and the Guitar + or Keyboard + track. Bar is the bar within the song; Ableton's bar is in brackets. Click it to see it in Ableton. Fixed it? Press Dismiss (it stays hidden until the next read). Intended? Press Allow.
      ${!sync.snapshot.songs || Object.values(sync.snapshot.songs).some((d) => d.chord_mismatches) ? (chordOpen.length ? `<ul class="sync-list">${chordOpen.map(chordRow).join('')}</ul>` : '<p class="sync-empty">Guitar and Keyboard chords match the Chords track.</p>') : '<p class="sync-empty">Press Sync Ableton Set again (TSPWork 1.10.1 or later is needed to check chords).</p>'}
      ${chordAllowed.length ? `<button type="button" class="sync-snoozed-toggle" data-sync-toggle-allowed aria-expanded="${!!sync.showAllowed}">${sync.showAllowed ? 'Hide' : 'Show'} ${chordAllowed.length} allowed</button>${sync.showAllowed ? `<ul class="sync-list">${chordAllowed.map(chordRow).join('')}</ul>` : ''}` : ''}</section>
    <section class="sync-card"><header><h2>Song details <span>${meta.length}</span></h2>${meta.length ? '<button type="button" class="button" data-sync-all="meta">Apply all</button>' : ''}</header>
      <p class="muted">Name and starting key read from Ableton. Duration and tempo are updated automatically on every read. Ableton's spelling wins; TSP Work keeps Title Case.</p>
      ${meta.length ? `<ul class="sync-list">${metaRows}</ul>` : '<p class="sync-empty">Everything matches.</p>'}</section>
    ${(() => {
      const mism = syncAudioMismatches();
      return `<section class="sync-card"><header><h2>Practice audio length <span>${mism.length}</span></h2></header>
      <p class="muted">Uploaded Mixdowns compared with the song length in this read. A difference means the song changed after it was exported: export it again and re-upload, or the Practice lyrics will drift.${sync.lyricsSaved ? ` Lyrics for ${sync.lyricsSaved} songs were saved for Practice.` : ''}</p>
      ${mism.length ? `<ul class="sync-notes">${mism.map((m) => `<li><b>${escapeHtml(m.songId)}</b> ${escapeHtml(m.name)}: audio ${practiceTime(m.audio)}, set ${practiceTime(m.set)} (${m.diff > 0 ? '+' : ''}${m.diff.toFixed(1)} s)</li>`).join('')}</ul>` : `<p class="sync-empty">${sync.audioLengths?.size ? 'Every uploaded Mixdown matches the set.' : 'No practice audio uploaded yet.'}</p>`}</section>`;
    })()}
    <section class="sync-card"><header><h2>Ableton housekeeping <span>${warnings.length}</span></h2></header>
      <p class="muted">Things to tidy in the Ableton set. Nothing here changes TSP Work.</p>
      ${warnings.length ? `<ul class="sync-notes">${warnings.map((w) => `<li>${escapeHtml(w.msg)}</li>`).join('')}</ul>` : '<p class="sync-empty">No issues found.</p>'}</section>
    <section class="sync-card"><header><h2>Check in TSP Work <span>${notices.length}</span></h2></header>
      <p class="muted">TSP Work and Ableton disagree, but the sync never lowers a status. Review these by hand.</p>
      ${notices.length ? `<ul class="sync-notes">${notices.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '<p class="sync-empty">Nothing to check.</p>'}</section>`;
}

// Practice audio vs the set: a Mixdown whose length differs from the song in
// the last read means the audio is out of date (lyrics would drift).
async function loadSyncAudioLengths() {
  // MP3 Mixdowns are 320 kbps CBR, so their length follows from their size;
  // AAC (.m4a) ones are measured from the file itself (a few at a time, and
  // remembered per file version so later reads skip them).
  const { data, error } = await db.functions.invoke('practice-audio', { body: { action: 'list' } });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || 'list failed');
  const lengths = new Map();
  const todo = [];
  for (const [songId, files] of Object.entries(data.songs || {})) {
    const mix = files.find((f) => f.element === 'Mixdown');
    if (!mix?.bytes) continue;
    if (mix.ext !== 'm4a') { lengths.set(songId, { song_id: songId, duration_seconds: Math.round(mix.bytes * 8 / 320000 * 10) / 10 }); continue; }
    const cacheKey = `tsp-len-${songId}-${mix.modified}`;
    let duration = null;
    try { duration = Number(localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey)) || null; } catch { /* ignore */ }
    if (duration) lengths.set(songId, { song_id: songId, duration_seconds: duration });
    else todo.push({ songId, cacheKey });
  }
  const measure = async ({ songId, cacheKey }) => {
    try {
      const { data: links } = await db.functions.invoke('practice-audio', { body: { action: 'urls', song_id: songId } });
      const url = links?.tracks?.find((t) => t.element === 'Mixdown')?.url;
      const duration = url ? await audioUrlDuration(url) : null;
      if (duration) {
        try { localStorage.setItem(cacheKey, String(duration)); } catch { /* ignore */ }
        lengths.set(songId, { song_id: songId, duration_seconds: duration });
      }
    } catch { /* skip */ }
  };
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(measure));
  sync.audioLengths = lengths;
}

function audioUrlDuration(url) {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    const done = (value) => { if (settled) return; settled = true; audio.removeAttribute('src'); resolve(value); };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 10) / 10 : null);
    audio.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
    audio.src = url;
  });
}

function syncAudioMismatches() {
  const out = [];
  if (!sync.snapshot || !sync.audioLengths) return out;
  for (const [songId, row] of sync.audioLengths) {
    const data = sync.snapshot.songs[songId];
    if (!data || row.duration_seconds == null) continue;
    const diff = Number(row.duration_seconds) - data.duration_seconds;
    if (Math.abs(diff) > 1.5) out.push({ songId, name: state.songs.find((song) => song.id === songId)?.name || '', audio: Number(row.duration_seconds), set: data.duration_seconds, diff });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

// ---- Read progress: the read itself is timed from recent reads on this
// device (TSPWork can't report progress mid-read); the bar moves with time
// toward 85 % and slows near the end if a read runs long, then the saving
// steps fill the rest.
const READ_SECS_KEY = 'tsp-read-seconds';
function readEstimate() {
  try { return Math.min(600, Math.max(8, Number(localStorage.getItem(READ_SECS_KEY)) || 25)); } catch { return 25; }
}
function readProgressStart(since) {
  sync.progress = { started: since || Date.now(), estimate: readEstimate(), phase: 'read', step: 0, label: 'Reading the saved Ableton set…' };
  readProgressTick();
}
function readProgressReadDone() {
  const p = sync.progress;
  if (!p || p.phase !== 'read') return;
  const secs = (Date.now() - p.started) / 1000;
  // Remember how long reads take here (smoothed; ignore waits behind other work).
  try { const prev = Number(localStorage.getItem(READ_SECS_KEY)) || secs; localStorage.setItem(READ_SECS_KEY, String(Math.round((prev * 0.4 + secs * 0.6) * 10) / 10)); } catch { /* ignore */ }
  p.phase = 'save';
  p.readSecs = secs;
}
function readProgressStep(label, step) {
  if (!sync.progress) return;
  Object.assign(sync.progress, { phase: 'save', label, step });
  readProgressTick();
}
const READ_STAGE_LABEL = { open: 'Opening the saved set', tracks: 'Reading tracks', songs: 'Working out songs', done: 'Finishing the read' };
// Where the read is, from TSPWork (1.20+) when it reports it; otherwise timed.
function readStageInfo(p) {
  const st = p.remoteStage;
  if (st?.stage && READ_STAGE_LABEL[st.stage]) {
    const frac = st.total ? Math.min(1, st.done / st.total) : 0;
    const pct = st.stage === 'open' ? 6 : st.stage === 'tracks' ? 10 + 65 * frac : st.stage === 'songs' ? 75 + 10 * frac : 85;
    const count = st.total ? ` ${st.done} of ${st.total}` : '';
    return { pct, label: `${READ_STAGE_LABEL[st.stage]}${count}`, short: `${READ_STAGE_LABEL[st.stage]}${count}` };
  }
  return null;
}
function readProgressValue(p) {
  if (p.phase === 'save') return 85 + Math.min(3, p.step) * 5;
  const real = readStageInfo(p);
  if (real) return real.pct;
  const t = (Date.now() - p.started) / 1000;
  const k = t / p.estimate;
  // Linear up to the estimate, then creeps toward 95 % so it never sits still or lies about being done.
  return k <= 1 ? 85 * k : 85 + 10 * (1 - Math.exp(-(k - 1) * 1.5));
}
function readProgressStageText(p, remote) {
  if (p.phase === 'save') return p.label;
  const real = readStageInfo(p);
  if (real) return `${remote ? 'Another window: ' : ''}${real.label}…`;
  return remote ? 'TSPWork is reading the set for another window…' : 'Reading the saved Ableton set…';
}
const READ_STEPS = [['read', 'Read the saved set'], ['lyrics', 'Save lyrics for Practice'], ['fp', 'Save audio fingerprints'], ['colors', 'Save track colours']];
function readProgressHtml(p, remote) {
  const pct = readProgressValue(p);
  const t = Math.round((Date.now() - p.started) / 1000);
  const left = Math.max(0, Math.round(p.estimate - t));
  const timing = p.phase === 'save' ? `${t} s` : `${t} s${t < p.estimate ? ` · about ${left} s left` : ' · taking longer than usual'}`;
  const current = p.phase === 'save' ? Math.min(3, p.step) : 0;
  const steps = remote ? '' : `<ol class="rp-steps">${READ_STEPS.map(([, label], i) => `<li class="${i < current ? 'done' : i === current ? 'now' : ''}">${i < current ? '✓' : i === current ? '●' : '○'} ${escapeHtml(label)}</li>`).join('')}</ol>`;
  return `<div class="read-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
    <div class="rp-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
    <div class="rp-label"><span>${escapeHtml(readProgressStageText(p, remote))}</span><b>${Math.round(pct)}%</b></div>
    <div class="rp-time muted">${escapeHtml(timing)}</div>${steps}</div>`;
}
// Ask TSPWork where the read is (its /status answers at once during a read).
async function readProgressPoll() {
  if (readProgressPoll.busy) return;
  readProgressPoll.busy = true;
  try {
    const st = await abletonRequest('/status', null, 1500);
    if (st?.reading_progress) {
      if (sync.progress) sync.progress.remoteStage = st.reading_progress;
      readProgressPoll.remote = st.reading_progress;
    }
    if (!st?.reading_since) readProgressPoll.remote = null;
  } catch { /* ignore */ } finally { readProgressPoll.busy = false; }
}
function readProgressTick() {
  clearTimeout(readProgressTick.timer);
  const remoteSince = !sync.reading && abletonBridge.status?.reading_since;
  const p = sync.reading ? sync.progress : remoteSince ? { started: remoteSince * 1000, estimate: readEstimate(), phase: 'read', remoteStage: readProgressPoll.remote } : null;
  if (p && p.phase === 'read' && Date.now() - (readProgressTick.polled || 0) > 900) { readProgressTick.polled = Date.now(); readProgressPoll(); }
  const box = document.getElementById('read-progress-box');
  if (box && p) box.innerHTML = readProgressHtml(p, !!remoteSince);
  // The button shows the stage and fills up too.
  const btn = document.getElementById('sync-read');
  if (btn && p) {
    const pct = readProgressValue(p);
    btn.classList.add('reading');
    btn.style.setProperty('--p', `${pct.toFixed(1)}%`);
    const real = readStageInfo(p);
    btn.textContent = `${p.phase === 'save' ? p.label.replace(/…$/, '') : real ? real.short : 'Reading the set'} · ${Math.round(pct)}%`;
  } else if (btn) { btn.classList.remove('reading'); btn.style.removeProperty('--p'); }
  if (p) readProgressTick.timer = setTimeout(readProgressTick, 250);
}

// Reading the saved set takes ~20 s (separate python) to several minutes (inside Live).
const SET_READ_TIMEOUT_MS = 15 * 60 * 1000;
function lyricsRelayStateLines(lines) {
  return [...(lines || [])].sort((a, b) => Number(a.t) - Number(b.t)).map((line) => {
    const { is_new_clip, section_index, force, accept, untouched, ...saved } = line;
    return saved;
  });
}
function lyricsRelayStateMatches(a, b) {
  const left = lyricsRelayStateLines(a).map((line) => [Number(line.t), Number(line.e), String(line.text || '')]);
  const right = lyricsRelayStateLines(b).map((line) => [Number(line.t), Number(line.e), String(line.text || '')]);
  return left.length === right.length && left.every((line, i) =>
    Math.abs(line[0] - right[i][0]) <= 0.03
    && Math.abs(line[1] - right[i][1]) <= 0.03
    && line[2] === right[i][2]);
}
async function persistAppliedLyricsRelayState(rows) {
  for (const row of rows || []) {
    const source = row.source_lines || row.lines;
    const applied = lyricsRelayStateLines(source);
    const forced = (source || []).some((line) => line.force);
    if (lyricsRelayStateMatches(row.applied_lines, applied) && !row.relay_error && !forced) continue;
    const patch = { applied_lines: applied, applied_at: new Date().toISOString(), relay_error: null, relay_conflicts: null };
    // "Use Practice edit" overwrites a hand edit once; it must not keep overwriting.
    if (forced) patch.lines = source.map((line) => { const { force, ...rest } = line; return rest; });
    let query = db.from('song_lyrics_edits').update(patch).eq('song_id', row.song_id).eq('track_slug', row.track_slug);
    if (forced) query = query.eq('updated_at', row.updated_at);
    const { error } = await query;
    if (error) throw error;
  }
}
// The lines to send for one queued edit, relative to a relay base (what Live
// should currently hold). A Drum/Percussion clip added by an earlier relay is
// already in that base, so it is sent as an ordinary clip, not as a new one.
function lyricsRelayLines(trackSlug, sourceLines, relayBaseLines, savedBaseLines, sections) {
  const lines = (sourceLines || []).map((line) => ({ ...line }));
  if (!['drums', 'percussion'].includes(trackSlug) || !sections?.length) return lines;
  const matched = new Set();
  lines.forEach((line, i) => {
    if (!line.is_new_clip) return;
    const sectionIndex = Number(line.section_index);
    const sectionWasEmpty = !(savedBaseLines || []).some((base) => lyricsEditorSectionIndex(base, sections) === sectionIndex);
    const baseIndex = (relayBaseLines || []).findIndex((base, j) => !matched.has(j)
      && (base.text === line.text || sectionWasEmpty)
      && lyricsEditorSectionIndex(base, sections) === sectionIndex);
    if (baseIndex < 0) return;
    matched.add(baseIndex);
    const { is_new_clip, section_index, ...alreadyApplied } = line;
    lines[i] = alreadyApplied;
  });
  return lines;
}
// Tells the bridge (TSPWork 1.30+), per clip, which texts Practice itself has
// put there: the saved text and what the relay applied earlier ("accept"), and
// whether Practice leaves the clip as saved ("untouched"). A clip holding any
// other text was typed by hand in Live: kept if untouched, otherwise a
// mismatch for Aaron to decide. Older bridges ignore these fields.
function lyricsRelayAnnotate(lines, savedBaseLines, appliedLines) {
  const at = (list, t) => (list || []).find((line) => Math.abs(Number(line.t) - Number(t)) <= 0.03);
  return (lines || []).map((line) => {
    if (line.is_new_clip) return line;
    const saved = at(savedBaseLines, line.t); const applied = at(appliedLines, line.t);
    const accept = [...new Set([saved?.text, applied?.text].filter((text) => typeof text === 'string').map((text) => text.trim()))];
    return { ...line, accept, untouched: !!saved && String(line.text || '').trim() === String(saved.text || '').trim() };
  });
}
// Which queued edits the relay sends now. Normally only edits whose latest
// lines are not in Live yet; on a full check (Live or the set was reloaded, the
// app just opened, or every two minutes) every edit is re-checked, which is
// harmless: the bridge changes nothing when Live already matches. An edit the
// bridge refused waits a minute unless it has been saved again since.
function lyricsRelayPlan(updates, options) {
  const full = !!options?.full; const refused = options?.refused || new Map(); const now = options?.now ?? Date.now();
  const send = []; const waiting = [];
  for (const row of updates || []) {
    const key = `${row.song_id}|${row.track_slug}`;
    const held = refused.get(key);
    if (held && held.updated_at === row.updated_at && now < held.until && !full) { waiting.push(row); continue; }
    const decided = (row.source_lines || []).some((line) => line.force); // Aaron chose the Practice text for a clip
    if (full || decided || !lyricsRelayStateMatches(row.applied_lines, row.source_lines || row.lines)) send.push(row);
  }
  return { send, waiting };
}
// Sends queued edits to the bridge. The bridge refuses a whole request when
// one track conflicts, naming it. That track is retried once against the saved
// baseline (Live's memory may have been reset); if it still conflicts it is set
// aside, and the others are sent again. Returns what was applied and refused.
async function relayLyricsRows(rows, request) {
  // Each edit can be described to the bridge against two baselines: what the
  // relay last put into Live ("applied") or the saved set ("saved"). The bridge
  // only changes a clip whose text differs between baseline and edit, so:
  // - new work on a track already in Live goes against "applied" first;
  // - a re-check of a track believed to be in Live goes against "saved" first,
  //   otherwise nothing would differ and a Live that was reopened without
  //   saving would be left unchanged.
  // The other baseline is the fallback when the bridge reports a mismatch.
  let batch = rows.map((row) => {
    const applied = { base_lines: row.base_lines, lines: row.lines };
    if (!row.saved_lines) return { row, variants: [applied] };
    const saved = { base_lines: row.saved_base_lines, lines: row.saved_lines };
    const recheck = lyricsRelayStateMatches(row.applied_lines, row.source_lines || row.lines);
    return { row, variants: recheck ? [saved, applied] : [applied, saved] };
  });
  const refused = []; const applied = [];
  for (let attempt = 0; attempt <= rows.length * 2 && batch.length; attempt += 1) {
    const write = await request(batch.map((item) => ({ song_id: item.row.song_id, track_slug: item.row.track_slug, ...item.variants[0] })));
    if (write?.ok) { applied.push(...batch.map((item) => item.row)); batch = []; break; }
    if (write?.error === 'busy') return { applied, refused, busy: true, remaining: batch.map((item) => item.row) };
    const index = batch.findIndex((item) => item.row.song_id === write?.song_id && item.row.track_slug === write?.track_slug);
    if (index < 0) throw new Error(write?.message || write?.detail || write?.error || 'Ableton could not apply the saved lyric edits.');
    const item = batch[index];
    // TSPWork 1.30 names the mismatched clips itself: that answer is final.
    // Older bridges only say "changed", so the other baseline is tried first.
    const detailed = write.error === 'source_changed' && Array.isArray(write.conflicts);
    if (item.variants.length > 1 && !detailed) { batch[index] = { row: item.row, variants: item.variants.slice(1) }; continue; }
    const savedText = (t) => (item.row.saved_base_lines || []).find((line) => Math.abs(Number(line.t) - Number(t)) <= 0.03)?.text;
    refused.push({ song_id: item.row.song_id, track_slug: item.row.track_slug, updated_at: item.row.updated_at, error: write.error || 'refused',
      conflicts: detailed ? write.conflicts.map((c) => ({ ...c, base_text: savedText(c.t) ?? c.base_text })) : null });
    batch.splice(index, 1);
  }
  return { applied, refused, busy: false, remaining: [] };
}
async function persistRefusedLyricsRelayState(refused, updates) {
  for (const item of refused || []) {
    const row = (updates || []).find((x) => x.song_id === item.song_id && x.track_slug === item.track_slug);
    const conflicts = item.error === 'source_changed' ? (item.conflicts || null) : null;
    if (row?.relay_error === item.error && JSON.stringify(row?.relay_conflicts || null) === JSON.stringify(conflicts)) continue;
    const { error } = await db.from('song_lyrics_edits').update({ relay_error: item.error, relay_conflicts: conflicts })
      .eq('song_id', item.song_id).eq('track_slug', item.track_slug).eq('updated_at', item.updated_at);
    if (error) console.warn('Could not record the lyric relay problem', error.message || error);
  }
}
// A mismatch between a queued Practice edit and a hand edit in Live is a
// decision for Aaron (Ableton Sync > Lyric update mismatches), not a fault.
const lyricsRelayIsMismatch = (error) => error === 'source_changed';
// Aaron's decision on one mismatched clip. "practice": the Practice text
// replaces the hand edit in Live (the bridge is told to overwrite that clip
// once). "ableton": the queue adopts the text now in Live, so Live is left
// alone and Practice shows it. The relay then runs again.
function lyricsConflictResolution(lines, conflicts, t, choice, baseLine) {
  const near = (value) => Math.abs(Number(value) - Number(t)) <= 0.03;
  const conflict = (conflicts || []).find((c) => near(c.t));
  if (!conflict) return null;
  let found = false;
  let next = (lines || []).map((line) => {
    if (line.is_new_clip || !near(line.t)) return line;
    found = true;
    if (choice === 'practice') return { ...line, force: true };
    const { force, ...rest } = line;
    return { ...rest, text: conflict.live_text };
  });
  // Practice had removed this clip (Drums/Percussion) and Aaron keeps it.
  if (!found && choice === 'ableton' && baseLine) { next = [...next, { ...baseLine, text: conflict.live_text }].sort((a, b) => Number(a.t) - Number(b.t)); found = true; }
  if (!found) return null;
  return { lines: next, conflicts: (conflicts || []).filter((c) => c !== conflict) };
}
async function resolveLyricConflict(songId, slug, t, choice) {
  const key = `${songId}|${slug}`;
  if (sync.resolving?.has(key)) return;
  (sync.resolving ||= new Set()).add(key); renderSyncPage();
  try {
    const [{ data: row, error }, { data: base }] = await Promise.all([
      db.from('song_lyrics_edits').select('lines,updated_at,relay_conflicts').eq('song_id', songId).eq('track_slug', slug).maybeSingle(),
      db.from('song_lyrics').select('tracks').eq('song_id', songId).maybeSingle()
    ]);
    if (error) throw error;
    if (!row) throw new Error('That edit is no longer queued.');
    const baseLine = base?.tracks?.find((track) => track.slug === slug)?.lines?.find((line) => Math.abs(Number(line.t) - Number(t)) <= 0.03);
    const resolved = lyricsConflictResolution(row.lines, row.relay_conflicts, t, choice, baseLine);
    if (!resolved) throw new Error('That clip is no longer listed as a mismatch.');
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
    const { data: updated, error: writeError } = await db.from('song_lyrics_edits')
      .update({ lines: resolved.lines, updated_at: updatedAt, relay_conflicts: resolved.conflicts.length ? resolved.conflicts : null, relay_error: resolved.conflicts.length ? 'source_changed' : null })
      .eq('song_id', songId).eq('track_slug', slug).eq('updated_at', row.updated_at).select('updated_at');
    if (writeError) throw writeError;
    if (!updated?.length) throw new Error('That track was edited just now. Try again.');
    autoLyricsSync.refusedRows.delete(key);
    autoLyricsSync.forceFull = true;
    showNotice(choice === 'practice' ? 'The Practice edit will replace the clip in Ableton.' : 'Ableton’s version is kept.');
    scheduleAutoLyricsSync(100);
  } catch (error) { showNotice(error.message || 'Could not apply that decision.', true); }
  finally { sync.resolving.delete(key); await loadLyricConflicts(true); }
}
async function loadLyricConflicts(force = false) {
  if (!state.member?.is_admin) return;
  const { data, error } = await db.from('song_lyrics_edits').select('song_id,track_slug,updated_at,relay_conflicts').eq('relay_error', 'source_changed');
  if (error) return;
  const next = (data || []).sort((a, b) => `${a.song_id}|${a.track_slug}`.localeCompare(`${b.song_id}|${b.track_slug}`));
  const changed = JSON.stringify(next) !== JSON.stringify(sync.lyricConflicts || []);
  sync.lyricConflicts = next;
  if ((changed || force) && state.view === 'sync') renderSyncPage();
}
function lyricMismatchSectionHtml() {
  const rows = sync.lyricConflicts || [];
  const count = rows.reduce((sum, row) => sum + Math.max(1, (row.relay_conflicts || []).length), 0);
  const items = rows.map((row) => {
    const song = state.songs.find((x) => x.id === row.song_id);
    const head = `<span class="song-id">${escapeHtml(row.song_id)}</span> <b>${escapeHtml(song?.name || '')}</b> · ${escapeHtml(lyricsTrackLabel(row.track_slug))}`;
    const busy = sync.resolving?.has(`${row.song_id}|${row.track_slug}`) ? 'disabled' : '';
    if (!Array.isArray(row.relay_conflicts) || !row.relay_conflicts.length) {
      return `<li class="sync-row lyric-mismatch"><div class="lyric-mismatch-head">${head}</div><p class="muted">A clip on this track was changed by hand in Ableton. To see the clips and choose, TSPWork 1.30 must be loaded: in Live set the TSPWork control surface to None, then back to TSPWork.</p></li>`;
    }
    return row.relay_conflicts.map((c) => {
      const id = escapeHtml(`${row.song_id}|${row.track_slug}|${c.t}`);
      const text = (value) => value === null || value === undefined ? '<i>clip removed</i>' : escapeHtml(lyricsClipTextForEditor(value));
      return `<li class="sync-row lyric-mismatch"><div class="lyric-mismatch-head">${head} · clip ${Number(c.line) || ''}</div>
        <dl class="lyric-mismatch-texts"><dt>Practice edit</dt><dd>${text(c.practice_text)}</dd><dt>Ableton now</dt><dd>${text(c.live_text)}</dd><dt>Saved before</dt><dd>${text(c.base_text)}</dd></dl>
        <div class="lyric-mismatch-actions">${c.practice_text === null || c.practice_text === undefined ? '' : `<button type="button" class="button" data-lyric-resolve="${id}" data-choice="practice" ${busy}>Use Practice edit</button>`}<button type="button" class="button quiet" data-lyric-resolve="${id}" data-choice="ableton" ${busy}>Keep Ableton</button></div></li>`;
    }).join('');
  }).join('');
  return `<section class="sync-card"><header><h2>Lyric update mismatches <span>${count}</span></h2></header>
    <p class="muted">A lyric edit from Practice and a change typed in Ableton landed on the same clip. Choose which one wins; your choice is applied to the open set straight away (save in Live afterwards as usual).</p>
    ${rows.length ? `<ul class="sync-list">${items}</ul>` : '<p class="sync-empty">No mismatches.</p>'}</section>`;
}
async function pendingAbletonLyricsEdits() {
  const [{ data: edits, error: editError }, { data: baselines, error: baselineError }] = await Promise.all([
    db.from('song_lyrics_edits').select('song_id,track_slug,lines,updated_at,applied_lines,relay_error,relay_conflicts'),
    db.from('song_lyrics').select('song_id,tracks,sections')
  ]);
  if (editError) throw editError;
  if (baselineError) throw baselineError;
  const baselineBySong = new Map((baselines || []).map((row) => [row.song_id, row]));
  const updates = []; const rowsToClear = []; const problems = [];
  for (const edit of edits || []) {
    const baseSong = baselineBySong.get(edit.song_id);
    let baseTrack = baseSong?.tracks?.find((track) => track.slug === edit.track_slug);
    if (!baseTrack && ['drums', 'percussion'].includes(edit.track_slug) && baseSong?.sections?.length
      && (edit.lines || []).length > 0 && (edit.lines || []).every((line) => line.is_new_clip === true)) {
      // Ableton omits tracks with no named clips from its lyrics snapshot.
      // An all-new Drum/Percussion edit therefore has a valid empty baseline.
      baseTrack = { lines: [] };
    }
    if (!baseTrack) {
      problems.push({ song_id: edit.song_id, track_slug: edit.track_slug, error: 'no_baseline', message: 'No saved Ableton baseline yet. The edit is kept in Practice.' });
      continue;
    }
    const savedBaseLines = [...(baseTrack.lines || [])].sort((x, y) => Number(x.t) - Number(y.t));
    const sourceLines = [...(edit.lines || [])].sort((x, y) => Number(x.t) - Number(y.t));
    const hasApplied = Array.isArray(edit.applied_lines);
    const appliedBaseLines = hasApplied ? [...edit.applied_lines].sort((x, y) => Number(x.t) - Number(y.t)) : null;
    const relayBaseLines = appliedBaseLines || savedBaseLines;
    updates.push({
      song_id: edit.song_id, track_slug: edit.track_slug, updated_at: edit.updated_at,
      base_lines: relayBaseLines,
      lines: lyricsRelayAnnotate(lyricsRelayLines(edit.track_slug, sourceLines, relayBaseLines, savedBaseLines, baseSong.sections), savedBaseLines, appliedBaseLines),
      // If Live's memory went back to the saved set (Live reopened or the set
      // reloaded without saving), the relay retries against the saved baseline.
      saved_base_lines: savedBaseLines,
      saved_lines: hasApplied ? lyricsRelayAnnotate(lyricsRelayLines(edit.track_slug, sourceLines, savedBaseLines, savedBaseLines, baseSong.sections), savedBaseLines, appliedBaseLines) : null,
      source_lines: sourceLines,
      applied_lines: edit.applied_lines || null,
      relay_error: edit.relay_error || null,
      relay_conflicts: edit.relay_conflicts || null
    });
    // Confirmation against the saved .als must always use the original saved
    // baseline and full intended override, not the most recent memory relay.
    rowsToClear.push({
      song_id: edit.song_id, track_slug: edit.track_slug, updated_at: edit.updated_at,
      base_lines: savedBaseLines, lines: sourceLines
    });
  }
  return { updates, rowsToClear, problems, baselineBySong };
}
const lyricsRowKey = (row) => `${row.song_id}|${row.track_slug}`;
// Split queued rows into those the saved set confirms and those it does not.
function classifyPendingLyricsRows(snapshot, rows) {
  const confirmed = []; const unconfirmed = [];
  for (const row of rows || []) (pendingLyricsRowMatchesSnapshot(snapshot, row) ? confirmed : unconfirmed).push(row);
  return { confirmed, unconfirmed };
}
// The lyrics tracks to store as one song's baseline. A track with a queued,
// unconfirmed edit keeps its previous baseline: the bridge detects conflicts
// by comparing Live with the baseline the edit was made against, so replacing
// it would let a later relay overwrite a hand edit made in Live.
function baselineTracksForSave(snapshotTracks, heldSlugs, previousTracks) {
  const held = new Set(heldSlugs || []);
  if (!held.size) return snapshotTracks || [];
  const previous = new Map((previousTracks || []).map((track) => [track.slug, track]));
  const out = []; const seen = new Set();
  for (const track of snapshotTracks || []) {
    if (!held.has(track.slug)) { out.push(track); continue; }
    seen.add(track.slug);
    if (previous.has(track.slug)) out.push(previous.get(track.slug));
  }
  for (const slug of held) if (!seen.has(slug) && previous.has(slug)) out.push(previous.get(slug));
  return out;
}
// After reading the saved set: store the new baseline and clear only the
// queued edits that the saved file confirms and that nobody changed meanwhile.
// Everything else stays queued and is returned for reporting. Safe to repeat.
async function reconcileLyricsAfterRead(snapshot, pending, io) {
  if (!snapshot?.songs) throw new Error('No saved-set snapshot to confirm lyric edits against.');
  const { confirmed, unconfirmed } = classifyPendingLyricsRows(snapshot, pending.rowsToClear);
  const validated = new Map(confirmed.map((row) => [lyricsRowKey(row), row.updated_at]));
  const current = await io.currentEdits();
  const held = new Map(); const unchanged = new Set(); const changed = [];
  for (const row of current || []) {
    const key = lyricsRowKey(row);
    if (validated.has(key) && validated.get(key) === row.updated_at) { unchanged.add(key); continue; }
    if (validated.has(key)) changed.push({ song_id: row.song_id, track_slug: row.track_slug });
    if (!held.has(row.song_id)) held.set(row.song_id, new Set());
    held.get(row.song_id).add(row.track_slug);
  }
  const saved = await io.saveBaseline(snapshot, held, pending.baselineBySong);
  const cleared = [];
  for (const row of confirmed) {
    if (!unchanged.has(lyricsRowKey(row))) continue;
    if (await io.deleteEdit(row)) cleared.push({ song_id: row.song_id, track_slug: row.track_slug });
    else changed.push({ song_id: row.song_id, track_slug: row.track_slug });
  }
  return { saved, cleared, changed, unconfirmed: unconfirmed.map((row) => ({ song_id: row.song_id, track_slug: row.track_slug })) };
}
const lyricsReconcileIo = {
  async currentEdits() {
    const { data, error } = await db.from('song_lyrics_edits').select('song_id,track_slug,updated_at');
    if (error) throw error;
    return data || [];
  },
  saveBaseline: (snapshot, held, baselineBySong) => saveSongLyrics(snapshot, held, baselineBySong),
  async deleteEdit(row) {
    const { data, error } = await db.from('song_lyrics_edits').delete().eq('song_id', row.song_id).eq('track_slug', row.track_slug).eq('updated_at', row.updated_at).select('updated_at');
    if (error) throw error;
    return (data || []).length > 0;
  }
};
function lyricsQueueLabel(rows) {
  return rows.map((row) => `${row.song_id} · ${lyricsTrackLabel(row.track_slug)}`).join(', ');
}
async function syncLyricsToMainProject() {
  const pending = await pendingAbletonLyricsEdits();
  const result = await abletonRequest('/sync-lyrics', { edits: pending.updates }, SET_READ_TIMEOUT_MS);
  if (!result?.ok) {
    if (result?.error === 'wrong_open_set') throw new Error(`Open the main Ableton project before syncing. TSPWork sees: ${result.open_path || 'no saved set'}`);
    throw new Error(result?.message || result?.detail || result?.error || 'Could not sync lyric edits to the main Ableton project.');
  }
  sync.writebackRows = pending.rowsToClear;
  return result;
}
function pendingLyricsRowMatchesSnapshot(snapshot, row) {
  const saved = [...(snapshot?.songs?.[row.song_id]?.lyrics?.tracks?.find((track) => track.slug === row.track_slug)?.lines || [])]
    .sort((a, b) => Number(a.t) - Number(b.t));
  const edited = [...(row.lines || [])].sort((a, b) => Number(a.t) - Number(b.t));
  const base = [...(row.base_lines || [])].sort((a, b) => Number(a.t) - Number(b.t));
  const structuralTrack = ['drums', 'percussion'].includes(row.track_slug);
  // Practice can create/remove Drum or Percussion clips. Confirm that complete
  // structural edit; all other tracks only need their changed Practice lines
  // confirmed, so unrelated Live clip changes or additions can be rebased.
  if (structuralTrack && (edited.length !== base.length || edited.some((line) => line.is_new_clip))) {
    return saved.length === edited.length && saved.every((line, i) => line.text === edited[i]?.text);
  }
  const usedBase = new Set();
  for (const line of edited) {
    const t = Number(line.t);
    const match = base.map((candidate, i) => ({ i, gap: Math.abs(Number(candidate.t) - t) }))
      .filter((item) => !usedBase.has(item.i)).sort((a, b) => a.gap - b.gap)[0];
    if (!match || match.gap > 0.03) return false;
    usedBase.add(match.i);
    const original = base[match.i];
    if (String(line.text || '').trim() === String(original.text || '').trim()) continue;
    const savedLine = saved.find((candidate) => Math.abs(Number(candidate.t) - t) <= 0.03);
    if (!savedLine || String(savedLine.text || '').trim() !== String(line.text || '').trim()) return false;
  }
  return true;
}
async function clearSyncedLyricsOverrides(snapshot, rows = sync.writebackRows || []) {
  for (const row of rows) {
    if (!pendingLyricsRowMatchesSnapshot(snapshot, row)) {
      throw new Error(`The saved Ableton set does not yet contain ${row.song_id} · ${row.track_slug}. Save the set in Live, then sync again. The Practice edit is still queued.`);
    }
    const { error } = await db.from('song_lyrics_edits').delete().eq('song_id', row.song_id).eq('track_slug', row.track_slug).eq('updated_at', row.updated_at);
    if (error) throw error;
  }
  refreshSyncLyricsPendingBadge();
}
function verifyPendingLyricsSnapshot(snapshot, rows = sync.writebackRows || []) {
  for (const row of rows) {
    if (!pendingLyricsRowMatchesSnapshot(snapshot, row)) {
      throw new Error(`The saved Ableton set does not yet contain ${row.song_id} · ${row.track_slug}. Save the set in Live, then sync again. The Practice edit is still queued.`);
    }
  }
}
const PRACTICE_LYRICS_SYNC_KEY = 'tsp-practice-lyrics-sync';
const practiceLyricsSyncSeen = new Set();
let practiceLyricsSyncChannel = null;
try { practiceLyricsSyncChannel = new BroadcastChannel('tsp-practice-lyrics-sync'); } catch { /* storage events below are the fallback */ }
function refreshPracticeLyricsForSync(message) {
  if (message?.type !== 'ableton-lyrics-synced' || !Array.isArray(message.song_ids)) return false;
  if (message.id && practiceLyricsSyncSeen.has(message.id)) return false;
  if (message.id) {
    practiceLyricsSyncSeen.add(message.id);
    if (practiceLyricsSyncSeen.size > 100) practiceLyricsSyncSeen.delete(practiceLyricsSyncSeen.values().next().value);
  }
  if (state.view !== 'practice' || !message.song_ids.includes(practice.songId)) return false;
  practiceLoadLyrics(practice.songId).catch((error) => console.warn('Could not refresh Practice lyrics after Ableton sync', error));
  return true;
}
practiceLyricsSyncChannel?.addEventListener('message', (event) => refreshPracticeLyricsForSync(event.data));
window.addEventListener('storage', (event) => {
  if (event.key !== PRACTICE_LYRICS_SYNC_KEY || !event.newValue) return;
  try { refreshPracticeLyricsForSync(JSON.parse(event.newValue)); } catch { /* ignore malformed local signal */ }
});
function broadcastPracticeLyricsSync(songIds) {
  const message = { type: 'ableton-lyrics-synced', song_ids: songIds, id: `${Date.now()}-${Math.random()}` };
  try { practiceLyricsSyncChannel?.postMessage(message); } catch { /* storage event fallback below */ }
  try { localStorage.setItem(PRACTICE_LYRICS_SYNC_KEY, JSON.stringify(message)); } catch { /* private mode: same-tab refresh still works */ }
}
async function refreshPracticeLyricsAfterSync(snapshot) {
  const songId = practice.songId;
  if (!snapshot?.songs?.[songId]?.lyrics) return;
  // Re-read the persisted baseline after writeback cleanup so this view cannot
  // retain the override that was just removed in Supabase.
  await practiceLoadLyrics(songId);
}
async function readAbletonSet() {
  if (!abletonBridge.connected) { await probeAbletonBridge(); }
  if (!abletonBridge.connected) { renderSyncStatus(); showNotice('Ableton is not connected.', true); return; }
  if (sync.reading) return; // a read is already running
  sync.reading = true;
  readProgressStart();
  if (state.view === 'sync') renderSyncPage(); else renderSyncStatus();
  try {
    // This button confirms what the musician already saved in Live. The Mac
    // relay applies pending Practice edits to Live memory separately; never
    // write clips here while reading the saved .als.
    readProgressStep('Checking queued Practice lyrics…', 0);
    let pending = null;
    try { pending = await pendingAbletonLyricsEdits(); sync.writebackRows = pending.rowsToClear; }
    catch (error) { console.warn('Queued lyric edits could not be loaded; lyrics will not be updated in this sync', error); }
    // TSPWork does one thing at a time (a read takes a few minutes). If it's
    // still busy with something else (another window's read, a jump), wait for it.
    let result = null;
    const waitUntil = Date.now() + SET_READ_TIMEOUT_MS;
    for (;;) {
      result = await abletonRequest('/snapshot', {}, SET_READ_TIMEOUT_MS);
      if (result?.error !== 'busy' || Date.now() > waitUntil) break;
      showNotice('TSPWork is busy with another request; checking the saved set as soon as it is free…');
      await new Promise((resolve) => setTimeout(resolve, 4000));
      if (sync.progress) sync.progress.started = Date.now(); // time only the read itself
    }
    readProgressReadDone();
    if (result?.error === 'busy') throw new Error('TSPWork stayed busy for 15 minutes. Reselect TSPWork in Live (Settings › Link, Tempo & MIDI) and try again');
    if (!result?.ok) throw new Error(result?.error === 'als_not_found' ? `Saved set not found at ${result.als_path}` : (result?.detail || result?.error || 'Could not read the set'));
    sync.snapshot = result.snapshot;
    sync.readAt = new Date();
    sync.dismissed.clear();
    // /snapshot reads the on-disk .als. A queued lyric edit that the saved file
    // does not confirm stays queued and is reported below; it no longer stops
    // the rest of the sync (tempo, duration, keys, fingerprints, colours).
    // Duration and tempo always follow Ableton: apply them straight away.
    const autoMeta = computeSyncDiff(sync.snapshot).meta.filter((item) => SYNC_AUTO_FIELDS.includes(item.field));
    if (autoMeta.length) sync.autoApply = autoMeta;
    try { await loadSyncSnoozes(); } catch (error) { console.warn('Snoozes not loaded', error); }
    // Lyrics for the Practice page come from this read.
    readProgressStep('Saving lyrics for Practice…', 1);
    if (Object.values(sync.snapshot.songs || {}).some((song) => song.lyrics)) {
      try {
        if (!pending) throw new Error('queued lyric edits could not be checked, so the lyrics baseline was left as it was');
        const outcome = await reconcileLyricsAfterRead(sync.snapshot, pending, lyricsReconcileIo);
        sync.lyricsSaved = outcome.saved;
        sync.lyricsQueued = [...outcome.unconfirmed, ...outcome.changed, ...(pending.problems || [])];
        refreshSyncLyricsPendingBadge();
        try { await refreshPracticeLyricsAfterSync(sync.snapshot); }
        finally { broadcastPracticeLyricsSync(Object.keys(sync.snapshot.songs || {})); }
        abletonPresence.awaitingSave = sync.lyricsQueued.length > 0 && abletonPresence.awaitingSave;
        abletonPresence.needsAttention = false;
        abletonPresence.lastSync = new Date().toISOString();
        abletonPresence.lastHeartbeat = 0;
        setAbletonConnected(true);
        await publishAbletonPresence(true);
        if (sync.lyricsQueued.length) {
          showNotice(`Sync finished. Not in the saved set yet: ${lyricsQueueLabel(sync.lyricsQueued)}. Save the set in Live and sync again; anything listed under Lyric update mismatches needs your choice first.`);
        }
      } catch (error) { sync.lyricsSaved = null; showNotice(`Lyrics were not fully saved for Practice: ${error.message}`, true); }
    }
    // Practice audio: the set's current track fingerprints (yellow = changed since upload).
    readProgressStep('Saving audio fingerprints…', 2);
    try { await audioStateAfterRead(sync.snapshot); } catch (error) { console.warn('Audio state not updated', error); }
    // Practice track colours follow the Ableton project.
    readProgressStep('Saving track colours…', 3);
    if (sync.snapshot.track_colors && Object.keys(sync.snapshot.track_colors).length) {
      const { error: colorError } = await db.from('app_meta').upsert({ key: 'practice_track_colors', value: sync.snapshot.track_colors, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (colorError) console.warn('Track colours not saved', colorError); else practice.colors = sync.snapshot.track_colors;
    }
  } catch (error) {
    fail(`Could not read the Ableton set: ${error.message || error}`, error);
  } finally {
    sync.reading = false;
    sync.progress = null;
    renderSyncPage();
    // The saved baseline may have changed: re-check every queued edit against Live.
    autoLyricsSync.forceFull = true;
    autoLyricsSync.rerun = false;
    scheduleAutoLyricsSync(250);
  }
  // Mixdown lengths (for the "audio length differs" check) load afterwards,
  // without holding up the results.
  if (sync.snapshot) loadSyncAudioLengths().then(() => { if (state.view === 'sync' && !sync.reading) renderSyncPage(); }).catch((error) => console.warn('Audio lengths not loaded', error));
  if (sync.autoApply?.length) {
    const items = sync.autoApply;
    sync.autoApply = null;
    await runSyncApply([], items, `Applied ${items.length} duration/tempo ${items.length === 1 ? 'update' : 'updates'} from Ableton: ${[...new Set(items.map((i) => i.songId))].join(', ')}.`);
  }
}

async function applySyncTask(item) {
  if (item.taskKey === 'backing_track_manual') {
    const { data, error } = await db.from('songs').update({ backing_track_manual: 'Mixed' }).eq('id', item.songId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error(`TSP Work did not update ${item.songId}.`);
    const song = state.songs.find((row) => row.id === item.songId);
    if (song) song.backing_track_manual = 'Mixed';
  } else {
    const { data, error } = await db.from('song_tasks').update({ status: item.to }).eq('song_id', item.songId).eq('task_key', item.taskKey).select('song_id');
    if (error) throw error;
    if (!data?.length) throw new Error(`TSP Work did not update ${item.songId} ${item.label}.`);
    const row = state.tasks.find((task) => task.song_id === item.songId && task.task_key === item.taskKey);
    if (row) row.status = item.to;
  }
}

async function applySyncMeta(item) {
  const { data, error } = await db.from('songs').update(item.update).eq('id', item.songId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error(`TSP Work did not update ${item.songId}.`);
  const song = state.songs.find((row) => row.id === item.songId);
  if (song) Object.assign(song, item.update);
}

async function recordSyncRun(taskItems, metaItems) {
  const snapshot = sync.snapshot;
  await db.from('ableton_sync_runs').insert({
    als_path: snapshot?.als_path, als_modified_at: snapshot?.als_modified_at, als_size: snapshot?.als_size,
    song_count: Object.keys(snapshot?.songs || {}).length, task_updates: taskItems.length, metadata_updates: metaItems.length,
    warnings: snapshot?.warnings || [],
    changes: { tasks: taskItems.map(({ songId, taskKey, from, to }) => ({ songId, taskKey, from, to })), metadata: metaItems.map(({ songId, field }) => ({ songId, field })) }
  });
}

async function runSyncApply(taskItems, metaItems, doneMessage) {
  const keys = [...taskItems.map((i) => `t:${i.songId}:${i.taskKey}`), ...metaItems.map((i) => `m:${i.songId}:${i.field}`)];
  keys.forEach((key) => sync.applying.add(key));
  renderSyncPage();
  const doneTasks = [];
  const doneMeta = [];
  try {
    for (const item of taskItems) { await applySyncTask(item); doneTasks.push(item); }
    for (const item of metaItems) { await applySyncMeta(item); doneMeta.push(item); }
  } catch (error) {
    fail(`Update stopped: ${error.message || error}`, error);
  } finally {
    keys.forEach((key) => sync.applying.delete(key));
    if (doneTasks.length || doneMeta.length) {
      try { await recordSyncRun(doneTasks, doneMeta); } catch (error) { console.warn('Sync run not recorded', error); }
      try { await loadReadiness(); } catch (error) { console.warn(error); }
      renderSongs();
      const count = doneTasks.length + doneMeta.length;
      showNotice(doneMessage || `Updated ${count} ${count === 1 ? 'item' : 'items'} in TSP Work.`);
    }
    renderSyncPage();
  }
}

$('#sync-read').addEventListener('click', readAbletonSet);

// ---------------------------------------------------------------------------
// Practice audio export (admin's Mac). TSPWork 1.13 renders each element of a
// song through Live's Export dialog into ~/Music/TSP Exports/<song>/ as MP3:
// Stems, Parts, Backing, CPC and a Mixdown. Ableton must be left alone while
// it runs; every solo/mute/loop is put back afterwards.
const exportJob = { selected: new Set(), state: null, timer: null };
const EXPORT_PREFS_KEY = 'tsp-export-prefs-v1';
const DEFAULT_EXPORT_ROOT = '/Volumes/AARON SSD/TSP/TSP Exports';
function exportPrefs() {
  try { return { root: DEFAULT_EXPORT_ROOT, upload: true, ...JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY) || '{}') }; } catch { return { root: DEFAULT_EXPORT_ROOT, upload: true }; }
}
function saveExportPrefs(patch) {
  try { localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify({ ...exportPrefs(), ...patch })); } catch { /* ignore */ }
}

function exportVocalsComplete(songId) {
  return ['vox_dale', 'vox_anston'].filter((key) => state.tasks.find((t) => t.song_id === songId && t.task_key === key)?.status === 'Completed');
}

function exportSongPayload(song) {
  return { song_id: song.id, song_name: song.name, vocals_complete: exportVocalsComplete(song.id), instrumental: song.type === 'Inst' || /^I\d/.test(song.id) };
}

function renderExportPanel(opts = {}) {
  const box = $('#export-panel');
  if (!box) return;
  // Which songs are already uploaded (from the bucket), loaded once and after each export.
  if (!practice.available && !exportJob.loadingAvailable) {
    exportJob.loadingAvailable = true;
    practiceLoadAvailable().catch((error) => console.warn('Upload list not loaded', error))
      .finally(() => { exportJob.loadingAvailable = false; if (practice.available) renderExportPanel(); });
  }
  if (!exportJob.audioState && !exportJob.audioLoading) {
    exportJob.audioLoading = true;
    audioStateLoad().catch((error) => { console.warn('Audio state not loaded', error); exportJob.audioState = new Map(); exportJob.currentFp = {}; })
      .finally(() => { exportJob.audioLoading = false; if (exportJob.audioState) renderExportPanel(); });
  }
  const job = exportJob.state;
  const running = job && ['starting', 'running', 'uploading'].includes(job.state);
  const songs = state.songs; // same order as the database / Songs page
  const count = exportJob.selected.size;
  let status = '';
  if (job) {
    const queue = job.queue || [job.song_id];
    const results = new Map((job.results || []).map((r) => [r.song_id, r]));
    const files = (job.done || []).map((d) => `<li>✓ ${escapeHtml(d.label)}</li>`).join('');
    const now = running && job.current ? `<li class="export-now">● Exporting ${escapeHtml(job.current)}… (${(job.done || []).length + 1} of ${job.total || '?'})</li>` : '';
    const songLine = queue.length > 1 ? `<ul class="export-queue">${queue.map((id, i) => {
      const r = results.get(id);
      const mark = r ? (r.state === 'done' ? '✓' : r.state === 'cancelled' || r.state === 'stopped' ? '–' : '✕') : (running && i === job.song_index ? '●' : '·');
      return `<li class="${r ? r.state : (running && i === job.song_index ? 'now' : '')}" title="${escapeHtml(r?.error || '')}">${mark} ${escapeHtml(id)}${r?.state === 'stopped' ? ' <small>not exported (stopped)</small>' : r ? ` <small>${r.files} files${r.skipped?.length ? ` · skipped ${escapeHtml(r.skipped.join(', '))}` : ''}${r.error ? ` · ${escapeHtml(r.error)}` : ''}</small>` : ''}</li>`;
    }).join('')}</ul>` : '';
    const doneCount = (job.results || []).filter((r) => r.state === 'done').length;
    const stoppedCount = (job.results || []).filter((r) => r.state === 'stopped').length;
    const head = job.state === 'done' && job.stopped_early ? `Stopped as asked: ${doneCount} song${doneCount === 1 ? '' : 's'} exported, ${stoppedCount} left for another run.`
      : job.state === 'done' ? `Done: ${queue.length > 1 ? `${doneCount} songs` : `${(job.done || []).length} files for ${escapeHtml(job.song_id)}`}.`
      : job.state === 'error' ? (queue.length > 1 ? `Finished with problems: ${doneCount} of ${queue.length} songs exported.` : `Stopped on ${escapeHtml(job.song_id)}: ${escapeHtml(job.error || 'error')}`)
      : `Exporting ${escapeHtml(job.song_id)}${queue.length > 1 ? ` (song ${job.song_index + 1} of ${queue.length})` : ''}. Don't touch Ableton until it finishes.${job.stop_after_song ? ` Stopping after ${escapeHtml(job.song_id)}.` : ''}`;
    const mix = job.mix && running ? `<p class="muted">Mixdown uses ${job.mix.instrumental ? 'no vocals (instrumental)' : job.mix.vocal_parts_used ? 'the vocal parts' : 'the VOCALS stem for vocals'}${job.mix.stems_used?.length ? `; stems filling gaps: ${escapeHtml(job.mix.stems_used.join(', '))}` : ''}.</p>` : '';
    const upLine = job.upload ? `<p class="muted">Uploaded ${job.uploaded || 0} files (${((job.uploaded_bytes || 0) / 1048576).toFixed(0)} MB)${job.upload_pending ? `, ${job.upload_pending} waiting` : ''}${job.upload_failed?.length ? ` · <span class="error">${job.upload_failed.length} failed: ${escapeHtml(job.upload_failed.slice(0, 3).map((f) => `${f.song_id} ${f.label}`).join(', '))}</span>` : ''}.</p>` : '';
    const headNow = job.state === 'uploading' ? 'All songs exported; finishing the last uploads…' : head;
    const prog = running ? exportProgress(job) : null;
    const bar = prog ? `<div class="export-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(prog.pct)}"><span style="width:${prog.pct.toFixed(1)}%"></span></div>
      <p class="muted export-eta">${prog.pct.toFixed(0)}% done${prog.eta ? ` · about ${prog.eta} left` : ''}${prog.basis === 'history' ? ` <small>(timed from ${exportJob.logCount} earlier song${exportJob.logCount === 1 ? '' : 's'})</small>` : ''}</p>` : '';
    const storage = exportJob.storageBytes != null ? ` · Cloudflare storage: <b>${(exportJob.storageBytes / 1e9).toFixed(2)} GB</b> of 10 GB` : '';
    status = `<div class="export-status ${job.state}"><p><b>${headNow}</b></p>${bar}${upLine.replace('.</p>', `${storage}.</p>`)}${job.folder && running ? `<p class="muted">Folder: ${escapeHtml(job.folder)}</p>` : ''}${mix}${running && job.skipped?.length ? `<p class="muted">Skipped: ${escapeHtml(job.skipped.join(', '))}</p>` : ''}${songLine}${running ? `<ul class="export-files">${files}${now}</ul>` : ''}</div>`;
  }
  const prefs = exportPrefs();
  // The panel is redrawn on every poll and click: keep the song list where it was scrolled.
  const oldList = box.querySelector('.export-pick');
  const listScroll = oldList ? [oldList.scrollTop, oldList.scrollLeft] : null;
  const pageScroll = window.scrollY;
  const canStopAfter = running && job.state !== 'uploading' && (job.queue || []).length > 1 && job.song_index < (job.queue || []).length - 1;
  const stopSupported = exportVersionAtLeast('1.17');
  const controlsHtml = `<header><h2>Practice audio</h2></header>
    <p class="muted">Exports Stems, Parts, Backing, CPC and a Mixdown per song (MP3s in the folder below; smaller AAC copies go to the Practice page), uploading each song while the next one renders. A few minutes per song: start it at night, leave the Mac plugged in with the lid open, and don't use it until it finishes.</p>
    <div class="export-row export-opts">
      <label class="export-folder">Folder <input id="export-root" type="text" value="${escapeHtml(prefs.root)}" ${running ? 'disabled' : ''} spellcheck="false"></label>
      <label class="export-check"><input id="export-upload" type="checkbox" ${prefs.upload ? 'checked' : ''} ${running ? 'disabled' : ''}> Upload to the band app</label>
    </div>
    <div class="export-row">
      <button class="button quiet" type="button" data-export-all ${running ? 'disabled' : ''}>Select all</button>
      <select class="export-setlist" data-export-setlist ${running ? 'disabled' : ''} aria-label="Select a setlist's songs">
        <option value="">+ Setlist…</option>${(state.setlists || []).map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join('')}
      </select>
      <button class="button quiet" type="button" data-export-none ${running || !count ? 'disabled' : ''}>Clear</button>
      <button class="button quiet" type="button" data-export-changed ${running || !exportChangedIds().length ? 'disabled' : ''} title="Add the songs that changed in Ableton since their upload">+ Changed${exportChangedIds().length ? ` (${exportChangedIds().length})` : ''}</button>
      ${(() => { const up = [...exportJob.selected].filter((id) => practice.available?.has(id) && !audioChanges(id).length).length; return `<button class="button quiet" type="button" data-export-unuploaded ${running || !up ? 'disabled' : ''} title="Uncheck the checked songs that are already on the band app">Uncheck uploaded${up ? ` (${up})` : ''}</button>`; })()}
      <button id="export-start" class="button primary" type="button" ${running || exportJob.preparing || !count || (!abletonBridge.connected && !running) ? 'disabled' : ''}>${exportJob.preparing ? 'Starting…' : running ? 'Exporting…' : `Export ${count ? `${count} song${count === 1 ? '' : 's'}` : 'songs'}`}</button>
      ${exportJob.control ? `<span class="muted export-control-wait"><span class="spinner" style="display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:6px"></span>${escapeHtml(exportJob.control.waiting)}</span>` : ''}${canStopAfter && !exportJob.control ? `<button id="export-stop-after" class="button ${job.stop_after_song ? 'primary' : 'quiet'}" type="button" ${stopSupported ? '' : 'disabled'} title="${stopSupported ? (job.stop_after_song ? 'Keep exporting the rest of the songs' : 'Finish the song being exported, then stop') : 'Needs TSPWork 1.17: in Live, set the TSPWork control surface to None and back to TSPWork'}">${job.stop_after_song ? `Keep going after ${escapeHtml(job.song_id)}` : 'Stop after this song'}</button>` : ''}
      ${running ? '<button id="export-cancel" class="button quiet" type="button" title="Stop right away (the current song is left unfinished) and put Ableton back">Cancel now</button>' : ''}
    </div>
    <p class="muted export-legend"><span class="export-up">●</span> on the band app${practice.available ? ` (${practice.available.size} songs)` : ''} · <span class="export-changed">●</span> changed in Ableton since its upload${exportChangedIds().length ? ` (${exportChangedIds().length})` : ''}${exportJob.preparing ? ` · <b>${escapeHtml(exportJob.preparing)}</b>` : ''}</p>
    ${audioInventoryHtml()}
    <ul class="export-pick">${songs.map((song) => {
      const up = practice.available?.get(song.id);
      const changes = up ? audioChanges(song.id) : [];
      return `<li class="${up ? (changes.length ? 'changed' : 'uploaded') : ''}"><label title="${up ? (changes.length ? `Changed in Ableton since it was uploaded: ${escapeHtml(changes.join(', '))}` : `${up.length} files on the band app`) : 'Not uploaded yet'}"><input type="checkbox" data-export-song="${escapeHtml(song.id)}" ${exportJob.selected.has(song.id) ? 'checked' : ''} ${running ? 'disabled' : ''}><span class="song-id">${escapeHtml(song.id)}</span> <span class="export-name">${escapeHtml(song.name)}</span>${up ? ' <span class="export-up">●</span>' : ''}</label></li>`;
    }).join('')}</ul>`;
  // Only redraw what changed: during an export the progress below updates
  // every 2 s, but the buttons and the list stay put so clicks aren't lost.
  if (!box.querySelector(':scope > .export-list-wrap')) box.innerHTML = '<div class="export-controls"></div><div class="export-list-wrap"></div><div class="export-status-wrap"></div>';
  const cut = controlsHtml.indexOf('<ul class="export-pick">');
  const topHtml = cut >= 0 ? controlsHtml.slice(0, cut) : controlsHtml;
  const listHtml = cut >= 0 ? controlsHtml.slice(cut) : '';
  const controls = box.querySelector(':scope > .export-controls');
  if (controls._html !== topHtml) { controls.innerHTML = topHtml; controls._html = topHtml; }
  const listWrap = box.querySelector(':scope > .export-list-wrap');
  // A tick the user just made is already on screen: don't redraw the list for it.
  if (opts.keepList && listWrap._html) listWrap._html = listHtml;
  else if (listWrap._html !== listHtml) { listWrap.innerHTML = listHtml; listWrap._html = listHtml; }
  const statusWrap = box.querySelector(':scope > .export-status-wrap');
  if (statusWrap._html !== status) { statusWrap.innerHTML = status; statusWrap._html = status; }
  const list = box.querySelector('.export-pick');
  if (list && listScroll && list !== oldList) { list.scrollTop = listScroll[0]; list.scrollLeft = listScroll[1]; }
  if (Math.abs(window.scrollY - pageScroll) > 1) window.scrollTo(0, pageScroll);
}
function exportChangedIds() {
  return state.songs.filter((song) => practice.available?.has(song.id) && audioChanges(song.id).length).map((song) => song.id);
}
function exportVersionAtLeast(want) {
  const have = String(abletonBridge.status?.version || abletonBridge.version || '0').split('.').map(Number);
  const need = want.split('.').map(Number);
  for (let i = 0; i < need.length; i += 1) {
    if ((have[i] || 0) !== need[i]) return (have[i] || 0) > need[i];
  }
  return true;
}

// Progress weighs every file by its song's length: done songs count their
// files, the current song its finished files, and songs still to come the
// average number of files per song so far (about 11 at the start).
// Time left: from how long earlier exports took (practice_export_log, one
// row per song), as seconds of export per file per second of song. Falls back
// to this run's own pace until there is history.
function exportProgress(job) {
  const queue = job.queue || [job.song_id];
  const dur = (id) => state.songs.find((song) => song.id === id)?.duration_seconds || 240;
  const results = job.results || [];
  const doneSongs = results.filter((r) => r.files > 0);
  const avgFiles = doneSongs.length ? doneSongs.reduce((sum, r) => sum + r.files, 0) / doneSongs.length : (exportJob.avgFiles || 11);
  const now = Date.now() / 1000;
  const rate = exportJob.rate;
  if (rate && job.state !== 'uploading') {
    let doneSec = 0;
    let totalSec = 0;
    queue.forEach((id, i) => {
      const r = results.find((item) => item.song_id === id);
      if (r) { const s = r.seconds ?? r.files * dur(id) * rate; doneSec += s; totalSec += s; return; }
      if (i === job.song_index && job.song_started_at) {
        const expected = (job.total || avgFiles) * dur(id) * rate;
        const elapsed = Math.max(0, now - job.song_started_at);
        doneSec += Math.min(elapsed, expected * 0.97);
        totalSec += Math.max(expected, elapsed / 0.97);
        return;
      }
      totalSec += avgFiles * dur(id) * rate;
    });
    const left = Math.max(0, totalSec - doneSec);
    return { pct: totalSec ? Math.min(100, (doneSec / totalSec) * 100) : 0, eta: exportFmtSeconds(left), basis: 'history' };
  }
  let done = 0;
  let total = 0;
  queue.forEach((id, i) => {
    const r = results.find((item) => item.song_id === id);
    if (r) { done += r.files * dur(id); total += r.files * dur(id); }
    else if (i === job.song_index && job.state !== 'uploading') {
      const files = job.total || avgFiles;
      done += (job.done || []).length * dur(id);
      total += files * dur(id);
    } else total += avgFiles * dur(id);
  });
  const pct = total ? Math.min(100, (done / total) * 100) : 0;
  let eta = '';
  const elapsed = now - (job.started_at || now);
  if (pct > 2 && elapsed > 60) eta = exportFmtSeconds(elapsed * (100 - pct) / pct);
  return { pct: job.state === 'uploading' ? 100 : pct, eta, basis: 'pace' };
}
function exportFmtSeconds(left) {
  const h = Math.floor(left / 3600);
  const m = Math.max(1, Math.round((left % 3600) / 60));
  return h ? `${h} h ${m} min` : `${m} min`;
}
// Past export timings -> rate (s of export per file per s of song).
async function exportLoadRate() {
  const { data, error } = await db.from('practice_export_log').select('files, export_seconds, song_seconds')
    .eq('state', 'done').gt('files', 0).order('finished_at', { ascending: false }).limit(40);
  if (error || !data?.length) { exportJob.rate = 0; return; }
  let work = 0;
  let secs = 0;
  let files = 0;
  for (const row of data) {
    if (!row.song_seconds) continue;
    work += row.files * row.song_seconds;
    secs += Number(row.export_seconds);
    files += row.files;
  }
  if (work > 0) exportJob.rate = secs / work;
  if (data.length) exportJob.avgFiles = files / data.length;
  exportJob.logCount = data.length;
}
// ---- Practice audio freshness --------------------------------------------
// Storage check (admin): the files in the R2 bucket against the upload records
// in practice_audio_state, by exact song and element (not just counts).
function audioInventoryCheck(available, audioState, songIds) {
  const known = new Set(songIds || []);
  const inR2 = new Set(); const inState = new Set(); const legacy = []; const unknownSongs = new Set();
  for (const [songId, files] of available || []) {
    if (!known.has(songId)) unknownSongs.add(songId);
    for (const file of files || []) {
      inR2.add(`${songId}|${file.element}`);
      if (file.ext === 'mp3') legacy.push(`${songId} ${file.element}`);
    }
  }
  for (const [songId, elements] of audioState || []) {
    for (const element of Object.keys(elements || {})) inState.add(`${songId}|${element}`);
  }
  const label = (key) => key.replace('|', ' ');
  return {
    files: inR2.size, records: inState.size,
    noRecord: [...inR2].filter((key) => !inState.has(key)).map(label).sort(),
    noFile: [...inState].filter((key) => !inR2.has(key)).map(label).sort(),
    legacy: legacy.sort(), unknownSongs: [...unknownSongs].sort()
  };
}
function audioInventoryHtml() {
  if (!practice.available || practice.availableFromDevice || !exportJob.audioState) return '';
  const c = audioInventoryCheck(practice.available, exportJob.audioState, (state.songs || []).map((song) => song.id));
  const list = (items) => escapeHtml(items.slice(0, 8).join(', ')) + (items.length > 8 ? ` and ${items.length - 8} more` : '');
  const problems = [];
  if (c.noFile.length) problems.push(`${c.noFile.length} upload record${c.noFile.length === 1 ? '' : 's'} with no file (${list(c.noFile)})`);
  if (c.noRecord.length) problems.push(`${c.noRecord.length} file${c.noRecord.length === 1 ? '' : 's'} with no upload record (${list(c.noRecord)})`);
  if (c.unknownSongs.length) problems.push(`files for song IDs that are not in the app (${list(c.unknownSongs)})`);
  const legacy = c.legacy.length ? ` ${c.legacy.length} older MP3 file${c.legacy.length === 1 ? '' : 's'} (${list(c.legacy)}).` : '';
  return problems.length
    ? `<p class="muted export-inventory"><span class="error">Storage check: ${problems.join('; ')}.</span>${legacy}</p>`
    : `<p class="muted export-inventory">Storage check: ${c.files} files on Cloudflare match the ${c.records} upload records.${legacy}</p>`;
}

// practice_audio_state: per uploaded file, the fingerprint of its Ableton
// tracks at export. app_meta 'audio_fingerprints': the set as last read.
// A difference = that song's upload is out of date (yellow in the checklist).
async function audioStateLoad() {
  const [{ data: rows, error }, { data: meta }] = await Promise.all([
    db.from('practice_audio_state').select('song_id, element, fingerprint'),
    db.from('app_meta').select('value').eq('key', 'audio_fingerprints').maybeSingle()
  ]);
  if (error) throw error;
  const map = new Map();
  for (const row of rows || []) {
    if (!map.has(row.song_id)) map.set(row.song_id, {});
    map.get(row.song_id)[row.element] = row.fingerprint;
  }
  exportJob.audioState = map;
  exportJob.currentFp = meta?.value?.songs || {};
}
async function audioStateAfterRead(snapshot, { seed = true } = {}) {
  const songs = {};
  for (const [id, data] of Object.entries(snapshot?.songs || {})) if (data.audio_fp) songs[id] = data.audio_fp;
  if (!Object.keys(songs).length) return; // TSPWork older than the fingerprint update
  await db.from('app_meta').upsert({ key: 'audio_fingerprints', value: { songs, als_modified_at: snapshot.als_modified_at }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  // Always reload the stored upload fingerprints: they may have changed since
  // this page loaded (another export, another device, a manual fix).
  await audioStateLoad();
  exportJob.currentFp = songs;
  // Songs uploaded before fingerprints existed: take this read as their baseline.
  if (seed) {
    if (!practice.available) { try { await practiceLoadAvailable(); } catch { /* ignore */ } }
    const rows = [];
    for (const [id, files] of practice.available || []) {
      if (exportJob.audioState.has(id) || !songs[id]) continue;
      for (const file of files) {
        const fp = songs[id][file.element];
        if (fp) rows.push({ song_id: id, element: file.element, fingerprint: fp, als_modified_at: snapshot.als_modified_at });
      }
    }
    if (rows.length) {
      const { error } = await db.from('practice_audio_state').upsert(rows, { onConflict: 'song_id,element' });
      if (!error) await audioStateLoad();
    }
  }
}
async function exportSaveAudioState(job) {
  const base = exportJob.baseline;
  if (!base) return;
  exportJob.stateSaved ||= new Set();
  for (const r of job?.results || []) {
    const key = `${r.song_id}|${r.started_at}`;
    if (r.state !== 'done' || !r.started_at || exportJob.stateSaved.has(key)) continue;
    const fp = base.songs[r.song_id]?.audio_fp;
    if (!fp) continue;
    exportJob.stateSaved.add(key);
    const elements = (r.file_seconds || []).map(([label]) => label);
    const rows = elements.filter((el) => fp[el]).map((el) => ({ song_id: r.song_id, element: el, fingerprint: fp[el], exported_at: new Date((r.finished_at || Date.now() / 1000) * 1000).toISOString(), als_modified_at: base.als_modified_at }));
    // Whole-song fingerprint too, so newly added parts count as a change.
    if (fp.Mixdown && !elements.includes('Mixdown')) rows.push({ song_id: r.song_id, element: 'Mixdown', fingerprint: fp.Mixdown, als_modified_at: base.als_modified_at });
    const del = await db.from('practice_audio_state').delete().eq('song_id', r.song_id);
    const ins = rows.length ? await db.from('practice_audio_state').insert(rows) : { error: null };
    if (del.error || ins.error) { exportJob.stateSaved.delete(key); console.warn('Audio state not saved', del.error || ins.error); continue; }
    if (exportJob.audioState) exportJob.audioState.set(r.song_id, Object.fromEntries(rows.map((row) => [row.element, row.fingerprint])));
  }
}
// What changed in the set since this song was uploaded ([] = up to date or unknown).
function audioChanges(songId) {
  const stored = exportJob.audioState?.get(songId);
  const now = exportJob.currentFp?.[songId];
  if (!stored || !now) return [];
  const changed = Object.keys(stored).filter((el) => el !== 'Mixdown' && now[el] !== stored[el]);
  if (!changed.length && stored.Mixdown && now.Mixdown && stored.Mixdown !== now.Mixdown) {
    const added = Object.keys(now).filter((el) => el !== 'Mixdown' && now[el] && !(el in stored));
    return added.length ? added.map((el) => `${el} (new)`) : ['Mixdown'];
  }
  return changed;
}

// Save each finished song's timing once (TSPWork 1.16 with timing).
async function exportLogResults(job) {
  exportJob.logged ||= new Set();
  const fresh = (job?.results || []).filter((r) => r.started_at && r.seconds != null && (r.state === 'done' || r.state === 'error'))
    .filter((r) => !exportJob.logged.has(`${r.song_id}|${r.started_at}`));
  const keys = fresh.map((r) => `${r.song_id}|${r.started_at}`);
  const rows = fresh.map((r) => ({
      song_id: r.song_id, state: r.state, files: r.files || 0, export_seconds: r.seconds,
      song_seconds: state.songs.find((song) => song.id === r.song_id)?.duration_seconds ?? null,
      file_seconds: r.file_seconds || [],
      started_at: new Date(r.started_at * 1000).toISOString(), finished_at: new Date(r.finished_at * 1000).toISOString()
    }));
  if (!rows.length) return;
  keys.forEach((key) => exportJob.logged.add(key));
  const { error } = await db.from('practice_export_log').upsert(rows, { onConflict: 'song_id,started_at', ignoreDuplicates: true });
  if (error) { console.warn('Export timing not saved', error); keys.forEach((key) => exportJob.logged.delete(key)); return; }
  exportLoadRate();
}

async function exportRefreshStorage() {
  if (exportJob.storageLoading) return;
  exportJob.storageLoading = true;
  try {
    const { data } = await db.functions.invoke('practice-audio', { body: { action: 'list' } });
    if (data?.ok) {
      exportJob.storageBytes = data.total_bytes;
      practice.available = new Map(Object.entries(data.songs || {}));
    }
  } catch { /* try again later */ } finally {
    exportJob.storageLoading = false;
    exportJob.storageAt = Date.now();
  }
}

async function pollExport() {
  if (!exportJob.storageAt || Date.now() - exportJob.storageAt > 60000) exportRefreshStorage();
  try {
    const result = await abletonRequest('/export/state', {}, 3000);
    exportJob.state = result?.job || exportJob.state;
  } catch { /* Live may be busy rendering; try again */ }
  if (exportJob.state?.results?.length) { exportLogResults(exportJob.state); exportSaveAudioState(exportJob.state); }
  if (exportJob.rate == null && !exportJob.rateLoading) { exportJob.rateLoading = true; exportLoadRate().finally(() => { exportJob.rateLoading = false; }); }
  renderExportPanel();
  if (!exportJob.state || !['starting', 'running', 'uploading'].includes(exportJob.state.state)) {
    clearInterval(exportJob.timer);
    exportJob.timer = null;
    const job = exportJob.state;
    practice.available = null;
    // Songs that exported fine are unchecked; any that failed stay checked for another go.
    (job?.results || []).forEach((r) => { if (r.state === 'done') exportJob.selected.delete(r.song_id); });
    renderExportPanel();
    if (job?.state === 'done' && job.stopped_early) showNotice(`Export stopped as asked: ${job.results.filter((r) => r.state === 'done').length} songs exported.`);
    else if (job?.state === 'done') showNotice(`Export finished: ${(job.queue || []).length > 1 ? `${job.results.length} songs` : `${job.done.length} files for ${job.song_id}`}.`);
    if (job?.state === 'error') showNotice(`Export finished with problems: ${job.error}`, true);
  }
}

async function startExport() {
  if (exportJob.preparing) return;
  const songs = state.songs.filter((song) => exportJob.selected.has(song.id));
  if (!songs.length) return;
  const prefs = exportPrefs();
  const label = songs.length === 1 ? `${songs[0].id} ${songs[0].name}` : `${songs.length} songs`;
  if (!window.confirm(`Export practice audio for ${label}${prefs.upload ? ' and upload it to the band app' : ''}?\n\nFolder: ${prefs.root}\n\nAbleton will solo tracks and open its Export dialog many times (about a minute per file). Don't use the Mac until it finishes. You can cancel from here.`)) return;
  try {
    // The fingerprints saved with each upload come from the latest read of the
    // set (this window's, or the one saved in the app). No new read here: a
    // read takes minutes. Read the set first if you've changed it since.
    exportJob.baseline = null;
    exportJob.preparing = 'Using the latest read of the Ableton set…';
    renderExportPanel();
    try {
      const recent = [sync.snapshot, exportJob.lastSnapshot]
        .filter((snap) => snap?.als_modified_at && Object.values(snap.songs || {}).some((song) => song.audio_fp))
        .sort((x, y) => Date.parse(y.als_modified_at) - Date.parse(x.als_modified_at))[0];
      const { data: meta } = await db.from('app_meta').select('value').eq('key', 'audio_fingerprints').maybeSingle();
      const saved = meta?.value?.songs ? meta.value : null;
      const useSaved = saved && (!recent || Date.parse(saved.als_modified_at || 0) > Date.parse(recent.als_modified_at));
      if (useSaved) {
        exportJob.baseline = { songs: Object.fromEntries(Object.entries(saved.songs).map(([id, fp]) => [id, { audio_fp: fp }])), als_modified_at: saved.als_modified_at };
      } else if (recent) {
        exportJob.baseline = { songs: recent.songs, als_modified_at: recent.als_modified_at };
      }
    } catch (error) { console.warn('Latest set read not loaded before export', error); }
    exportJob.preparing = 'Preparing upload links…';
    renderExportPanel();
    let uploads = {};
    if (prefs.upload) {
      // Signed upload links (valid 24 h) for every song in the run; TSPWork
      // uploads each file right after exporting it.
      const { data, error } = await db.functions.invoke('practice-audio', { body: { action: 'upload_batch', song_ids: songs.map((song) => song.id) } });
      if (error || !data?.ok) throw new Error(`upload links: ${data?.error || error?.message || 'failed'}`);
      uploads = data.urls;
    }
    let result = null;
    // Wait while TSPWork is busy (a set read can take several minutes), up to 15 min.
    const busyUntil = Date.now() + SET_READ_TIMEOUT_MS;
    for (;;) {
      result = await abletonRequest('/export', { songs: songs.map(exportSongPayload), export_root: prefs.root, uploads }, 20000);
      if (result?.error !== 'busy' || Date.now() > busyUntil) break;
      const since = abletonBridge.status?.reading_since;
      exportJob.preparing = since
        ? `TSPWork is reading the set (since ${new Date(since * 1000).toLocaleTimeString()}); the export starts as soon as it's done…`
        : 'TSPWork is busy; starting as soon as it is free…';
      renderExportPanel();
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!result?.ok) {
      exportJob.preparing = null;
      renderExportPanel();
      const why = { busy: 'TSPWork stayed busy for 15 minutes. Reselect TSPWork in Live and try again.', export_running: 'An export is already running.', export_folder_missing: `The folder isn't available: ${prefs.root}. Is the SSD connected?`, bad_export_folder: 'That folder path is not valid.' }[result?.error];
      showNotice(why || `Could not start the export: ${result?.error || 'no response'}`, true);
      return;
    }
    exportJob.preparing = null;
    exportJob.state = result.job;
    renderExportPanel();
    clearInterval(exportJob.timer);
    exportJob.timer = setInterval(pollExport, 4000);
  } catch (error) {
    exportJob.preparing = null;
    renderExportPanel();
    showNotice(String(error?.message || '').startsWith('upload links') ? `Could not prepare uploads (${error.message}).` : 'Ableton did not answer. Is TSPWork 1.16 running?', true);
  }
}

document.addEventListener('change', async (event) => {
  if (event.target.matches?.('[data-export-setlist]') && event.target.value) {
    // Adds every song of that setlist to the selection.
    const setlistId = event.target.value;
    const { data, error } = await db.from('setlist_items').select('song_id').eq('setlist_id', setlistId);
    if (error) { fail('Could not read that setlist.', error); return; }
    (data || []).forEach((row) => { if (row.song_id) exportJob.selected.add(row.song_id); });
    const name = state.setlists.find((list) => list.id === setlistId)?.name || 'setlist';
    showNotice(`Selected the ${new Set((data || []).filter((r) => r.song_id).map((r) => r.song_id)).size} songs of ${name}.`);
    renderExportPanel();
    return;
  }
  if (event.target.id === 'export-root') { saveExportPrefs({ root: event.target.value.trim() || DEFAULT_EXPORT_ROOT }); return; }
  if (event.target.id === 'export-upload') { saveExportPrefs({ upload: event.target.checked }); return; }
  const box = event.target.closest?.('[data-export-song]');
  if (!box) return;
  if (box.checked) exportJob.selected.add(box.dataset.exportSong); else exportJob.selected.delete(box.dataset.exportSong);
  renderExportPanel({ keepList: true });
});
document.addEventListener('click', (event) => {
  if (event.target.closest('#export-start')) startExport();
  if (event.target.closest('[data-export-all]')) { state.songs.forEach((song) => exportJob.selected.add(song.id)); renderExportPanel(); }
  if (event.target.closest('[data-export-none]')) { exportJob.selected.clear(); renderExportPanel(); }
  if (event.target.closest('[data-export-changed]')) { exportChangedIds().forEach((id) => exportJob.selected.add(id)); renderExportPanel(); }
  if (event.target.closest('[data-export-unuploaded]')) {
    for (const id of [...exportJob.selected]) if (practice.available?.has(id) && !audioChanges(id).length) exportJob.selected.delete(id);
    renderExportPanel();
  }
  if (event.target.closest('#export-cancel')) {
    if (!window.confirm('Cancel the export right now? The song being exported is left unfinished. (To finish it first, use "Stop after this song".)')) return;
    exportControl({}, (job, direct) => direct || !job || !['starting', 'running'].includes(job.state),
      'Cancelling the export…', 'OK: the export is being cancelled.', 'cancel');
  }
  const stopBtn = event.target.closest('#export-stop-after');
  if (stopBtn && !stopBtn.disabled) {
    const undo = !!exportJob.state?.stop_after_song;
    const songId = exportJob.state?.song_id || 'this song';
    stopBtn.disabled = true;
    stopBtn.textContent = undo ? 'Resuming…' : 'Asking TSPWork to stop…';
    exportControl({ after_song: true, undo }, (job) => !!job?.stop_after_song === !undo,
      undo ? 'Asking TSPWork to carry on…' : `Asking TSPWork to stop after ${songId}…`,
      undo ? 'OK: the export will carry on with the remaining songs.' : `OK: the export will stop after ${songId} finishes.`, 'stop');
  }
});
// While Live renders, TSPWork's server inside Live gets little time and drops
// connections in bursts, so a stop/cancel is sent again (with a long wait each
// time) until TSPWork confirms it, for up to ~4 minutes.
async function exportControl(body, applied, waitingMsg, okMsg, kind) {
  const token = {};
  exportJob.control = { token, kind, waiting: waitingMsg };
  renderExportPanel();
  showNotice(waitingMsg);
  const until = Date.now() + 4 * 60 * 1000;
  let done = false;
  for (let attempt = 1; Date.now() < until && exportJob.control?.token === token; attempt += 1) {
    try {
      const result = await abletonRequest('/export/cancel', body, 25000);
      if (result?.job !== undefined) exportJob.state = result.job || exportJob.state;
      if (result?.ok && applied(result.job, true)) { done = true; break; }
    } catch { /* dropped while Live renders: try again */ }
    // Maybe it got through but the answer was lost: check the state too.
    try {
      const st = await abletonRequest('/export/state', {}, 15000);
      if (st?.job) exportJob.state = st.job;
      if (st && applied(st.job, false)) { done = true; break; }
    } catch { /* ignore */ }
    if (exportJob.control?.token === token) { exportJob.control.waiting = `${waitingMsg} (try ${attempt + 1}; Live is busy rendering)`; renderExportPanel(); }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (exportJob.control?.token === token) exportJob.control = null;
  renderExportPanel();
  if (done) showNotice(okMsg);
  else showNotice(`TSPWork still hasn't confirmed after 4 minutes. ${kind === 'stop' ? 'Try again, or use Cancel.' : 'In Ableton, press Esc to close the Export dialog, then set TSPWork to None and back.'}`, true);
}
$('#sync-content').addEventListener('click', (event) => {
  const resolve = event.target.closest('[data-lyric-resolve]');
  if (resolve) { const [songId, slug, t] = resolve.dataset.lyricResolve.split('|'); resolveLyricConflict(songId, slug, Number(t), resolve.dataset.choice); return; }
  const jump = event.target.closest('[data-sync-jump]');
  if (jump) { sendAbletonCommand('/jump', { song_id: jump.dataset.syncJump }); return; }
  const select = event.target.closest('[data-sync-select]');
  if (select) {
    const taskKey = select.dataset.task === 'backing_track_manual' ? 'mixed_backing' : select.dataset.task;
    const body = { song_id: select.dataset.syncSelect, task_key: taskKey, review: true };
    if (select.dataset.fromBeat) {
      // Show about 8 bars from the mismatch (a little before it, for context).
      const beat = Number(select.dataset.fromBeat);
      Object.assign(body, { from_beat: beat - 4, to_beat: beat + 28 });
    }
    sendAbletonCommand('/select', body);
    return;
  }
  const { tasks, meta } = sync.snapshot ? computeSyncDiff(sync.snapshot) : { tasks: [], meta: [] };
  if (event.target.closest('[data-sync-toggle-allowed]')) { sync.showAllowed = !sync.showAllowed; renderSyncPage(); return; }
  const dismiss = event.target.closest('[data-sync-dismiss]');
  if (dismiss) { sync.dismissed.add(dismiss.dataset.syncDismiss); renderSyncPage(); return; }
  const chordButton = event.target.closest('[data-sync-chord]');
  if (chordButton) { const [songId, taskKey] = chordButton.dataset.syncChord.split('|'); setChordAllowed(songId, taskKey, chordButton.dataset.allow === '1'); return; }
  if (event.target.closest('[data-sync-toggle-snoozed]')) { sync.showSnoozed = !sync.showSnoozed; renderSyncPage(); return; }
  const unsnooze = event.target.closest('[data-sync-unsnooze]');
  if (unsnooze) { const [songId, taskKey] = unsnooze.dataset.syncUnsnooze.split(':'); unsnoozeSyncTask(songId, taskKey); return; }
  const snooze = event.target.closest('[data-sync-snooze]');
  if (snooze) { const item = tasks.find((i) => `t:${i.songId}:${i.taskKey}` === snooze.dataset.syncSnooze); if (item) snoozeSyncTask(item); return; }
  const taskButton = event.target.closest('[data-sync-task]');
  if (taskButton) { runSyncApply(tasks.filter((i) => `t:${i.songId}:${i.taskKey}` === taskButton.dataset.syncTask), []); return; }
  const metaButton = event.target.closest('[data-sync-meta]');
  if (metaButton) { runSyncApply([], meta.filter((i) => `m:${i.songId}:${i.field}` === metaButton.dataset.syncMeta)); return; }
  const all = event.target.closest('[data-sync-all]');
  if (all) {
    const isTasks = all.dataset.syncAll === 'tasks';
    const count = isTasks ? tasks.length : meta.length;
    if (!window.confirm(`${isTasks ? 'Complete' : 'Apply'} all ${count} ${isTasks ? 'task updates' : 'song detail changes'}?`)) return;
    runSyncApply(isTasks ? tasks : [], isTasks ? [] : meta);
  }
});


// ---------------------------------------------------------------------------
// Practice page. MP3s exported by TSPWork are uploaded (admin) to Cloudflare R2;
// the practice-audio Edge Function hands out short-lived signed links. Top: the
// Mixdown with plain controls. Bottom: an Ableton-style multitrack (on/off,
// solo, volume, meter per track) decoded in the browser and played in sync.
// Track settings are kept per track name for this browser session, so they
// carry across songs (e.g. Bass off stays off).
const PRACTICE_ORDER = ['Part - Bass', 'Part - Keyboard', 'Part - Guitar', 'Part - Violin', 'Part - Percussion', 'Part - Drums',
  'Part - Dale Vox', 'Part - Anston Vox', 'Backing', 'CPC', 'Stem - Bass', 'Stem - Drums', 'Stem - Other', 'Stem - Vocals'];
const PRACTICE_TASK = { 'Part - Bass': 'bass_part', 'Part - Keyboard': 'keyboard_part', 'Part - Guitar': 'guitar_part', 'Part - Violin': 'violin_part',
  'Part - Percussion': 'percussion_part', 'Part - Drums': 'drums_part', 'Part - Dale Vox': 'vox_dale', 'Part - Anston Vox': 'vox_anston' };
const PRACTICE_COLORS = { 'Part - Bass': '#ff8d4f', 'Part - Keyboard': '#ffd54d', 'Part - Guitar': '#79d36b', 'Part - Violin': '#ef7fb7',
  'Part - Percussion': '#c79bff', 'Part - Drums': '#5fb8ff', 'Part - Dale Vox': '#ff6b6b', 'Part - Anston Vox': '#ffa1a1',
  Backing: '#4fd6c7', CPC: '#a8a8a8', 'Stem - Bass': '#b98a6a', 'Stem - Drums': '#6f97b8', 'Stem - Other': '#8fae7c', 'Stem - Vocals': '#b8828f' };
const PRACTICE_SETTINGS_KEY = 'tsp-practice-mix-v1';
const practice = {
  songId: '', available: null, tracks: [], loadingSong: false, error: '',
  ctx: null, master: null, buffers: new Map(), nodes: new Map(), loadState: new Map(), eager: null, decodedBytes: 0,
  playing: false, offset: 0, startedAt: 0, duration: 0, raf: null, loadToken: 0, loadingRun: -1,
  upload: { items: [], running: false }
};

function practiceSettings() {
  try { return JSON.parse(sessionStorage.getItem(PRACTICE_SETTINGS_KEY) || '{}'); } catch { return {}; }
}
function practiceTrackSetting(element) {
  const saved = practiceSettings()[element];
  return { on: saved?.on ?? !element.startsWith('Stem'), solo: !!saved?.solo, vol: saved?.vol ?? 1 };
}
function savePracticeTrackSetting(element, patch) {
  const all = practiceSettings();
  all[element] = { ...practiceTrackSetting(element), ...patch };
  try { sessionStorage.setItem(PRACTICE_SETTINGS_KEY, JSON.stringify(all)); } catch { /* private mode: keep in memory only */ }
  practice.memory = all;
}

// ---------------------------------------------------------------------------
// Offline audio: practice files saved on this device so they download once.
// Two places, chosen by the member:
//   folder  - a folder they pick (Chrome/Edge on a computer: File System Access)
//   browser - this browser's own storage (Cache Storage; works on iPhone too)
// A manifest records each saved file's version (size + upload time); a newer
// upload on the band app shows up as an update to download.
const OFFLINE_PREF_KEY = 'tsp-offline-v1';
const OFFLINE_MANIFEST_KEY = 'tsp-offline-manifest-v1';
const OFFLINE_CACHE = 'tsp-practice-audio-v1';
const offline = { mode: 'none', dir: null, folderName: '', manifest: {}, ready: false, needsPermission: false, job: null, urls: new Map(), initPromise: null };

function offlineVersion(t) { return `${t.bytes || 0}|${t.uploaded_at || t.modified || ''}`; }
function offlinePrefsGet() { try { return JSON.parse(localStorage.getItem(OFFLINE_PREF_KEY) || '{}'); } catch { return {}; } }
function offlinePrefsSet(patch) { try { localStorage.setItem(OFFLINE_PREF_KEY, JSON.stringify({ ...offlinePrefsGet(), ...patch })); } catch { /* ignore */ } }
function offlineFolderSupported() { return typeof window.showDirectoryPicker === 'function'; }
function offlineBrowserSupported() { return typeof caches !== 'undefined'; }

// Tiny IndexedDB key/value store (the chosen folder's handle lives here).
function offlineIdb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tsp-offline', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', mode);
      const r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(r?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

function offlineInit() {
  if (offline.initPromise) return offline.initPromise;
  offline.initPromise = (async () => {
    const prefs = offlinePrefsGet();
    // Saving on the device is on by default (in the browser's storage); a
    // member can switch it off or choose a folder instead.
    // Saving on the device is always on: in the browser's storage, or in a
    // folder the member picked (Chrome/Edge on a computer).
    offline.mode = prefs.mode === 'folder' ? 'folder' : (offlineBrowserSupported() ? 'browser' : 'none');
    if (offline.mode === 'browser') { try { navigator.storage?.persist?.(); } catch { /* ignore */ } }
    try { offline.manifest = JSON.parse(localStorage.getItem(OFFLINE_MANIFEST_KEY) || '{}'); } catch { offline.manifest = {}; }
    if (offline.mode === 'folder') {
      try {
        const handle = await offlineIdb('readonly', (store) => store.get('folder'));
        if (!handle) { offline.mode = 'none'; }
        else {
          offline.folderName = handle.name;
          const perm = await handle.queryPermission({ mode: 'readwrite' });
          if (perm === 'granted') { offline.dir = handle; await offlineReadFolderManifest(); }
          else offline.needsPermission = true;
          offline.handle = handle;
        }
      } catch (error) { console.warn('Offline folder not available', error); offline.mode = 'none'; }
    }
    if (offline.mode === 'browser' && !offlineBrowserSupported()) offline.mode = 'none';
    offline.ready = true;
  })();
  return offline.initPromise;
}
async function offlineReadFolderManifest() {
  try {
    const fh = await offline.dir.getFileHandle('tsp-audio-manifest.json');
    offline.manifest = JSON.parse(await (await fh.getFile()).text()) || {};
  } catch { /* new folder: keep the local copy of the manifest */ }
}
let offlineManifestTimer = null;
function offlineSaveManifest() {
  try { localStorage.setItem(OFFLINE_MANIFEST_KEY, JSON.stringify(offline.manifest)); } catch { /* ignore */ }
  if (offline.mode !== 'folder' || !offline.dir) return;
  clearTimeout(offlineManifestTimer);
  offlineManifestTimer = setTimeout(async () => {
    try {
      const fh = await offline.dir.getFileHandle('tsp-audio-manifest.json', { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(offline.manifest, null, 1));
      await w.close();
    } catch (error) { console.warn('Manifest not written', error); }
  }, 400);
}
function offlineFileName(element, ext) { return `${element}.${ext || 'm4a'}`; }
const offlineCacheKey = (songId, element) => `https://tsp-offline.local/${encodeURIComponent(songId)}/${encodeURIComponent(element)}`;

async function offlineRead(songId, element) {
  const m = offline.manifest[songId]?.[element];
  if (!m) return null;
  try {
    if (offline.mode === 'folder' && offline.dir) {
      const dir = await offline.dir.getDirectoryHandle(songId);
      return await (await dir.getFileHandle(m.file)).getFile();
    }
    if (offline.mode === 'browser') {
      const res = await (await caches.open(OFFLINE_CACHE)).match(offlineCacheKey(songId, element));
      return res ? await res.blob() : null;
    }
  } catch { /* missing on disk */ }
  return null;
}
async function offlineWrite(songId, element, track, blob) {
  const ext = track.ext || 'm4a';
  if (offline.mode === 'folder' && offline.dir) {
    const dir = await offline.dir.getDirectoryHandle(songId, { create: true });
    const name = offlineFileName(element, ext);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    const old = offline.manifest[songId]?.[element]?.file;
    if (old && old !== name) { try { await dir.removeEntry(old); } catch { /* ignore */ } }
    (offline.manifest[songId] ||= {})[element] = { v: offlineVersion(track), file: name, ext, bytes: blob.size, modified: track.uploaded_at || track.modified || '' };
  } else if (offline.mode === 'browser') {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put(offlineCacheKey(songId, element), new Response(blob, { headers: { 'Content-Type': ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4' } }));
    (offline.manifest[songId] ||= {})[element] = { v: offlineVersion(track), file: offlineFileName(element, ext), ext, bytes: blob.size, modified: track.uploaded_at || track.modified || '' };
  } else return;
  offlineSaveManifest();
}
function offlineObjectUrl(key, blob) {
  const old = offline.urls.get(key);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(blob);
  offline.urls.set(key, url);
  return url;
}
// The audio for a track: the saved copy if it's the current version (or if
// we're offline), otherwise download it (and save it when saving is on).
// Songs opened in this visit stay in memory (compressed), so going back to a
// song never downloads it again, even if the device couldn't save it.
const PHONE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const memBlobs = new Map();
const MEM_BLOB_BUDGET = (PHONE ? 220 : 700) * 1048576;
function memBlobKey(songId, track) { return `${songId}|${track.element}|${offlineVersion(track)}`; }
function memBlobGet(songId, track) {
  const key = memBlobKey(songId, track);
  const blob = memBlobs.get(key) || (track.offline ? [...memBlobs.entries()].find(([k]) => k.startsWith(`${songId}|${track.element}|`))?.[1] : null);
  if (blob) { memBlobs.delete(key); memBlobs.set(key, blob); }
  return blob || null;
}
function memBlobPut(songId, track, blob) {
  for (const k of [...memBlobs.keys()]) if (k.startsWith(`${songId}|${track.element}|`)) memBlobs.delete(k);
  memBlobs.set(memBlobKey(songId, track), blob);
  let total = 0;
  for (const b of memBlobs.values()) total += b.size;
  for (const [k, b] of memBlobs) { if (total <= MEM_BLOB_BUDGET) break; if (k.startsWith(`${songId}|`)) continue; memBlobs.delete(k); total -= b.size; }
}
async function offlineTrackBlob(songId, track, onStatus) {
  await offlineInit();
  const inMemory = memBlobGet(songId, track);
  if (inMemory) return inMemory;
  const saved = offline.manifest[songId]?.[track.element];
  const current = saved && (track.offline || saved.v === offlineVersion(track));
  if (offline.mode !== 'none' && (offline.dir || offline.mode === 'browser') && (current || (saved && !track.url))) {
    const blob = await offlineRead(songId, track.element);
    if (blob) { memBlobPut(songId, track, blob); return blob; }
  }
  if (!track.url) throw new Error('not saved on this device and no connection');
  onStatus?.(offline.mode === 'none' ? 'Loading…' : 'Downloading and saving on this device…');
  const response = await fetch(track.url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  memBlobPut(songId, track, blob);
  if (offline.mode !== 'none' && (offline.dir || offline.mode === 'browser')) {
    try { await offlineWrite(songId, track.element, track, blob); offline.lastError = ''; }
    catch (error) {
      console.warn('Not saved on this device', error);
      offline.lastError = `${error?.name || 'Error'}: ${error?.message || error}`;
      renderOfflinePanel();
    }
  }
  return blob;
}
function offlineSavedSongs() {
  const map = new Map();
  for (const [songId, files] of Object.entries(offline.manifest)) {
    map.set(songId, Object.entries(files).map(([element, m]) => ({ element, bytes: m.bytes, modified: m.modified, ext: m.ext })));
  }
  return map;
}
function offlineStats() {
  let files = 0;
  let bytes = 0;
  let mixdowns = 0;
  let multitracks = 0;
  for (const [songId, songFiles] of Object.entries(offline.manifest)) {
    for (const m of Object.values(songFiles)) { files += 1; bytes += m.bytes || 0; }
    if (songFiles.Mixdown) mixdowns += 1;
    // A multitrack counts when every track the band app has for the song is saved
    // (when the list isn't known, e.g. offline, any saved tracks count).
    const parts = (practice.available?.get(songId) || []).filter((f) => f.element !== 'Mixdown').map((f) => f.element);
    const savedParts = Object.keys(songFiles).filter((el) => el !== 'Mixdown');
    if (parts.length ? parts.every((el) => songFiles[el]) : savedParts.length) multitracks += 1;
  }
  return { songs: Object.keys(offline.manifest).length, files, bytes, mixdowns, multitracks };
}
// Saved files whose upload on the band app is newer.
function offlineUpdates() {
  const out = [];
  if (!practice.available || practice.availableFromDevice) return out;
  for (const [songId, files] of Object.entries(offline.manifest)) {
    const now = practice.available.get(songId) || [];
    for (const [element, m] of Object.entries(files)) {
      const up = now.find((f) => f.element === element);
      if (up && m.v !== offlineVersion(up)) out.push({ songId, element, bytes: up.bytes || 0 });
    }
  }
  return out;
}
const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes > 1048576 * 100 ? 0 : 1)} MB`;

async function offlineChooseFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: 'tsp-practice-audio', mode: 'readwrite' });
    await offlineIdb('readwrite', (store) => store.put(handle, 'folder'));
    offline.mode = 'folder'; offline.dir = handle; offline.handle = handle; offline.folderName = handle.name; offline.needsPermission = false;
    offlinePrefsSet({ mode: 'folder' });
    await offlineReadFolderManifest();
    offlineSaveManifest();
    showNotice(`Practice audio will be saved in “${handle.name}”.`);
  } catch (error) { if (error?.name !== 'AbortError') showNotice(`Could not use that folder: ${error.message}`, true); }
  renderOfflinePanel();
}
async function offlineUseBrowser() {
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
  offline.mode = 'browser';
  offlinePrefsSet({ mode: 'browser' });
  showNotice('Practice audio will be saved in this browser on this device.');
  renderOfflinePanel();
}
async function offlineReconnect() {
  try {
    const perm = await offline.handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') { offline.dir = offline.handle; offline.needsPermission = false; await offlineReadFolderManifest(); }
  } catch (error) { showNotice(`Could not open the folder: ${error.message}`, true); }
  renderOfflinePanel();
}
// Frees the space used in the browser; saving stays on (songs save again as they're played).
async function offlineClearBrowser() {
  try { await caches.delete(OFFLINE_CACHE); } catch { /* ignore */ }
  offline.manifest = {};
  offlineSaveManifest();
  memBlobs.clear();
  renderOfflinePanel();
}
// Download (or update) many songs for offline use.
async function offlineDownload(songIds, { everything, onlyUpdates } = {}) {
  if (offline.job) return;
  const job = { done: 0, total: 0, bytes: 0, totalBytes: 0, songs: songIds.length, current: '', cancelled: false, failed: 0 };
  offline.job = job;
  const plan = [];
  for (const id of songIds) {
    const files = practice.available?.get(id) || [];
    for (const f of files) {
      if (!everything && !onlyUpdates && f.element !== 'Mixdown') continue;
      const saved = offline.manifest[id]?.[f.element];
      if (saved && saved.v === offlineVersion(f)) continue;
      if (onlyUpdates && !saved) continue;
      plan.push({ id, element: f.element, bytes: f.bytes || 0 });
    }
  }
  job.total = plan.length;
  job.totalBytes = plan.reduce((sum, p) => sum + p.bytes, 0);
  renderOfflinePanel();
  const bySong = new Map();
  for (const p of plan) (bySong.get(p.id) || bySong.set(p.id, []).get(p.id)).push(p);
  // Lyrics for every song in the list (small), so they work offline too.
  for (const id of songIds) {
    if (job.cancelled) break;
    const { data } = await db.from('song_lyrics').select('tracks, sections, tempo, bars, tone, duration_seconds, updated_at').eq('song_id', id).maybeSingle();
    if (data) await jsonCachePut(`lyrics/${id}`, data);
  }
  for (const [id, items] of bySong) {
    if (job.cancelled) break;
    let tracks = [];
    try {
      const { data, error } = await db.functions.invoke('practice-audio', { body: { action: 'urls', song_id: id } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'links');
      tracks = data.tracks;
    } catch { job.failed += items.length; job.done += items.length; continue; }
    for (const item of items) {
      if (job.cancelled) break;
      const t = tracks.find((x) => x.element === item.element);
      job.current = `${id} ${item.element}`;
      renderOfflinePanel();
      try {
        if (!t) throw new Error('missing');
        const res = await fetch(t.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        await offlineWrite(id, item.element, t, blob);
        job.bytes += blob.size;
      } catch (error) { job.failed += 1; console.warn('Offline download failed', id, item.element, error); }
      job.done += 1;
      renderOfflinePanel();
    }
  }
  offline.job = null;
  showNotice(job.cancelled ? 'Stopped saving audio.' : `Saved ${job.done - job.failed} file${job.done - job.failed === 1 ? '' : 's'} on this device${job.failed ? ` (${job.failed} failed; try again on a better connection)` : ''}.`, !!job.failed);
  renderOfflinePanel();
}

function renderOfflinePanel() {
  const box = $('#practice-offline');
  if (!box) return;
  if (!offline.ready) { offlineInit().then(renderOfflinePanel); return; }
  const stats = offlineStats();
  const updates = offlineUpdates();
  const upBytes = updates.reduce((sum, u) => sum + u.bytes, 0);
  const updSongs = [...new Set(updates.map((u) => u.songId))];
  const list = practice.songList || state.songs;
  const scopeIds = list.map((song) => song.id).filter((id) => practice.available?.has(id));
  const sourceLabel = $('#practice-source')?.selectedOptions?.[0]?.textContent || 'these songs';
  const need = (everything) => {
    let bytes = 0;
    for (const id of scopeIds) for (const f of practice.available.get(id) || []) {
      if (!everything && f.element !== 'Mixdown') continue;
      if (offline.manifest[id]?.[f.element]?.v === offlineVersion(f)) continue;
      bytes += f.bytes || 0;
    }
    return bytes;
  };
  const job = offline.job;
  let body;
  if (offline.mode === 'none') {
    body = '<p class="muted">This browser can\'t keep audio on the device, so songs stream each time. Use Safari, Chrome or Edge to save them.</p>';
  } else if (offline.needsPermission) {
    body = `<p>Saved audio is in the folder <b>${escapeHtml(offline.folderName)}</b>. Allow access again to use it.</p>
      <div class="offline-row"><button type="button" class="button primary" data-offline-reconnect>Open folder “${escapeHtml(offline.folderName)}”</button>${offlineBrowserSupported() ? '<button type="button" class="button quiet" data-offline-browser>Save in the browser instead</button>' : ''}</div>`;
  } else {
    const where = offline.mode === 'folder' ? `the folder <b>${escapeHtml(offline.folderName)}</b>` : 'this browser on this device';
    const mixNeed = need(false);
    const allNeed = need(true);
    body = `<p>Saving in ${where} · <b>${stats.mixdowns}</b> mixdown${stats.mixdowns === 1 ? '' : 's'} and <b>${stats.multitracks}</b> multitrack${stats.multitracks === 1 ? '' : 's'} saved (${mb(stats.bytes)}).${practice.availableFromDevice ? ' <span class="offline-badge">Offline: playing saved audio</span>' : ''}</p>
      ${updates.length ? `<div class="offline-update"><b>Newer audio for ${updSongs.length} song${updSongs.length === 1 ? '' : 's'}</b> (${escapeHtml(updSongs.slice(0, 8).join(', '))}${updSongs.length > 8 ? '…' : ''}) · ${mb(upBytes)} <button type="button" class="button primary" data-offline-update ${job ? 'disabled' : ''}>Update</button></div>` : ''}
      ${job ? `<div class="export-progress"><span style="width:${job.total ? (job.done / job.total) * 100 : 0}%"></span></div>
        <div class="offline-progress-status"><span class="muted offline-progress-label">Saving ${job.done} of ${job.total} files (${mb(job.bytes)} of ${mb(job.totalBytes)})${job.current ? ` · ${escapeHtml(job.current)}` : ''}</span><button type="button" class="button quiet" data-offline-cancel>Stop</button></div>`
      : `<div class="offline-row">
          <span class="muted">Save “${escapeHtml(sourceLabel)}” (${scopeIds.length} songs):</span>
          <button type="button" class="button quiet" data-offline-dl="mix" ${mixNeed ? '' : 'disabled'}>Mixdowns${mixNeed ? ` · ${mb(mixNeed)}` : ' · saved'}</button>
          <button type="button" class="button quiet" data-offline-dl="all" ${allNeed ? '' : 'disabled'}>Everything${allNeed ? ` · ${mb(allNeed)}` : ' · saved'}</button>
        </div>`}
      <p class="muted offline-small">Songs you open are saved as you play them, so they don't download again.${offline.mode === 'browser' ? ' <button type="button" class="linklike" data-offline-clear>Delete saved audio</button>' : ''}${offline.mode === 'folder' && offlineBrowserSupported() ? ' <button type="button" class="linklike" data-offline-browser>Save in the browser instead</button>' : ''}${offline.mode === 'browser' && offlineFolderSupported() ? ' · <button type="button" class="linklike" data-offline-folder>Use a folder instead</button>' : ''}</p>`;
  }
  const bgSongs = [...bgFetch.songs.entries()].filter(([id]) => id !== practice.songId);
  const bgLine = bgSongs.length ? `<p class="muted offline-small">Still downloading in the background: ${bgSongs.map(([id, st]) => `${escapeHtml(id)} (${st.done}/${st.total})`).join(', ')}</p>` : '';
  const saveError = offline.lastError && offline.mode !== 'none'
    ? `<p class="error offline-small">This device could not save the last file (${escapeHtml(offline.lastError)}). It still plays, and won't download again during this visit.</p>` : '';
  box.innerHTML = `<header><h2>Offline audio</h2>${offline.mode !== 'none' && !offline.needsPermission ? '<span class="offline-on">● On</span>' : ''}</header>${body}${bgLine}${saveError}`;
}
document.addEventListener('click', (event) => {
  if (!event.target.closest('#practice-offline')) return;
  if (event.target.closest('[data-offline-folder]')) offlineChooseFolder();
  else if (event.target.closest('[data-offline-browser]')) offlineUseBrowser();
  else if (event.target.closest('[data-offline-reconnect]')) offlineReconnect();
  else if (event.target.closest('[data-offline-cancel]')) { if (offline.job) offline.job.cancelled = true; }
  else if (event.target.closest('[data-offline-clear]')) { if (window.confirm('Delete all practice audio saved in this browser? Songs will save again as you play them.')) offlineClearBrowser(); }
  else if (event.target.closest('[data-offline-update]')) offlineDownload([...new Set(offlineUpdates().map((u) => u.songId))], { onlyUpdates: true });
  else {
    const dl = event.target.closest('[data-offline-dl]');
    if (dl) {
      const list = practice.songList || state.songs;
      offlineDownload(list.map((song) => song.id).filter((id) => practice.available?.has(id)), { everything: dl.dataset.offlineDl === 'all' });
    }
  }
});

// What's uploaded comes straight from the R2 bucket (files from the app's
// upload and from TSPWork's overnight export alike).
async function practiceLoadAvailable() {
  await offlineInit();
  try {
    const { data, error } = await db.functions.invoke('practice-audio', { body: { action: 'list' } });
    if (error || !data?.ok) throw new Error(data?.error || error?.message || 'list failed');
    practice.available = new Map(Object.entries(data.songs || {}));
    practice.availableFromDevice = false;
    exportJob.storageBytes = data.total_bytes;
  } catch (error) {
    // No connection: offer what is saved on this device.
    const saved = offlineSavedSongs();
    if (!saved.size) throw error;
    practice.available = saved;
    practice.availableFromDevice = true;
  }
  renderOfflinePanel();
}

// Which songs the Practice page offers: the whole repertoire, an upcoming
// gig's setlist, or any setlist. Remembered on this device.
const PRACTICE_SOURCE_KEY = 'tsp-practice-source';
const practiceSetlistSongs = new Map(); // setlist id -> [song ids in order]

function practiceSources() {
  const today = new Date().toISOString().slice(0, 10);
  const gigs = (state.gigs || []).filter((gig) => !gig.completed && gig.setlist_id && (!gig.event_date || gig.event_date >= today))
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  // Each setlist appears once: under its upcoming gig if it has one, else under Setlists.
  const out = [{ value: 'all', label: 'All songs (repertoire)' }];
  const used = new Set();
  for (const gig of gigs) {
    if (used.has(gig.setlist_id)) continue;
    used.add(gig.setlist_id);
    const date = gig.event_date ? new Date(`${gig.event_date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    const list = (state.setlists || []).find((item) => item.id === gig.setlist_id);
    out.push({ value: `setlist:${gig.setlist_id}`, label: `${gig.name}${date ? ` · ${date}` : ''}${list ? ` (${list.name})` : ''}`, gig: true, group: 'Upcoming gigs' });
  }
  for (const list of state.setlists || []) {
    if (!used.has(list.id)) out.push({ value: `setlist:${list.id}`, label: list.name, group: 'Setlists' });
  }
  return out;
}

function practiceSourceValue() {
  const sources = practiceSources();
  let saved = '';
  try { saved = localStorage.getItem(PRACTICE_SOURCE_KEY) || ''; } catch { /* ignore */ }
  if (saved && sources.some((src) => src.value === saved)) return saved;
  return 'all';
}

async function practiceSongList() {
  const source = practiceSourceValue();
  if (source === 'all') return state.songs;
  const setlistId = source.slice('setlist:'.length);
  if (!practiceSetlistSongs.has(setlistId)) {
    const { data, error } = await db.from('setlist_items').select('song_id, position, item_type').eq('setlist_id', setlistId).order('position');
    const cachedLists = dataCacheGet()?.setlistSongs || {};
    if (error) {
      if (!isNetworkError(error) || !cachedLists[setlistId]) throw error;
      practiceSetlistSongs.set(setlistId, cachedLists[setlistId]);
    } else {
      const ids = (data || []).filter((row) => row.song_id).map((row) => row.song_id);
      practiceSetlistSongs.set(setlistId, ids);
      dataCacheSet({ setlistSongs: { ...cachedLists, [setlistId]: ids } });
    }
  }
  const ids = practiceSetlistSongs.get(setlistId);
  return ids.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
}

async function renderPracticePage() {
  $('#practice-upload').classList.toggle('hidden', !state.member?.is_admin);
  renderTonePanel();
  if (!practice.colors) {
    const { data, error } = await db.from('app_meta').select('value').eq('key', 'practice_track_colors').maybeSingle();
    if (error) practice.colors = dataCacheGet()?.colors || {};
    else { practice.colors = data?.value || {}; dataCacheSet({ colors: practice.colors }); }
  }
  if (!practice.available) {
    try { await practiceLoadAvailable(); } catch (error) { practice.available = new Map(); console.warn(error); }
  }
  const source = practiceSourceValue();
  const opt = (src) => `<option value="${escapeHtml(src.value)}" ${src.value === source ? 'selected' : ''}>${escapeHtml(src.label)}</option>`;
  const sources = practiceSources();
  $('#practice-source').innerHTML = sources.filter((src) => !src.group).map(opt).join('')
    + ['Upcoming gigs', 'Setlists'].map((group) => {
      const items = sources.filter((src) => src.group === group);
      return items.length ? `<optgroup label="${group}">${items.map(opt).join('')}</optgroup>` : '';
    }).join('');
  let songs = state.songs;
  try { songs = await practiceSongList(); } catch (error) { console.warn(error); }
  practice.songList = songs;
  if (!practice.songId) { try { practice.songId = localStorage.getItem('tsp-practice-song') || ''; } catch { /* ignore */ } }
  if (!songs.some((song) => song.id === practice.songId)) practice.songId = (songs.find((song) => practice.available.has(song.id)) || songs[0])?.id || '';
  renderPracticeUpload();
  if (practice.tracks.songId !== practice.songId) await practiceOpenSong(practice.songId);
  else renderPracticePlayers();
}

function ptMixElement() {
  if (!ptMixElement.el) {
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    // Diagnostics: what the element does (lock-screen scrubbing may seek it directly).
    ['play', 'pause', 'seeking'].forEach((type) => el.addEventListener(type, () => { if (typeof ptMediaLog === 'function') ptMediaLog(`audio ${type} ${Math.round(el.currentTime)}`); }));
    ptMixElement.el = el;
  }
  return ptMixElement.el;
}
async function practiceOpenSong(songId) {
  practiceStop(true);
  // The previous song's player stays on the page (dimmed) until the new one is
  // ready, so nothing jumps; its audio is silenced and unhooked straight away.
  const oldAudio = $('#practice-mix-audio');
  if (oldAudio) { oldAudio.pause(); oldAudio.removeAttribute('id'); }
  document.querySelector('.practice-layout')?.classList.add('practice-switching');
  practice.songId = songId;
  ptSongPickerOpen = false;
  ptWorkOpen = false;
  try { localStorage.setItem('tsp-practice-song', songId); } catch { /* ignore */ }
  practice.tracks = [];
  practice.tracks.songId = songId;
  // A superseded song load can leave this true if the next song has no audio
  // and returns before starting a new request. Clear it before that early path.
  practice.loadingSong = false;
  practice.buffers = new Map();
  practice.loadState = new Map();
  practice.eager = null;
  practice.decodedBytes = 0;
  practice.duration = 0;
  practice.offset = 0;
  practice.position = 0;
  roomPulse(); // a room hears about the new song at once
  // The Mixdown/Multitrack choice carries over to the next song.
  practice.error = '';
  practice.lyrics = null;
  practice.lyricIndex = -2;
  practice.lyricsUnsynced = false;
  practice.loadToken += 1;
  const songToken = practice.loadToken;
  practice.loadingRun = -1;
  practiceLoadLyrics(songId);
  if (!practice.available?.has(songId) && !offline.manifest[songId]) { renderPracticePlayers(); return; }
  practice.loadingSong = true;
  // Keep a separate UI watchdog as well as the request timeout below. The
  // installed app can retain a pending load across a view switch; never let
  // that leave Practice dimmed with an empty transport indefinitely.
  const loadingWatchdog = setTimeout(() => {
    if (practice.songId !== songId || practice.loadToken !== songToken || !practice.loadingSong) return;
    practice.loadingSong = false;
    practice.error = `Audio is taking too long to load for ${songId}. You can retry by selecting the song again.`;
    renderPracticePlayers();
  }, 20000);
  renderPracticePlayers();
  try {
    let tracks;
    try {
      // Edge requests can stall without rejecting (especially from an installed
      // web app). Bound the wait so this song can fall back to its local audio
      // instead of leaving the Practice cards and transport dimmed forever.
      const { data, error } = await practiceWithTimeout(
        db.functions.invoke('practice-audio', { body: { action: 'urls', song_id: songId } }),
        `Getting audio links for ${songId}`,
        15000
      );
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'could not get the audio links');
      tracks = data.tracks;
    } catch (error) {
      // Offline: play what is saved on this device.
      if (!offline.manifest[songId]) throw error;
      tracks = Object.entries(offline.manifest[songId]).map(([element, m]) => ({ element, bytes: m.bytes, uploaded_at: m.modified, ext: m.ext, url: null, offline: true }));
    }
    if (practice.songId !== songId) return;
    tracks = tracks.slice().sort((a, b) => practiceRank(a.element) - practiceRank(b.element));
    tracks.songId = songId;
    practice.tracks = tracks;
  } catch (error) {
    if (practice.songId === songId && practice.loadToken === songToken) {
      practice.error = error.message === 'r2_not_configured' ? 'Audio storage is not set up yet.' : `Could not load this song's audio: ${error.message}`;
    }
  } finally {
    clearTimeout(loadingWatchdog);
    if (practice.songId === songId && practice.loadToken === songToken) {
      practice.loadingSong = false;
      renderPracticePlayers();
    }
  }
  // Load the multitrack straight away only when it's already on this device
  // (or in memory); downloading is always the member's choice.
  if (practice.songId === songId && practice.loadToken === songToken && !roomFollowing() && practiceMultiTracks().length
    && (practiceMultiSaved(songId) || practiceMultiInMemory(songId) || bgFetchActive(songId))) practiceLoadTracks();
}
function practiceMultiInMemory(songId) {
  return practiceMultiTracks().every((t) => memBlobGet(songId, t));
}
function practiceMultiSaved(songId) {
  if (offline.mode === 'none' || (offline.mode === 'folder' && !offline.dir)) return false;
  const saved = offline.manifest[songId] || {};
  return practiceMultiTracks().every((t) => saved[t.element] && (t.offline || saved[t.element].v === offlineVersion(t)));
}

// Colour of a track as in the Ableton project (saved at each Sync read).
function practiceColor(element) {
  // Colours come from the set via the database; only a plain hex value may reach a style attribute.
  const fromSet = practice.colors?.[element];
  return (typeof fromSet === 'string' && /^#[0-9a-f]{3,8}$/i.test(fromSet) ? fromSet : null) || PRACTICE_COLORS[element] || '#9aa';
}
function practiceInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#141414';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.5 ? '#f2f2f2' : '#141414';
}

function practiceRank(element) {
  const i = PRACTICE_ORDER.indexOf(element);
  return i === -1 ? 50 : i;
}

function practiceTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Re-rendering the cards must never move the page (iPhone Safari jumps to the
// top when the page briefly gets shorter): hold each card's height while its
// content is swapped and put the scroll position back.
function practiceKeepPlace(fn) {
  const y = window.scrollY;
  const cards = [...document.querySelectorAll('#practice-view .practice-card')];
  cards.forEach((card) => { card.style.minHeight = `${card.offsetHeight}px`; });
  try { fn(); } finally {
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    setTimeout(() => {
      cards.forEach((card) => { card.style.minHeight = ''; });
      if (Math.abs(window.scrollY - y) > 1 && window.scrollY < y) window.scrollTo(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
      lyricsFit();
    }, 60);
  }
}
function renderPracticePlayers() {
  practiceKeepPlace(() => { try { renderPracticePlayersInner(); } finally { ptRender(); } });
}
function renderPracticePlayersInner() {
  const song = state.songs.find((item) => item.id === practice.songId)
    || practice.songList?.find((item) => item.id === practice.songId);
  const dlBox = $('#practice-downloads');
  const note = $('#practice-song-note');
  const say = (text, isError) => { if (!note) return; note.textContent = text; note.classList.toggle('error', !!isError); };
  say('');
  dlBox.innerHTML = '';
  if (!song) return;
  if (practice.loadingSong) return; // keep the previous song on screen until this one is ready
  document.querySelector('.practice-layout')?.classList.remove('practice-switching');
  if (practice.error) { say(practice.error, true); return; }
  if (!practice.tracks.length) { say(`No practice audio for ${song.id} ${song.name} yet.`); return; }
  const mix = practice.tracks.find((t) => t.element === 'Mixdown');
  // One Mixdown <audio> element for the whole visit: iOS only lets an element it
  // has already played start again from the lock screen (next/previous song).
  const audio = mix ? ptMixElement() : null;
  if (audio) {
    const host = $('#practice-audio-host');
    if (audio.parentElement !== host) host.append(audio);
    audio.id = 'practice-mix-audio';
    if (audio.dataset.song !== practice.songId) {
      audio.pause();
      audio.dataset.song = practice.songId;
      if (offline.mode === 'none' && mix.url) audio.setAttribute('src', mix.url);
      else { audio.removeAttribute('src'); audio.load(); }
    }
    if (!audio.getAttribute('src')) {
      // Saved on this device: play the local copy (downloads once, then reuses it).
      const songId = practice.songId;
      offlineTrackBlob(songId, mix, (msg) => { if (practice.songId === songId) say(msg); })
        .then((blob) => {
          if (practice.songId !== songId || !document.body.contains(audio)) return;
          audio.src = offlineObjectUrl(`${songId}|Mixdown`, blob);
          say('');
          renderOfflinePanel();
        })
        .catch((error) => {
          if (practice.songId !== songId) return;
          say(`Could not load the mixdown: ${error.message}`, true);
          if (mix.url) audio.src = mix.url;
        });
    }
    if (!audio.dataset.hooked) {
      audio.dataset.hooked = '1';
      audio.addEventListener('ended', () => { practice.position = 0; audio.currentTime = 0; ptRender(); });
      audio.addEventListener('loadedmetadata', ptRender);
    }
    if (practice.autoplay) {
      practice.autoplay = false;
      audio.addEventListener('canplay', () => ptPlay(), { once: true });
    }
  }
  renderPracticeMultitrack();
  renderOfflinePanel();
  ptRender();
  const files = practice.tracks.slice().sort((a2, b2) => (a2.element === 'Mixdown' ? -1 : b2.element === 'Mixdown' ? 1 : practiceRank(a2.element) - practiceRank(b2.element)));
  dlBox.innerHTML = `<header><h2>Download</h2><button type="button" class="button quiet" data-practice-dl-all title="Download every file of this song">Download all (${files.length})</button></header>
    <ul class="practice-dl-list">${files.map((t) => `<li><span class="practice-dl-dot" style="background:${t.element === 'Mixdown' ? '#f39a26' : practiceColor(t.element)}"></span><span>${escapeHtml(t.element)}</span><small class="muted">${t.bytes ? `${(t.bytes / 1048576).toFixed(1)} MB` : ''}</small><button type="button" class="button quiet" data-practice-dl-track="${escapeHtml(t.element)}">Download MP3</button></li>`).join('')}</ul>`;
  practiceCheckLyricsLength();
}

function practiceMultiTracks() {
  return practice.tracks.filter((t) => t.element !== 'Mixdown');
}

function practiceTrackRowMarkup(t, i, { loaded, anySolo }) {
  const st = practiceTrackSetting(t.element);
  const audible = anySolo ? st.solo : st.on; // solo plays a track even if it's switched off
  const ls = practice.loadState.get(t.element);
  const dbLabel = st.vol > 0 ? (20 * Math.log10(st.vol)).toFixed(1) : '-inf';
  return `<li class="ab-track ${audible ? '' : 'ab-silent'}" data-element="${escapeHtml(t.element)}" style="--track-color:${practiceColor(t.element)};--track-ink:${practiceInk(practiceColor(t.element))}">
    <div class="ab-title"><span class="ab-name">${escapeHtml(t.element)}</span>${ls === 'error' ? '<small class="ab-err">failed</small>' : ls === 'loading' ? '<small>loading…</small>' : loaded && !practice.buffers.has(t.element) ? '<small class="ab-lazy">loads when on</small>' : ''}</div>
    <div class="ab-controls">
      <button type="button" class="ab-activator ${st.on ? 'on' : ''}" data-practice-on="${escapeHtml(t.element)}" aria-pressed="${st.on}" title="${loaded ? 'Track on/off' : 'Load the multitrack first'}" ${loaded ? '' : 'disabled'}>${i + 1}</button>
      <button type="button" class="ab-solo ${st.solo ? 'on' : ''}" data-practice-solo="${escapeHtml(t.element)}" aria-pressed="${st.solo}" title="${loaded ? 'Solo (Cmd/Ctrl-click to add)' : 'Load the multitrack first'}" ${loaded ? '' : 'disabled'}>S</button>
      <input type="range" class="ab-fader" min="0" max="1.413" step="0.001" value="${st.vol}" data-practice-vol="${escapeHtml(t.element)}" aria-label="${escapeHtml(t.element)} volume" ${loaded ? '' : 'disabled'}>
      <span class="ab-db">${dbLabel}</span>
      <span class="ab-meter"><span data-practice-meter="${escapeHtml(t.element)}"></span></span>
    </div></li>`;
}

// The multitrack lives in the mixer drop-up on the playback bar (and in full
// screen); there is no separate card on the page any more.
function renderPracticeMultitrack() {
  if (ptMixer.open) ptMixerRender();
}

// Decoded audio sits in memory, and phones and tablets have a hard limit, so:
// stereo whenever the tracks being listened to fit, mono when they don't; the
// sample rate drops only if even mono would not fit; and tracks nobody is
// listening to (stems are off by default) are decoded when they are switched
// on rather than up front. Computers decode everything in full quality.
const PRACTICE_MEM_BUDGET = (PHONE ? 320 : 2048) * 1048576;
const PRACTICE_RATES = [44100, 32000, 24000, 22050];
const practiceBufferBytes = (buffer) => buffer.length * buffer.numberOfChannels * 4;
function practiceAudibleElements(tracks = practiceMultiTracks()) {
  const anySolo = tracks.some((t) => practiceTrackSetting(t.element).solo);
  return new Set(tracks.filter((t) => {
    const st = practiceTrackSetting(t.element);
    return anySolo ? st.solo : st.on;
  }).map((t) => t.element));
}
function practiceDecodePlan(tracks) {
  const all = new Set(tracks.map((t) => t.element));
  if (!PHONE) return { rate: 0, mono: false, eager: all };
  const song = state.songs.find((item) => item.id === practice.songId);
  const seconds = Math.max(60, Number(song?.duration_seconds) || 300) + 5;
  const audible = practiceAudibleElements(tracks);
  const order = [...tracks].sort((x, y) => (audible.has(y.element) ? 1 : 0) - (audible.has(x.element) ? 1 : 0));
  const each = (rate, channels) => seconds * 4 * rate * channels;
  const needed = Math.max(1, audible.size);
  const take = (rate, channels) => new Set(order
    .slice(0, Math.max(1, Math.min(tracks.length, Math.floor(PRACTICE_MEM_BUDGET / each(rate, channels)))))
    .map((t) => t.element));
  for (const rate of PRACTICE_RATES) if (each(rate, 2) * needed <= PRACTICE_MEM_BUDGET) return { rate, mono: false, eager: take(rate, 2) };
  for (const rate of PRACTICE_RATES) if (each(rate, 1) * needed <= PRACTICE_MEM_BUDGET) return { rate, mono: true, eager: take(rate, 1) };
  const last = PRACTICE_RATES[PRACTICE_RATES.length - 1];
  return { rate: last, mono: true, eager: take(last, 1) };
}
function practiceToMono(buffer) {
  const mono = practice.ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const out = mono.getChannelData(0);
  const n = buffer.numberOfChannels;
  for (let c = 0; c < n; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) out[i] += data[i] / n;
  }
  return mono;
}
// Many exported parts (a DI bass, a close-miked drum) have the same signal in
// both channels. Keeping one channel for those sounds identical and halves
// what they use, which leaves room for the tracks that are really stereo.
function practiceIsDualMono(buffer) {
  if (buffer.numberOfChannels !== 2) return false;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}
function practiceFitBuffer(buffer) {
  if (buffer.numberOfChannels < 2) return buffer;
  if (practice.mono || practiceIsDualMono(buffer)) return practiceToMono(buffer);
  return buffer;
}
function practiceForgetBuffer(element) {
  const buffer = practice.buffers.get(element);
  if (!buffer) return;
  practice.decodedBytes = Math.max(0, practice.decodedBytes - practiceBufferBytes(buffer));
  practice.buffers.delete(element);
  practice.loadState.delete(element);
  const node = practice.nodes.get(element);
  if (node) {
    try { node.source.onended = null; node.source.stop(); } catch { /* already stopped */ }
    practice.nodes.delete(element);
  }
}
// Room for a track about to be decoded: drop tracks nobody is listening to.
// Their files stay on the device, so switching one back on reloads it quickly.
function practiceMakeRoom(bytes) {
  if (practice.decodedBytes + bytes <= PRACTICE_MEM_BUDGET) return;
  const audible = practiceAudibleElements();
  const droppable = practiceMultiTracks().filter((t) => practice.buffers.has(t.element) && !audible.has(t.element)).reverse();
  for (const t of droppable) {
    if (practice.decodedBytes + bytes <= PRACTICE_MEM_BUDGET) return;
    practiceForgetBuffer(t.element);
  }
}
async function practiceDecodeTrack(track, token, blobPromise) {
  try {
    const blob = await (blobPromise || bgFetchTrack(practice.songId, track));
    if (token !== practice.loadToken) return false;
    const data = await practiceWithTimeout(blob.arrayBuffer(), `Reading ${track.element}`);
    let buffer = await practiceWithTimeout(practice.ctx.decodeAudioData(data), `Decoding ${track.element}`);
    if (token !== practice.loadToken) return false;
    buffer = practiceFitBuffer(buffer);
    practiceMakeRoom(practiceBufferBytes(buffer));
    // Still no room (a very long medley with everything switched on): this
    // track plays in mono rather than not at all.
    if (buffer.numberOfChannels > 1 && practice.decodedBytes + practiceBufferBytes(buffer) > PRACTICE_MEM_BUDGET) buffer = practiceToMono(buffer);
    practice.buffers.set(track.element, buffer);
    practice.decodedBytes += practiceBufferBytes(buffer);
    practice.loadState.set(track.element, 'ready');
    practice.duration = Math.max(practice.duration, buffer.duration);
    practiceAttachTrack(track.element);
    return true;
  } catch (error) {
    if (token !== practice.loadToken) return false;
    practice.loadState.set(track.element, 'error');
    console.warn('Practice track failed', track.element, error);
    return false;
  }
}
// A track decoded while the multitrack is playing joins in at the right spot.
function practiceAttachTrack(element) {
  const buffer = practice.buffers.get(element);
  if (!practice.playing || !practice.ctx || !buffer || practice.nodes.has(element)) return;
  const at = practicePosition() + 0.06;
  if (at >= buffer.duration) return;
  const source = practice.ctx.createBufferSource();
  source.buffer = buffer;
  const gain = practice.ctx.createGain();
  const analyser = practice.ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser).connect(gain).connect(practice.master);
  gain.gain.value = 0;
  source.start(practice.ctx.currentTime + 0.06, at);
  practice.nodes.set(element, { source, gain, analyser });
  practiceApplyGains();
}
// Switching on (or soloing) a track that was left for later: decode it now.
function practiceEnsureTrack(element) {
  if (!practice.ctx || practice.buffers.has(element) || practice.loadState.get(element) === 'loading') return;
  const track = practiceMultiTracks().find((t) => t.element === element);
  if (!track) return;
  const token = practice.loadToken;
  practice.loadState.set(element, 'loading');
  renderPracticeMultitrack();
  practiceDecodeTrack(track, token).finally(() => {
    if (token !== practice.loadToken) return;
    practiceApplyGains();
    renderPracticeMultitrack();
    ptRender();
  });
}
// The tracks this song decodes up front, and whether they are all in.
function practiceEagerTracks() {
  const tracks = practiceMultiTracks();
  return practice.eager?.size ? tracks.filter((t) => practice.eager.has(t.element)) : tracks;
}
function practiceMultiLoaded() {
  const eager = practiceEagerTracks();
  if (!eager.length || !practice.buffers.size) return false;
  // A track that failed does not keep the mixer locked.
  return eager.every((t) => practice.buffers.has(t.element) || practice.loadState.get(t.element) === 'error');
}
// Multitrack downloads run in the background: leaving a song doesn't stop its
// download, and coming back picks up where it is. At most two files at a time.
const bgFetch = { files: new Map(), songs: new Map(), active: 0, waiting: [] };
const PRACTICE_AUDIO_TIMEOUT_MS = 120000;
function practiceWithTimeout(promise, label, timeoutMs = PRACTICE_AUDIO_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out. Try loading the multitrack again.`)), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}
function bgFetchTrack(songId, track) {
  const key = `${songId}|${track.element}`;
  if (bgFetch.files.has(key)) return bgFetch.files.get(key);
  const song = bgFetch.songs.get(songId) || { total: 0, done: 0 };
  song.total += 1;
  bgFetch.songs.set(songId, song);
  const run = async () => {
    while (bgFetch.active >= 2) await new Promise((resolve) => bgFetch.waiting.push(resolve));
    bgFetch.active += 1;
    try { return await practiceWithTimeout(offlineTrackBlob(songId, track), `Loading ${track.element}`); }
    finally {
      bgFetch.active -= 1;
      bgFetch.waiting.shift()?.();
    }
  };
  const promise = run().finally(() => {
    bgFetch.files.delete(key);
    song.done += 1;
    if (song.done >= song.total) bgFetch.songs.delete(songId);
    if (practice.songId !== songId) renderOfflinePanel();
  });
  bgFetch.files.set(key, promise);
  return promise;
}
function bgFetchActive(songId) { return bgFetch.songs.has(songId); }
async function practiceLoadTracks() {
  const token = practice.loadToken;
  if (practice.loadingRun === token) return;
  practice.loadingRun = token;
  const tracks = practiceMultiTracks();
  const plan = practiceDecodePlan(tracks);
  practice.eager = plan.eager;
  // Mark the tracks being decoded now so every button shows the download at once.
  tracks.forEach((t) => { if (!practice.buffers.has(t.element) && plan.eager.has(t.element)) practice.loadState.set(t.element, 'loading'); });
  renderPracticeMultitrack();
  ptRender();
  try {
    if (practice.ctx && plan.rate && practice.ctx.sampleRate !== plan.rate && !practice.playing) {
      await practiceWithTimeout(practice.ctx.close(), 'Audio engine reset', 30000);
      practice.ctx = null;
      // Buffers belong to the closed engine: they are decoded again below.
      practice.buffers = new Map();
      practice.loadState = new Map();
      practice.decodedBytes = 0;
      practice.duration = 0;
    }
    if (!practice.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      try { practice.ctx = plan.rate ? new Ctx({ sampleRate: plan.rate }) : new Ctx(); } catch { practice.ctx = new Ctx(); }
      practice.master = practice.ctx.createGain();
      practice.master.connect(practice.ctx.destination);
    }
    practice.mono = plan.mono;
    await practiceWithTimeout(practice.ctx.resume(), 'Audio engine startup', 30000).catch(() => {});
  } catch (error) {
    if (token === practice.loadToken) {
      tracks.forEach((t) => { if (!practice.buffers.has(t.element)) practice.loadState.set(t.element, 'error'); });
      console.warn('Practice audio engine failed', error);
      renderPracticeMultitrack();
      ptRender();
    }
    if (practice.loadingRun === token) practice.loadingRun = -1;
    return;
  }
  // Downloads start for every track now and carry on in the background even
  // if the member moves to another song. Decoding (two at a time, to spare
  // phone memory) only happens while this song is open.
  const songId = practice.songId;
  const missing = tracks.filter((t) => !practice.buffers.has(t.element));
  // Every file is downloaded (so the song is complete on the device); only the
  // tracks in the plan are decoded now.
  const blobs = new Map(missing.map((t) => [t.element, bgFetchTrack(songId, t)]));
  blobs.forEach((promise) => promise.catch(() => {}));
  const queue = missing.filter((t) => plan.eager.has(t.element));
  const worker = async () => {
    while (queue.length) {
      if (token !== practice.loadToken) return;
      const t = queue.shift();
      await practiceDecodeTrack(t, token, blobs.get(t.element));
      if (token !== practice.loadToken) return;
      renderPracticeMultitrack();
      ptRender();
    }
  };
  await Promise.all([worker(), worker()]);
  if (token !== practice.loadToken) { if (practice.loadingRun === token) practice.loadingRun = -1; return; }
  if (practice.loadingRun === token) practice.loadingRun = -1;
  // Keep failed tracks visible and in the download list so members can retry.
  practice.tracks.songId = practice.songId;
  // Multitrack chosen and the Mixdown was standing in: carry on from the same spot.
  const audio = $('#practice-mix-audio');
  if (ptMode() === 'multi' && ptMultiReady() && !practice.playing) {
    const wasPlaying = !!(audio && !audio.paused && !audio.ended);
    const at = audio && (wasPlaying || audio.currentTime) ? audio.currentTime : (practice.position || 0);
    if (audio) audio.pause();
    practice.position = at;
    practice.offset = at;
    if (wasPlaying) practicePlay();
  }
  renderPracticeMultitrack();
  renderOfflinePanel();
  ptRefreshPicks();
}

function practicePosition() {
  if (!practice.playing || !practice.ctx) return practice.offset;
  return Math.min(practice.duration, practice.offset + practice.ctx.currentTime - practice.startedAt);
}

function practiceApplyGains() {
  const tracks = practiceMultiTracks();
  const anySolo = tracks.some((t) => practiceTrackSetting(t.element).solo);
  for (const t of tracks) {
    const node = practice.nodes.get(t.element);
    if (!node) continue;
    const st = practiceTrackSetting(t.element);
    const target = (anySolo ? st.solo : st.on) ? st.vol : 0;
    node.gain.gain.setTargetAtTime(target, practice.ctx.currentTime, 0.015);
  }
}

function practicePlay() {
  if (!practice.ctx || practice.playing) return;
  $('#practice-mix-audio')?.pause();
  practice.ctx.resume().catch(() => {});
  if (practice.offset >= practice.duration - 0.05) practice.offset = 0;
  const when = practice.ctx.currentTime + 0.08;
  practice.nodes = new Map();
  for (const t of practiceMultiTracks()) {
    const buffer = practice.buffers.get(t.element);
    if (!buffer) continue;
    const source = practice.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = practice.ctx.createGain();
    const analyser = practice.ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser).connect(gain).connect(practice.master);
    gain.gain.value = 0;
    source.start(when, Math.min(practice.offset, buffer.duration));
    practice.nodes.set(t.element, { source, gain, analyser });
  }
  practice.startedAt = when;
  practice.playing = true;
  practiceApplyGains();
  const first = [...practice.nodes.values()][0];
  if (first) first.source.onended = () => { if (practice.playing && practicePosition() >= practice.duration - 0.1) { practicePause(); practice.offset = 0; renderPracticeMultitrack(); } };
  renderPracticeMultitrack();
  practiceTick();
}

function practicePause() {
  if (!practice.playing) return;
  practice.offset = practicePosition();
  practiceStop(false);
  renderPracticeMultitrack();
}

function practiceStop(reset) {
  for (const node of practice.nodes.values()) { try { node.source.onended = null; node.source.stop(); } catch { /* already stopped */ } }
  practice.nodes = new Map();
  practice.playing = false;
  cancelAnimationFrame(practice.raf);
  if (reset) practice.offset = 0;
}

function practiceSeek(seconds) {
  const wasPlaying = practice.playing;
  practiceStop(false);
  practice.offset = Math.max(0, Math.min(practice.duration, seconds));
  if (wasPlaying) practicePlay(); else renderPracticeMultitrack();
}

const practiceMeterData = new Float32Array(512);
function practiceTick() {
  cancelAnimationFrame(practice.raf);
  const step = () => {
    if (!practice.playing) return;
    const pos = practicePosition();
    const time = $('#practice-time');
    if (time) time.textContent = `${practiceTime(pos)} / ${practiceTime(practice.duration)}`;
    const seek = $('#practice-seek');
    if (seek && !seek.matches(':active')) seek.value = pos.toFixed(2);
    for (const [element, node] of practice.nodes) {
      const bars = document.querySelectorAll(`[data-practice-meter="${CSS.escape(element)}"]`);
      if (!bars.length) continue;
      node.analyser.getFloatTimeDomainData(practiceMeterData);
      let peak = 0;
      for (let i = 0; i < practiceMeterData.length; i += 1) peak = Math.max(peak, Math.abs(practiceMeterData[i]));
      const dbfs = peak > 0 ? 20 * Math.log10(peak) : -60;
      // The fill always spans the whole meter (so green-yellow-red stays put);
      // the level only decides how much of it shows.
      const level = `${Math.max(0, Math.min(100, (dbfs + 48) / 48 * 100)).toFixed(1)}%`;
      bars.forEach((bar) => { bar.style.setProperty('--level', level); bar.classList.toggle('hot', dbfs > -1); });
    }
    if (pos >= practice.duration - 0.05) { practicePause(); practice.offset = 0; renderPracticeMultitrack(); return; }
    practice.raf = requestAnimationFrame(step);
  };
  practice.raf = requestAnimationFrame(step);
}

$('#practice-source').addEventListener('change', (event) => {
  try { localStorage.setItem(PRACTICE_SOURCE_KEY, event.target.value); } catch { /* ignore */ }
  renderPracticePage();
});
function practiceStepSong(delta) {
  const list = practice.songList || state.songs;
  const i = list.findIndex((song) => song.id === practice.songId);
  const next = list[Math.max(0, Math.min(list.length - 1, i + delta))];
  if (next && next.id !== practice.songId) practiceOpenSong(next.id);
}
let practiceMp3EncoderPromise = null;
function practiceMp3Encoder() {
  if (window.lamejs) return Promise.resolve(window.lamejs);
  if (practiceMp3EncoderPromise) return practiceMp3EncoderPromise;
  practiceMp3EncoderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
    script.async = true;
    script.onload = () => window.lamejs ? resolve(window.lamejs) : reject(new Error('MP3 encoder did not load'));
    script.onerror = () => reject(new Error('Could not load the MP3 encoder. Check your connection and try again.'));
    document.head.append(script);
  }).catch((error) => { practiceMp3EncoderPromise = null; throw error; });
  return practiceMp3EncoderPromise;
}
function practiceMp3Samples(channel, start, end) {
  const out = new Int16Array(end - start);
  for (let i = start; i < end; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i]));
    out[i - start] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  return out;
}
async function practiceDownloadMp3(track, onStatus = () => {}) {
  if (!track?.url) throw new Error('This audio file is not available online.');
  onStatus('Downloading source audio…');
  const response = await fetch(track.url);
  if (!response.ok) throw new Error(`Could not download audio (HTTP ${response.status}).`);
  const sourceBlob = await response.blob();
  let mp3Blob = sourceBlob;
  if (track.ext !== 'mp3') {
    onStatus('Preparing MP3 conversion…');
    const lamejs = await practiceMp3Encoder();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser cannot convert the audio to MP3.');
    const audioContext = new AudioContextClass();
    let decoded;
    try { decoded = await audioContext.decodeAudioData(await sourceBlob.arrayBuffer()); }
    finally { await audioContext.close().catch(() => {}); }
    const channels = decoded.numberOfChannels > 1 ? 2 : 1;
    const encoder = new lamejs.Mp3Encoder(channels, decoded.sampleRate, 192);
    const left = decoded.getChannelData(0);
    const right = channels === 2 ? decoded.getChannelData(1) : null;
    const blocks = [];
    const chunkSize = 1152;
    const blockCount = Math.ceil(left.length / chunkSize);
    for (let start = 0; start < left.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, left.length);
      const data = channels === 2
        ? encoder.encodeBuffer(practiceMp3Samples(left, start, end), practiceMp3Samples(right, start, end))
        : encoder.encodeBuffer(practiceMp3Samples(left, start, end));
      if (data.length) blocks.push(data);
      const completed = Math.min(blockCount, Math.floor(start / chunkSize) + 1);
      if (completed % 40 === 0 || completed === blockCount) {
        onStatus(`Converting to MP3… ${Math.round(completed / blockCount * 100)}%`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    const final = encoder.flush();
    if (final.length) blocks.push(final);
    mp3Blob = new Blob(blocks, { type: 'audio/mpeg' });
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(mp3Blob);
  link.href = url;
  link.download = `${practice.songId} - ${track.element}.mp3`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// Download all: convert and save one MP3 at a time (the browser may ask once to allow several downloads).
$('#practice-downloads').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-practice-dl-all]');
  const one = event.target.closest('[data-practice-dl-track]');
  if (one) {
    const track = practice.tracks.find((item) => item.element === one.dataset.practiceDlTrack);
    one.disabled = true;
    one.textContent = 'Preparing…';
    try { await practiceDownloadMp3(track, (status) => { one.textContent = status; }); }
    catch (error) { showNotice(error.message, true); }
    finally { one.disabled = false; one.textContent = 'Download MP3'; }
    return;
  }
  if (!button) return;
  const tracks = practice.tracks.slice().sort((a, b) => (a.element === 'Mixdown' ? -1 : b.element === 'Mixdown' ? 1 : practiceRank(a.element) - practiceRank(b.element)));
  button.disabled = true;
  try {
    for (let i = 0; i < tracks.length; i += 1) {
      button.textContent = `MP3 ${i + 1} of ${tracks.length}…`;
      await practiceDownloadMp3(tracks[i], (status) => { button.textContent = `${i + 1}/${tracks.length}: ${status}`; });
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; button.textContent = `Download all (${tracks.length})`; }
});
// Mixer controls (main Multitrack card and the full-screen drop-up share these).
function practiceMixRefresh() { practiceApplyGains(); renderPracticeMultitrack(); ptRender(); }
function practiceMixClick(event) {
  if (event.target.closest('[data-practice-load]')) { practiceLoadTracks(); return true; }
  if (event.target.closest('[data-practice-reset]')) {
    try { sessionStorage.removeItem(PRACTICE_SETTINGS_KEY); } catch { /* ignore */ }
    practiceMixRefresh(); return true;
  }
  const on = event.target.closest('[data-practice-on]');
  if (on) {
    const el = on.dataset.practiceOn;
    const now = !practiceTrackSetting(el).on;
    savePracticeTrackSetting(el, { on: now });
    if (now) practiceEnsureTrack(el);
    practiceMixRefresh(); return true;
  }
  const solo = event.target.closest('[data-practice-solo]');
  if (solo) {
    const el = solo.dataset.practiceSolo;
    const now = !practiceTrackSetting(el).solo;
    // Like Ableton: plain click solos only this track; Cmd/Ctrl-click adds to the solo.
    if (now && !(event.metaKey || event.ctrlKey)) practiceMultiTracks().forEach((t) => { if (t.element !== el && practiceTrackSetting(t.element).solo) savePracticeTrackSetting(t.element, { solo: false }); });
    savePracticeTrackSetting(el, { solo: now });
    if (now) practiceEnsureTrack(el);
    practiceMixRefresh(); return true;
  }
  return false;
}
function practiceMixInput(event) {
  const fader = event.target.closest('[data-practice-vol]');
  if (!fader) return false;
  const el = fader.dataset.practiceVol;
  const vol = Number(fader.value);
  savePracticeTrackSetting(el, { vol });
  practiceApplyGains();
  const label = vol > 0 ? (20 * Math.log10(vol)).toFixed(1) : '-inf';
  // Keep both copies of this fader in step without redrawing the one being dragged.
  document.querySelectorAll(`[data-practice-vol="${CSS.escape(el)}"]`).forEach((input) => {
    if (input !== fader) input.value = vol;
    const db = input.closest('li')?.querySelector('.ab-db, .pm-db');
    if (db) db.textContent = label;
  });
  return true;
}

// --- Admin upload: drop the TSP Exports folder (or song folders / MP3s). Files
// named "<SONG ID> - <Element>.mp3" go to R2 and are listed in practice_tracks.
const PRACTICE_FILE_RE = /^([A-Z]{1,4}\d{1,3}) - ((?:Stem|Part) - [A-Za-z][A-Za-z ]{0,29}|Backing|CPC|Mixdown)\.mp3$/i;

function renderPracticeUpload() {
  const box = $('#practice-upload');
  if (!box || !state.member?.is_admin) return;
  const up = practice.upload;
  const done = up.items.filter((i) => i.state === 'done').length;
  const failed = up.items.filter((i) => i.state === 'error');
  const listed = up.items.slice(-12).map((i) => `<li class="${i.state}">${i.state === 'done' ? '✓' : i.state === 'error' ? '✕' : i.state === 'uploading' ? '●' : '·'} ${escapeHtml(i.songId)} · ${escapeHtml(i.element)}${i.error ? ` <small>${escapeHtml(i.error)}</small>` : ''}</li>`).join('');
  box.innerHTML = `<header><h2>Upload practice audio</h2><span class="muted">Admin only</span></header>
    <p class="muted">Drop your <b>TSP Exports</b> folder (or some song folders) here, or choose it. Files named like <code>E7 - Part - Guitar.mp3</code> are uploaded and replace older versions.</p>
    <label class="practice-drop" id="practice-drop"><input type="file" id="practice-files" multiple webkitdirectory accept=".mp3,audio/mpeg">
      <span>${up.running ? `Uploading… ${done} of ${up.items.length}` : 'Drop folder here or click to choose'}</span></label>
    ${up.items.length ? `<p class="muted">${done} of ${up.items.length} uploaded${failed.length ? ` · ${failed.length} failed` : ''}.</p><ul class="export-files">${listed}</ul>` : ''}`;
}

function practiceFileDuration(file) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = (value) => { URL.revokeObjectURL(url); resolve(value); };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 10) / 10 : null);
    audio.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    audio.src = url;
  });
}

async function practiceUploadFiles(files) {
  if (practice.upload.running) return;
  const songIds = new Set(state.songs.map((song) => song.id));
  const items = [];
  for (const file of files) {
    const m = PRACTICE_FILE_RE.exec(file.name);
    if (!m) continue;
    const songId = m[1].toUpperCase();
    const element = m[2].replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Cpc$/i, 'CPC');
    if (!songIds.has(songId)) continue;
    items.push({ file, songId, element, state: 'waiting' });
  }
  if (!items.length) { showNotice('No practice MP3s found. Files must be named like "E7 - Part - Guitar.mp3".', true); return; }
  practice.upload = { items, running: true };
  renderPracticeUpload();
  for (const item of items) {
    item.state = 'uploading';
    renderPracticeUpload();
    try {
      const { data, error } = await db.functions.invoke('practice-audio', { body: { action: 'upload', song_id: item.songId, element: item.element, bytes: item.file.size } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'no upload link');
      const put = await fetch(data.url, { method: 'PUT', body: item.file, headers: { 'Content-Type': 'audio/mpeg' } });
      if (!put.ok) throw new Error(`storage HTTP ${put.status}`);
      const duration = await practiceFileDuration(item.file);
      const { error: rowError } = await db.from('practice_tracks').upsert({ song_id: item.songId, element: item.element, object_key: data.object_key, bytes: item.file.size, duration_seconds: duration, uploaded_at: new Date().toISOString() }, { onConflict: 'song_id,element' });
      if (rowError) throw rowError;
      item.state = 'done';
    } catch (error) {
      item.state = 'error';
      item.error = error.message === 'r2_not_configured' ? 'storage not set up' : String(error.message || error).slice(0, 80);
    }
    renderPracticeUpload();
  }
  practice.upload.running = false;
  renderPracticeUpload();
  const failed = items.filter((i) => i.state === 'error').length;
  showNotice(failed ? `Uploaded ${items.length - failed} files; ${failed} failed.` : `Uploaded ${items.length} files.`, !!failed);
  await practiceLoadAvailable().catch(() => {});
  practice.tracks.songId = null; // refresh the open song
  renderPracticePage();
}

$('#practice-upload').addEventListener('change', (event) => {
  if (event.target.id === 'practice-files') practiceUploadFiles([...event.target.files]);
});
$('#practice-upload').addEventListener('dragover', (event) => { event.preventDefault(); $('#practice-drop')?.classList.add('over'); });
$('#practice-upload').addEventListener('dragleave', () => $('#practice-drop')?.classList.remove('over'));
$('#practice-upload').addEventListener('drop', async (event) => {
  event.preventDefault();
  $('#practice-drop')?.classList.remove('over');
  const files = [];
  const walk = (entry) => new Promise((resolve) => {
    if (entry.isFile) { entry.file((f) => { files.push(f); resolve(); }, resolve); return; }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const readAll = () => reader.readEntries(async (entries) => {
        if (!entries.length) { resolve(); return; }
        await Promise.all(entries.map(walk));
        readAll();
      }, resolve);
      readAll();
      return;
    }
    resolve();
  });
  const entries = [...(event.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) await Promise.all(entries.map(walk)); else files.push(...event.dataTransfer.files);
  practiceUploadFiles(files);
});

// ---------------------------------------------------------------------------
// Lyrics on the Practice page, the way AbleSet shows them: every clip on a
// +LYRICS track is a line ([C] chords inline, (notes), [labels]); SECTIONS
// clips are headings. Saved by the admin's last "Sync Ableton Set" (song_lyrics),
// timed in seconds from the song start, so they follow the practice audio.
// The chosen lyrics track and text size are kept on this device across songs.
const LYRICS_PREFS_KEY = 'tsp-practice-lyrics-v2';
const LYRIC_CHORD_RE = /^(?:Key:|[A-G][#b]?(?:maj|min|m|dim|aug|sus|add|M|\+|°|ø)?[0-9]*(?:(?:sus|add|maj|b|#)?[0-9]+)*(?:\/[A-G][#b]?)?(?:-[A-G][#b]?(?:maj|min|m|dim|aug|sus|add|M|\+|°|ø)?[0-9]*(?:(?:sus|add|maj|b|#)?[0-9]+)*(?:\/[A-G][#b]?)?)*-?)$/;

function lyricsPrefs() {
  // `track` is only set once someone picks a chip; until then each member
  // gets the track for their instrument (lyricsDefaultTrack).
  let old = {};
  try { old = JSON.parse(localStorage.getItem('tsp-practice-lyrics-v1') || '{}'); } catch { /* ignore */ }
  try { return { size: old.size || 'm', ...JSON.parse(localStorage.getItem(LYRICS_PREFS_KEY) || '{}') }; } catch { return { size: 'm' }; }
}
// Guitar -> Guitar, keys -> Keyboard, drums -> Drums, singers
// (Dale, Anston) -> Lyrics; anyone else, or a song without that track -> Chords.
function lyricsDefaultTrack() {
  const member = state.member || {};
  const slug = String(member.slug || '').toLowerCase();
  const instrument = String(member.instrument || '').toLowerCase();
  if (slug === 'dale' || slug === 'anston') return 'lyrics';
  if (/guitar/.test(instrument)) return 'guitar';
  if (/key/.test(instrument)) return 'keyboard';
  if (/percussion/.test(instrument)) return 'percussion';
  if (/drum/.test(instrument)) return 'drums';
  return 'chords';
}
function saveLyricsPrefs(patch) {
  try { localStorage.setItem(LYRICS_PREFS_KEY, JSON.stringify({ ...lyricsPrefs(), ...patch })); } catch { /* ignore */ }
}


const LYRICS_EDITABLE_TRACKS = ['guitar', 'keyboard', 'drums', 'percussion'];
let lyricsEditChannel = null;
let lyricsEditDraft = null;
function lyricsClipTextForEditor(text) {
  return String(text || '').replace(/\s*\\{1,2}\s*/g, '\n');
}
function lyricsClipTextFromEditor(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim()).join(' \\ ');
}
function lyricsEditorTrackForMember(shown = lyricsShownSlug()) {
  if (state.member?.is_admin) {
    const standard = LYRICS_STANDARD.some(([key]) => key === shown);
    const custom = (practice.lyrics?.tracks || []).some((track) => track.slug === shown);
    return shown && (standard || custom) ? shown : null;
  }
  const i = String(state.member?.instrument || '').toLowerCase();
  return /guitar/.test(i) ? 'guitar' : /key/.test(i) ? 'keyboard' : /percussion/.test(i) ? 'percussion' : /drum/.test(i) ? 'drums' : null;
}
function lyricsTrackLabel(slug) {
  return LYRICS_STANDARD.find(([key]) => key === slug)?.[1]
    || practice.lyrics?.tracks?.find((track) => track.slug === slug)?.label
    || slug;
}
function applyLyricsEdits(rows) {
  const ly = practice.lyrics;
  if (!ly || ly.error) return;
  const source = (ly.sourceTracks || ly.tracks || []).map((t) => ({ ...t, lines: [...(t.lines || [])] }));
  ly.sourceTracks = source;
  const tracks = source.map((t) => ({ ...t, lines: [...t.lines] }));
  for (const edit of rows || []) {
    let t = tracks.find((x) => x.slug === edit.track_slug);
    if (!t) { t = { slug: edit.track_slug, label: lyricsTrackLabel(edit.track_slug), lines: [] }; tracks.push(t); }
    t.lines = edit.lines || [];
  }
  ly.tracks = tracks;
  ly.lyricsEdits = rows || [];
}
async function readLyricsEdits(songId) {
  const { data, error } = await db.from('song_lyrics_edits').select('song_id,track_slug,lines,updated_at,applied_lines,applied_at,relay_error').eq('song_id', songId);
  if (error) throw error;
  return data || [];
}
let practiceLyricsRefreshTimer = null;
const practiceLyricsRefreshQueued = new Set();
async function refreshPracticeLyricsFromRealtime(songId) {
  if (state.view !== 'practice' || practice.songId !== songId || !practice.lyrics || practice.lyrics.error) return;
  const dialog = $('#lyrics-edit-dialog');
  if (lyricsEditDraft?.songId === songId && dialog?.open) {
    practiceLyricsRefreshQueued.add(songId);
    return;
  }
  if (practiceLyricsRefreshTimer) clearTimeout(practiceLyricsRefreshTimer);
  practiceLyricsRefreshTimer = setTimeout(async () => {
    practiceLyricsRefreshTimer = null;
    if (state.view !== 'practice' || practice.songId !== songId || !practice.lyrics || practice.lyrics.error) return;
    if (lyricsEditDraft?.songId === songId && $('#lyrics-edit-dialog')?.open) {
      practiceLyricsRefreshQueued.add(songId);
      return;
    }
    try {
      const [{ data, error }, edits] = await Promise.all([
        db.from('song_lyrics').select('tracks, sections, tempo, bars, tone, duration_seconds, updated_at').eq('song_id', songId).maybeSingle(),
        readLyricsEdits(songId)
      ]);
      if (error) throw error;
      if (state.view !== 'practice' || practice.songId !== songId) return;
      if (lyricsEditDraft?.songId === songId && $('#lyrics-edit-dialog')?.open) {
        practiceLyricsRefreshQueued.add(songId);
        return;
      }
      const next = data || { tracks: [], sections: [] };
      next.sourceTracks = (next.tracks || []).map((track) => ({ ...track, lines: [...(track.lines || [])] }));
      practice.lyrics = next;
      await Promise.all([jsonCachePut('lyrics/' + songId, data), jsonCachePut('lyrics-edits/' + songId, edits)]);
      applyLyricsEdits(edits);
      practiceKeepPlace(renderPracticeLyrics);
      renderTonePanel();
      practiceLyricsRefreshQueued.delete(songId);
    } catch (error) { console.warn('Could not refresh shared Practice lyrics', error); }
  }, 150);
}
// Realtime can drop quietly on phones and tablets (sleep, network change). As
// a safety net the open Practice song is checked every few seconds with a tiny
// query, and reloaded only when something about its lyric edits changed.
function lyricsEditsSignature(edits, baselineUpdatedAt) {
  return [baselineUpdatedAt || '', ...(edits || []).map((row) => `${row.track_slug}|${row.updated_at}|${row.relay_error || ''}|${row.applied_at || ''}`).sort()].join(';');
}
let lyricsPollBusy = false;
async function pollPracticeLyrics() {
  const songId = practice.songId;
  if (lyricsPollBusy || document.hidden || state.view !== 'practice' || !songId || !practice.lyrics || practice.lyrics.error || navigator.onLine === false) return;
  if (lyricsEditDraft && $('#lyrics-edit-dialog')?.open) return;
  lyricsPollBusy = true;
  try {
    const [{ data: edits, error }, { data: base }] = await Promise.all([
      db.from('song_lyrics_edits').select('track_slug,updated_at,relay_error,applied_at').eq('song_id', songId),
      db.from('song_lyrics').select('updated_at').eq('song_id', songId).maybeSingle()
    ]);
    if (error || practice.songId !== songId) return;
    const remote = lyricsEditsSignature(edits, base?.updated_at);
    const local = lyricsEditsSignature(practice.lyrics.lyricsEdits, practice.lyrics.updated_at);
    if (remote !== local) refreshPracticeLyricsFromRealtime(songId);
  } catch { /* offline or busy: the next tick tries again */ } finally { lyricsPollBusy = false; }
}
setInterval(pollPracticeLyrics, 6000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.view === 'practice' && practice.songId && practice.lyrics && !practice.lyrics.error) refreshPracticeLyricsFromRealtime(practice.songId);
});
function subscribeLyricsEdits(songId) {
  if (lyricsEditChannel) db.removeChannel(lyricsEditChannel);
  lyricsEditChannel = db.channel('practice-lyrics-' + songId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'song_lyrics', filter: 'song_id=eq.' + songId }, () => refreshPracticeLyricsFromRealtime(songId))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'song_lyrics_edits', filter: 'song_id=eq.' + songId }, () => refreshPracticeLyricsFromRealtime(songId))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') refreshPracticeLyricsFromRealtime(songId);
    });
}
async function practiceLoadLyrics(songId) {
  practice.lyrics = null;
  $('#practice-lyrics')?.classList.add('practice-switching');
  let { data, error } = await db.from('song_lyrics').select('tracks, sections, tempo, bars, tone, duration_seconds, updated_at').eq('song_id', songId).maybeSingle();
  if (error && isNetworkError(error)) {
    const cached = await jsonCacheGet('lyrics/' + songId);
    if (cached) { data = cached; error = null; }
  } else if (!error && data) jsonCachePut('lyrics/' + songId, data);
  if (practice.songId !== songId) return;
  practice.lyrics = error ? { error: error.message } : (data || { tracks: [], sections: [] });
  if (!practice.lyrics.error) {
    practice.lyrics.sourceTracks = (practice.lyrics.tracks || []).map((t) => ({ ...t, lines: [...(t.lines || [])] }));
    try {
      const rows = await readLyricsEdits(songId);
      await jsonCachePut('lyrics-edits/' + songId, rows);
      applyLyricsEdits(rows);
    } catch (editError) {
      const cached = await jsonCacheGet('lyrics-edits/' + songId);
      if (cached) applyLyricsEdits(cached);
      else console.warn('Shared lyrics edits unavailable', editError);
    }
  }
  if (practice.songId !== songId) return;
  practice.lyricIndex = -2;
  $('#practice-lyrics')?.classList.remove('practice-switching');
  practiceKeepPlace(renderPracticeLyrics);
  renderTonePanel();
  if (!practice.lyrics.error) subscribeLyricsEdits(songId);
}
function lyricsEditorDialog() {
  let d = $('#lyrics-edit-dialog');
  if (d) return d;
  document.body.insertAdjacentHTML('beforeend', '<dialog id="lyrics-edit-dialog" class="lyrics-edit-dialog"><form id="lyrics-edit-form"><header class="lyrics-edit-header"><div><h2 data-edit-title></h2><p class="muted">Click a clip to edit its original text. Drums and Percussion clips can also be added or removed by section.</p></div><button type="button" class="button quiet lyrics-edit-close" data-edit-close aria-label="Cancel editing">×</button></header><div id="lyrics-edit-lines" class="lyrics-edit-canvas" data-edit-lines></div><p class="lyrics-edit-message" id="lyrics-edit-message" data-edit-message role="status"></p><footer><button type="button" class="button quiet" data-edit-restore>Restore Ableton Version</button><span class="lyrics-edit-spacer"></span><button type="button" class="button quiet" data-edit-close>Cancel</button><button type="submit" class="button primary" data-edit-save>Save Lyrics</button></footer></form></dialog>');
  d = $('#lyrics-edit-dialog');
  d.addEventListener('click', async (e) => {
    if (e.target.closest('[data-edit-close]')) { d.close(); return; }
    const addSection = e.target.closest('[data-edit-add-section]');
    if (addSection) { finishLyricsEditorCell(); addLyricsEditorClip(Number(addSection.dataset.editAddSection)); return; }
    const remove = e.target.closest('[data-edit-remove-clip]');
    if (remove) { removeLyricsEditorClip(Number(remove.dataset.editRemoveClip)); return; }
    if (e.target.closest('[data-edit-restore]')) await restoreLyricsEditor();
    const undo = e.target.closest('[data-edit-undo]');
    if (undo) {
      const i = Number(undo.dataset.editUndo);
      const line = lyricsEditDraft?.lines[i];
      if (line?._addedThisSession) {
        lyricsEditDraft.lines.splice(i, 1);
        lyricsEditDraft.activeIndex = null;
        lyricsEditDraft.message = '';
        renderLyricsEditor();
      } else if (line) {
        line.text = line._sessionText;
        lyricsEditDraft.activeIndex = null;
        lyricsEditDraft.message = '';
        renderLyricsEditor();
      }
      return;
    }
    const cell = e.target.closest('[data-edit-cell]');
    if (cell && !e.target.closest('[data-edit-line]')) {
      const targetLine = lyricsEditDraft.lines[Number(cell.dataset.editCell)];
      const targetKey = targetLine?._editKey;
      if (lyricsEditDraft.activeIndex != null && lyricsEditDraft.activeIndex !== Number(cell.dataset.editCell)) finishLyricsEditorCell();
      const targetIndex = lyricsEditDraft.lines.findIndex((line) => line._editKey === targetKey);
      if (targetIndex < 0) return;
      lyricsEditDraft.activeIndex = targetIndex;
      renderLyricsEditor({ focus: true });
    }
  });
  d.addEventListener('click', (e) => {
    const clickedCell = e.target.closest('[data-edit-cell]')?.dataset.editCell ?? null;
    const activatesCell = !!e.target.closest('[data-edit-cell], [data-edit-add-section]');
    setTimeout(() => {
      if (!lyricsEditDraft || !d.open || lyricsEditDraft.activeIndex == null || activatesCell) return;
      if (String(lyricsEditDraft.activeIndex) === clickedCell) return;
      finishLyricsEditorCell();
    }, 0);
  });
  d.addEventListener('input', (e) => {
    const field = e.target.closest('[data-edit-line]');
    if (!field || !lyricsEditDraft) return;
    const i = Number(field.dataset.editLine);
    const value = field.value.replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\n{2,}/g, '\n');
    if (value !== field.value) {
      const caret = Math.min(field.selectionStart, value.length);
      field.value = value;
      field.setSelectionRange(caret, caret);
    }
    if (lyricsEditDraft.lines[i]) lyricsEditDraft.lines[i].text = lyricsClipTextFromEditor(value);
    const undo = field.closest('[data-edit-cell]')?.querySelector('[data-edit-undo]');
    if (undo) undo.disabled = lyricsEditDraft.lines[i]?._addedThisSession ? false : lyricsEditDraft.lines[i]?.text === lyricsEditDraft.lines[i]?._sessionText;
    const save = d.querySelector('[data-edit-save]');
    if (save) save.disabled = lyricsEditDraft.saving || !lyricsEditorHasChanges();
    const restore = d.querySelector('[data-edit-restore]');
    if (restore) restore.disabled = lyricsEditDraft.saving || lyricsEditDraft.restoreAbleton || (!lyricsEditDraft.hasOverride && lyricsEditorMatchesAbleton());
  });
  d.addEventListener('keydown', (e) => {
    const textField = e.target.closest('[data-edit-line]');
    if (textField && e.key === 'Enter') {
      const currentLine = textField.value.slice(0, textField.selectionStart).split('\n').pop() || '';
      if (!currentLine.trim()) { e.preventDefault(); return; }
    }
    const cell = e.target.closest('[data-edit-cell][tabindex="0"]');
    if (!cell || e.target.matches('textarea')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); }
  });
  d.addEventListener('submit', async (e) => { e.preventDefault(); finishLyricsEditorCell(); await saveLyricsEditor(); });
  d.addEventListener('close', () => {
    const songId = lyricsEditDraft?.songId;
    lyricsEditDraft = null;
    if (songId) refreshPracticeLyricsFromRealtime(songId);
  });
  return d;
}
function removeLyricsEditorClip(index) {
  const d = lyricsEditDraft;
  if (!d || d.saving || !['drums', 'percussion'].includes(d.slug)) return;
  if (!d.lines[index]) return;
  d.lines.splice(index, 1);
  d.activeIndex = null;
  d.message = '';
  renderLyricsEditor();
}
function finishLyricsEditorCell() {
  const d = lyricsEditDraft;
  if (!d || d.activeIndex == null) return;
  const index = d.activeIndex;
  const line = d.lines[index];
  d.activeIndex = null;
  if (line && ['drums', 'percussion'].includes(d.slug) && !String(line.text || '').trim()) {
    d.lines.splice(index, 1);
    d.message = '';
  }
  renderLyricsEditor();
}
function lyricsEditorHasChanges() {
  const d = lyricsEditDraft;
  if (!d) return false;
  if (d.restoreAbleton || d.lines.some((line) => line._addedThisSession)) return true;
  const current = new Map(d.lines.map((line) => [line._editKey, line]));
  return d.sessionLines.some((line) => current.get(line._editKey)?.text !== line.text);
}
function lyricsEditorMatchesAbleton() {
  const d = lyricsEditDraft;
  if (d?.lines.some((line) => line.is_new_clip)) return false;
  const current = d?.lines.filter((line) => !line.is_new_clip) || [];
  return !!d && current.length === d.abletonLines.length && current.every((line, i) => line.text === d.abletonLines[i]?.text);
}
function lyricsEditorSectionIndex(line, sections) {
  const mid = (Number(line.t) + Number(line.e ?? line.t)) / 2;
  let index = -1;
  sections.forEach((section, i) => { if (Number(section.t) <= mid) index = i; });
  return index;
}
function lyricsEditorItems() {
  const d = lyricsEditDraft;
  const sections = (practice.lyrics?.sections || []).slice().sort((a, b) => a.t - b.t);
  const items = sections.map((sec, sectionIndex) => ({ type: 'section', t: sec.t, at: sec.t, rank: 1, name: sec.name, c: sec.c, sectionIndex }));
  (d?.lines || []).forEach((line, i) => {
    const text = String(line.text || '');
    if (line.is_new_clip) {
      const sectionIndex = Number(line.section_index);
      items.push({ type: 'line', t: line.t, at: sections[sectionIndex]?.t ?? line.t, rank: 2, line, i, sectionIndex });
      return;
    }
    const end = Number.isFinite(line.e) ? line.e : line.t;
    const boundary = sections.find((sec) => sec.t >= line.t - 0.01 && sec.t < end - 0.01);
    let at = line.t; let rank = 2; let sectionIndex = lyricsEditorSectionIndex(line, sections);
    if (boundary) {
      const inNext = /\[\s*>\s*\]/.test(text) ? true : /\[\s*<\s*\]/.test(text) ? false : (end - boundary.t) > (boundary.t - line.t);
      at = boundary.t; rank = inNext ? 2 : 0;
      if (inNext) sectionIndex = sections.indexOf(boundary);
      else sectionIndex = sections.indexOf(boundary) - 1;
    }
    items.push({ type: 'line', t: line.t, at, rank, line, i, sectionIndex });
  });
  return items.sort((a, b) => a.at - b.at || a.rank - b.rank || a.t - b.t);
}
function addLyricsEditorClip(sectionIndex) {
  const d = lyricsEditDraft;
  if (!d || d.saving || !['drums', 'percussion'].includes(d.slug)) return;
  const sections = (practice.lyrics?.sections || []).slice().sort((a, b) => a.t - b.t);
  const section = sections[sectionIndex];
  const end = sections[sectionIndex + 1]?.t ?? (Number(practice.lyrics?.duration_seconds) || ptDuration());
  if (!section || !Number.isFinite(end) || end <= Number(section.t)) {
    d.message = 'Could not find this section’s end time. Sync Ableton and try again.';
    renderLyricsEditor(); return;
  }
  if (d.lines.some((line) => line.is_new_clip && Number(line.section_index) === sectionIndex)) return;
  const line = { t: Number(section.t), e: end, text: '', is_new_clip: true, section_index: sectionIndex,
    _editKey: `new-${Date.now()}-${Math.random()}`, _sessionText: '', _addedThisSession: true };
  d.lines.push(line);
  d.lines.sort((a, b) => Number(a.t) - Number(b.t));
  d.restoreAbleton = false;
  d.activeIndex = d.lines.indexOf(line);
  d.message = '';
  renderLyricsEditor({ focus: true });
}
function renderLyricsEditor({ focus = false } = {}) {
  const d = lyricsEditorDialog();
  if (!lyricsEditDraft) return;
  const draft = lyricsEditDraft;
  const canvas = d.querySelector('[data-edit-lines]');
  const scrollTop = canvas.scrollTop;
  canvas.className = `lyrics-edit-canvas ly-size-${lyricsPrefs().size}`;
  d.querySelector('[data-edit-title]').textContent = draft.songName + ' · ' + lyricsTrackLabel(draft.slug);
  const items = lyricsEditorItems();
  const occupiedSections = new Set(items.filter((item) => item.type === 'line' && item.sectionIndex >= 0).map((item) => item.sectionIndex));
  const canAddSectionClips = ['drums', 'percussion'].includes(draft.slug);
  canvas.innerHTML = items.map((item) => {
    if (item.type === 'section') {
      const color = /^#[0-9a-f]{6}$/i.test(item.c || '') ? `--sec-color:${item.c}` : '';
      const add = canAddSectionClips && !occupiedSections.has(item.sectionIndex)
        ? `<button type="button" class="lyrics-edit-add-clip" data-edit-add-section="${item.sectionIndex}" aria-label="Add a ${escapeHtml(lyricsTrackLabel(draft.slug))} MIDI clip to ${escapeHtml(item.name)}" title="Add MIDI clip">＋</button>` : '';
      return `<div class="lyrics-edit-section-block"><div class="lyrics-edit-section"${color ? ` style="${color}"` : ''}>${escapeHtml(item.name)}</div>${add}</div>`;
    }
    const line = item.line;
    const ink = lyricInk(line.c);
    const changed = !!line._addedThisSession || line.text !== line._sessionText;
    const editing = draft.activeIndex === item.i;
    const clipLabel = line.is_new_clip ? 'New MIDI clip' : `Clip ${item.i + 1}`;
    const removeButton = canAddSectionClips ? `<button type="button" class="lyrics-edit-remove-clip" data-edit-remove-clip="${item.i}" aria-label="Remove ${escapeHtml(lyricsTrackLabel(draft.slug))} MIDI clip" title="Remove MIDI clip">×</button>` : '';
    return `<div class="lyrics-edit-cell ${editing ? 'editing' : ''}" data-edit-cell="${item.i}" role="group" tabindex="0" aria-label="Lyric clip ${item.i + 1}"${ink ? ` style="--edit-clip-ink:${ink}"` : ''}>${removeButton}${editing
      ? `<textarea class="lyrics-edit-input" data-edit-line="${item.i}" rows="3" aria-label="${clipLabel} text">${escapeHtml(lyricsClipTextForEditor(line.text))}</textarea><div class="lyrics-edit-cell-tools"><span>${clipLabel} · original MIDI clip text</span><button type="button" class="lyrics-edit-undo" data-edit-undo="${item.i}" ${changed ? '' : 'disabled'}>Undo</button></div>`
      : `<div class="lyrics-edit-cell-preview">${lyricLineHtml(line.text)}</div><div class="lyrics-edit-cell-tools"><span>${clipLabel}</span>${changed ? `<button type="button" class="lyrics-edit-undo" data-edit-undo="${item.i}">Undo</button>` : ''}</div>`}</div>`;
  }).join('') || '<p class="lyrics-edit-empty">No lyric clips on this track.</p>';
  d.querySelector('[data-edit-message]').textContent = draft.message || (draft.restoreAbleton ? 'Ableton version is selected. Choose Save Lyrics to remove the saved edits.' : '');
  d.querySelector('[data-edit-restore]').disabled = draft.saving || draft.restoreAbleton || (!draft.hasOverride && lyricsEditorMatchesAbleton());
  d.querySelector('[data-edit-save]').disabled = draft.saving || !lyricsEditorHasChanges() || draft.lines.some((line) => !String(line.text || '').trim());
  canvas.scrollTop = scrollTop;
  if (focus) {
    const input = canvas.querySelector(`[data-edit-line="${draft.activeIndex}"]`);
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
}
function openLyricsEditor(slug) {
  if (!practice.lyrics || practice.lyrics.error || !lyricsEditorTrackForMember(slug)) return;
  const song = state.songs.find((x) => x.id === practice.songId);
  const track = practice.lyrics.tracks.find((x) => x.slug === slug);
  const abletonTrack = practice.lyrics.sourceTracks?.find((x) => x.slug === slug);
  const abletonLines = (abletonTrack?.lines || []).map((x) => ({ ...x }));
  const lines = (track?.lines || []).map((x, i) => ({ ...x, _editKey: `opening-${i}`, _sessionText: x.text, _addedThisSession: false }));
  const fixedLines = lines.filter((line) => !line.is_new_clip);
  const mayChangeClipCount = ['drums', 'percussion'].includes(slug);
  if ((!mayChangeClipCount && fixedLines.length !== abletonLines.length) || (lines.some((line) => line.is_new_clip) && !mayChangeClipCount)) {
    showNotice('This track’s saved edit has a different number of clips from Ableton. Restore the Ableton version before editing.', true);
    return;
  }
  const edit = (practice.lyrics.lyricsEdits || []).find((x) => x.track_slug === slug);
  lyricsEditDraft = { songId: practice.songId, songName: song?.name || practice.songId, slug,
    lines, sessionLines: lines.map((x) => ({ _editKey: x._editKey, text: x.text })), abletonLines,
    updatedAt: edit?.updated_at || null, hasOverride: !!edit, restoreAbleton: false, activeIndex: null, message: '', saving: false };
  renderLyricsEditor();
  lyricsEditorDialog().showModal();
}
// Two devices edited the same lyrics track. Keep every line this editor
// changed and take the other device's version of the lines it did not touch.
// Returns null when the two versions cannot be lined up clip for clip (a clip
// was added or removed), in which case the editor must be reopened.
function mergeLyricsEditorLines(mine, theirs) {
  const other = [...(theirs || [])].sort((a, b) => Number(a.t) - Number(b.t));
  const own = [...(mine || [])].sort((a, b) => Number(a.t) - Number(b.t));
  if (own.length !== other.length || own.some((line) => line.is_new_clip) || other.some((line) => line.is_new_clip)) return null;
  const merged = []; let kept = 0; let taken = 0; let both = 0;
  for (let i = 0; i < own.length; i += 1) {
    const line = own[i]; const theirLine = other[i];
    if (Math.abs(Number(line.t) - Number(theirLine.t)) > 0.03) return null;
    const { changed, opened, ...saved } = line;
    if (changed) {
      if (String(theirLine.text || '') !== String(opened || '') && String(theirLine.text || '') !== String(saved.text || '')) both += 1;
      merged.push(saved); kept += 1;
    } else {
      if (String(theirLine.text || '') !== String(saved.text || '')) taken += 1;
      merged.push({ ...saved, text: theirLine.text });
    }
  }
  return { lines: merged, kept, taken, both };
}
async function saveLyricsEditor() {
  if (!lyricsEditDraft || lyricsEditDraft.saving) return;
  const d = lyricsEditDraft;
  const mayAddClips = ['drums', 'percussion'].includes(d.slug);
  const presentKeys = new Set(d.lines.filter((line) => !line._addedThisSession).map((line) => line._editKey));
  if (!d.restoreAbleton && !mayAddClips && d.sessionLines.some((line) => !presentKeys.has(line._editKey))) {
    d.message = 'Existing MIDI clips cannot be removed from this track.';
    renderLyricsEditor(); return;
  }
  const additions = d.lines.filter((line) => line.is_new_clip);
  if (!d.restoreAbleton && additions.length && !mayAddClips) {
    d.message = 'Only Drums and Percussion tracks can add MIDI clips.';
    renderLyricsEditor(); return;
  }
  const additionSections = new Set();
  for (const line of additions) {
    const index = Number(line.section_index);
    if (!Number.isInteger(index) || index < 0 || additionSections.has(index)) {
      d.message = 'A section can have only one Drums or Percussion MIDI clip.';
      renderLyricsEditor(); return;
    }
    additionSections.add(index);
  }
  if (d.lines.some((line) => !String(line.text || '').trim())) {
    d.message = 'Each MIDI clip needs text. Use chord text such as [G] for a chord-only clip.';
    renderLyricsEditor(); return;
  }
  if (!lyricsEditorHasChanges()) { $('#lyrics-edit-dialog').close(); return; }
  d.saving = true; renderLyricsEditor();
  try {
    const stale = 'Another edit changed the clips on this track while this editor was open. Close and reopen to keep everyone’s changes.';
    let linesToSave = d.lines.map((line) => {
      const { _editKey, _sessionText, _addedThisSession, ...saved } = line;
      return { ...saved, text: lyricsClipTextFromEditor(saved.text) };
    });
    const mineForMerge = d.lines.map((line) => {
      const { _editKey, _sessionText, _addedThisSession, ...saved } = line;
      const text = lyricsClipTextFromEditor(saved.text);
      return { ...saved, text, opened: lyricsClipTextFromEditor(_sessionText), changed: !!_addedThisSession || text !== lyricsClipTextFromEditor(_sessionText) };
    });
    let restore = false; let restoreToLive = false; let mergeNote = '';
    for (let attempt = 0; ; attempt += 1) {
      const { data: latest, error: readError } = await db.from('song_lyrics_edits').select('updated_at, applied_lines, lines').eq('song_id', d.songId).eq('track_slug', d.slug).maybeSingle();
      if (readError) throw readError;
      if ((latest?.updated_at || null) !== d.updatedAt) {
        // Someone saved this track from another device (or a sync confirmed
        // and cleared it) while this editor was open: merge line by line.
        if (d.restoreAbleton || attempt >= 3) throw new Error(stale);
        let theirs = latest?.lines;
        if (!latest) {
          const { data: base, error: baseError } = await db.from('song_lyrics').select('tracks').eq('song_id', d.songId).maybeSingle();
          if (baseError) throw baseError;
          theirs = base?.tracks?.find((track) => track.slug === d.slug)?.lines || [];
          d.abletonLines = theirs.map((x) => ({ ...x }));
        }
        const merged = mergeLyricsEditorLines(mineForMerge, theirs);
        if (!merged) throw new Error(stale);
        linesToSave = merged.lines;
        d.updatedAt = latest?.updated_at || null;
        mergeNote = merged.both ? ` ${merged.both} line${merged.both === 1 ? ' was' : 's were'} also changed on another device; your version was kept.`
          : merged.taken ? ' Changes made on another device were kept too.' : '';
      }
      const sameAsAbleton = (d.abletonLines || []).length === linesToSave.length
        && linesToSave.every((line, i) => !line.is_new_clip && String(line.text || '') === String(d.abletonLines[i]?.text || ''));
      restore = d.restoreAbleton || (mergeNote ? sameAsAbleton : lyricsEditorMatchesAbleton());
      restoreToLive = restore && !!latest && (abletonPresence.available || abletonPresence.awaitingSave || Array.isArray(latest.applied_lines));
      if (restore && !latest) break; // nothing queued and nothing to change
      if (restore && latest && !restoreToLive) {
        const { data: deleted, error } = await db.from('song_lyrics_edits').delete().eq('song_id', d.songId).eq('track_slug', d.slug).eq('updated_at', d.updatedAt).select('updated_at');
        if (error) throw error;
        if (deleted?.length) break;
        continue; // changed again meanwhile: read and merge once more
      }
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(latest?.updated_at || '') + 1 || 0)).toISOString();
      const lyricEdit = { lines: linesToSave, edited_by_member_id: state.member.id, updated_at: updatedAt, relay_error: null };
      if (latest) {
        const { data: updated, error } = await db.from('song_lyrics_edits').update(lyricEdit)
          .eq('song_id', d.songId).eq('track_slug', d.slug).eq('updated_at', d.updatedAt).select('updated_at');
        if (error) throw error;
        if (updated?.length) break;
        continue;
      }
      const { error } = await db.from('song_lyrics_edits').insert({ ...lyricEdit, song_id: d.songId, track_slug: d.slug });
      if (!error) break;
      if (error.code !== '23505') throw error; // 23505: another device queued this track first, so merge with it
    }
    const rows = await readLyricsEdits(d.songId);
    await jsonCachePut('lyrics-edits/' + d.songId, rows);
    applyLyricsEdits(rows); practiceKeepPlace(renderPracticeLyrics);
    showNotice(restoreToLive
      ? lyricsTrackLabel(d.slug) + ' Ableton lyrics queued to replace the pending in-memory edit.'
      : restore ? lyricsTrackLabel(d.slug) + ' lyrics restored from Ableton.'
      : abletonPresence.available
        ? lyricsTrackLabel(d.slug) + ' lyrics saved. Sending them to the open Ableton Master Project…' + mergeNote
        : lyricsTrackLabel(d.slug) + ' lyrics saved to shared Practice; they will sync when Ableton is available.' + mergeNote);
    $('#lyrics-edit-dialog').close();
  } catch (error) {
    d.saving = false;
    d.message = error.message || 'Could not save. Check your connection and try again.';
    renderLyricsEditor();
  }
}
async function restoreLyricsEditor() {
  const d = lyricsEditDraft;
  if (!d || d.saving || (lyricsEditorMatchesAbleton() && !d.hasOverride)) return;
  d.lines = d.abletonLines.map((x, i) => {
    const original = d.lines.find((line) => !line.is_new_clip && Math.abs(Number(line.t) - Number(x.t)) < 0.01);
    return { ...x, _editKey: original?._editKey || `ableton-${i}`, _sessionText: original?._sessionText ?? x.text, _addedThisSession: false };
  });
  d.restoreAbleton = true;
  d.activeIndex = null;
  d.message = 'Ableton version is selected. Choose Save Lyrics to restore this track; an in-memory change will be replaced in Live and remain queued until you save and sync.';
  renderLyricsEditor();
}

function lyricsTrack() {
  const tracks = (practice.lyrics?.tracks || []).filter((t) => t.lines?.length);
  const picked = lyricsPrefs().track;
  // A track someone picked is kept across songs; a song without it shows just its sections.
  if (picked) return tracks.find((t) => t.slug === picked) || null;
  // Otherwise: their instrument's track, or Chords when this song doesn't have it.
  return tracks.find((t) => t.slug === lyricsDefaultTrack()) || tracks.find((t) => t.slug === 'chords') || null;
}
function lyricsShownSlug() {
  return lyricsPrefs().track || lyricsTrack()?.slug || lyricsDefaultTrack();
}
// Clip colours from the set; very dark ones are lifted so they read on black.
function lyricInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '';
  const n = parseInt(m[1], 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.45) {
    const k = Math.min(0.75, (0.45 - lum) / (1 - lum) + 0.15);
    [r, g, b] = [r, g, b].map((v) => Math.round(v + (255 - v) * k));
  }
  return `rgb(${r}, ${g}, ${b})`;
}
// Always offered (in this order), plus any other +LYRICS track a song has.
const LYRICS_STANDARD = [['chords', 'Chords'], ['guitar', 'Guitar'], ['keyboard', 'Keyboard'], ['lyrics', 'Lyrics'], ['drums', 'Drums'], ['percussion', 'Percussion']];

function lyricLineHtml(text) {
  let raw = String(text || '').replace(/\[\s*[<>]\s*\]/g, '');
  // "[Key:] [E]" (possibly followed by more, e.g. "\\ [(RetroSynth)]") shows as "Key: E".
  let keyHtml = '';
  const keyMatch = raw.match(/^\s*\[Key:\]\s*\[([^\]]+)\]\s*/);
  if (keyMatch) {
    keyHtml = `<span class="ly-key">Key:&nbsp; <b>${escapeHtml(keyMatch[1])}</b></span>`;
    raw = raw.slice(keyMatch[0].length);
    if (!raw.trim()) return keyHtml;
    raw = raw.replace(/^\s*\\{1,2}\s*/, '');
    keyHtml += '<span class="ly-br"></span>';
  }
  const parts = [];
  let last = 0;
  let pendingChord = null;
    const re = /\[([^\]\s]+)\]/g;
  let m;
  const pushText = (str) => {
    // "\\" in a clip name is a line break (AbleSet).
    const pieces = String(str || '').split(/\s*\\{1,2}\s*/);
    pieces.forEach((piece, i) => {
      if (i > 0) { if (pendingChord !== null) { parts.push({ chord: pendingChord, text: '' }); pendingChord = null; } parts.push({ br: true }); }
      if (!piece && pendingChord === null) return;
      parts.push({ chord: pendingChord, text: piece });
      pendingChord = null;
    });
  };
  while ((m = re.exec(raw))) {
    const before = raw.slice(last, m.index);
    const token = m[1].trim();
    // A chord, or a chord with an instruction like "A(stop)" / "E x2": shown above the words.
    // Chords, chords with an instruction ("A(stop)", "E x2") and bracketed
    // instructions like "[(stop)]" all sit above the words, in chord colour.
    // Everything in [] (chords, "A(stop)", "[(stop)]", "[-E]", ...) sits above
    // the words in chord colour, like AbleSet.
    pushText(before);
    if (pendingChord !== null) parts.push({ chord: pendingChord, text: '' });
    pendingChord = token;
    last = re.lastIndex;
  }
  pushText(raw.slice(last));
  if (pendingChord !== null) parts.push({ chord: pendingChord, text: '' });
  const chordOnly = parts.every((p) => p.br || p.label !== undefined || !String(p.text || '').trim());
  const fmt = (str) => escapeHtml(str).replace(/\(([^)]*)\)/g, '<span class="ly-note">($1)</span>');
  // A row (between line breaks) with no words is chords only: no empty word row under its chords.
  let rowStart = 0;
  for (let i = 0; i <= parts.length; i += 1) {
    if (i === parts.length || parts[i].br) {
      const row = parts.slice(rowStart, i);
      const noWords = row.every((p) => p.label !== undefined || !String(p.text || '').trim());
      row.forEach((p) => { p.rowChordOnly = noWords; });
      rowStart = i + 1;
    }
  }
  return keyHtml + parts.map((p) => {
    if (p.br) return '<span class="ly-br"></span>';
    if (p.label !== undefined) return p.label ? `<span class="ly-label">${escapeHtml(p.label)}</span>` : '';
    if (p.chord === null || p.chord === undefined) return `<span class="ly-seg"><span class="ly-word">${fmt(p.text)}</span></span>`;
    return `<span class="ly-seg ${chordOnly || p.rowChordOnly ? 'ly-chord-only' : ''}"><span class="ly-chord">${escapeHtml(p.chord)}</span><span class="ly-word">${fmt(p.text) || '&nbsp;'}</span></span>`;
  }).join('');
}

function renderPracticeLyrics() {
  renderPracticeLyricsInner();
  lyricsFit();
  if (typeof lyricsChipsHint === 'function') lyricsChipsHint();
}
window.addEventListener('resize', () => { if (typeof lyricsChipsHint === 'function') lyricsChipsHint(); });
// Full-screen lyrics (YouTube-style): only the lyrics, with the track/size
// controls on top and the transport at the bottom; both fade out after a few
// seconds without moving the mouse or touching the screen while playing.
const LY_FS_ICONS = {
  enter: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 2h5v2H4v3H2zM9 2h5v5h-2V4H9zM2 9h2v3h3v2H2zM12 9h2v5H9v-2h3z" fill="currentColor"/></svg>',
  exit: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M5 2h2v5H2V5h3zM9 2h2v3h3v2H9zM2 9h5v5H5v-3H2zM9 9h5v2h-3v3H9z" fill="currentColor"/></svg>'
};
const lyricsFs = { on: false, timer: 0 };
// Controls: shown on entering; while a song plays they fade out after 1 s
// without a touch/click; while paused they stay until you tap empty space.
// ms: how long the controls stay after the last touch while playing (longer
// after using a control, so there's time to pick a track or size).
function lyricsFsShowControls(ms = 2500) {
  if (!lyricsFs.on) return;
  document.body.classList.add('lyrics-fs-controls');
  lyricsFsArmHide(ms);
}
function lyricsFsHideControls() {
  clearTimeout(lyricsFs.timer);
  document.body.classList.remove('lyrics-fs-controls');
  ptMixerClose();
}
function lyricsFsArmHide(ms = 2500) {
  clearTimeout(lyricsFs.timer);
  const check = () => {
    if (!lyricsFs.on || !document.body.classList.contains('lyrics-fs-controls')) return;
    if (ptMixer.open) lyricsFs.timer = setTimeout(check, 500); // mixer open: stay until it's closed
    else if (ptIsPlaying()) lyricsFsHideControls();
    else lyricsFs.timer = setTimeout(check, 500); // paused: keep them; hide once playback starts
  };
  lyricsFs.timer = setTimeout(check, ms);
}
function lyricsChipsHint() {
  const row = document.querySelector('#practice-lyrics .ly-chips');
  if (!row) return;
  const more = row.scrollWidth > row.clientWidth + 2;
  row.classList.toggle('more-right', more && row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
  row.classList.toggle('more-left', more && row.scrollLeft > 2);
}
document.addEventListener('scroll', (event) => {
  if (!event.target?.classList?.contains('ly-chips')) return;
  lyricsChipsHint();
  if (lyricsFs.on) lyricsFsShowControls(5000); // swiping through the track chips keeps them up
}, true);
// A finger resting on the controls keeps them up.
document.addEventListener('touchstart', (event) => {
  if (lyricsFs.on && event.target.closest?.('#practice-transport, #pt-mixer, #practice-lyrics > header, #practice-lyrics .ly-chips')) lyricsFsShowControls(5000);
}, { passive: true });
function lyricsFsEnter() {
  if (lyricsFs.on) return;
  lyricsFs.on = true;
  document.body.classList.add('lyrics-fs', 'lyrics-fs-in');
  setTimeout(() => document.body.classList.remove('lyrics-fs-in'), 320);
  // Real full screen where the browser allows it (computers, Android); iPhone keeps the browser bars.
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (request && !document.fullscreenElement && !document.webkitFullscreenElement) { try { request.call(el)?.catch?.(() => {}); } catch { /* not allowed */ } }
  renderPracticeLyrics();
  lyricsFsShowControls();
  practice.lyricIndex = -2;
  setTimeout(() => { lyricsFit(); practiceLyricsTick(true); lyricsChipsHint(); }, 80);
}
function lyricsFsExit(skipFade) {
  if (!lyricsFs.on || lyricsFs.leaving) return;
  if (!skipFade) {
    // Fade out, then go back to the page.
    lyricsFs.leaving = true;
    document.body.classList.add('lyrics-fs-out');
    setTimeout(() => { lyricsFs.leaving = false; document.body.classList.remove('lyrics-fs-out'); lyricsFsExit(true); }, 260);
    return;
  }
  lyricsFs.on = false;
  clearTimeout(lyricsFs.timer);
  ptMixerClose();
  document.body.classList.remove('lyrics-fs', 'lyrics-fs-controls');
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try { exit?.call(document)?.catch?.(() => {}); } catch { /* ignore */ }
  }
  renderPracticeLyrics();
  practice.lyricIndex = -2;
  // Back on the page with the lyrics card at the top of the screen.
  // The big "Lyrics" title lands at the top, clear of the iPhone status bar
  // (the Home Screen app draws the page under it).
  const bringLyricsUp = () => {
    const title = document.querySelector('#practice-lyrics > header') || document.getElementById('practice-lyrics');
    if (!title) return;
    const top = title.getBoundingClientRect().top + window.scrollY - safeAreaTop() - 10;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    lyricsFit();
  };
  setTimeout(() => { bringLyricsUp(); practiceLyricsTick(true); }, 60);
  setTimeout(bringLyricsUp, 400); // again once the browser has left full screen
  setTimeout(bringLyricsUp, 900); // and after the phone's toolbars have settled
}
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-lyrics-fs]')) { lyricsFs.on ? lyricsFsExit() : lyricsFsEnter(); }
});
['fullscreenchange', 'webkitfullscreenchange'].forEach((name) => document.addEventListener(name, () => {
  if (lyricsFs.on && !lyricsFs.leaving && !document.fullscreenElement && !document.webkitFullscreenElement) lyricsFsExit();
}));
document.addEventListener('keydown', (event) => {
  if (state.view !== 'practice' || event.target.closest?.('input, textarea, select')) return;
  if (event.key === 'Escape' && ptMixer.open) { ptMixerClose(); return; }
  if (event.key === 'Escape' && lyricsFs.on) { lyricsFsExit(); return; }
  if ((event.key === 'f' || event.key === 'F') && !event.metaKey && !event.ctrlKey) { lyricsFs.on ? lyricsFsExit() : lyricsFsEnter(); return; }
  lyricsFsShowControls();
});
// Mouse movement brings the controls back on a computer.
document.addEventListener('mousemove', (event) => {
  if (!lyricsFs.on || event.movementX === 0 && event.movementY === 0) return;
  lyricsFsShowControls();
}, { passive: true });
// A click inside the mixer redraws its rows, which takes the button that was
// clicked out of the page: by the time the click reaches the handlers below,
// asking what it sits in would answer "nothing". So it is noted here, in the
// capture phase, while everything is still in place.
const ptClickAt = { mixer: false, transport: false, lyricsControls: false };
document.addEventListener('click', (event) => {
  const t = event.target;
  ptClickAt.mixer = !!t.closest?.('#pt-mixer');
  ptClickAt.transport = !!t.closest?.('#practice-transport');
  ptClickAt.lyricsControls = !!t.closest?.('#practice-lyrics > header, #practice-lyrics .ly-chips');
}, true);
// On the Practice page a click away from the mixer and the playback bar closes
// the mixer; in full-screen lyrics the handler below does it.
function ptMixerClickClosesIt(at, { open, fullScreen }) {
  if (!open || fullScreen) return false;
  return !at.mixer && !at.transport;
}
// Clicking/tapping empty space shows or hides the controls; using a control
// keeps them up; tapping a line still jumps there.
document.addEventListener('click', (event) => {
  if (!lyricsFs.on) return;
  const t = event.target;
  if (ptClickAt.transport || ptClickAt.mixer || ptClickAt.lyricsControls) { lyricsFsShowControls(5000); return; }
  if (ptMixer.open) { ptMixerClose(); event.stopPropagation(); event.preventDefault(); return; } // first tap outside just closes the mixer
  if (t.closest('.ly-line, .ly-section, button, a, input, select')) return;
  if (!t.closest('#practice-lyrics')) return;
  if (document.body.classList.contains('lyrics-fs-controls')) lyricsFsHideControls();
  else lyricsFsShowControls();
}, true);
const LYRICS_RELAY_ERRORS = {
  source_changed: 'a clip on this track was also changed by hand in Ableton. Aaron will choose which version wins on the Ableton Sync page.',
  clip_count_mismatch: 'the number of clips on this track changed in Ableton. Aaron needs to save and sync the set, then edit again.',
  line_count_changed: 'the number of clips no longer matches Ableton. Restore the Ableton version and edit again.',
  section_clip_exists: 'that section already has a clip in Ableton.',
  lyrics_track_not_found: 'this lyrics track was not found in the open Ableton set.',
  song_not_found: 'this song was not found in the open Ableton set.',
  no_baseline: 'Ableton has no saved version of this track yet. Aaron needs to sync the set.'
};
// One line under the track chips saying where this track's queued edit is.
function lyricsEditStatus(edit, presence) {
  if (!edit) return null;
  if (edit.relay_error === 'source_changed') return { state: 'sending', text: `Waiting for a decision: ${LYRICS_RELAY_ERRORS.source_changed}` };
  if (edit.relay_error) return { state: 'attention', text: `Not in Ableton yet: ${LYRICS_RELAY_ERRORS[edit.relay_error] || `Ableton refused the edit (${edit.relay_error}).`}` };
  if (Array.isArray(edit.applied_lines) && lyricsRelayStateMatches(edit.applied_lines, edit.lines)) {
    return { state: 'applied', text: 'Edit is in Ableton. It stays marked as pending until Aaron saves the set and syncs.' };
  }
  return presence?.available
    ? { state: 'sending', text: 'Edit saved. Sending it to Ableton…' }
    : { state: 'queued', text: 'Edit saved. It will go into Ableton when Aaron’s Mac has the app and the set open.' };
}
function renderPracticeLyricsInner() {
  const box = $('#practice-lyrics');
  if (!box) return;
  const prefs = lyricsPrefs();
  const ly = practice.lyrics;
  if (!ly) { box.innerHTML = '<header><h2>Lyrics</h2></header><p class="muted">Loading…</p>'; return; }
  if (ly.error) { box.innerHTML = `<header><h2>Lyrics</h2></header><p class="error">${escapeHtml(ly.error)}</p>`; return; }
  const tracks = ly.tracks || [];
  if (!tracks.length) { box.innerHTML = '<header><h2>Lyrics</h2></header><p class="muted">No lyrics saved for this song yet. They come from the admin\'s last Ableton Sync read.</p>'; return; }
  const current = lyricsTrack();
  const shown = lyricsShownSlug();
  const editSlug = lyricsEditorTrackForMember(shown);
  const chipList = [...LYRICS_STANDARD, ...tracks.filter((t) => !LYRICS_STANDARD.some(([slug]) => slug === t.slug)).map((t) => [t.slug, t.label])];
  const chips = chipList.map(([slug, label]) => {
    const has = tracks.some((t) => t.slug === slug && t.lines?.length);
    const selected = slug === shown;
    const edit = selected && editSlug === slug
      ? `<button type="button" class="ly-chip-edit" data-lyrics-edit="${escapeHtml(slug)}" title="Edit ${escapeHtml(label)} lyrics" aria-label="Edit ${escapeHtml(label)} lyrics"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Zm16.7-9.8a.93.93 0 0 0 0-1.3l-2.1-2.1a.93.93 0 0 0-1.3 0l-1.7 1.7 3.4 3.4 1.7-1.7Z"/></svg></button>` : '';
    return `<span class="ly-chip-wrap ${selected ? 'on' : ''}"><button type="button" class="ly-chip ${selected ? 'on' : ''} ${has ? '' : 'empty'}" data-lyrics-track="${escapeHtml(slug)}" title="${has ? '' : 'Nothing on this track for this song'}">${escapeHtml(label)}</button>${edit}</span>`;
  }).join('');
  const chosenLabel = chipList.find(([slug]) => slug === shown)?.[1] || shown;
  const editStatus = lyricsEditStatus((ly.lyricsEdits || []).find((row) => row.track_slug === shown), abletonPresence);
  const missing = (!current ? `<p class="muted ly-missing">No ${escapeHtml(chosenLabel)} notes in this song; showing its sections.</p>` : '')
    + (editStatus ? `<p class="muted ly-edit-status ${editStatus.state}">${escapeHtml(editStatus.text)}</p>` : '');
  // Merge section headings into the line list by time.
  const items = [];
  const sections = (ly.sections || []).slice().sort((a, b) => a.t - b.t);
  sections.forEach((sec, k) => items.push({ type: 'section', t: sec.t, at: sec.t, rank: 1, name: sec.name, c: sec.c, k }));
  // Which section a line is listed under: the one holding most of its clip.
  // A clip that starts at the end of section A but runs mostly into B goes
  // under B. [>] in the clip forces it under the later section, [<] under
  // the earlier one. (Timing still follows the clip itself.)
  (current?.lines || []).forEach((line, i) => {
    const text = String(line.text || '');
    const forceNext = /\[\s*>\s*\]/.test(text);
    const forcePrev = /\[\s*<\s*\]/.test(text);
    const end = Number.isFinite(line.e) ? line.e : line.t;
    const boundary = sections.find((sec) => sec.t >= line.t - 0.01 && sec.t < end - 0.01);
    let at = line.t;
    let rank = 2; // after a section that starts at the same moment
    if (boundary) {
      const inNext = forceNext ? true : forcePrev ? false : (end - boundary.t) > (boundary.t - line.t);
      if (inNext) { at = boundary.t; rank = 2; } else { at = boundary.t; rank = 0; } // 0 = just before that section
    }
    items.push({ type: 'line', t: line.t, e: line.e, at, rank, text, c: line.c, i });
  });
  items.sort((a, b) => a.at - b.at || a.rank - b.rank || a.t - b.t);
  // AbleSet-style count dots under a section heading while nothing is sung or
  // played on this track: one per beat for short gaps, otherwise a few that
  // step through the bars.
  const withDots = [];
  items.forEach((it, i) => {
    withDots.push(it);
    if (it.type !== 'section') return;
    const nextT = items[i + 1]?.t ?? (practice.lyrics?.duration_seconds || ptDuration() || it.t);
    const n = lyricsDotCount(it.t, nextT);
    if (n) withDots.push({ type: 'dots', t: it.t, t1: nextT, n });
  });
  const song = state.songs.find((row) => row.id === practice.songId);
  box.innerHTML = `<header><h2>Lyrics</h2><span class="ly-sizes">${['s', 'm', 'l'].map((size) => `<button type="button" class="ly-size ${prefs.size === size ? 'on' : ''}" data-lyrics-size="${size}">${size === 's' ? 'A' : size === 'm' ? 'A' : 'A'}</button>`).join('')}<button type="button" class="ly-fs-btn" data-lyrics-fs title="${lyricsFs.on ? 'Exit full screen (Esc)' : 'Full screen (F)'}" aria-label="${lyricsFs.on ? 'Exit full screen' : 'Full screen lyrics'}">${lyricsFs.on ? LY_FS_ICONS.exit : LY_FS_ICONS.enter}</button></span></header>
    <div class="ly-chips">${chips}</div>${missing}
    <div class="ly-scroll ly-size-${prefs.size} ly-track-${escapeHtml(current?.slug || 'none')}" id="practice-lyrics-scroll">${song ? `<div class="ly-title">${escapeHtml(song.name)}</div>` : ''}${withDots.map((it) => it.type === 'dots'
      ? `<div class="ly-dots" data-t="${it.t}" data-t1="${it.t1}">${'<span class="ly-dot"></span>'.repeat(it.n)}</div>`
      : it.type === 'section'
      ? `<div class="ly-section" data-t="${it.t}"${/^#[0-9a-f]{6}$/i.test(it.c || '') ? ` style="--sec-color:${it.c}"` : ''}>${escapeHtml(it.name)}</div>`
      : `<div class="ly-line" data-line="${it.i}" data-t="${it.t}" data-e="${it.e}"${lyricInk(it.c) ? ` style="--ly-ink:${lyricInk(it.c)}"` : ''}>${lyricLineHtml(it.text)}</div>`).join('')}</div>
    <p class="muted ly-foot">From the Ableton set read ${ly.updated_at ? new Date(ly.updated_at).toLocaleDateString() : ''}. Click a line to jump there.</p>`;
  practice.lyricIndex = -2;
  practiceLyricsTick(true);
  practiceCheckLyricsLength();
}

// Lyrics are timed from the song start, the same point the exported audio
// starts, so they line up by themselves. Only a length difference means the
// song changed in Ableton after the audio was exported.
function practiceCheckLyricsLength() {
  const box = $('#practice-lyrics');
  const audio = $('#practice-mix-audio');
  const set = practice.lyrics?.duration_seconds;
  box?.querySelector('.ly-drift')?.remove();
  if (roomFollowing()) { practice.lyricsUnsynced = false; return; } // the host's clock drives them
  if (!box || !audio || !set) return;
  const check = () => {
    if (!Number.isFinite(audio.duration)) return;
    const diff = audio.duration - set;
    box.querySelector('.ly-drift')?.remove();
    practice.lyricsUnsynced = Math.abs(diff) > 1.5;
    if (!practice.lyricsUnsynced) return;
    $('#practice-lyrics-scroll')?.querySelectorAll('.ly-line').forEach((el) => el.classList.remove('current', 'next', 'past'));
    const note = document.createElement('p');
    note.className = 'ly-drift';
    note.textContent = `This audio is ${Math.abs(diff).toFixed(1)} s ${diff > 0 ? 'longer' : 'shorter'} than the song in the last Ableton read, so the lyrics are shown without timing.${state.member?.is_admin ? ' Export and upload this song again.' : ''}`;
    box.querySelector('.ly-chips')?.after(note);
  };
  if (Number.isFinite(audio.duration)) check(); else audio.addEventListener('loadedmetadata', check, { once: true });
}

function practiceNow() {
  return ptPosition();
}

// Beats between two times, from the set's tempo map.
function lyricsBeatsBetween(t0, t1) {
  const map = Array.isArray(practice.lyrics?.tempo) && practice.lyrics.tempo.length ? practice.lyrics.tempo : null;
  const song = state.songs.find((row) => row.id === practice.songId);
  const bpmAt = (t) => {
    if (!map) return Number(song?.tempo_start) || 120;
    let bpm = map[0][1];
    for (const [pt, v] of map) { if (pt <= t) bpm = v; else break; }
    return bpm;
  };
  let beats = 0;
  const step = 0.05;
  for (let t = t0; t < t1; t += step) beats += (Math.min(step, t1 - t) * bpmAt(t)) / 60;
  return beats;
}
function lyricsDotCount(t0, t1) {
  if (!(t1 > t0)) return 0;
  const beats = lyricsBeatsBetween(t0, t1);
  if (beats < 2.9) return 0; // only gaps of 3 counts or more
  if (beats <= 8.1) return Math.max(1, Math.round(beats)); // one per beat
  // Longer gaps: one dot per bar, at most four (each then covers several bars).
  return Math.min(4, Math.max(1, Math.round(beats / 4)));
}
function practiceLyricsDots(scroll, t) {
  scroll.querySelectorAll('.ly-dots').forEach((row) => {
    const t0 = Number(row.dataset.t);
    const t1 = Number(row.dataset.t1);
    const dots = row.children;
    const phase = t < t0 ? 'before' : t >= t1 - 0.08 ? 'after' : 'live';
    const lit = phase === 'live' ? Math.floor(((t - t0) / (t1 - t0)) * dots.length) + 1 : 0;
    const key = `${phase}${lit}`;
    if (row.dataset.lit === key) return;
    row.dataset.lit = key;
    [...dots].forEach((dot, i) => dot.classList.toggle('on', i < lit));
    // Empty space until the gap starts, the dots while it runs, gone after.
    row.classList.toggle('live', phase === 'live');
    row.classList.toggle('gone', phase !== 'live');
  });
}

function practiceLyricsTick(force) {
  if (practice.lyricsUnsynced) return; // audio and lyrics disagree on length
  const scroll = $('#practice-lyrics-scroll');
  if (!scroll || !practice.lyrics) return;
  const lines = lyricsTrack()?.lines || [];
  const t = practiceNow();
  practiceLyricsDots(scroll, t);
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) { if (lines[i].t <= t + 0.05) idx = i; else break; }
  const inside = idx >= 0 && t < lines[idx].e;
  // Section under the playhead gets a lighter highlight, but only when no
  // line is live: while paused (e.g. after clicking it), or during a section
  // with nothing on this track. A live line always wins.
  const sectionEls = [...scroll.querySelectorAll('.ly-section')];
  let secEl = null;
  let secIndex = -1;
  sectionEls.forEach((el, i) => { if (Number(el.dataset.t) <= t + 0.05) { secEl = el; secIndex = i; } });
  let showSection = null;
  if (secEl && !inside) {
    const from = Number(secEl.dataset.t);
    const to = sectionEls[secIndex + 1] ? Number(sectionEls[secIndex + 1].dataset.t) : Infinity;
    const hasLines = lines.some((line) => line.t >= from - 0.05 && line.t < to);
    if (!hasLines || !ptIsPlaying()) showSection = secEl;
  }
  if (force || showSection !== practice.sectionEl) {
    sectionEls.forEach((el) => el.classList.toggle('current', el === showSection));
    practice.sectionEl = showSection;
    if (!lines.length && showSection && (force || Date.now() - (practice.lyricsTouchedAt || 0) > 4000)) lyricsScrollTo(scroll, showSection, force);
  }
  if (!lines.length) return;
  const key = inside ? idx : -1 - Math.max(0, idx + 1); // between lines: point at the next one
  if (!force && key === practice.lyricIndex) return;
  practice.lyricIndex = key;
  scroll.querySelectorAll('.ly-line').forEach((el) => {
    const i = Number(el.dataset.line);
    el.classList.toggle('current', inside && i === idx);
    el.classList.toggle('next', (inside ? i === idx + 1 : i === idx + 1));
    el.classList.toggle('past', i < idx || (!inside && i === idx));
  });
  const target = scroll.querySelector(`.ly-line[data-line="${inside ? idx : Math.max(0, idx + 1)}"]`);
  // Don't fight the reader: after they scroll the lyrics by hand, wait 4 s.
  if (target && (force || Date.now() - (practice.lyricsTouchedAt || 0) > 4000)) lyricsScrollTo(scroll, target, force);
}

// Puts a line about a third of the way down the lyrics box. Measured with
// getBoundingClientRect so it is right whatever the page layout, zoom or
// device; only the lyrics box scrolls, never the page.
function lyricsScrollTo(scroll, target, instant) {
  const top = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - scroll.clientHeight * 0.35;
  const max = scroll.scrollHeight - scroll.clientHeight;
  const goal = Math.max(0, Math.min(max, Math.round(top)));
  if (Math.abs(scroll.scrollTop - goal) < 2) return;
  practice.lyricsAutoScrolling = Date.now();
  cancelAnimationFrame(practice.lyricsScrollAnim || 0);
  if (instant) { scroll.scrollTop = goal; return; }
  // iPhone/iPad: Safari's own smooth scrolling is the reliable way to glide there.
  if (PHONE && 'scrollBehavior' in document.documentElement.style) { scroll.scrollTo({ top: goal, behavior: 'smooth' }); return; }
  // Eased glide (slow in, slow out) instead of the browser's fixed smooth scroll.
  const from = scroll.scrollTop;
  const distance = goal - from;
  const duration = Math.min(900, 420 + Math.abs(distance) * 0.6);
  const started = performance.now();
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const step = (now) => {
    if (Date.now() - (practice.lyricsTouchedAt || 0) < 300) return; // the reader took over
    const k = Math.min(1, (now - started) / duration);
    scroll.scrollTop = from + distance * ease(k);
    if (k < 1) practice.lyricsScrollAnim = requestAnimationFrame(step);
  };
  practice.lyricsScrollAnim = requestAnimationFrame(step);
}

// A hand scroll (touch, wheel, keys) pauses autoscroll briefly.
['touchstart', 'wheel', 'keydown', 'pointerdown'].forEach((type) => {
  document.addEventListener(type, (event) => {
    if (event.target.closest?.('#practice-lyrics-scroll')) practice.lyricsTouchedAt = Date.now();
  }, { passive: true });
});
window.addEventListener('resize', () => { if (state.view === 'practice') practiceLyricsTick(true); });

// One loop keeps lyrics in step with whichever player is running.
(function lyricsLoop() {
  if (state.view === 'practice' && !document.hidden) practiceLyricsTick(false);
  requestAnimationFrame(lyricsLoop);
})();

$('#practice-lyrics').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-lyrics-edit]');
  if (edit) { openLyricsEditor(edit.dataset.lyricsEdit); return; }
  const chip = event.target.closest('[data-lyrics-track]');
  if (chip) { saveLyricsPrefs({ track: chip.dataset.lyricsTrack }); renderPracticeLyrics(); return; }
  const size = event.target.closest('[data-lyrics-size]');
  if (size) { saveLyricsPrefs({ size: size.dataset.lyricsSize }); renderPracticeLyrics(); return; }
  const line = event.target.closest('.ly-line, .ly-section');
  if (line) {
    // Land just after the start, so the previous section's count dots stay off.
    ptSeek(Math.max(0, Number(line.dataset.t) + 0.02));
    practice.lyricIndex = -2;
  }
});

// Saved on each admin "Sync Ableton Set": one row per song with its lyrics.
async function saveSongLyrics(snapshot, held = new Map(), baselineBySong = new Map()) {
  const known = new Set(state.songs.map((song) => song.id));
  const rows = Object.entries(snapshot?.songs || {})
    .filter(([id, data]) => known.has(id) && data.lyrics)
    .map(([id, data]) => ({ song_id: id, tracks: baselineTracksForSave(data.lyrics.tracks || [], held.get(id), baselineBySong.get(id)?.tracks), sections: data.lyrics.sections || [], tempo: data.lyrics.tempo || [], bars: data.bars || [], tone: data.tone || [],
      duration_seconds: data.duration_seconds, als_modified_at: snapshot.als_modified_at, updated_at: new Date().toISOString() }));
  for (let i = 0; i < rows.length; i += 20) {
    const { error } = await db.from('song_lyrics').upsert(rows.slice(i, i + 20), { onConflict: 'song_id' });
    if (error) throw error;
  }
  return rows.length;
}


// ---------------------------------------------------------------------------
// Practice transport: one Ableton-style bar at the bottom drives whichever
// player is chosen (Mixdown or Multitrack); both follow its single playhead.
const PT_MODE_KEY = 'tsp-practice-mode';
let ptSongPickerOpen = false;
let ptWorkOpen = false;
function ptMode() {
  let mode = 'mix';
  try { mode = sessionStorage.getItem(PT_MODE_KEY) || 'mix'; } catch { /* ignore */ }
  return mode === 'multi' ? 'multi' : 'mix';
}
function ptMultiReady() {
  return practiceMultiLoaded();
}
function ptEngine() {
  if (roomFollowing()) return 'room'; // the host plays; this device shows and steers
  const audio = $('#practice-mix-audio');
  if (ptMode() === 'multi' && ptMultiReady()) return 'multi';
  return audio ? 'mix' : (ptMultiReady() ? 'multi' : null);
}
function ptDuration() {
  if (roomFollowing()) return room.state.duration || Number(state.songs.find((x) => x.id === practice.songId)?.duration_seconds) || 0;
  const audio = $('#practice-mix-audio');
  return Math.max(practice.duration || 0, Number.isFinite(audio?.duration) ? audio.duration : 0);
}
function ptIsPlaying() {
  if (roomFollowing()) return !!room.state.playing;
  const audio = $('#practice-mix-audio');
  return practice.playing || (audio && !audio.paused && !audio.ended);
}
function ptPosition() {
  if (roomFollowing()) return roomPosition();
  const audio = $('#practice-mix-audio');
  if (practice.playing) return practicePosition();
  if (audio && !audio.paused) return audio.currentTime || 0;
  return practice.position || 0;
}
function ptPlay() {
  if (roomCmd('play')) return;
  const t = ptPosition();
  const engine = ptEngine();
  const audio = $('#practice-mix-audio');
  if (engine === 'multi') {
    audio?.pause();
    practice.offset = Math.min(t, practice.duration);
    practicePlay();
  } else if (engine === 'mix') {
    practicePause();
    audio.currentTime = Math.min(t, ptDuration());
    audio.play().catch(() => {});
  }
  ptRender();
  ptMediaUpdate(true);
  roomPulse();
}
function ptPause() {
  if (roomCmd('pause')) return;
  practice.position = ptPosition();
  practicePause();
  $('#practice-mix-audio')?.pause();
  ptRender();
  ptMediaUpdate(true);
  roomPulse();
}
function ptStop() {
  if (roomCmd('stop')) return;
  ptPause();
  ptSeek(0);
}
function ptSeek(t) {
  if (roomCmd('seek', Math.max(0, t))) return;
  const target = Math.max(0, Math.min(ptDuration() || t, t));
  const audio = $('#practice-mix-audio');
  practice.position = target;
  if (practice.playing) { practiceSeek(target); }
  else {
    practice.offset = target;
    if (audio) audio.currentTime = target;
  }
  practice.lyricIndex = -2;
  ptRender();
  ptMediaUpdate(true);
  roomPulse();
}
function ptMultiLoading() {
  return practiceMultiTracks().some((tr) => practice.loadState.get(tr.element) === 'loading');
}
function ptSetMode(mode) {
  // Multitrack not downloaded yet: this click downloads it (the button shows
  // progress); once ready, the next click switches to it.
  if (mode === 'multi' && !ptMultiReady()) {
    // Remember the choice: playback moves over to the multitrack once it's loaded.
    try { sessionStorage.setItem(PT_MODE_KEY, 'multi'); } catch { /* ignore */ }
    if (!ptMultiLoading() && practiceMultiTracks().length) practiceLoadTracks();
    ptRender();
    return;
  }
  if (mode === ptEngine()) return;
  const wasPlaying = ptIsPlaying();
  const t = ptPosition();
  practicePause();
  $('#practice-mix-audio')?.pause();
  try { sessionStorage.setItem(PT_MODE_KEY, mode); } catch { /* ignore */ }
  practice.position = t;
  practice.offset = t;
  // Only the labels change; the players themselves are left alone so the
  // playhead is kept.
  ptRefreshPicks();
  if (wasPlaying) ptPlay(); else ptSeek(t);
}
function roomPulse() { if (roomHosting()) roomSendState(true); }
function ptRefreshPicks() {
  const engine = ptEngine();
  document.querySelectorAll('#practice-view .pt-pick').forEach((btn) => {
    const mine = btn.dataset.ptMode === engine;
    btn.classList.toggle('on', mine);
    btn.textContent = btn.dataset.ptMode === 'mix'
      ? (mine ? '● Using the Mixdown' : 'Play the Mixdown')
      : (mine ? '● Using the Multitrack' : 'Play the Multitrack');
  });
  ptRender();
}
const ptMixer = { open: false }; // full-screen mixer drop-up (see ptMixerRender)
const ptIcons = {
  start: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 3h2v10H3zM13 3v10L6 8z" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5v11L13.5 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 3.5h9v9h-9z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 16 16" width="15" height="14"><path d="M2 3h2v10H2zM9 3v10L4.5 8zM15 3v10L10.5 8z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 16 16" width="15" height="14"><path d="M12 3h2v10h-2zM7 3v10l4.5-5zM1 3v10l4.5-5z" fill="currentColor"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M7 1h2v7.2l2.6-2.6L13 7l-5 5-5-5 1.4-1.4L7 8.2zM2 13h12v2H2z" fill="currentColor"/></svg>',
  mixer: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M3 1.5h1.6v13H3zM7.2 1.5h1.6v13H7.2zM11.4 1.5H13v13h-1.6z" fill="currentColor" opacity=".45"/><rect x="1.6" y="8.6" width="4.4" height="2.6" rx=".8" fill="currentColor"/><rect x="5.8" y="3.6" width="4.4" height="2.6" rx=".8" fill="currentColor"/><rect x="10" y="10.4" width="4.4" height="2.6" rx=".8" fill="currentColor"/></svg>',
  loop: '<svg viewBox="0 0 16 16" width="16" height="14"><path d="M4 5h7.5l-1.8-1.8L11 2l4 4-4 4-1.3-1.2L11.5 7H4a1.5 1.5 0 0 0-1.5 1.5V9H1v-.5A3 3 0 0 1 4 5zm8 6H4.5l1.8 1.8L5 14l-4-4 4-4 1.3 1.2L4.5 9H12a1.5 1.5 0 0 0 1.5-1.5V7H15v.5A3 3 0 0 1 12 11z" fill="currentColor"/></svg>'
};
function ptTime(seconds) {
  const s = Math.max(0, seconds || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
}
function ptRender() {
  const bar = $('#practice-transport');
  if (!bar) return;
  document.querySelectorAll('body > .pt-song-menu, body > .pt-work-popover').forEach((menu) => menu.remove());
  const song = state.songs.find((item) => item.id === practice.songId)
    || practice.songList?.find((item) => item.id === practice.songId);
  const engine = ptEngine();
  // Stays on screen while the next song loads (only hidden when nothing is chosen).
  if (!song) { bar.classList.add('hidden'); ptMeasure(); return; }
  bar.classList.remove('hidden');
  const idle = !engine;
  requestAnimationFrame(ptMeasure);
  const playing = ptIsPlaying();
  const dur = ptDuration() || (idle ? Number(song.duration_seconds) || 0 : 0);
  const multiAvailable = practiceMultiTracks().length > 0;
  const off = idle ? 'disabled' : '';
  const idleNote = idle ? (practice.loadingSong ? 'Loading…' : practice.error ? 'Not available' : practice.tracks.length ? 'Loading…' : 'No audio yet') : '';
  bar.classList.toggle('pt-idle', idle);
  const songList = practice.songList || state.songs;
  const songMenu = ptSongPickerOpen ? `<div class="pt-song-menu" role="menu" aria-label="Songs in the current list">${songList.map((item, i) => `<button type="button" role="menuitem" class="pt-song-option ${item.id === practice.songId ? 'current' : ''}" data-pt-song-id="${escapeHtml(item.id)}" ${item.id === practice.songId ? 'aria-current="true"' : ''}><span class="pt-song-option-num">${i + 1}</span><b>${escapeHtml(item.id)}</b><span class="pt-song-option-name">${escapeHtml(item.name)}</span></button>`).join('')}</div>` : '';
  bar.innerHTML = `
    <div class="pt-group pt-modes" role="radiogroup" aria-label="Play from">
      <button type="button" data-pt-mode="mix" class="${engine === 'mix' ? 'on' : ''}" ${$('#practice-mix-audio') ? '' : 'disabled'}>Mixdown</button>
      <button type="button" data-pt-mode="multi" class="pt-multi ${engine === 'multi' ? 'on' : ''}" ${multiAvailable ? '' : 'disabled'} title="${ptMultiReady() ? 'Play from the multitrack' : 'Download the multitrack tracks first'}">Multitrack${multiAvailable && !ptMultiReady() ? (ptMultiLoading() ? ` <span class="pt-spin" aria-label="Downloading"></span><small>${practiceMultiTracks().filter((t) => practice.buffers.has(t.element)).length}/${practiceMultiTracks().length}</small>` : ` <span class="pt-dl" aria-hidden="true">${ptIcons.download}</span>`) : ''}</button>
      <button type="button" data-pt-mixer class="pt-mixer-btn ${engine === 'multi' ? 'on' : ''} ${ptMixer.open ? 'open' : ''}" ${multiAvailable ? '' : 'disabled'} title="Multitrack mixer" aria-label="Multitrack mixer" aria-expanded="${ptMixer.open}">${ptIcons.mixer}</button>
    </div>
    <div class="pt-song-wrap">
      <button type="button" class="pt-song" data-pt-songs aria-haspopup="menu" aria-expanded="${ptSongPickerOpen}" title="Choose a song from the current list"><b>${song ? escapeHtml(song.id) : ''}</b> ${song ? escapeHtml(song.name) : ''}${ptQueueLabel()}</button>
      ${songMenu}
    </div>
    <span class="pt-break" aria-hidden="true"></span>
    <div class="pt-group pt-buttons">
      <button type="button" data-pt="prev" title="Previous song in the list">${ptIcons.prev}</button>
      <button type="button" data-pt="start" title="Back to start" ${off}>${ptIcons.start}</button>
      <button type="button" data-pt="play" class="pt-play ${playing ? 'on' : ''}" title="Play / pause (Space)" ${off}>${playing ? ptIcons.pause : ptIcons.play}</button>
      <button type="button" data-pt="stop" title="Stop" ${off}>${ptIcons.stop}</button>
      <button type="button" data-pt="next" title="Next song in the list">${ptIcons.next}</button>
    </div>
    <div class="pt-lcd" id="pt-pos">${idle ? idleNote : ptTime(ptPosition())}</div>
    <input type="range" id="pt-seek" class="pt-seek" min="0" max="${dur.toFixed(2)}" step="0.05" value="${ptPosition().toFixed(2)}" aria-label="Position" ${off}>
    <div class="pt-lcd pt-dim">${ptTime(dur)}</div>
    <div class="pt-info">${ptInfoHtml(song)}</div>`;
  bar.querySelectorAll('.pt-song-menu, .pt-work-popover').forEach((menu) => document.body.append(menu));
  if (ptMixer.open) requestAnimationFrame(ptMixerPlace);
  if (ptSongPickerOpen) requestAnimationFrame(ptPlaceSongPicker);
  if (ptWorkOpen) requestAnimationFrame(ptPlaceWorkPopover);
}
function ptPlacePopover(menu, anchor) {
  if (!menu || !anchor) return;
  const margin = 12;
  const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
  const viewportHeight = window.innerHeight;
  const width = Math.max(180, Math.min(360, viewportWidth - margin * 2));
  const maxHeight = Math.max(120, Math.min(440, viewportHeight - margin * 2, viewportHeight * .65));
  menu.style.position = 'fixed';
  menu.style.width = width + 'px';
  menu.style.maxWidth = width + 'px';
  menu.style.maxHeight = maxHeight + 'px';
  menu.style.left = '0px';
  menu.style.right = 'auto';
  menu.style.top = '0px';
  menu.style.bottom = 'auto';
  const anchorRect = anchor.getBoundingClientRect();
  const menuHeight = Math.min(menu.scrollHeight, maxHeight);
  const above = anchorRect.top - margin;
  const below = viewportHeight - anchorRect.bottom - margin;
  const placeAbove = above >= menuHeight + 10 || above >= below;
  const top = placeAbove ? Math.max(margin, anchorRect.top - menuHeight - 10) : Math.min(viewportHeight - menuHeight - margin, anchorRect.bottom + 10);
  const left = Math.max(margin, Math.min(anchorRect.right - width, viewportWidth - width - margin));
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}
function ptPlaceSongPicker() {
  const wrap = document.querySelector('#practice-transport .pt-song-wrap');
  const menu = document.querySelector('body > .pt-song-menu');
  const anchor = wrap?.querySelector('.pt-song');
  if (!menu || !ptSongPickerOpen) return;
  ptPlacePopover(menu, anchor);
}
function ptPlaceWorkPopover() {
  const anchor = document.querySelector('#practice-transport [data-pt-work]');
  const menu = document.querySelector('body > .pt-work-popover');
  if (!menu || !ptWorkOpen) return;
  ptPlacePopover(menu, anchor);
}
window.addEventListener('resize', () => {
  if (ptSongPickerOpen) ptPlaceSongPicker();
  if (ptWorkOpen) ptPlaceWorkPopover();
});
window.visualViewport?.addEventListener('resize', () => {
  if (ptSongPickerOpen) ptPlaceSongPicker();
  if (ptWorkOpen) ptPlaceWorkPopover();
});
function ptTick() {
  const bar = $('#practice-transport');
  if (!bar || bar.classList.contains('hidden')) return;
  if (bar.classList.contains('pt-idle')) { if (ptEngine()) ptRender(); return; }
  const pos = ptPosition();
  ptMediaUpdate();
  const lcd = $('#pt-pos');
  if (lcd) lcd.textContent = ptTime(pos);
  const live = ptLive(pos);
  const keyEl = $('#pt-key');
  if (keyEl && keyEl.textContent !== live.key) keyEl.textContent = live.key;
  const bpmEl = $('#pt-bpm');
  if (bpmEl && bpmEl.textContent !== live.bpm) bpmEl.textContent = live.bpm;
  const seek = $('#pt-seek');
  if (seek && !seek.matches(':active')) seek.value = pos.toFixed(2);
  const playBtn = bar.querySelector('[data-pt="play"]');
  const playing = ptIsPlaying();
  if (playBtn && playBtn.classList.contains('on') !== playing) ptRender();
}
// Live key and tempo at the playhead: key from the "[Key:] [X]" clips on the
// lyrics tracks, tempo from the set's tempo automation (saved with the lyrics).
function ptLive(pos) {
  const song = state.songs.find((item) => item.id === practice.songId);
  const ly = practice.lyrics || {};
  let key = Array.isArray(song?.keys) && song.keys.length ? song.keys[0] : '—';
  const segs = Array.isArray(song?.key_segments) ? song.key_segments : [];
  if (segs.length) {
    for (const seg of segs) { if (seg.t <= pos + 0.05) key = seg.key; else break; }
  } else {
    const keyTrack = (ly.tracks || []).find((t) => t.slug === 'chords') || (ly.tracks || [])[0];
    for (const line of keyTrack?.lines || []) {
      if (line.t > pos + 0.05) break;
      const m = String(line.text || '').match(/\[Key:\]\s*\[([^\]]+)\]/);
      if (m) key = m[1].trim();
    }
  }
  // Bar counter: bar.beat at the playhead, from the set's bar map (tempo
  // automation and time-signature changes are already in its timings).
  let bar = '—';
  const bars = Array.isArray(ly.bars) ? ly.bars : [];
  if (bars.length) {
    let lo = 0;
    let hi = bars.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid][0] <= pos + 1e-3) lo = mid; else hi = mid - 1; }
    const [t0, num, den] = bars[lo];
    const t1 = bars[lo + 1]?.[0] ?? Math.max(t0 + 0.01, ptDuration());
    const beat = Math.min(num, Math.floor(((pos - t0) / Math.max(0.01, t1 - t0)) * num) + 1);
    bar = `${lo + 1}.${Math.max(1, beat)}`;
    if (bars.some((b) => b[1] !== num || b[2] !== den) || num !== 4 || den !== 4) bar += ` · ${num}/${den}`;
  }
  let bpm = Number(song?.tempo_start) || null;
  const map = Array.isArray(ly.tempo) ? ly.tempo : [];
  if (map.length) {
    bpm = map[0][1];
    for (let i = 0; i < map.length; i++) {
      if (map[i][0] > pos) {
        const [t0, v0] = map[i - 1] || map[0];
        const [t1, v1] = map[i];
        bpm = t1 > t0 ? v0 + (v1 - v0) * (pos - t0) / (t1 - t0) : v1;
        break;
      }
      bpm = map[i][1];
    }
  }
  return { key, bar, bpm: bpm ? `${Math.round(bpm)} BPM` : '— BPM' };
}
function ptWorkOwnerGroups(items, song) {
  if (!items.length) return '<p class="dashboard-all-done">All required work is complete.</p>';
  const groups = new Map();
  for (const item of items) {
    const key = item.owner_member_id || 'unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => Number(b === state.member?.id) - Number(a === state.member?.id)).map(([ownerId, ownerItems]) => {
    const owner = ownerId === 'unassigned' ? null : state.members.find((member) => member.id === ownerId);
    const isMine = owner?.id === state.member?.id;
    return `<section class="dashboard-owner ${isMine ? 'mine' : ''}"><h4>${escapeHtml(owner?.name || 'Unassigned')}</h4><div class="dashboard-owner-tasks">${ownerItems.map((item) => `<div class="dashboard-task-row"><span>${escapeHtml(item.type.label)}</span><span class="pt-work-status" data-status="${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>`).join('')}</div></section>`;
  }).join('');
}
function ptWorkPopoverHtml(song) {
  const required = songWorkItems(song.id).filter((item) => !isWorkItemDone(item));
  const optional = songWorkItems(song.id, true).filter((item) => item.category === 'part' && !isWorkItemDone(item));
  const waitingForMix = song.backing_track_manual === 'Sent to Mix';
  return `<div class="pt-work-popover" role="dialog" aria-label="Remaining work for ${escapeHtml(song.id)}">
    <div class="dashboard-open-song pt-work-song-heading"><span class="song-id">${escapeHtml(song.id)}</span><strong class="song-title">${escapeHtml(song.name)}</strong><button type="button" data-pt-work-close aria-label="Close work remaining">×</button></div>
    <div class="dashboard-work">
      <div class="dashboard-work-heading"><h3>Required work</h3><span>${required.length} ${required.length === 1 ? 'task' : 'tasks'} remaining</span></div>
      ${ptWorkOwnerGroups(required, song)}
    </div>
    ${optional.length ? `<details class="dashboard-optional"><summary>Optional Parts <span>${optional.length} remaining</span></summary>${ptWorkOwnerGroups(optional, song)}</details>` : ''}
    ${!required.length && waitingForMix ? '<p class="pt-work-waiting">Required work is complete. Waiting on the mix.</p>' : ''}
  </div>`;
}
function ptInfoHtml(song) {
  if (!song) return '';
  const live = ptLive(ptPosition());
  const readinessStatus = songReadinessStatus(song.id);
  const ready = readinessStatus.ready;
  const bandLeft = remainingWork(song.id);
  const workLabel = readinessStatus.label || (bandLeft ? `Not ready · ${bandLeft} left` : 'Not ready');
  const workStatus = ready
    ? `<span class="pt-chip pt-ready is-ready" aria-label="Song is ready">${workLabel}</span>`
    : `<span class="pt-work-anchor"><button type="button" class="pt-chip pt-ready pt-work-toggle ${ptWorkOpen ? 'open' : ''}" data-status="${escapeHtml(workLabel)}" data-pt-work aria-haspopup="dialog" aria-expanded="${ptWorkOpen}">${workLabel}</button>${ptWorkOpen ? ptWorkPopoverHtml(song) : ''}</span>`;
  return `<span class="pt-chip pt-readonly" aria-label="Key, read only">Key <b id="pt-key">${escapeHtml(live.key)}</b></span>
    <span class="pt-chip pt-readonly" aria-label="Tempo, read only"><b id="pt-bpm">${escapeHtml(live.bpm)}</b></span>
    ${isGuest() ? '' : workStatus}`;
}
function ptQueueLabel() {
  const list = practice.songList || state.songs;
  const i = list.findIndex((song) => song.id === practice.songId);
  return i >= 0 ? ` <small class="pt-queue">${i + 1} / ${list.length}</small>` : '';
}
// ---------------------------------------------------------------------------
// Guitar tones over MIDI: the GUITAR TONE Midi notes from the set are sent
// from this page (Chrome/Edge Web MIDI) to the guitarist's Mac, at the same
// moments Ableton would send them. Jumping around re-sends the tone that
// should be active at the new spot.
const TONE_PREFS_KEY = 'tsp-tone-midi-v1';
const tone = { access: null, requesting: false, error: '', current: null, last: null, lastPos: null, lastHi: null, lastSong: null };
function tonePrefs() {
  try { return { enabled: false, output: '', channel: 1, ...JSON.parse(localStorage.getItem(TONE_PREFS_KEY) || '{}') }; } catch { return { enabled: false, output: '', channel: 1 }; }
}
function saveTonePrefs(patch) {
  try { localStorage.setItem(TONE_PREFS_KEY, JSON.stringify({ ...tonePrefs(), ...patch })); } catch { /* ignore */ }
}
// Only Aaron and Rowen see the guitar tone sender.
const TONE_MEMBERS = new Set(['aaron', 'rowen']);
function toneForMe() {
  return TONE_MEMBERS.has(String(state.member?.slug || '').toLowerCase());
}
function toneSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}
function toneOutputs() {
  return tone.access ? [...tone.access.outputs.values()].filter((o) => o.state !== 'disconnected') : [];
}
function toneOutput() {
  const name = tonePrefs().output;
  return toneOutputs().find((o) => o.name === name) || null;
}
// Only songs whose Guitar Tone MIDI task is complete send tones.
function toneSongReady(songId = practice.songId) {
  const status = state.tasks.find((task) => task.song_id === songId && task.task_key === 'guitar_tone_midi')?.status;
  return status === 'Completed' || status === 'Finished';
}
function toneEvents() {
  if (!toneSongReady()) return [];
  return Array.isArray(practice.lyrics?.tone) ? practice.lyrics.tone : [];
}
async function toneConnect() {
  if (tone.requesting || !toneSupported()) return;
  tone.requesting = true;
  tone.error = '';
  try {
    tone.access = await navigator.requestMIDIAccess();
    tone.access.onstatechange = () => renderTonePanel();
    saveTonePrefs({ enabled: true });
    if (!toneOutput()) {
      const iac = toneOutputs().find((o) => /IAC/i.test(o.name));
      if (iac) saveTonePrefs({ output: iac.name });
    }
  } catch (error) {
    tone.error = error?.name === 'SecurityError' || error?.name === 'NotAllowedError'
      ? 'MIDI access was blocked. Click the icon at the left of the address bar, allow MIDI devices, then press Enable MIDI again.'
      : (error?.message || String(error));
  }
  tone.requesting = false;
  renderTonePanel();
}
function toneSend(ev, why) {
  const out = toneOutput();
  if (!out || !ev) return;
  const ch = Math.min(16, Math.max(1, Number(tonePrefs().channel) || 1)) - 1;
  try {
    out.send([0x90 | ch, ev.n & 127, (ev.v || 100) & 127]);
    out.send([0x80 | ch, ev.n & 127, 0], performance.now() + Math.max(40, (ev.d || 0.1) * 1000));
    tone.current = ev;
    tone.last = { ...ev, why, song: practice.songId };
    tone.error = '';
  } catch (error) {
    tone.error = error?.message || String(error);
  }
  toneRenderStatus();
}
function toneActiveAt(pos) {
  let active = null;
  for (const ev of toneEvents()) { if (ev.t <= pos + 0.02) active = ev; else break; }
  return active;
}
function toneChase(pos) {
  const active = toneActiveAt(pos);
  if (active && active !== tone.current) toneSend(active, 'jump');
}
const TONE_LOOKAHEAD = 0.02;
function toneTick() {
  if (!tone.access || !practice.songId || !toneOutput()) { tone.lastPos = null; return; }
  if (tone.lastSong !== practice.songId) { tone.lastSong = practice.songId; tone.lastPos = null; tone.current = null; }
  const pos = ptPosition();
  const playing = ptIsPlaying();
  const hi = pos + TONE_LOOKAHEAD;
  let jumped = true;
  if (tone.lastPos === null) {
    toneChase(pos); // song just opened, or the port was just chosen
  } else if (playing && pos >= tone.lastPos - 0.05 && pos - tone.lastPos <= 1) {
    jumped = false; // normal playback: send the changes the playhead passes
    for (const ev of toneEvents()) {
      if (ev.t > tone.lastHi + 1e-4 && ev.t <= hi) toneSend(ev, 'play');
    }
  } else if (playing || Math.abs(pos - tone.lastPos) > 0.01) {
    toneChase(pos); // scrubbed or skipped: send the tone for the new spot now
  }
  tone.lastPos = pos;
  tone.lastHi = jumped ? hi : Math.max(hi, tone.lastHi);
}
setInterval(() => { try { toneTick(); } catch (error) { console.warn('tone', error); } }, 15);
function toneRenderStatus() {
  const box = $('#tone-status');
  if (!box) return;
  const ev = tone.last;
  box.textContent = tone.error ? tone.error
    : ev ? `Last sent: note ${ev.n} (bar ${ev.bar}, ${ptTime(ev.t)}${ev.song && ev.song !== practice.songId ? `, ${ev.song}` : ''})${ev.why === 'test' ? ' · test' : ''}`
    : 'Nothing sent yet.';
  box.classList.toggle('error', !!tone.error);
}
function renderTonePanel() {
  const box = $('#practice-tone');
  if (!box) return;
  const show = toneForMe();
  box.classList.toggle('hidden', !show);
  if (!show) return;
  const prefs = tonePrefs();
  if (prefs.enabled && !tone.access && !tone.requesting && toneSupported()) toneConnect();
  const events = toneEvents();
  const outputs = toneOutputs();
  const ready = !!(tone.access && toneOutput());
  const song = state.songs.find((item) => item.id === practice.songId);
  const count = !practice.songId ? '' : !toneSongReady() ? `${song ? escapeHtml(song.id) : 'This song'}’s guitar tone MIDI isn’t marked complete yet, so no tones are sent for it.`
    : !practice.lyrics ? 'Loading this song’s tones…'
    : events.length ? `${song ? escapeHtml(song.id) : 'This song'} has ${events.length} tone change${events.length === 1 ? '' : 's'}: ${events.map((ev) => `bar ${ev.bar}`).join(', ')}.`
    : `${song ? escapeHtml(song.id) : 'This song'} has no tone changes on the GUITAR TONE Midi track.`;
  let body;
  if (!toneSupported()) {
    body = '<p class="tone-warn">This browser can’t send MIDI. On your MacBook, open TSP Work in <b>Google Chrome</b> or <b>Microsoft Edge</b> (Safari doesn’t support MIDI).</p>';
  } else if (!tone.access) {
    body = `<div class="tone-row"><button type="button" class="button primary" data-tone-connect ${tone.requesting ? 'disabled' : ''}>${tone.requesting ? 'Waiting for permission…' : 'Enable MIDI'}</button><span class="muted">Chrome will ask to allow MIDI devices; click Allow.</span></div>`;
  } else {
    const options = outputs.map((o) => `<option value="${escapeHtml(o.name)}" ${o.name === prefs.output ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');
    body = `<div class="tone-row">
        <label>Send to <select data-tone-output><option value="">Choose a MIDI port…</option>${options}</select></label>
        <label>Channel <select data-tone-channel>${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}" ${Number(prefs.channel) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        <button type="button" class="button quiet" data-tone-test ${ready ? '' : 'disabled'} title="Send the tone for the current playhead position">Send current tone</button>
      </div>
      ${outputs.length ? '' : '<p class="tone-warn">No MIDI ports found. Do step 2 below (turn on the IAC Driver), then reload this page.</p>'}`;
  }
  box.innerHTML = `<header><h2>Guitar tones <small class="muted">MIDI</small></h2><span class="tone-state ${ready ? 'on' : ''}">${ready ? '● Sending to ' + escapeHtml(prefs.output) : 'Off'}</span></header>
    ${body}
    <p class="muted tone-count">${count}</p>
    <p class="muted tone-status" id="tone-status"></p>
    <details class="tone-guide" ${ready ? '' : 'open'}><summary>How to set it up on your MacBook</summary>
      <ol>
        <li><b>Use Chrome or Edge</b> on your MacBook and keep this Practice page open while you play along. Safari can’t send MIDI.</li>
        <li><b>Turn on the Mac’s built-in MIDI cable:</b> open <i>Audio MIDI Setup</i> (Applications › Utilities), choose <i>Window › Show MIDI Studio</i>, double-click <i>IAC Driver</i>, tick <i>Device is online</i> and click <i>Apply</i>. Reload this page afterwards.</li>
        <li><b>In Ableton Live:</b> open <i>Settings › Link, Tempo &amp; MIDI</i>. In the MIDI Ports list, turn <i>Track</i> on for the input <i>IAC Driver (Bus 1)</i>, and for the output that goes to your guitar processor.</li>
        <li><b>Make a MIDI track</b> in your Live set: <i>MIDI From</i> = IAC Driver (Bus 1), All Channels; <i>Monitor</i> = In; <i>MIDI To</i> = your guitar processor, on the channel it listens to for preset changes.</li>
        <li><b>Here:</b> click <i>Enable MIDI</i> and allow it, choose <i>IAC Driver Bus 1</i> under <i>Send to</i>, keep Channel 1 (or whatever your Ableton track expects), then press <i>Send current tone</i> to test.</li>
      </ol>
      <p class="muted">Tones change at the same moments as in Aaron’s set: the GUITAR TONE Midi notes (for example note 65 or 66) are sent at the start of each section that needs a new tone. If you skip back or ahead into the middle of a section, the tone for that spot is sent straight away, before you press play. If your processor is plugged into the Mac by USB, you can also pick it directly under <i>Send to</i> and skip Ableton.</p>
    </details>`;
  toneRenderStatus();
}
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-tone-connect]')) { toneConnect(); return; }
  if (event.target.closest('[data-tone-test]')) {
    const ev = toneActiveAt(ptPosition()) || toneEvents()[0];
    if (ev) toneSend(ev, 'test'); else { tone.error = 'This song has no tone changes to send.'; toneRenderStatus(); }
  }
});
document.addEventListener('change', (event) => {
  const out = event.target.closest('[data-tone-output]');
  if (out) { saveTonePrefs({ output: out.value }); tone.current = null; tone.lastPos = null; renderTonePanel(); return; }
  const ch = event.target.closest('[data-tone-channel]');
  if (ch) { saveTonePrefs({ channel: Number(ch.value) || 1 }); tone.current = null; }
});

(function ptLoop() {
  if (state.view === 'practice' && !document.hidden) ptTick();
  requestAnimationFrame(ptLoop);
})();
document.addEventListener('click', (event) => {
  const workToggle = event.target.closest('#practice-transport [data-pt-work]');
  if (workToggle) {
    ptWorkOpen = !ptWorkOpen;
    ptSongPickerOpen = false;
    ptRender();
    return;
  }
  const songToggle = event.target.closest('#practice-transport [data-pt-songs]');
  if (songToggle) {
    ptWorkOpen = false;
    ptSongPickerOpen = !ptSongPickerOpen;
    ptRender();
    if (ptSongPickerOpen) document.querySelector('body > .pt-song-menu [data-pt-song-id][aria-current="true"]')?.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest('body > .pt-work-popover [data-pt-work-close]')) {
    ptWorkOpen = false;
    ptRender();
    return;
  }
  if (ptWorkOpen && !event.target.closest('body > .pt-work-popover')) {
    ptWorkOpen = false;
    ptRender();
  }
  const songChoice = event.target.closest('body > .pt-song-menu [data-pt-song-id]');
  if (songChoice) {
    const songId = songChoice.dataset.ptSongId;
    ptSongPickerOpen = false;
    if (roomCmd('song', songId)) { ptRender(); return; } // the host changes song; this device follows
    if (songId !== practice.songId) {
      practice.autoplay = ptIsPlaying();
      ptPause();
      practiceOpenSong(songId);
    } else ptRender();
    return;
  }
  if (ptSongPickerOpen && !event.target.closest('body > .pt-song-menu')) {
    ptSongPickerOpen = false;
    ptRender();
  }
  const modeBtn = event.target.closest('[data-pt-mode]');
  if (modeBtn && event.target.closest('#practice-view')) { ptSetMode(modeBtn.dataset.ptMode); return; }
  const btn = event.target.closest('#practice-transport [data-pt]');
  if (!btn) return;
  const action = btn.dataset.pt;
  if (action === 'play') { ptIsPlaying() ? ptPause() : ptPlay(); }
  else if (action === 'stop') ptStop();
  else if (action === 'start') ptSeek(0);
  else if (action === 'prev' || action === 'next') {
    // Next/previous song in the chosen list (repertoire or setlist); keeps playing if it was.
    if (roomCmd(action)) return;
    practice.autoplay = ptIsPlaying();
    ptPause();
    practiceStepSong(action === 'next' ? 1 : -1);
  }
});
// Lyrics box height leaves room for the fixed transport (its height varies by screen).
function ptMeasure() {
  const bar = document.getElementById('practice-transport');
  if (!bar) return;
  const h = bar.classList.contains('hidden') ? 0 : bar.getBoundingClientRect().height;
  if (h || bar.classList.contains('hidden')) document.documentElement.style.setProperty('--pt-h', `${Math.round(h)}px`);
  lyricsFit();
}
if (window.ResizeObserver) {
  const ptBarEl = document.getElementById('practice-transport');
  if (ptBarEl) new ResizeObserver(ptMeasure).observe(ptBarEl);
}
window.addEventListener('resize', ptMeasure);
// Computer layout (lyrics column beside the players): the lyrics box always
// ends just above the transport, so it's fully visible wherever the page is
// scrolled; it grows as the page scrolls and the column sticks to the top.
function lyricsFit() {
  {
    const box = document.getElementById('practice-lyrics-scroll');
    const side = document.querySelector('.practice-side');
    if (!box || !side || state.view !== 'practice') return;
    if (lyricsFs.on) {
      const h = window.innerHeight;
      lyricsPad(box, h);
      if (Math.abs(box.offsetHeight - h) > 2) box.style.height = `${h}px`;
      return;
    }
    if (getComputedStyle(side).position !== 'sticky') { box.style.height = ''; lyricsPad(box, box.clientHeight); return; }
    const bar = document.getElementById('practice-transport');
    const ptH = bar && !bar.classList.contains('hidden') ? bar.getBoundingClientRect().height : 0;
    const card = box.closest('.practice-card');
    const below = card ? card.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom : 30;
    const h = Math.round(Math.max(260, Math.min(1000, window.innerHeight - ptH - 12 - below - box.getBoundingClientRect().top)));
    lyricsPad(box, h);
    if (Math.abs(box.offsetHeight - h) > 2) box.style.height = `${h}px`;
  }
}
// Space above the first line and below the last, sized to the box (so the
// current line can sit about a third of the way down) instead of the screen.
function lyricsPad(box, h) {
  const top = `${Math.round(h * 0.18)}px`;
  const bottom = `${Math.round(h * 0.62)}px`;
  if (box.style.paddingTop !== top) box.style.paddingTop = top;
  if (box.style.paddingBottom !== bottom) box.style.paddingBottom = bottom;
}
window.addEventListener('scroll', lyricsFit, { passive: true });
window.addEventListener('resize', lyricsFit);
document.addEventListener('input', (event) => {
  if (event.target.id === 'pt-seek' && !ptIsPlaying()) { practice.position = Number(event.target.value); const lcd = $('#pt-pos'); if (lcd) lcd.textContent = ptTime(practice.position); }
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'pt-seek') ptSeek(Number(event.target.value));
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (ptSongPickerOpen || ptWorkOpen)) {
    const focusSelector = ptWorkOpen ? '#practice-transport [data-pt-work]' : '#practice-transport [data-pt-songs]';
    ptSongPickerOpen = false;
    ptWorkOpen = false;
    ptRender();
    document.querySelector(focusSelector)?.focus({ preventScroll: true });
    return;
  }
  if (state.view !== 'practice' || event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest?.('input[type="text"], input[type="search"], textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  if (!event.repeat) { ptIsPlaying() ? ptPause() : ptPlay(); }
}, true);
document.addEventListener('keyup', (event) => {
  if (state.view === 'practice' && event.code === 'Space' && !event.target.closest?.('input[type="text"], textarea, select')) event.preventDefault();
}, true);


// ---------------------------------------------------------------------------
// Activity logs (for later statistics): how long each member has the app open
// (app_sessions), which page they're on (page_visits), and what they practise
// (practice_plays). Saved quietly; nothing is shown and failures are ignored.
const ACTIVITY_BEAT_MS = 30000;      // how often "still here" is saved
const ACTIVITY_NEW_SESSION_MS = 5 * 60 * 1000; // away longer than this = a new session
const PRACTICE_PAUSE_ENDS_MS = 5 * 60 * 1000;  // a play stays open across short pauses
const activity = { sessionId: null, visitId: null, view: null, starting: null, lastBeat: 0, play: null, tick: null };
const APP_VERSION = (document.querySelector('script[src*="app.js"]')?.src.match(/v=([^&]+)/) || [])[1] || '';

async function activityStart() {
  if (!state.member?.id || activity.starting || navigator.onLine === false) return;
  activity.starting = (async () => {
    try {
      const { data, error } = await db.from('app_sessions').insert({
        member_id: state.member.id,
        device: PHONE ? 'phone' : 'computer',
        standalone: !!(window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches),
        app_version: APP_VERSION
      }).select('id').single();
      if (error) throw error;
      activity.sessionId = data.id;
      activity.visitId = null;
      activity.lastBeat = Date.now();
      await activityView(state.view || 'songs', true);
    } catch (error) { console.warn('activity: session not saved', error?.message || error); }
    finally { activity.starting = null; }
  })();
  return activity.starting;
}
async function activityView(view, force) {
  if (!activity.sessionId || !state.member?.id) return;
  if (!force && view === activity.view && activity.visitId) return;
  const now = new Date().toISOString();
  const previous = activity.visitId;
  activity.view = view;
  activity.visitId = null;
  try {
    if (previous) db.from('page_visits').update({ ended_at: now }).eq('id', previous).then(() => {}, () => {});
    const { data, error } = await db.from('page_visits').insert({ session_id: activity.sessionId, member_id: state.member.id, view, started_at: now, ended_at: now }).select('id').single();
    if (error) throw error;
    if (activity.view === view) activity.visitId = data.id;
  } catch (error) { console.warn('activity: page visit not saved', error?.message || error); }
}
async function activityBeat() {
  if (!activity.sessionId) return;
  const now = new Date().toISOString();
  activity.lastBeat = Date.now();
  try {
    await Promise.all([
      db.from('app_sessions').update({ last_seen_at: now }).eq('id', activity.sessionId),
      activity.visitId ? db.from('page_visits').update({ ended_at: now }).eq('id', activity.visitId) : null,
      activityPlaySave()
    ]);
  } catch { /* ignore */ }
}
async function activityEnd() {
  await activityPlayEnd();
  await activityBeat();
  activity.sessionId = null;
  activity.visitId = null;
  activity.view = null;
}
setInterval(() => { if (!document.hidden && state.member) activityBeat(); }, ACTIVITY_BEAT_MS);
document.addEventListener('visibilitychange', () => {
  if (!state.member) return;
  if (document.hidden) { activityBeat(); return; }
  // Back after a long time away (phone locked, app in the background): a new session.
  if (!activity.sessionId || Date.now() - activity.lastBeat > ACTIVITY_NEW_SESSION_MS) { activity.sessionId = null; activityStart(); }
  else activityBeat();
});
window.addEventListener('pagehide', () => { if (state.member) activityBeat(); });
window.addEventListener('online', () => { if (state.member && !activity.sessionId) activityStart(); });

// Practice plays: one row per song a member plays, kept open across short
// pauses and seeks; it ends when they change song or mode, leave Practice,
// or stay paused for 5 minutes. seconds_played counts only real playing time.
function activityPlayTick() {
  const playing = state.view === 'practice' && ptIsPlaying();
  const now = Date.now();
  let p = activity.play;
  if (p && (p.songId !== practice.songId || (playing && p.mode !== ptEngine()) || (!playing && now - p.lastPlayingAt > PRACTICE_PAUSE_ENDS_MS) || state.view !== 'practice')) {
    activityPlayEnd();
    p = null;
  }
  if (!playing) { if (p) p.lastTick = now; return; }
  if (!p && state.member?.id && practice.songId) {
    p = activity.play = {
      id: null, songId: practice.songId, mode: ptEngine() || 'mix', startedAt: new Date().toISOString(),
      startPosition: ptPosition(), seconds: 0, lastTick: now, lastPlayingAt: now, reachedEnd: false, fullscreen: false, dirty: true,
      solo: ptEngine() === 'multi' ? Object.fromEntries(practiceMultiTracks().map((t) => { const st = practiceTrackSetting(t.element); return [t.element, st.solo ? 'solo' : st.on ? 'on' : 'off']; })) : null
    };
    activityPlayInsert(p);
  }
  p.seconds += Math.min(2, Math.max(0, (now - p.lastTick) / 1000));
  p.lastTick = now;
  p.lastPlayingAt = now;
  p.endPosition = ptPosition();
  p.songSeconds = ptDuration();
  if (p.songSeconds && p.endPosition >= p.songSeconds - 2) p.reachedEnd = true;
  if (typeof lyricsFs !== 'undefined' && lyricsFs.on) p.fullscreen = true;
  p.dirty = true;
  if (now - (p.savedAt || 0) > 15000) activityPlaySave();
}
async function activityPlayInsert(p) {
  try {
    const { data, error } = await db.from('practice_plays').insert({
      session_id: activity.sessionId, member_id: state.member.id, song_id: p.songId, mode: p.mode,
      started_at: p.startedAt, ended_at: p.startedAt, start_position: Math.round(p.startPosition * 10) / 10, solo: p.solo
    }).select('id').single();
    if (error) throw error;
    p.id = data.id;
    p.savedAt = Date.now();
  } catch (error) { console.warn('activity: practice play not saved', error?.message || error); }
}
async function activityPlaySave(p = activity.play) {
  if (!p?.id || !p.dirty) return;
  p.dirty = false;
  p.savedAt = Date.now();
  try {
    await db.from('practice_plays').update({
      ended_at: new Date(Math.min(Date.now(), p.lastPlayingAt + 1000)).toISOString(),
      seconds_played: Math.round(p.seconds * 10) / 10,
      end_position: p.endPosition == null ? null : Math.round(p.endPosition * 10) / 10,
      song_seconds: p.songSeconds ? Math.round(p.songSeconds * 10) / 10 : null,
      reached_end: p.reachedEnd, fullscreen: p.fullscreen
    }).eq('id', p.id);
  } catch { p.dirty = true; }
}
async function activityPlayEnd() {
  const p = activity.play;
  activity.play = null;
  if (!p) return;
  p.dirty = true;
  await activityPlaySave(p);
}
setInterval(activityPlayTick, 1000);

// --- Full-screen lyrics: compact multitrack mixer that opens up out of the
// transport's Multitrack button. Same settings as the Multitrack card.
function ptMixerEl() {
  let box = document.getElementById('pt-mixer');
  if (!box) {
    box = document.createElement('div');
    box.id = 'pt-mixer';
    box.className = 'pt-mixer hidden';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Multitrack mixer');
    document.body.append(box);
    box.addEventListener('click', (event) => {
      if (event.target.closest('[data-pm-close]')) { ptMixerClose(); return; }
      if (event.target.closest('[data-pm-use]')) { ptSetMode('multi'); ptMixerRender(); return; }
      practiceMixClick(event);
    });
    box.addEventListener('input', practiceMixInput);
    box.addEventListener('dblclick', (event) => {
      const fader = event.target.closest('[data-practice-vol]');
      if (fader) { savePracticeTrackSetting(fader.dataset.practiceVol, { vol: 1 }); practiceMixRefresh(); }
    });
  }
  return box;
}
function ptMixerRender() {
  const box = ptMixerEl();
  const tracks = practiceMultiTracks();
  if (!tracks.length) { ptMixerClose(); return; }
  const loaded = practiceMultiLoaded();
  const loading = tracks.some((t) => practice.loadState.get(t.element) === 'loading');
  const done = practiceEagerTracks().filter((t) => practice.buffers.has(t.element)).length;
  const totalMb = tracks.reduce((sum, t) => sum + (t.bytes || 0), 0) / 1048576;
  const anySolo = tracks.some((t) => practiceTrackSetting(t.element).solo);
  const lock = loaded ? '' : 'disabled';
  const usingMulti = ptEngine() === 'multi';
  const failed = tracks.filter((t) => practice.loadState.get(t.element) === 'error').length;
  const rows = tracks.map((t, i) => practiceTrackRowMarkup(t, i, { loaded, anySolo })).join('');
  box.innerHTML = `<header><b>Mixer</b>
      ${loaded ? `<button type="button" class="button quiet" data-practice-reset title="Reset all tracks: on, no solo, 0 dB (stems off)">Reset mix</button>` : ''}
      <button type="button" class="pm-btn pm-x" data-pm-close aria-label="Close mixer">✕</button></header>
    ${!loaded ? `<div class="pm-note">${loading ? `Downloading tracks… ${done}/${practiceEagerTracks().length}` : `<button type="button" class="button primary" data-practice-load>Load multitrack (${totalMb.toFixed(0)} MB)</button>${failed ? `<span>${failed} track${failed === 1 ? '' : 's'} failed to load. Select Load multitrack to retry.</span>` : ''}`}</div>`
      : usingMulti ? '' : `<div class="pm-note">Playing the Mixdown. <button type="button" class="button primary" data-pm-use>Use the Multitrack</button></div>`}
    <ul class="ab-tracks pt-mixer-tracks ${loaded ? '' : 'ab-locked'}">${rows}</ul>`;
  box.classList.remove('hidden');
  ptMixerPlace();
}
// Sits just above the Multitrack button, kept on screen.
function ptMixerPlace() {
  const box = document.getElementById('pt-mixer');
  const btn = document.querySelector('#practice-transport .pt-mixer-btn');
  const multi = document.querySelector('#practice-transport .pt-multi');
  if (!box || !ptMixer.open || !btn) return;
  const anchor = (multi || btn).getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const width = Math.min(380, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  box.style.width = `${width}px`;
  box.style.left = `${left}px`;
  box.style.bottom = `${Math.max(8, window.innerHeight - b.top + 10)}px`;
  const topBar = lyricsFs.on ? (document.querySelector('#practice-lyrics > header')?.getBoundingClientRect().bottom || 0) : 12;
  box.style.maxHeight = `${Math.max(160, Math.min(b.top - 20 - topBar, window.innerHeight * 0.7))}px`;
  box.style.setProperty('--pm-tail', `${Math.max(14, Math.min(width - 14, b.left + b.width / 2 - left))}px`);
}
function ptMixerOpen() {
  if (!practiceMultiTracks().length) return;
  ptMixer.open = true;
  ptMixerRender();
  document.querySelector('#practice-transport .pt-mixer-btn')?.classList.add('open');
  lyricsFsShowControls(5000);
}
function ptMixerClose() {
  if (!ptMixer.open) return;
  ptMixer.open = false;
  document.getElementById('pt-mixer')?.classList.add('hidden');
  const btn = document.querySelector('#practice-transport .pt-mixer-btn');
  if (btn) { btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
}
document.addEventListener('click', (event) => {
  if (event.target.closest('#practice-transport [data-pt-mixer]')) {
    ptMixer.open ? ptMixerClose() : ptMixerOpen();
    return;
  }
  if (ptMixerClickClosesIt(ptClickAt, { open: ptMixer.open, fullScreen: lyricsFs.on })) ptMixerClose();
});
window.addEventListener('resize', () => { if (ptMixer.open) ptMixerPlace(); });

// Height of the iPhone status bar / notch area (0 elsewhere).
function safeAreaTop() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;height:env(safe-area-inset-top);width:0;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  const h = probe.getBoundingClientRect().height || 0;
  probe.remove();
  return h;
}

// --- New version check: GitHub Pages caches index.html for ~10 minutes, so an
// open app can keep running an old version. Look for a newer one now and then
// and offer a one-tap update (never reloads by itself: practice might be playing).
async function checkForUpdate() {
  if (!APP_VERSION || navigator.onLine === false || document.getElementById('update-bar')) return;
  try {
    const html = await fetch(`index.html?check=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
    const latest = (html.match(/app\.js\?v=([^"'&]+)/) || [])[1];
    if (!latest || latest === APP_VERSION) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.innerHTML = '<span>A new version of TSP Work is ready.</span><button type="button" class="button primary">Update</button><button type="button" class="text-button" aria-label="Later">Later</button>';
    bar.querySelector('.primary').onclick = async () => {
      bar.querySelector('.primary').textContent = 'Updating…';
      // Refresh the browser's saved copies first so one reload is enough.
      try { await Promise.all(['index.html', './', `app.js?v=${latest}`, `styles.css?v=${latest}`].map((u) => fetch(u, { cache: 'reload' }))); } catch { /* ignore */ }
      location.reload();
    };
    bar.querySelector('.text-button').onclick = () => { bar.remove(); checkForUpdate.snoozedUntil = Date.now() + 30 * 60 * 1000; };
    document.body.append(bar);
  } catch { /* offline or blocked: try later */ }
}
function maybeCheckForUpdate() {
  if (Date.now() < (checkForUpdate.snoozedUntil || 0)) return;
  checkForUpdate();
}
setTimeout(maybeCheckForUpdate, 8000);
setInterval(maybeCheckForUpdate, 3 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeCheckForUpdate(); });


// --- iPhone lock screen / Dynamic Island / Control Centre (Media Session).
// The system scrubber, play/pause and skip buttons drive the app's transport,
// so they work for both the Mixdown and the Multitrack. The multitrack plays
// through Web Audio, which iOS doesn't show as "now playing" by itself, so a
// silent looping audio element runs alongside it while it plays.
const ptMedia = { key: '', lastPos: 0, silent: null, handlers: false, log: [] };
function ptSilentAudio() {
  if (ptMedia.silent) return ptMedia.silent;
  // 1 s of 8 kHz 8-bit silence as a WAV.
  const n = 8000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i += 1) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i += 1) v.setUint8(44 + i, 128);
  const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  a.loop = true;
  a.setAttribute('playsinline', '');
  ptMedia.silent = a;
  return a;
}
// Temporary: what the iPhone's controls send, saved for Aaron (admin) so problems can be checked.
function ptMediaLog(event) {
  ptMedia.log.push({ t: new Date().toISOString(), event, engine: ptEngine(), pos: Math.round(ptPosition() * 10) / 10 });
  ptMedia.log = ptMedia.log.slice(-30);
  ptMediaFlush();
}
function ptMediaFlush() {
  if (!ptMedia.debug || !state.member?.is_admin) return; // diagnostics off (set ptMedia.debug = true to log to app_meta.media_debug)
  clearTimeout(ptMedia.logTimer);
  ptMedia.logTimer = setTimeout(() => {
    db.from('app_meta').upsert({ key: 'media_debug', value: { ua: navigator.userAgent, standalone: !!(navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches), mediaSession: 'mediaSession' in navigator, log: ptMedia.log }, updated_at: new Date().toISOString() }, { onConflict: 'key' }).then(() => {}, () => {});
  }, 1500);
}
function ptMediaHandlers() {
  if (ptMedia.handlers || !('mediaSession' in navigator)) return;
  ptMedia.handlers = true;
  const set = (action, fn) => {
    try { navigator.mediaSession.setActionHandler(action, (d) => { ptMediaLog(`${action}${d?.seekTime != null ? ` ${Math.round(d.seekTime)}` : ''}`); fn(d || {}); }); ptMediaLog(`registered ${action}`); }
    catch (error) { ptMediaLog(`no ${action}: ${error?.message || error}`); }
  };
  set('play', () => ptPlay());
  set('pause', () => ptPause());
  set('stop', () => ptStop());
  set('seekto', (d) => { if (Number.isFinite(d.seekTime)) ptSeek(d.seekTime); });
  // iOS web pages always show ±10 s buttons here (not previous/next song), so
  // route them through the transport too (otherwise they only move the Mixdown).
  set('seekbackward', (d) => ptSeek(ptPosition() - (d.seekOffset || 10)));
  set('seekforward', (d) => ptSeek(ptPosition() + (d.seekOffset || 10)));
  set('previoustrack', () => { practice.autoplay = ptIsPlaying(); ptPause(); practiceStepSong(-1); });
  set('nexttrack', () => { practice.autoplay = ptIsPlaying(); ptPause(); practiceStepSong(1); });
}
function ptMediaUpdate(force) {
  if (!('mediaSession' in navigator)) return;
  ptMediaHandlers();
  const song = state.songs.find((item) => item.id === practice.songId);
  if (!song || state.view !== 'practice' && !ptIsPlaying()) return;
  const engine = ptEngine();
  const playing = ptIsPlaying();
  // Multitrack: keep iOS's now-playing session alive with the silent element.
  if (engine === 'multi' && playing) { const a = ptSilentAudio(); if (a.paused) a.play().catch(() => {}); }
  else if (ptMedia.silent && !ptMedia.silent.paused) ptMedia.silent.pause();
  const key = `${song.id}|${engine}`;
  if (key !== ptMedia.key) {
    ptMedia.key = key;
    try {
      const art = new URL('apple-touch-icon.png', location.href).href;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.name,
        artist: `${song.id} · The String Project`,
        album: engine === 'multi' ? 'Practice · Multitrack' : 'Practice · Mixdown',
        artwork: [{ src: art, sizes: '180x180', type: 'image/png' }]
      });
    } catch { /* ignore */ }
  }
  try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch { /* ignore */ }
  const now = Date.now();
  if (!force && now - ptMedia.lastPos < 1000) return;
  ptMedia.lastPos = now;
  const dur = ptDuration();
  if (dur > 0 && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: dur, playbackRate: 1, position: Math.max(0, Math.min(dur, ptPosition())) }); } catch { /* ignore */ }
  }
}
// Keep the lock screen in step while the screen is off (no animation frames then).
setInterval(() => { if (ptIsPlaying()) ptMediaUpdate(); }, 2000);
// Register the controls straight away (iOS can ignore handlers added after playback starts).
ptMediaHandlers();


// ---------------------------------------------------------------------------
// Group practice. One device (the host) plays; the others follow its lyrics and
// drive its playback bar. The host broadcasts a clock anchor — where it was at
// a given moment by its own clock — and each follower works out the difference
// between the two clocks from round trips, then runs that anchor forward with
// its own clock, so the lyrics never wait for the next message. Followers send
// commands; only the host ever touches audio.
const ROOM_KEY = 'tsp-room-v1';
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to read out loud
const ROOM_SAMPLE_LIFE_MS = 120000;
const roomDeviceId = Math.random().toString(36).slice(2, 10);
const room = {
  code: null, role: null, channel: null, members: [], state: null, anchor: null,
  offset: 0, rtt: null, synced: false, samples: [], pings: new Map(),
  stateTimer: null, pingTimer: null, songRequest: null, busy: false, mode: '', error: ''
};
function roomHosting() { return room.role === 'host' && !!room.channel; }
function roomFollowing() { return room.role === 'follower' && !!room.channel && !!room.state; }
function roomNewCode() {
  return Array.from({ length: 4 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');
}
// Where the host is now, by this device's reckoning of the host's clock.
function roomPosition() {
  const s = room.state;
  if (!s) return 0;
  if (!s.playing) return s.position || 0;
  return Math.max(0, (s.position || 0) + (Date.now() + room.offset - s.at) / 1000);
}
// How far off the shared clock could be: half the shortest round trip.
function roomAccuracy() { return room.synced && room.rtt != null ? Math.max(1, Math.round(room.rtt / 2)) : null; }
function roomHostName() {
  return room.members.find((m) => m.role === 'host')?.name || room.state?.host || 'the other device';
}

// The host's own clock: an anchor that only moves when playback really drifts
// from it, so followers get a smooth line instead of the coarse steps some
// browsers report for an <audio> element's position.
function roomHostAnchor() {
  const playing = ptIsPlaying();
  const pos = ptPosition();
  const now = Date.now();
  const a = room.anchor;
  if (playing && a && a.playing && a.songId === practice.songId) {
    const predicted = a.pos + (now - a.at) / 1000;
    if (Math.abs(predicted - pos) < 0.25) return a;
  }
  room.anchor = { at: now, pos, playing, songId: practice.songId };
  return room.anchor;
}
function roomSendState() {
  if (!roomHosting()) return;
  const a = roomHostAnchor();
  room.channel.send({ type: 'broadcast', event: 'state', payload: {
    songId: practice.songId, position: a.pos, at: a.at, playing: a.playing,
    duration: ptDuration() || 0, host: state.member?.name || ''
  } });
}
function roomApplyState(payload) {
  if (!payload || room.role !== 'follower') return;
  const first = !room.state;
  room.state = payload;
  if (payload.songId && payload.songId !== practice.songId && room.songRequest !== payload.songId) {
    room.songRequest = payload.songId;
    practice.autoplay = false;
    Promise.resolve(practiceOpenSong(payload.songId)).finally(() => { room.songRequest = null; });
  }
  if (first) { renderRoomUi(); ptRender(); }
}
// Called by the transport on a follower: true means "sent to the host instead".
function roomCmd(action, value) {
  if (room.role !== 'follower' || !room.channel) return false;
  room.channel.send({ type: 'broadcast', event: 'cmd', payload: { action, value, from: roomDeviceId, name: state.member?.name || '' } });
  return true;
}
function roomHandleCmd(payload) {
  if (!roomHosting() || !payload) return;
  switch (payload.action) {
    case 'hello': break; // just asking for the current state
    case 'play': if (!ptIsPlaying()) ptPlay(); break;
    case 'pause': if (ptIsPlaying()) ptPause(); break;
    case 'stop': ptStop(); break;
    case 'seek': ptSeek(Number(payload.value) || 0); break;
    case 'prev': case 'next': {
      practice.autoplay = ptIsPlaying();
      ptPause();
      practiceStepSong(payload.action === 'next' ? 1 : -1);
      break;
    }
    case 'song': {
      const songId = String(payload.value || '');
      if (songId && songId !== practice.songId) {
        practice.autoplay = ptIsPlaying();
        ptPause();
        practiceOpenSong(songId);
      }
      break;
    }
    default: return;
  }
  roomSendState();
}

// Clock: several round trips, and the one that came back quickest is kept —
// it is the least likely to have been held up in one direction only.
function roomPingBurst(times = 3) {
  if (room.role !== 'follower' || !room.channel) return;
  let sent = 0;
  const send = () => {
    if (room.role !== 'follower' || !room.channel) return;
    const id = Math.random().toString(36).slice(2, 10);
    room.pings.set(id, Date.now());
    if (room.pings.size > 24) room.pings.delete(room.pings.keys().next().value);
    room.channel.send({ type: 'broadcast', event: 'ping', payload: { id, from: roomDeviceId } });
    sent += 1;
    if (sent < times) setTimeout(send, 250);
  };
  send();
}
function roomOnPong(payload) {
  const t0 = room.pings.get(payload.id);
  if (!t0) return;
  room.pings.delete(payload.id);
  const now = Date.now();
  const rtt = now - t0;
  const offset = payload.t1 - (t0 + rtt / 2);
  room.samples = [...room.samples.filter((x) => now - x.at < ROOM_SAMPLE_LIFE_MS), { rtt, offset, at: now }].slice(-10);
  const best = room.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  room.rtt = best.rtt;
  if (!room.synced) { room.offset = best.offset; room.synced = true; }
  else room.offset += (best.offset - room.offset) * 0.35; // ease, so lyrics never jump
  renderRoomUi();
}

async function roomOpen(code, role) {
  if (room.channel) await roomLeave('', true);
  Object.assign(room, { code, role, state: null, anchor: null, members: [], samples: [], pings: new Map(), offset: 0, rtt: null, synced: false, error: '' });
  const channel = db.channel('tsp-room-' + code, { config: { broadcast: { self: false }, presence: { key: roomDeviceId } } });
  room.channel = channel;
  channel
    .on('broadcast', { event: 'state' }, ({ payload }) => roomApplyState(payload))
    .on('broadcast', { event: 'cmd' }, ({ payload }) => roomHandleCmd(payload))
    .on('broadcast', { event: 'ping' }, ({ payload }) => {
      if (roomHosting()) channel.send({ type: 'broadcast', event: 'pong', payload: { id: payload.id, to: payload.from, t1: Date.now() } });
    })
    .on('broadcast', { event: 'pong' }, ({ payload }) => { if (payload?.to === roomDeviceId) roomOnPong(payload); })
    .on('broadcast', { event: 'bye' }, ({ payload }) => {
      if (payload?.role === 'host' && room.role === 'follower') roomLeave(`${payload.name || 'The other device'} closed the room.`);
    })
    .on('presence', { event: 'sync' }, () => {
      room.members = Object.values(channel.presenceState()).flat();
      if (room.role === 'follower' && room.members.length && !room.members.some((m) => m.role === 'host')) {
        roomLeave('The room ended: the device that was playing left.');
        return;
      }
      renderRoomUi();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        room.error = '';
        channel.track({ id: roomDeviceId, role, name: state.member?.name || '', member_id: state.member?.id || null });
        if (role === 'host') roomSendState();
        else { roomPingBurst(5); roomCmd('hello'); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        room.error = 'Lost the connection to the room; trying again…';
      }
      renderRoomUi();
    });
  try { sessionStorage.setItem(ROOM_KEY, JSON.stringify({ code, role })); } catch { /* private mode */ }
  clearInterval(room.stateTimer); clearInterval(room.pingTimer);
  if (role === 'host') room.stateTimer = setInterval(roomSendState, 1000);
  else room.pingTimer = setInterval(() => roomPingBurst(3), 20000);
  renderRoomUi();
  ptRender();
}
async function roomLeave(message, quiet) {
  clearInterval(room.stateTimer); clearInterval(room.pingTimer);
  room.stateTimer = null; room.pingTimer = null;
  const channel = room.channel;
  const role = room.role;
  Object.assign(room, { code: null, role: null, channel: null, members: [], state: null, anchor: null, samples: [], pings: new Map(), synced: false, rtt: null, offset: 0, songRequest: null });
  if (channel) {
    try { channel.send({ type: 'broadcast', event: 'bye', payload: { role, name: state.member?.name || '' } }); } catch { /* going anyway */ }
    try { await db.removeChannel(channel); } catch { /* going anyway */ }
  }
  try { sessionStorage.removeItem(ROOM_KEY); } catch { /* private mode */ }
  if (!quiet) {
    renderRoomUi();
    ptRender();
    if (state.view === 'practice') practiceKeepPlace(renderPracticeLyrics);
    if (message) showNotice(message);
  }
}

// ---- the group button, the chip beside it and the dialog --------------------
function roomDialogEl() {
  let d = document.getElementById('room-dialog');
  if (d) return d;
  document.body.insertAdjacentHTML('beforeend', '<dialog id="room-dialog" class="room-dialog"><div data-room-body></div></dialog>');
  d = document.getElementById('room-dialog');
  d.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-room-action]')?.dataset.roomAction;
    if (!act) { if (event.target === d) d.close(); return; }
    if (act === 'close') { d.close(); return; }
    if (act === 'make') { room.busy = true; renderRoomDialog(); await roomOpen(roomNewCode(), 'host'); room.busy = false; renderRoomDialog(); return; }
    if (act === 'join-form') { room.mode = 'join'; renderRoomDialog(); d.querySelector('#room-code-input')?.focus(); return; }
    if (act === 'back') { room.mode = ''; room.error = ''; renderRoomDialog(); return; }
    if (act === 'leave') { await roomLeave(''); room.mode = ''; renderRoomDialog(); return; }
  });
  d.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = (d.querySelector('#room-code-input')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length !== 4) { room.error = 'Enter the four-character code.'; renderRoomDialog(); return; }
    room.busy = true; renderRoomDialog();
    await roomOpen(code, 'follower');
    room.busy = false; room.mode = '';
    renderRoomDialog();
  });
  d.addEventListener('close', () => { room.mode = ''; room.error = ''; });
  return d;
}
function renderRoomDialog() {
  const d = document.getElementById('room-dialog');
  if (!d || !d.open) return;
  const body = d.querySelector('[data-room-body]');
  const others = room.members.filter((m) => m.id !== roomDeviceId);
  const devices = room.members.length || 1;
  const head = (title) => `<header class="room-head"><h2>${escapeHtml(title)}</h2><button type="button" class="pm-btn pm-x" data-room-action="close" aria-label="Close">✕</button></header>`;
  const error = room.error ? `<p class="error">${escapeHtml(room.error)}</p>` : '';
  if (roomHosting()) {
    body.innerHTML = `${head('Group practice')}
      <p class="muted">Read this code out to the others. They open Group practice and choose <b>Join a room</b>.</p>
      <p class="room-code">${escapeHtml(room.code)}</p>
      <p class="muted">This device plays the audio. ${devices > 1 ? `${devices} devices connected${others.length ? `: ${escapeHtml(others.map((m) => m.name || 'someone').join(', '))}` : ''}.` : 'Waiting for someone to join…'}</p>
      <p class="muted">On an iPhone or iPad, press play here once yourself — Safari only lets the others start the sound after that.</p>
      ${error}<div class="room-actions"><button type="button" class="button" data-room-action="leave">Close the room</button></div>`;
    return;
  }
  if (room.role === 'follower') {
    const acc = roomAccuracy();
    body.innerHTML = `${head('Group practice')}
      <p class="muted">Following <b>${escapeHtml(roomHostName())}</b> in room <b>${escapeHtml(room.code)}</b>. The lyrics follow their playback, and the buttons at the bottom drive it.</p>
      <p class="muted">${acc ? `Clocks agree to about ±${acc} ms (round trip ${Math.round(room.rtt)} ms).` : 'Measuring the connection…'}</p>
      ${error}<div class="room-actions"><button type="button" class="button" data-room-action="leave">Leave the room</button></div>`;
    return;
  }
  if (room.mode === 'join') {
    body.innerHTML = `${head('Join a room')}
      <form><p class="muted">Type the four characters from the device that is playing.</p>
      <input id="room-code-input" class="room-input" type="text" inputmode="latin" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="4" placeholder="ABCD" aria-label="Room code">
      ${error}<div class="room-actions"><button type="submit" class="button primary" ${room.busy ? 'disabled' : ''}>${room.busy ? 'Joining…' : 'Join'}</button><button type="button" class="button quiet" data-room-action="back">Back</button></div></form>`;
    return;
  }
  body.innerHTML = `${head('Group practice')}
    <p class="muted">Practise together on one device's audio: it plays, and everyone else sees the lyrics in time with it and can work its playback.</p>
    ${error}<div class="room-actions">
      ${isGuest() ? '' : `<button type="button" class="button primary" data-room-action="make" ${room.busy ? 'disabled' : ''}>${room.busy ? 'Making…' : 'Make a room'}</button>`}
      <button type="button" class="button" data-room-action="join-form">Join a room</button>
    </div>`;
}
function roomOpenDialog() {
  const d = roomDialogEl();
  if (!d.open) d.showModal();
  renderRoomDialog();
}
function renderRoomUi() {
  const chip = document.getElementById('room-chip');
  const btn = document.getElementById('room-button');
  document.body.classList.toggle('room-following', roomFollowing());
  document.body.classList.toggle('room-hosting', roomHosting());
  if (btn) btn.classList.toggle('on', !!room.channel);
  if (chip) {
    if (roomHosting()) {
      const devices = room.members.length || 1;
      chip.textContent = `Room ${room.code} · ${devices} device${devices === 1 ? '' : 's'}`;
    } else if (room.role === 'follower') {
      const acc = roomAccuracy();
      chip.textContent = room.state
        ? `Following ${roomHostName()}${acc ? ` · synced ±${acc} ms` : ' · measuring…'}`
        : `Room ${room.code} · waiting for the other device…`;
    } else chip.textContent = '';
    chip.classList.toggle('hidden', !room.channel);
  }
  renderRoomDialog();
}
document.addEventListener('click', (event) => {
  if (event.target.closest('#room-button, #room-chip')) roomOpenDialog();
});
// Back after a reload: rejoin the room this device was in.
(function roomRestore() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(ROOM_KEY) || 'null'); } catch { /* ignore */ }
  if (!saved?.code || !saved?.role) return;
  const start = () => { if (state.member) roomOpen(saved.code, saved.role); else setTimeout(start, 500); };
  setTimeout(start, 1200);
})();
window.addEventListener('pagehide', () => { if (room.channel) { try { room.channel.send({ type: 'broadcast', event: 'bye', payload: { role: room.role, name: state.member?.name || '' } }); } catch { /* leaving */ } } });
