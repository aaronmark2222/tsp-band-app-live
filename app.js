import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0';

const SUPABASE_URL = 'https://hzvfrvjuqvmkeqbrgmqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bXd0ymwEnYNqQCq1EwH2AA_0HajJecU';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (selector) => document.querySelector(selector);
// Task accents use the Ableton colors shown in the user's Live 12 screenshots.
const ABLETON_TASK_COLORS = {
  sections: { index: '', color: '#3C3C3C' },
  lyrics: { index: '', color: '#EB4CCE' },
  chords: { index: '', color: '#F7F48D' },
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
  Recorded: '#F6CAAE', Draft: '#FBE6A8', Review: '#FBE6A8', No: '#D0D0D0'
};
const BACKING_TRACK_COLORS = { 'Not Finished': '#F27A73', Finished: '#F6CAAE', 'Sent to Mix': '#7FA8D8', Mixed: '#A5D17D' };
const state = { member: null, members: [], songs: [], tasks: [], taskTypes: [], languages: [], languageOptions: [], setlists: [], gigs: [], activeSetlist: null, activeSetlistItems: [], originalSetlistItems: [], setlistOrderDirty: false, view: 'songs', expandedSongIds: new Set(), setlistEditMode: false, dashboardScope: 'gig', dashboardMemberId: null, accessMembers: [], newSetlistSongIds: [] };
let draggedItemId = null;
let savingSetlistOrder = false;
let dashboardRenderRequest = 0;

function showNotice(message, isError = false) {
  const box = $('#notice');
  box.textContent = message;
  box.classList.toggle('error-notice', isError);
  box.classList.remove('hidden');
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => box.classList.add('hidden'), 4200);
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

