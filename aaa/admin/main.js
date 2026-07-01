import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const configPanel = document.querySelector('#configPanel');
const loginPanel = document.querySelector('#loginPanel');
const adminPanel = document.querySelector('#adminPanel');
const signOutButton = document.querySelector('#signOutButton');
const logEl = document.querySelector('#log');

const fields = {
  supabaseUrl: document.querySelector('#supabaseUrl'),
  supabaseAnonKey: document.querySelector('#supabaseAnonKey'),
  email: document.querySelector('#email'),
  password: document.querySelector('#password'),
  difficulty: document.querySelector('#difficulty'),
  tags: document.querySelector('#tags'),
  coverFile: document.querySelector('#coverFile'),
  audioFile: document.querySelector('#audioFile'),
  lyricsFile: document.querySelector('#lyricsFile'),
  dictionaryFile: document.querySelector('#dictionaryFile'),
};

let supabase = null;
let latestLyricsMetadata = null;

document.querySelector('#saveConfigButton').addEventListener('click', saveConfig);
document.querySelector('#loginButton').addEventListener('click', login);
document.querySelector('#validateButton').addEventListener('click', validateFiles);
document.querySelector('#publishButton').addEventListener('click', publishNasheed);
fields.lyricsFile.addEventListener('change', previewLyricsMetadata);
signOutButton.addEventListener('click', signOut);

init();

async function init() {
  const config = readConfig();

  if (config) {
    fields.supabaseUrl.value = config.url;
    fields.supabaseAnonKey.value = config.anonKey;
    supabase = createClient(config.url, config.anonKey);
    await showLoginOrAdmin();
  }
}

function saveConfig() {
  const url = fields.supabaseUrl.value.trim();
  const anonKey = fields.supabaseAnonKey.value.trim();

  if (!url || !anonKey) {
    writeLog('Add Supabase URL and anon key first.');
    return;
  }

  localStorage.setItem('nushudAdminConfig', JSON.stringify({ url, anonKey }));
  supabase = createClient(url, anonKey);
  writeLog('Connection saved.');
  show(loginPanel);
}

async function login() {
  const email = fields.email.value.trim();
  const password = fields.password.value;

  if (!supabase) {
    writeLog('Save Supabase connection first.');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    writeLog(`Login failed: ${error.message}`);
    return;
  }

  await showLoginOrAdmin();
}

async function showLoginOrAdmin() {
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    show(loginPanel);
    hide(adminPanel);
    hide(signOutButton);
    return;
  }

  const isAdmin = await checkAdmin();

  if (!isAdmin) {
    writeLog('Logged in, but this user is not in public.admin_users.');
    show(loginPanel);
    hide(adminPanel);
    return;
  }

  document.querySelector('#adminEmail').textContent = data.user.email ?? '';
  hide(configPanel);
  hide(loginPanel);
  show(adminPanel);
  show(signOutButton);
  writeLog('Logged in as admin.');
}

async function checkAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

async function signOut() {
  await supabase.auth.signOut();
  show(loginPanel);
  hide(adminPanel);
  hide(signOutButton);
  writeLog('Signed out.');
}

async function validateFiles() {
  try {
    const lyrics = await readJsonFile(fields.lyricsFile.files[0], 'timed lyrics JSON');
    validateLyricsJson(lyrics);
    latestLyricsMetadata = getLyricsMetadata(lyrics);
    renderMetadataPreview(latestLyricsMetadata);

    const dictionaryFile = fields.dictionaryFile.files[0];
    if (dictionaryFile) {
      const dictionary = await readJsonFile(dictionaryFile, 'words.json');
      validateDictionaryJson(dictionary);
      const missingWords = getMissingDictionaryWords(lyrics, dictionary);

      if (missingWords.length > 0) {
        writeLog(`Validation passed with dictionary warnings. Missing words: ${formatMissingWords(missingWords)}`);
        return;
      }
    }

    writeLog('Validation passed.');
  } catch (error) {
    writeLog(error.message);
  }
}