function showWorkspace() {
  $('#loading').classList.add('hidden');
  $('#login-screen').classList.add('hidden');
  $('#first-login-screen').classList.add('hidden');
  $('#password-recovery-screen').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  $('#member-access-open').classList.toggle('hidden', !state.member.is_admin);
  $('#new-song-open').classList.toggle('hidden', !state.member.is_admin);
  $('#member-name').textContent = state.member.name;
  $('#member-badge').textContent = state.member.name.slice(0, 1).toUpperCase();
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

async function loadMember(user) {
  const { data, error } = await db.from('members').select('id,name,slug,is_admin,must_change_password').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This account is not linked to a band member. Ask Aaron to check the account setup.');
  state.member = data;
  state.dashboardMemberId = data.id;
}

async function loadData() {
  const [songs, tasks, taskTypes, languages, languageOptions, setlists, gigs, members] = await Promise.all([
    db.from('songs').select('id,name,type,is_medley,keys,tempo_start,tempo_end,tempo_change,tempo_segments,duration_seconds,backing_track_manual,sort_order').order('sort_order'),
    db.from('song_tasks').select('song_id,task_key,status,updated_at'),
    db.from('task_types').select('key,label,category,owner_member_id,allowed_statuses,done_statuses,sort_order').order('sort_order'),
    db.from('song_languages').select('song_id,language_code,position,languages(code,short_label)').order('position'),
    db.from('languages').select('code,name,short_label').order('sort_order'),
    db.from('setlists').select('id,name,description,created_at').order('created_at'),
    db.from('gigs').select('id,name,event_date,start_time,location,setlist_id,notes').order('event_date'),
    db.from('members').select('id,name,is_admin,sort_order').order('sort_order')
  ]);
  for (const result of [songs, tasks, taskTypes, languages, setlists, gigs, members, languageOptions]) if (result.error) throw result.error;
  Object.assign(state, { songs: songs.data, tasks: tasks.data, taskTypes: taskTypes.data, languages: languages.data, languageOptions: languageOptions.data, setlists: setlists.data, gigs: gigs.data, members: members.data });
  $('#song-count').textContent = state.songs.length;
  $('#song-total').textContent = `· ${state.songs.length} tracks`;
  renderSongs();
  renderLanguageFilter();
  renderSetlistOptions();
  renderGigs();
}

function taskEditable(type, current) {
  const adminMember = state.members.find((member) => member.is_admin);
  const ownerMemberId = current === 'Recorded' && adminMember ? adminMember.id : type.owner_member_id;
  return state.member.is_admin || ownerMemberId === state.member.id;
}

function statusControl(songId, type, current) {
  const options = type.allowed_statuses.map((status) => {
    const label = ['sections', 'lyrics', 'chords', 'guitar_tone_midi', 'prompts'].includes(type.key) && status === 'Completed' ? 'Complete' : status;
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
    `<option value="" ${manual ? '' : 'selected'} style="color:#D0D0D0;background-color:#19231c">${escapeHtml(derived)}</option>`,
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
  option.textContent = showAuto ? 'Auto' : derived;
  option.style.color = showAuto ? '#D0D0D0' : (BACKING_TRACK_COLORS[derived] || '#D0D0D0');
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
  const sentToMixOnly = !ready && readiness?.backing_track === 'Sent to Mix' && hasAbleSetWork && allRequiredWorkDone;
  if (ready) return '<span class="song-status-indicator" data-status="Ready">Ready</span>';
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
    button.classList.remove('song-title-abbreviated');
    if (state.expandedSongIds.has(button.dataset.songId)) return;
    const overflows = fullTitle.scrollWidth > fullTitle.clientWidth + 1;
    button.classList.toggle('song-title-abbreviated', overflows);
  });
}

window.addEventListener('resize', () => requestAnimationFrame(updateSongTitleAbbreviations));
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
      const adminMember = state.members.find((member) => member.is_admin);
      return { type, status, owner_member_id: status === 'Recorded' && adminMember ? adminMember.id : type.owner_member_id, category: type.category };
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

function renderSongDetails(songId) {
  const song = state.songs.find((item) => item.id === songId);
  const languages = state.languages.filter((row) => row.song_id === songId).map((row) => `<span class="language-chip" style="--language-color:${languageColor(row.language_code)}">${escapeHtml(row.languages?.short_label || row.language_code)}</span>`).join('');
  const songTasks = new Map(state.tasks.filter((task) => task.song_id === songId).map((task) => [task.task_key, task]));
  const readiness = (state.readiness || []).find((row) => row.song_id === songId);
  const groups = [
    ['ableset', 'AbleSet'],
    ['utility', 'Utility'],
    ['backing', 'Backing tracks & vocals'],
    ['part', 'Band parts · Optional']
  ];
  return `<div class="song-detail-metadata"><span>${songTypeLabel(song)}</span><span class="language-chips">${languages || '<span>No language set</span>'}</span><span>${secondsLabel(song?.duration_seconds)}</span><span>${escapeHtml(songTempoLabel(song))}</span></div><div class="song-details-overview"><span>Backing Track</span>${backingTrackControl(song, readiness)}</div><div class="task-groups">${groups.map(([category, label]) => {
    const types = state.taskTypes.filter((type) => type.category === category);
    if (!types.length) return '';
    return `<section class="task-group"><h3>${label}</h3><div class="task-grid">${types.map((type) => {
      const row = songTasks.get(type.key);
      const status = row?.status || 'Incomplete';
      const adminMember = state.members.find((member) => member.is_admin);
      const ownerMemberId = status === 'Recorded' && adminMember ? adminMember.id : type.owner_member_id;
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

function renderSongs() {
  const head = $('#songs-head');
  const body = $('#songs-body');
  head.innerHTML = '<tr><th>SONG</th><th>STATUS</th></tr>';
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
    const original = a.sort_order - b.sort_order;
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
    return `<tr class="song-overview"><td><button type="button" class="song-summary-toggle ${expanded ? 'song-expanded' : ''}" data-song-id="${escapeHtml(song.id)}" data-view="songs" aria-expanded="${expanded}" aria-controls="${detailId}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeHtml(song.id)} ${escapeHtml(song.name)}"><span class="song-disclosure" aria-hidden="true"></span><span class="song-id">${escapeHtml(song.id)}</span>${songTitleMarkup(song.name, 'song-name')}</button></td><td><span class="song-progress">${songProgress(song.id, song.name)}</span></td></tr><tr id="${detailId}" class="song-detail-row ${expanded ? '' : 'hidden'}"><td colspan="2">${renderSongDetails(song.id)}</td></tr>`;
  }).join('');
  if (!sorted.length) body.innerHTML = '<tr><td colspan="2" class="empty-state">No songs match these filters.</td></tr>';
  requestAnimationFrame(updateSongTitleAbbreviations);
}

function renderLanguageFilter() {
  const options = [...new Map(state.languages.map((row) => [row.language_code, row.languages])).entries()]
    .filter(([, language]) => language).map(([code, language]) => `<option value="${escapeHtml(code)}" style="color:${languageColor(code)};background-color:#111a15">${escapeHtml(language.short_label)}</option>`).join('');
  $('#language-filter').innerHTML = `<option value="">All languages</option>${options}`;
  $('#setlist-language-filter').innerHTML = `<option value="">All languages</option>${options}`;
  const keys = KEY_CHOICES;
  $('#key-filter').innerHTML = `<option value="">Any key / scale</option>${keys.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('')}`;
  $('#setlist-key-filter').innerHTML = `<option value="">Any key / scale</option>${keys.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('')}`;
}

async function loadReadiness() {
  const { data, error } = await db.from('song_readiness').select('song_id,backing_track,ready');
  if (error) throw error;
  state.readiness = data;
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
        : `<button type="button" class="song-summary-toggle setlist-song-toggle ${expanded ? 'song-expanded' : ''}" data-song-id="${escapeHtml(item.song_id)}" data-view="setlists" aria-expanded="${expanded}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeHtml(item.song_id)} ${escapeHtml(title)}"><span class="song-disclosure" aria-hidden="true"></span><span class="song-id">${escapeHtml(item.song_id)}</span>${songTitleMarkup(title, 'item-title song-title')}${songProgress(item.song_id, title)}</button>`
      : `<div><div class="item-title">${escapeHtml(title)}</div><div class="item-detail">${escapeHtml(detail)}</div></div>`;
    const controls = canEditSetlist ? `<div class="item-controls">${canDrag ? `<button class="drag-handle" type="button" data-id="${item.id}" aria-label="Drag ${escapeHtml(title)} to reorder" title="Drag to reorder">⠿</button>` : ''}<button class="icon-button remove-item" data-id="${item.id}" title="Remove item" aria-label="Remove ${escapeHtml(title)}" ${state.setlistOrderDirty ? "disabled" : ""}>×</button></div>` : '';
    const details = isSong && expanded ? `<div class="setlist-song-details">${renderSongDetails(item.song_id)}</div>` : '';
    const rowClass = `${setlistItemMatches(item, filters) ? 'setlist-row' : 'setlist-row hidden'}${canEditSetlist ? ' editing' : ''}`;
    return `<li class="${rowClass}" data-id="${item.id}" ${canDrag ? 'draggable="true"' : ''}><div class="setlist-item-summary">${summary}</div><span class="position">${String(index + 1).padStart(2, '0')}</span><div class="item-actions">${!isSong ? `<span class="duration">${secondsLabel(duration)}</span>` : ''}${controls}</div>${details}</li>`;
  }).join('');
  requestAnimationFrame(updateSongTitleAbbreviations);
  $('#setlist-items').classList.toggle('hidden', !items.length);
  $('#setlist-empty').classList.toggle('hidden', !!items.length);
  $('#setlist-filter-empty').classList.toggle('hidden', !items.length || !!matches.length);
}
function renderSetlistOptions() {
  const select = $('#setlist-select');
  const current = state.activeSetlist || select.value;
  select.innerHTML = state.setlists.map((list) => `<option value="${list.id}">${escapeHtml(list.name)}</option>`).join('');
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

function renderGigs() {
  const canEdit = !!state.member?.is_admin;
  $('#new-gig').classList.toggle('hidden', !canEdit);
  const gigs = [...state.gigs].sort((a, b) => a.event_date.localeCompare(b.event_date) || a.name.localeCompare(b.name));
  $('#gig-list').innerHTML = gigs.length ? gigs.map((gig) => {
    const setlist = state.setlists.find((item) => item.id === gig.setlist_id);
    const date = new Date(`${gig.event_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' });
    const details = [date, gig.start_time?.slice(0, 5), gig.location].filter(Boolean).join(' · ');
    return `<article class="gig-list-card"><div class="gig-list-card-main"><div><h2>${escapeHtml(gig.name)}</h2><p>${escapeHtml(details)}</p></div>${canEdit ? `<button type="button" class="button quiet" data-edit-gig="${escapeHtml(gig.id)}">Edit gig</button>` : ''}</div>${gig.notes ? `<p class="gig-list-notes">${escapeHtml(gig.notes)}</p>` : ''}<div class="gig-setlist-link"><span>Setlist</span>${setlist ? `<button type="button" class="text-button" data-open-gig-setlist="${escapeHtml(setlist.id)}">${escapeHtml(setlist.name)} →</button>` : '<em>No setlist attached</em>'}</div></article>`;
  }).join('') : '<div class="empty-state">No gigs have been added yet.</div>';
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
  $('#gig-form').classList.remove('hidden');
  $('#gig-name').focus();
}

async function renderActiveSetlist() {
  const setlist = state.setlists.find((item) => item.id === state.activeSetlist);
  $('#active-setlist-name').textContent = setlist?.name || 'Choose a setlist';
  $('#setlist-name-caption').textContent = setlist?.name || 'No setlist';
  const canEditSetlist = state.member.is_admin && state.setlistEditMode;
  $('#setlist-edit-toggle').classList.toggle('hidden', !state.member.is_admin);
  $('#setlist-edit-toggle').textContent = state.setlistEditMode ? 'Done editing' : 'Edit setlist';
  $('#save-setlist-order').classList.toggle('hidden', !canEditSetlist);
  $('#save-setlist-order').disabled = !state.setlistOrderDirty || savingSetlistOrder;
  $('#discard-setlist-order').classList.toggle('hidden', !canEditSetlist || !state.setlistOrderDirty);
  $('#setlist-edit-toggle').setAttribute('aria-pressed', String(state.setlistEditMode));
  $('#add-song-toggle').classList.toggle('hidden', !canEditSetlist);
  $('#add-song-toggle').disabled = !canEditSetlist || state.setlistOrderDirty;
  $('#new-setlist').classList.toggle('hidden', !state.member.is_admin);
  $('#new-setlist').disabled = !state.member.is_admin;
  if (!canEditSetlist) $('#add-song-panel').classList.add('hidden');
  $('#add-song-toggle').title = canEditSetlist ? '' : 'Choose Edit setlist to change the running order.';
  if (!setlist) {
    state.activeSetlistItems = [];
    $('#setlist-items').innerHTML = '';
    $('#setlist-filter-toolbar').classList.add('hidden');
    $('#setlist-filter-empty').classList.add('hidden');
    $('#setlist-empty').classList.remove('hidden');
    $('#setlist-summary').textContent = 'Create your first setlist.';
    $('#set-song-count').textContent = '0';
    return;
  }
  try {
    const [items, summary] = await Promise.all([
      loadSetlistItems(setlist.id),
      db.from('setlist_summary').select('song_count,total_seconds').eq('setlist_id', setlist.id).maybeSingle()
    ]);
    if (summary.error) throw summary.error;
    const total = summary.data?.total_seconds ?? 0;
    $('#set-song-count').textContent = summary.data?.song_count ?? 0;
    $('#setlist-summary').textContent = `${summary.data?.song_count || 0} songs · ${secondsLabel(total)} running time`;
    state.activeSetlistItems = items;
    if (canEditSetlist && !state.setlistOrderDirty) state.originalSetlistItems = [...items];
    $('#add-song').disabled = state.setlistOrderDirty;
    renderSetlistItems(items, canEditSetlist);
    $('#add-song-select').innerHTML = state.songs.map((song) => `<option value="${escapeHtml(song.id)}">${escapeHtml(song.id)} · ${escapeHtml(song.name)}</option>`).join('');
  } catch (error) { fail('Could not load this setlist.', error); }
}

function nextDashboardGig() {
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const upcoming = state.gigs.filter((gig) => gig.event_date >= localDate && gig.setlist_id).sort((a, b) => a.event_date.localeCompare(b.event_date));
  return upcoming[0] || [...state.gigs].sort((a, b) => b.event_date.localeCompare(a.event_date))[0] || null;
}

function renderDashboardTaskGroups(items, song, viewedMemberId) {
  if (!items.length) return '<p class="dashboard-all-done">All required work is complete.</p>';
  const groups = new Map();
  for (const item of items) {
    const key = item.owner_member_id || 'unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([ownerId, ownerItems]) => {
    const owner = ownerId === 'unassigned' ? null : state.members.find((member) => member.id === ownerId);
    const isViewedMember = owner?.id === viewedMemberId;
    return `<section class="dashboard-owner ${isViewedMember ? 'mine' : ''}"><h4>${escapeHtml(owner?.name || 'Unassigned')}${isViewedMember ? '<span>Dashboard</span>' : ''}</h4><div class="dashboard-owner-tasks">${ownerItems.map((item) => `<div class="dashboard-task-row"><span>${escapeHtml(item.type.label)}</span>${statusControl(song.id, item.type, item.status)}</div>`).join('')}</div></section>`;
  }).join('');
}

function dashboardWorkCategory(item) {
  if (item.status === 'Recorded') return 'other';
  if (item.category === 'ableset' || item.type.key === 'prompts') return 'playback';
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
  const gig = nextDashboardGig();
  $('#dashboard-gig-name').textContent = gig?.name || 'Upcoming Gig';
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    const active = tab.dataset.dashboardScope === state.dashboardScope;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  let songs = state.songs;
  if (state.dashboardScope === 'gig') {
    if (!gig?.setlist_id) {
      $('#dashboard-caption').textContent = 'No upcoming gig is linked to a setlist yet.';
      $('#dashboard-work-widgets').innerHTML = '';
      $('#dashboard-summary').innerHTML = '';
      $('#dashboard-song-list').innerHTML = '<div class="empty-state">Link a setlist to the next gig to see its remaining work here.</div>';
      return;
    }
    try {
      const items = await loadSetlistItems(gig.setlist_id);
      if (requestId !== dashboardRenderRequest) return;
      const songIds = [...new Set(items.filter((item) => item.item_type === 'song' && item.song_id).map((item) => item.song_id))];
      songs = songIds.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
    } catch (error) {
      fail('Could not load the upcoming gig setlist.', error);
      return;
    }
    const setlistName = state.setlists.find((list) => list.id === gig.setlist_id)?.name || 'linked setlist';
    $('#dashboard-caption').textContent = `${gig.name} · ${new Date(`${gig.event_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })} · ${setlistName}`;
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
    .map((type) => type.category === 'ableset' || type.key === 'prompts' ? 'playback' : type.category === 'backing' ? 'backing' : 'other'));
  // Recorded tasks are reassigned to the admin; include their current categories in the dashboard headings.
  for (const item of memberOpenItems) assignedCategories.add(dashboardWorkCategory(item));
  const widgets = [];
  if (assignedCategories.has('playback')) widgets.push(renderDashboardWorkWidget('Playback Work', 'playback', memberOpenItems.filter((item) => dashboardWorkCategory(item) === 'playback')));
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

async function addSongToSetlist() {
  if (!state.member.is_admin || !state.setlistEditMode || !state.activeSetlist) return;
  if (state.setlistOrderDirty) return showNotice('Save or discard the staged order before changing setlist contents.', true);
  const items = await loadSetlistItems(state.activeSetlist);
  const songId = $('#add-song-select').value;
  if (items.some((item) => item.item_type === 'song' && item.song_id === songId)) return showNotice('That song is already in this setlist.', true);
  const nextPosition = Math.max(0, ...items.map((item) => item.position)) + 1;
  const { error } = await db.from('setlist_items').insert({ setlist_id: state.activeSetlist, position: nextPosition, item_type: 'song', song_id: songId });
  if (error) return fail('Could not add this song.', error);
  $('#add-song-panel').classList.add('hidden');
  showNotice('Song added to the running order.');
  await renderActiveSetlist();
}

async function saveSetlistOrder(items) {
  if (!state.member.is_admin || !state.setlistEditMode || savingSetlistOrder || !state.setlistOrderDirty) return;
  savingSetlistOrder = true;
  $('#setlist-items').classList.add('saving-order');
  const base = Math.max(0, ...items.map((item) => item.position)) + items.length + 1;
  try {
    const stage = await Promise.all(items.map((item, index) => db.from('setlist_items').update({position:base+index}).eq('id',item.id)));
    const stageError = stage.find((result) => result.error)?.error;
    if (stageError) throw stageError;
    const updates = await Promise.all(items.map((item, index) => db.from('setlist_items').update({position:index+1}).eq('id',item.id)));
    const updateError = updates.find((result) => result.error)?.error;
    if (updateError) throw updateError;
    state.setlistOrderDirty = false;
    showNotice('Setlist order saved.');
    await renderActiveSetlist();
  } catch (error) {
    fail('Could not save the new setlist order. Your staged order is still here; try saving again.', error);
  } finally {
    savingSetlistOrder = false;
    $('#setlist-items').classList.remove('saving-order');
    updateSetlistEditControls();
  }
}
function updateSetlistEditControls() {
  const save = $('#save-setlist-order'), discard = $('#discard-setlist-order');
  if (save) save.disabled = !state.setlistOrderDirty || savingSetlistOrder;
  if (discard) discard.classList.toggle('hidden', !state.setlistEditMode || !state.setlistOrderDirty || savingSetlistOrder);
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
  state.setlistOrderDirty = state.activeSetlistItems.some((item,index) => item.id !== state.originalSetlistItems[index]?.id);
  renderSetlistItems(state.activeSetlistItems, true);
  updateSetlistEditControls();
}
async function removeSetlistItem(id) {
  if (!state.member.is_admin || !state.setlistEditMode) return;
  if (state.setlistOrderDirty) return showNotice('Save or discard the staged order before changing setlist contents.', true);
  const { error } = await db.from('setlist_items').delete().eq('id', id);
  if (error) return fail('Could not remove this item.', error);
  showNotice('Item removed from the setlist.');
  await renderActiveSetlist();
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
  const selectedPrefix = $('#new-song-type')?.value === 'Inst'
    ? 'I'
    : selectedCodes.length
      ? `${selectedCodes.join('')}${$('#new-song-format')?.value === 'medley' ? 'M' : ''}`
      : '';
  if (selectedPrefix) {
    const normalized = selectedPrefix.toUpperCase();
    if (!families.has(normalized)) families.set(normalized, { prefix: selectedPrefix, max: 0 });
  }
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  return [...families.values()]
    .map(({ prefix, max }) => `${prefix}${max + 1}`)
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
function nextSongNumber(prefix) {
  const max = state.songs.filter((song) => idPrefixFromId(song.id).toUpperCase() === prefix.toUpperCase())
    .reduce((value, song) => Math.max(value, Number(String(song.id).match(/\d+$/)?.[0] || 0)), 0);
  return max + 1;
}
function canonicalSongPrefix(prefix) {
  const existing = state.songs.find((song) => idPrefixFromId(song.id).toUpperCase() === prefix.toUpperCase());
  if (existing) return idPrefixFromId(existing.id);
  const selectedCodes = [...document.querySelectorAll('input[name="new-song-language"]:checked')].map((input) => input.value);
  const selectedPrefix = $('#new-song-type')?.value === 'Inst' ? 'I' : selectedCodes.length ? `${selectedCodes.join('')}${$('#new-song-format')?.value === 'medley' ? 'M' : ''}` : '';
  return selectedPrefix.toUpperCase() === prefix.toUpperCase() ? selectedPrefix : prefix.toUpperCase();
}
function updateGeneratedSongId() {
  const input = $('#new-song-id-prefix');
  if (!input) return;
  const typed = input.value.replace(/[^a-z]/gi, '').toUpperCase();
  const prefix = typed ? canonicalSongPrefix(typed) : '';
  const number = prefix ? nextSongNumber(prefix) : '';
  $('#new-song-id-number').textContent = number ? String(number) : '—';
  $('#new-song-id').value = prefix && number ? `${prefix}${number}` : '';
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
  renderTempoPoints([{ bpm: '', transition_to_next: 'gradual' }]);
  $('#new-song-task-statuses').innerHTML = state.taskTypes.map((type) => {
    const defaultStatus = type.allowed_statuses.includes('Incomplete') ? 'Incomplete' : type.allowed_statuses[0];
    const options = type.allowed_statuses.map((status) => `<option value="${escapeHtml(status)}" style="color:${STATUS_COLORS[status] || '#D0D0D0'};background-color:#19231c" ${status === defaultStatus ? 'selected' : ''}>${escapeHtml(status === 'Completed' ? 'Complete' : status)}</option>`).join('');
    return `<label class="new-song-task-row"><span>${escapeHtml(type.label)}</span><select class="new-song-task-status" data-task-key="${escapeHtml(type.key)}" data-status="${escapeHtml(defaultStatus)}">${options}</select></label>`;
  }).join('');
  updateNewSongIdPreview();
  renderNewSongIdSuggestions();
}
function updateNewSongIdPreview() {
  const type = $('#new-song-type')?.value || 'Vox';
  const isMedley = $('#new-song-format')?.value === 'medley';
  const codes = [...document.querySelectorAll('input[name="new-song-language"]:checked')].map((input) => input.value);
  const prefix = type === 'Inst' ? 'I' : codes.length ? `${codes.join('')}${isMedley ? 'M' : ''}` : '[language codes]';
  $('#new-song-id-preview').textContent = `Typical prefix for this selection: ${prefix}. Type only the letters; the next number is assigned automatically. Supported language codes: E, H, K, T, Kn, Ml, plus I for instrumental and M for medley.`;
  renderNewSongIdSuggestions();
}
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
  const selected = [...document.querySelectorAll('input[name="new-song-key"]:checked')].map((input) => input.value);
  $('#new-song-key-summary').textContent = selected.length ? selected.join(', ') : 'Choose keys';
}
function renderTempoPoints(points) {
  const rows = points.length ? points : [{ bpm: '', transition_to_next: 'gradual' }];
  $('#new-song-tempo-points').innerHTML = rows.map((point, index) => `<div class="tempo-point">
    <label>Tempo ${index + 1} (BPM)<input class="tempo-point-bpm" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(point.bpm ?? '')}" aria-label="Tempo ${index + 1} in BPM"></label>
    ${index < rows.length - 1 ? `<label>Change to next<select class="tempo-point-transition"><option value="gradual" ${point.transition_to_next === 'gradual' ? 'selected' : ''}>Gradual change</option><option value="instant" ${point.transition_to_next === 'instant' ? 'selected' : ''}>Instant change</option></select></label>` : '<span class="tempo-point-end">Final tempo</span>'}
    ${rows.length > 1 ? `<button type="button" class="icon-button remove-tempo-point" aria-label="Remove tempo ${index + 1}" data-tempo-remove="${index}">×</button>` : ''}
  </div>`).join('');
}
function readTempoPoints() {
  return [...document.querySelectorAll('.tempo-point')].map((row) => ({
    bpm: row.querySelector('.tempo-point-bpm').value.trim(),
    transition_to_next: row.querySelector('.tempo-point-transition')?.value || null
  }));
}

function openNewSongDialog() {
  if (!state.member?.is_admin) return;
  $('#new-song-form').reset();
  newSongIdQuery = '';
  $('#new-song-id-prefix').value = '';
  updateGeneratedSongId();
  $('#new-song-error').textContent = '';
  $('#new-song-type').value = 'Vox';
  $('#new-song-format').value = 'single';
  $('#new-song-tempo-change').value = 'none';
  $('#new-song-backing').value = '';
  renderNewSongFields();
  $('#song-editor-dialog').showModal();
  $('#new-song-id-prefix').focus();
}
async function saveNewSong(event) {
  event.preventDefault();
  if (!state.member?.is_admin) return;
  const id = $('#new-song-id').value.trim();
  const name = $('#new-song-name').value.trim();
  const idPattern = /^[A-Z][A-Za-z]*[0-9]+$/;
  if (!idPattern.test(id)) { $('#new-song-error').textContent = 'Use a valid ID prefix followed by a number, for example E12, EM3, EHM2, EHKM1, or I4.'; return; }
  if (state.songs.some((song) => song.id.toLowerCase() === id.toLowerCase())) { $('#new-song-error').textContent = 'That Song ID is already in use.'; return; }
  if ($('#new-song-type').value === 'Vox' && !document.querySelector('input[name="new-song-language"]:checked')) { $('#new-song-error').textContent = 'Choose at least one language for a vocal song.'; return; }
  const keys = [...document.querySelectorAll('input[name="new-song-key"]:checked')].map((input) => input.value);
  const invalidKeys = keys.filter((key) => !KEY_CHOICES.includes(key));
  if (invalidKeys.length) { $('#new-song-error').textContent = `Unknown key: ${invalidKeys.join(', ')}.`; return; }
  const tempoRows = readTempoPoints();
  const anyTempo = tempoRows.some((point) => point.bpm !== '');
  if (anyTempo && tempoRows.some((point) => !point.bpm || Number(point.bpm) <= 0)) { $('#new-song-error').textContent = 'Complete each tempo value or remove the empty tempo row.'; return; }
  const tempoSegments = anyTempo ? tempoRows.map((point) => ({ bpm:Number(point.bpm), transition_to_next:point.transition_to_next })) : [];
  const tempoStart = tempoSegments[0]?.bpm ?? null;
  const tempoEnd = tempoSegments.length > 1 ? tempoSegments.at(-1).bpm : null;
  const tempoChange = tempoSegments.length > 1 ? (tempoSegments[0].transition_to_next === 'gradual' ? 'ramp' : 'jump') : 'none';
  const duration = $('#new-song-duration').value ? Number($('#new-song-duration').value) : null;
  const languageCodes = [...document.querySelectorAll('input[name="new-song-language"]:checked')].map((input) => input.value);
  const payload = {
    id, name, type: $('#new-song-type').value, is_medley: $('#new-song-format').value === 'medley',
    keys, tempo_start: tempoStart, tempo_end: tempoEnd, tempo_change: tempoChange, tempo_segments: tempoSegments,
    duration_seconds: duration, backing_track_manual: $('#new-song-backing').value || null,
    sort_order: Math.max(0, ...state.songs.map((song) => song.sort_order || 0)) + 1
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
  renderNewSetlistSongChoices();
  $('#setlist-create-dialog').showModal();
  $('#new-setlist-name').focus();
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

function setView(view) {
  state.view = view;
  if (view !== 'setlists') {
    state.setlistEditMode = false;
    $('#add-song-panel').classList.add('hidden');
  }
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  $('#songs-view').classList.toggle('hidden', view !== 'songs');
  $('#setlists-view').classList.toggle('hidden', view !== 'setlists');
  $('#gigs-view').classList.toggle('hidden', view !== 'gigs');
  $('#dashboard-view').classList.toggle('hidden', view !== 'dashboard');
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
    const { data, error } = await db.functions.invoke('member-access-admin', { body: { action: 'list_members' } });
    if (error) throw error;
    state.accessMembers = data.members || [];
    $('#access-member-select').innerHTML = state.accessMembers.length
      ? '<option value="">Choose a band member</option>' + state.accessMembers.map((member) =>
          `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}${member.must_change_password ? ' · password change required' : ''}</option>`).join('')
      : '<option value="">No linked accounts</option>';
    $('#access-message').textContent = '';
  } catch (error) { $('#access-message').textContent = error.message || 'Could not load member accounts.'; }
});
async function runMemberAccessAction(action) {
  const memberId = $('#access-member-select').value;
  if (!memberId) { $('#access-message').textContent = 'Choose a band member first.'; return; }
  const buttons = [$('#issue-temporary-password'), $('#send-member-reset')];
  buttons.forEach((button) => { button.disabled = true; });
  $('#access-message').textContent = action === 'temporary_password' ? 'Creating a temporary password…' : 'Sending a reset email…';
  $('#temporary-password-result').classList.add('hidden');
  $('#temporary-password-value').textContent = '';
  try {
    const { data, error } = await db.functions.invoke('member-access-admin', { body: { action, member_id: memberId } });
    if (error) throw error;
    if (action === 'temporary_password') {
      $('#temporary-password-value').textContent = data.temporary_password;
      $('#temporary-password-result').classList.remove('hidden');
      $('#access-message').textContent = 'Share this password privately. The member must change it at their next sign-in.';
      const member = state.accessMembers.find((item) => item.id === memberId);
      if (member) member.must_change_password = true;
      const option = $('#access-member-select').selectedOptions[0];
      if (option && !option.textContent.includes('password change required')) option.textContent += ' · password change required';
    } else { $('#access-message').textContent = 'Password reset email sent.'; }
  } catch (error) { $('#access-message').textContent = error.message || 'Could not update member access.'; }
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

$('#sign-out').addEventListener('click', async () => { await db.auth.signOut(); state.member = null; showLogin(); });
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$('#song-search').addEventListener('input', renderSongs);
document.querySelectorAll('.dashboard-tab').forEach((button) => button.addEventListener('click', () => {
  state.dashboardScope = button.dataset.dashboardScope;
  renderDashboard();
}));
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
$('#refresh').addEventListener('click', async () => { try { await Promise.all([loadData(), loadReadiness()]); if (state.view === 'dashboard') await renderDashboard(); showNotice('Workspace refreshed.'); } catch (error) { fail('Could not refresh the workspace.', error); } });
$('#setlist-select').addEventListener('change', (event) => {
  if (state.setlistOrderDirty) { event.target.value = state.activeSetlist; showNotice('Save or discard your staged order before switching setlists.', true); return; }
  state.activeSetlist = event.target.value;
  renderActiveSetlist();
});
$('#add-song-toggle').addEventListener('click', () => $('#add-song-panel').classList.toggle('hidden'));
$('#setlist-edit-toggle').addEventListener('click', () => {
  if (!state.member.is_admin) return;
  if (state.setlistEditMode && state.setlistOrderDirty) { showNotice('Save or discard your staged order before leaving edit mode.', true); return; }
  state.setlistEditMode = !state.setlistEditMode;
  if (state.setlistEditMode) { state.expandedSongIds.clear(); state.originalSetlistItems = [...state.activeSetlistItems]; state.setlistOrderDirty = false; }
  else $('#add-song-panel').classList.add('hidden');
  renderActiveSetlist();
});
$('#save-setlist-order').addEventListener('click', () => saveSetlistOrder(state.activeSetlistItems.map((item,index) => ({id:item.id,position:index+1}))));
$('#discard-setlist-order').addEventListener('click', () => {
  state.activeSetlistItems = [...state.originalSetlistItems];
  state.setlistOrderDirty = false;
  renderSetlistItems(state.activeSetlistItems, true);
  updateSetlistEditControls();
});
$('#add-song').addEventListener('click', addSongToSetlist);
$('#new-setlist').addEventListener('click', openNewSetlistDialog);
$('#new-song-open').addEventListener('click', openNewSongDialog);
$('#cancel-new-song').addEventListener('click', () => $('#song-editor-dialog').close());
$('#new-song-form').addEventListener('submit', saveNewSong);
$('#new-song-id-prefix').addEventListener('input', (event) => {
  const input = event.target;
  const start = input.selectionStart;
  input.value = input.value.replace(/[^a-z]/gi, '').toUpperCase();
  if (start !== null) input.setSelectionRange(Math.min(start, input.value.length), Math.min(start, input.value.length));
  newSongIdQuery = input.value.trim();
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
  else if (event.key === 'ArrowUp' && index === 0) { event.preventDefault(); $('#new-song-id').focus(); }
});
$('#new-song-id-suggestions').addEventListener('click', (event) => {
  const option = event.target.closest('[data-song-id-suggestion]');
  if (option) acceptSongIdSuggestion(option.dataset.songIdSuggestion);
});
$('#new-song-type').addEventListener('change', updateNewSongIdPreview);
$('#new-song-format').addEventListener('change', updateNewSongIdPreview);
$('#new-song-language-options').addEventListener('change', updateNewSongIdPreview);
$('#new-song-key-options').addEventListener('change', updateNewSongKeySummary);
$('#add-tempo-point').addEventListener('click', () => { const points = readTempoPoints(); if (points.length >= 6) return; points.push({ bpm:'', transition_to_next:'gradual' }); renderTempoPoints(points); });
$('#new-song-tempo-points').addEventListener('click', (event) => { const button = event.target.closest('[data-tempo-remove]'); if (!button) return; const points = readTempoPoints(); points.splice(Number(button.dataset.tempoRemove), 1); renderTempoPoints(points); });
$('#new-song-task-statuses').addEventListener('change', (event) => { if (event.target.matches('.new-song-task-status')) event.target.dataset.status = event.target.value; });
$('#cancel-new-setlist').addEventListener('click', () => $('#setlist-create-dialog').close());
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
$('#gig-list').addEventListener('click', (event) => {
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
db.auth.getSession().then(async ({ data, error }) => {
  if (error || !data.session) return showLogin();
  try {
    await loadMember(data.session.user);
    if (new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery') return showPasswordRecovery();
    if (state.member.must_change_password) return showFirstLoginPasswordSetup();
    await Promise.all([loadData(), loadReadiness()]);
    showWorkspace();
    renderSongs();
  } catch (loadError) { await db.auth.signOut(); showLogin(); $('#login-error').textContent = loadError.message || 'Could not open the band workspace.'; }
});