async function publishNasheed() {
  try {
    const input = getPublishInput();
    const lyrics = await readJsonFile(input.lyricsFile, 'timed lyrics JSON');
    validateLyricsJson(lyrics);
    const metadata = getLyricsMetadata(lyrics);
    renderMetadataPreview(metadata);
    validateSelectedAudioFile(metadata, input.audioFile);

    if (input.dictionaryFile) {
      const dictionary = await readJsonFile(input.dictionaryFile, 'words.json');
      validateDictionaryJson(dictionary);
      const missingWords = getMissingDictionaryWords(lyrics, dictionary);

      if (missingWords.length > 0) {
        writeLog(`Publishing with missing dictionary entries: ${formatMissingWords(missingWords)}`);
      }

      await uploadFile('dictionary', 'words.json', input.dictionaryFile);
    }

    const coverUrl = await uploadFile('nasheed-covers', `${metadata.slug}.${extension(input.coverFile.name)}`, input.coverFile);
    const audioUrl = await uploadFile('nasheed-audio', `${metadata.slug}.${extension(input.audioFile.name)}`, input.audioFile);
    const lyricsJsonUrl = await uploadFile('nasheed-lyrics', `${metadata.slug}.json`, input.lyricsFile);

    const normalizedWords = getNormalizedWordsFromLyrics(lyrics);
    const wordCount = normalizedWords.length;
    const uniqueWordCount = new Set(normalizedWords).size;

    const { error } = await supabase
      .from('nasheeds')
      .insert({
        title: metadata.title,
        artist_name: metadata.artistName,
        cover_url: coverUrl,
        audio_url: audioUrl,
        lyrics_json_url: lyricsJsonUrl,
        duration_ms: metadata.durationMs,
        difficulty: input.difficulty,
        tags: input.tags,
        total_words: wordCount,
        new_words_count: uniqueWordCount,
        is_published: true,
      });

    if (error) {
      throw new Error(`Publish failed: ${error.message}`);
    }

    document.querySelector('#publishState').textContent = 'Published';
    writeLog('Published. The mobile app can now load this nasheed.');
  } catch (error) {
    writeLog(error.message);
  }
}

function getPublishInput() {
  const input = {
    difficulty: fields.difficulty.value,
    tags: fields.tags.value
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
    coverFile: fields.coverFile.files[0],
    audioFile: fields.audioFile.files[0],
    lyricsFile: fields.lyricsFile.files[0],
    dictionaryFile: fields.dictionaryFile.files[0],
  };

  const missing = Object.entries(input)
    .filter(([key, value]) => key !== 'dictionaryFile' && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(', ')}`);
  }

  return input;
}

async function previewLyricsMetadata() {
  try {
    const lyrics = await readJsonFile(fields.lyricsFile.files[0], 'timed lyrics JSON');
    validateLyricsJson(lyrics);
    latestLyricsMetadata = getLyricsMetadata(lyrics);
    renderMetadataPreview(latestLyricsMetadata);
  } catch (error) {
    latestLyricsMetadata = null;
    renderMetadataPreview(null);
    writeLog(error.message);
  }
}

async function uploadFile(bucket, path, file) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload failed for ${bucket}/${path}: ${error.message}`);
  }

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function readJsonFile(file, label) {
  if (!file) {
    throw new Error(`Choose ${label} first.`);
  }

  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function validateLyricsJson(json) {
  if (!json || !Array.isArray(json.lines) || json.lines.length === 0) {
    throw new Error('Lyrics JSON must contain a non-empty lines array.');
  }

  json.lines.forEach((line, lineIndex) => {
    if (!isValidTiming(line.startMs, line.endMs)) {
      throw new Error(`Line ${lineIndex + 1} has invalid timing.`);
    }

    if (!line.ar || typeof line.ar !== 'string') {
      throw new Error(`Line ${lineIndex + 1} needs ar.`);
    }
  });

  if (typeof json.lineCount === 'number' && json.lineCount !== json.lines.length) {
    throw new Error(`lineCount says ${json.lineCount}, but lines has ${json.lines.length}.`);
  }

  getLyricsMetadata(json);
}

function getLyricsMetadata(json) {
  const slug = String(json.id ?? json.slug ?? '').trim();
  const title = String(json.title ?? '').trim();
  const artistName = String(json.artist ?? json.artistName ?? json.author ?? json.authorName ?? '').trim();
  const audioFileName = String(json.audioFileName ?? json.audio_file_name ?? '').trim();
  const durationMs = getDurationMs(json);

  const missing = [
    !slug && 'id or slug',
    !title && 'title',
    !artistName && 'artist',
    !durationMs && 'duration from durationMs or line endMs',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Lyrics JSON missing metadata: ${missing.join(', ')}`);
  }

  return {
    slug,
    title,
    artistName,
    audioFileName,
    durationMs,
    lineCount: json.lines.length,
    languages: Array.isArray(json.languages) ? json.languages : [],
  };
}

function getDurationMs(json) {
  const explicitDuration = Number(json.durationMs ?? json.duration_ms ?? json.duration);

  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.round(explicitDuration);
  }

  const maxEndMs = Math.max(...json.lines.map((line) => Number(line.endMs)));
  return Number.isFinite(maxEndMs) && maxEndMs > 0 ? Math.round(maxEndMs) : 0;
}

function validateSelectedAudioFile(metadata, audioFile) {
  if (!metadata.audioFileName) {
    return;
  }

  if (audioFile.name !== metadata.audioFileName) {
    throw new Error(`Audio file mismatch. JSON expects ${metadata.audioFileName}, but selected ${audioFile.name}.`);
  }
}

function renderMetadataPreview(metadata) {
  const preview = document.querySelector('#metadataPreview');

  if (!metadata) {
    preview.textContent = 'Choose timed lyrics JSON to detect slug, title, artist, audio filename, line count, and duration.';
    return;
  }

  preview.innerHTML = [
    `<strong>${escapeHtml(metadata.title)}</strong>`,
    `Slug: ${escapeHtml(metadata.slug)}`,
    `Artist: ${escapeHtml(metadata.artistName)}`,
    `Duration: ${metadata.durationMs} ms`,
    `Lines: ${metadata.lineCount}`,
    metadata.audioFileName ? `Expected audio: ${escapeHtml(metadata.audioFileName)}` : '',
    metadata.languages.length > 0 ? `Languages: ${metadata.languages.map(escapeHtml).join(', ')}` : '',
  ].filter(Boolean).join('<br />');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function validateDictionaryJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('words.json must be an object keyed by normalized word.');
  }
}

function getMissingDictionaryWords(lyrics, dictionary) {
  const missing = new Set();

  getNormalizedWordsFromLyrics(lyrics).forEach((normalizedWord) => {
    if (!dictionary[normalizedWord]) {
      missing.add(normalizedWord);
    }
  });

  return [...missing];
}

function formatMissingWords(words) {
  const visibleWords = words.slice(0, 30).join(', ');
  const hiddenCount = words.length - 30;

  if (hiddenCount <= 0) {
    return visibleWords;
  }

  return `${visibleWords} ... and ${hiddenCount} more`;
}

function getNormalizedWordsFromLyrics(lyrics) {
  return lyrics.lines.flatMap((line) =>
    tokenizeArabicLine(line.ar).map(normalizeArabicWord).filter(Boolean),
  );
}

function tokenizeArabicLine(text) {
  return text.split(/\s+/).map((word) => word.trim()).filter(Boolean);
}

function normalizeArabicWord(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{Script=Arabic}\p{Letter}\p{Number}]+/gu, '')
    .trim();
}

function isValidTiming(startMs, endMs) {
  return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs >= 0 && endMs > startMs;
}

function extension(fileName) {
  return fileName.split('.').pop()?.toLowerCase() || 'bin';
}

function readConfig() {
  const raw = localStorage.getItem('nushudAdminConfig');
  return raw ? JSON.parse(raw) : null;
}

function show(element) {
  element.classList.remove('hidden');
}

function hide(element) {
  element.classList.add('hidden');
}

function writeLog(message) {
  logEl.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
}
