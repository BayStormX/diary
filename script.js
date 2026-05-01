/* ============================================================
   script.js — ลับๆ ของฉัน 🌿
   Full app logic: Auth, Posts, Gallery, Lightbox, Toast, Cursor
   ============================================================ */

'use strict';

/* ===== CONSTANTS & STATE ===== */
const STORAGE_KEYS = {
  POSTS:       'mintgallery_posts',
  USERS:       'mintgallery_users',
  CURRENT_USER:'mintgallery_current_user',
};

const MAX_IMAGE_SIZE_MB  = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const COMPRESS_TARGET_WIDTH = 1200;
const COMPRESS_QUALITY      = 0.82;

let allPosts          = [];
let currentUser       = null;
let currentFilter     = 'all';
let selectedMoods     = [];
let selectedVisibility = 'public';
let selectedEmoji     = '🌿';
let currentImageB64   = null;
let lightboxPostId    = null;
let searchQuery       = '';


/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initScrollHeader();
  initDateField();
  loadState();
  renderGallery();
  updateHeaderUser();
  updateProfileCard();
});


/* ===== DATA PERSISTENCE (localStorage) ===== */

function loadState() {
  try {
    const rawPosts = localStorage.getItem(STORAGE_KEYS.POSTS);
    allPosts = rawPosts ? JSON.parse(rawPosts) : [];
  } catch { allPosts = []; }

  try {
    const rawUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    currentUser = rawUser ? JSON.parse(rawUser) : null;
  } catch { currentUser = null; }
}

function savePosts() {
  try {
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(allPosts));
  } catch (e) {
    showToast('⚠️', 'พื้นที่จัดเก็บเต็มแล้ว ลองลดขนาดรูปดูนะ', 'warning');
  }
}

function getUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

function saveCurrentUser(user) {
  currentUser = user;
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
}


/* ===== SECTION NAVIGATION ===== */

function showSection(name) {
  const sections = { gallery: 'sectionGallery', upload: 'sectionUpload', profile: 'sectionProfile' };
  const navBtns  = { gallery: 'navGallery', upload: 'navUpload', profile: 'navProfile' };

  Object.entries(sections).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.toggle('hidden', key !== name);
      if (key === name) {
        el.style.animation = 'none';
        requestAnimationFrame(() => {
          el.style.animation = '';
        });
      }
    }
  });

  Object.entries(navBtns).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', key === name);
  });

  if (name === 'upload' && !currentUser) {
    document.getElementById('loginPrompt').style.display = 'flex';
    showSection('gallery');
    return;
  }

  if (name === 'gallery') renderGallery();
  if (name === 'profile') updateProfileCard();
  if (name === 'upload')  initDateField();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ===== GALLERY RENDERING ===== */

function getVisiblePosts() {
  const uid = currentUser?.username;
  return allPosts.filter(post => {
    if (post.visibility === 'private' && post.authorUsername !== uid) return false;
    if (currentFilter === 'mine'   && post.authorUsername !== uid) return false;
    if (currentFilter === 'others' && post.authorUsername === uid) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inName    = (post.personName || '').toLowerCase().includes(q);
      const inMessage = (post.message || '').toLowerCase().includes(q);
      const inAuthor  = (post.authorUsername || '').toLowerCase().includes(q);
      if (!inName && !inMessage && !inAuthor) return false;
    }
    return true;
  });
}

function renderGallery() {
  const grid      = document.getElementById('galleryGrid');
  const emptyState = document.getElementById('emptyState');
  if (!grid) return;

  const posts = getVisiblePosts();

  updateStats();

  if (posts.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  // Sort newest first
  const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  grid.innerHTML = sorted.map((post, i) => buildCardHTML(post, i)).join('');
}

function buildCardHTML(post, index) {
  const isOwner   = currentUser?.username === post.authorUsername;
  const dateLabel = formatDisplayDate(post.memoryDate || post.createdAt);
  const moodLabel = post.mood || '';
  const visBadge  = post.visibility === 'private'
    ? `<span class="card-visibility-badge badge-private">🔒 ส่วนตัว</span>`
    : `<span class="card-visibility-badge badge-public">🌍 สาธารณะ</span>`;
  const moodBadge = moodLabel
    ? `<span class="card-mood-badge">${moodLabel}</span>`
    : '';
  const authorAvatar = escapeHTML(post.authorEmoji || '🌿');
  const authorName   = escapeHTML(post.authorUsername || 'ไม่ระบุ');
  const personName   = escapeHTML(post.personName || 'ไม่ระบุชื่อ');
  const message      = escapeHTML(post.message || '');
  const delay        = Math.min(index * 60, 600);

  return `
    <article class="photo-card"
      style="animation-delay: ${delay}ms"
      onclick="openLightbox('${escapeAttr(post.id)}')"
      data-id="${escapeAttr(post.id)}">
      <div class="card-img-wrap">
        <img class="card-img" src="${post.imageB64}" alt="${personName}" loading="lazy" />
        ${visBadge}
        ${moodBadge}
      </div>
      <div class="card-body">
        <div class="card-person-row">
          <div class="card-author-avatar">${authorAvatar}</div>
          <span class="card-author-name">${authorName}</span>
        </div>
        <h3 class="card-person-name">${personName}</h3>
        ${message ? `<p class="card-message">"${message}"</p>` : ''}
        <div class="card-footer">
          <span class="card-date">📅 ${dateLabel}</span>
          <button class="card-expand-btn" title="ดูรูปใหญ่">🔍</button>
        </div>
      </div>
    </article>
  `;
}

function updateStats() {
  const visible = getVisiblePosts();
  const userSet = new Set(allPosts.filter(p => p.visibility !== 'private' || p.authorUsername === currentUser?.username).map(p => p.authorUsername));
  const todayStr = new Date().toDateString();
  const todayCount = visible.filter(p => new Date(p.createdAt).toDateString() === todayStr).length;

  setText('statTotal', visible.length);
  setText('statUsers', userSet.size);
  setText('statToday', todayCount);
}

function filterGallery() {
  searchQuery = (document.getElementById('searchInput')?.value || '').trim();
  renderGallery();
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderGallery();
}


/* ===== LIGHTBOX ===== */

function openLightbox(postId) {
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;

  lightboxPostId = postId;
  const lb = document.getElementById('lightbox');
  const isOwner = currentUser?.username === post.authorUsername;

  setAttr('lightboxImg', 'src', post.imageB64);
  setAttr('lightboxImg', 'alt', post.personName || '');

  // user info
  const lbAvatar = document.getElementById('lbAvatar');
  if (lbAvatar) lbAvatar.textContent = post.authorEmoji || '🌿';
  setText('lbUsername', post.authorUsername || 'ไม่ระบุ');
  setText('lbPerson',   post.personName || 'ไม่ระบุชื่อ');
  setText('lbMessage',  post.message ? `"${post.message}"` : '(ไม่มีข้อความ)');
  setText('lbDate',     `📅 ${formatDisplayDate(post.memoryDate || post.createdAt)}`);
  setText('lbMood',     post.mood || '');

  const delBtn = document.getElementById('lbDeleteBtn');
  if (delBtn) delBtn.style.display = isOwner ? 'inline-flex' : 'none';

  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(event) {
  if (event && event.target !== document.getElementById('lightbox') && !event.target.classList.contains('lightbox-close')) {
    if (!event.target.closest('.lightbox-close')) return;
  }
  const lb = document.getElementById('lightbox');
  lb.classList.remove('open');
  document.body.style.overflow = '';
  lightboxPostId = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox({ target: document.getElementById('lightbox') });
});

function deletePostFromLightbox() {
  if (!lightboxPostId || !currentUser) return;
  const post = allPosts.find(p => p.id === lightboxPostId);
  if (!post || post.authorUsername !== currentUser.username) return;

  allPosts = allPosts.filter(p => p.id !== lightboxPostId);
  savePosts();
  closeLightbox({ target: document.getElementById('lightbox') });
  renderGallery();
  showToast('🗑️', 'ลบรูปแล้ว!', 'success');
}


/* ===== FILE UPLOAD & IMAGE PROCESSING ===== */

function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (file) processFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('dropZone')?.classList.add('dragging');
}

function handleDragLeave(event) {
  event.preventDefault();
  document.getElementById('dropZone')?.classList.remove('dragging');
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('dropZone')?.classList.remove('dragging');
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    processFile(file);
  } else {
    showToast('⚠️', 'ต้องเป็นไฟล์รูปภาพเท่านั้นนะ', 'warning');
  }
}

function processFile(file) {
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    showToast('⚠️', `รูปใหญ่เกิน ${MAX_IMAGE_SIZE_MB}MB ลองใช้รูปที่เล็กกว่านี้นะ`, 'warning');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    compressImage(e.target.result, (compressed) => {
      currentImageB64 = compressed;
      showImagePreview(compressed);
    });
  };
  reader.readAsDataURL(file);
}

function compressImage(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let { width, height } = img;

    if (width > COMPRESS_TARGET_WIDTH) {
      height = Math.round((height * COMPRESS_TARGET_WIDTH) / width);
      width  = COMPRESS_TARGET_WIDTH;
    }

    canvas.width  = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const compressed = canvas.toDataURL('image/jpeg', COMPRESS_QUALITY);
    callback(compressed);
  };
  img.src = dataUrl;
}

function showImagePreview(src) {
  const preview     = document.getElementById('dropPreview');
  const placeholder = document.getElementById('dropPlaceholder');
  const previewImg  = document.getElementById('previewImg');

  if (preview && placeholder && previewImg) {
    previewImg.src          = src;
    preview.style.display   = 'block';
    placeholder.style.display = 'none';
  }
}

function removePreview(event) {
  event.stopPropagation();
  currentImageB64 = null;

  const preview     = document.getElementById('dropPreview');
  const placeholder = document.getElementById('dropPlaceholder');
  const fileInput   = document.getElementById('fileInput');

  if (preview)     preview.style.display   = 'none';
  if (placeholder) placeholder.style.display = 'flex';
  if (fileInput)   fileInput.value = '';

  const previewImg = document.getElementById('previewImg');
  if (previewImg) previewImg.src = '';
}


/* ===== POST SUBMISSION ===== */

function submitPost() {
  if (!currentUser) {
    document.getElementById('loginPrompt').style.display = 'flex';
    return;
  }
  if (!currentImageB64) {
    showToast('📸', 'ลืมใส่รูปนะ!', 'warning');
    shakeElement('dropZone');
    return;
  }

  const personName = (document.getElementById('personName')?.value || '').trim();
  const message    = (document.getElementById('postMessage')?.value || '').trim();
  const dateVal    = document.getElementById('postDate')?.value;

  if (!personName) {
    showToast('📝', 'ใส่ชื่อเขาด้วยนะ!', 'warning');
    shakeElement('personName');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  const btnText   = submitBtn?.querySelector('.btn-text');
  const btnLoader = submitBtn?.querySelector('.btn-loader');

  if (submitBtn) submitBtn.disabled = true;
  if (btnText)   btnText.style.display = 'none';
  if (btnLoader) btnLoader.style.display = 'block';

  setTimeout(() => {
    const newPost = {
      id:             generateId(),
      imageB64:       currentImageB64,
      personName:     personName,
      message:        message,
      memoryDate:     dateVal || new Date().toISOString().slice(0, 10),
      mood:           selectedMoods[0] || '',
      visibility:     selectedVisibility,
      authorUsername: currentUser.username,
      authorEmoji:    currentUser.emoji,
      createdAt:      new Date().toISOString(),
    };

    allPosts.unshift(newPost);
    savePosts();
    resetForm();
    showToast('💌', 'โพสต์รูปเรียบร้อย!', 'success');

    if (submitBtn) submitBtn.disabled = false;
    if (btnText)   btnText.style.display = 'block';
    if (btnLoader) btnLoader.style.display = 'none';

    showSection('gallery');
    spawnFloatingHearts();
  }, 600);
}

function resetForm() {
  currentImageB64  = null;
  selectedMoods    = [];
  selectedVisibility = 'public';

  const fields = ['personName', 'postMessage'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  initDateField();
  removePreview(new Event('reset'));

  document.querySelectorAll('.mood-tag').forEach(t => t.classList.remove('selected'));
  document.querySelectorAll('.vis-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('visBtnPublic')?.classList.add('active');

  updateMessageCount();

  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';
}


/* ===== AUTH: REGISTER & LOGIN ===== */

function registerUser() {
  const username = (document.getElementById('regUsername')?.value || '').trim();
  const password = (document.getElementById('regPassword')?.value || '').trim();

  if (!username || username.length < 2) {
    showToast('⚠️', 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษรนะ', 'warning');
    shakeElement('regUsername');
    return;
  }
  if (!password || password.length < 4) {
    showToast('⚠️', 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษรนะ', 'warning');
    shakeElement('regPassword');
    return;
  }

  const users = getUsers();
  if (users[username]) {
    showToast('⚠️', 'ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่นดูนะ', 'warning');
    return;
  }

  const user = {
    username,
    password:  simpleHash(password),
    emoji:     selectedEmoji,
    joinedAt:  new Date().toISOString(),
  };

  users[username] = user;
  saveUsers(users);
  saveCurrentUser({ username, emoji: selectedEmoji, joinedAt: user.joinedAt });

  updateHeaderUser();
  updateProfileCard();
  showToast('✨', `ยินดีต้อนรับ ${username}!`, 'success');
  clearAuthFields();
}

function loginUser() {
  const username = (document.getElementById('loginUsername')?.value || '').trim();
  const password = (document.getElementById('loginPassword')?.value || '').trim();

  if (!username || !password) {
    showToast('⚠️', 'ใส่ชื่อและรหัสผ่านด้วยนะ', 'warning');
    return;
  }

  const users = getUsers();
  const user  = users[username];

  if (!user || user.password !== simpleHash(password)) {
    showToast('⚠️', 'ชื่อหรือรหัสผ่านไม่ถูกต้องนะ', 'error');
    shakeElement('loginPassword');
    return;
  }

  saveCurrentUser({ username, emoji: user.emoji, joinedAt: user.joinedAt });
  updateHeaderUser();
  updateProfileCard();
  showToast('🌿', `สวัสดี ${username}! กลับมาแล้วนะ`, 'success');
  clearAuthFields();
}

function logoutUser() {
  saveCurrentUser(null);
  updateHeaderUser();
  updateProfileCard();
  showToast('👋', 'แล้วเจอกันใหม่นะ!', 'success');
  showSection('gallery');
}

function switchAuthTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');

  if (tab === 'login') {
    loginForm?.style.removeProperty('display');
    if (registerForm) registerForm.style.display = 'none';
    tabLogin?.classList.add('active');
    tabRegister?.classList.remove('active');
  } else {
    if (loginForm) loginForm.style.display = 'none';
    registerForm?.style.removeProperty('display');
    tabLogin?.classList.remove('active');
    tabRegister?.classList.add('active');
  }
}

function clearAuthFields() {
  ['loginUsername','loginPassword','regUsername','regPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function updateHeaderUser() {
  const avatar = document.getElementById('headerAvatar');
  const name   = document.getElementById('headerName');
  if (currentUser) {
    if (avatar) avatar.textContent = currentUser.emoji || '🌿';
    if (name)   name.textContent   = currentUser.username;
  } else {
    if (avatar) avatar.textContent = '?';
    if (name)   name.textContent   = 'ยังไม่ได้ล็อกอิน';
  }
}

function updateProfileCard() {
  const authCard    = document.getElementById('authCard');
  const profileCard = document.getElementById('profileCard');

  if (!currentUser) {
    if (authCard)    authCard.style.display    = 'block';
    if (profileCard) profileCard.style.display = 'none';
    return;
  }

  if (authCard)    authCard.style.display    = 'none';
  if (profileCard) profileCard.style.display = 'block';

  setText('profileAvatarBig', currentUser.emoji || '🌿');
  setText('profileUsername',  currentUser.username);

  const joinedDate = currentUser.joinedAt
    ? `เข้าร่วมเมื่อ ${formatDisplayDate(currentUser.joinedAt)}`
    : 'เพิ่งเข้าร่วม';
  setText('profileJoined', joinedDate);

  const myPosts   = allPosts.filter(p => p.authorUsername === currentUser.username);
  const myPublic  = myPosts.filter(p => p.visibility === 'public');
  const myPrivate = myPosts.filter(p => p.visibility === 'private');

  setText('myPostCount',   myPosts.length);
  setText('myPublicCount', myPublic.length);
  setText('myPrivateCount',myPrivate.length);

  renderMyPosts(myPosts);
}

function renderMyPosts(posts) {
  const grid = document.getElementById('myPostsGrid');
  if (!grid) return;

  if (posts.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted); font-size:14px; grid-column:1/-1;">ยังไม่มีรูปเลย อัพขึ้นมาเลยนะ! 📸</p>`;
    return;
  }

  const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  grid.innerHTML = sorted.slice(0, 12).map(post => buildCardHTML(post, 0)).join('');
}


/* ===== FORM HELPERS ===== */

function toggleMood(btn) {
  const mood = btn.dataset.mood;
  btn.classList.toggle('selected');

  if (btn.classList.contains('selected')) {
    if (!selectedMoods.includes(mood)) selectedMoods.push(mood);
  } else {
    selectedMoods = selectedMoods.filter(m => m !== mood);
  }
}

function setVisibility(vis) {
  selectedVisibility = vis;
  document.getElementById('visBtnPublic')?.classList.toggle('active', vis === 'public');
  document.getElementById('visBtnPrivate')?.classList.toggle('active', vis === 'private');
}

function selectEmoji(span) {
  document.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
  span.classList.add('selected');
  selectedEmoji = span.textContent;
}

function updateMessageCount() {
  const ta  = document.getElementById('postMessage');
  const cnt = document.getElementById('messageCount');
  if (ta && cnt) cnt.textContent = `${ta.value.length}/300`;
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'personName') {
    const cnt = document.getElementById('nameCount');
    if (cnt) cnt.textContent = `${e.target.value.length}/50`;
  }
});

function initDateField() {
  const dateInput = document.getElementById('postDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
}


/* ===== MODALS ===== */

function closeLoginPrompt() {
  document.getElementById('loginPrompt').style.display = 'none';
}

function goToProfile() {
  closeLoginPrompt();
  showSection('profile');
}


/* ===== CURSOR ===== */

function initCursor() {
  const dot  = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if (!dot || !ring) return;

  let mouseX = 0, mouseY = 0;
  let ringX  = 0, ringY  = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = `${mouseX}px`;
    dot.style.top  = `${mouseY}px`;
  });

  function animateRing() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    ring.style.left = `${ringX}px`;
    ring.style.top  = `${ringY}px`;
    requestAnimationFrame(animateRing);
  }
  animateRing();

  const hoverables = 'button, a, input, textarea, .photo-card, .emoji-option, .mood-tag';
  document.addEventListener('mouseover', (e) => {
    if (e.target.matches(hoverables) || e.target.closest(hoverables)) {
      dot.classList.add('hovering');
      ring.classList.add('hovering');
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.matches(hoverables) || e.target.closest(hoverables)) {
      dot.classList.remove('hovering');
      ring.classList.remove('hovering');
    }
  });
}


/* ===== SCROLL HEADER ===== */

function initScrollHeader() {
  const header = document.getElementById('mainHeader');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}


/* ===== TOAST NOTIFICATIONS ===== */

function showToast(icon, message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('exiting');
    setTimeout(() => toast.remove(), 380);
  }, 3200);
}


/* ===== FLOATING HEARTS ===== */

function spawnFloatingHearts() {
  const emojis = ['💚', '🌿', '✨', '💌', '🌸', '🍃'];
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'floating-heart';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.style.left = `${30 + Math.random() * 40}vw`;
      el.style.bottom = `${20 + Math.random() * 30}vh`;
      el.style.fontSize = `${14 + Math.random() * 16}px`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    }, i * 100);
  }
}


/* ===== SHAKE ANIMATION ===== */

function shakeElement(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'none';
  requestAnimationFrame(() => {
    el.style.animation = 'shake 0.5s ease';
  });
}

const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%      { transform: translateX(-6px); }
    40%      { transform: translateX(6px); }
    60%      { transform: translateX(-4px); }
    80%      { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);


/* ===== UTILITIES ===== */

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/['"<>&]/g, c => ({'\'':'&#039;','"':'&quot;','<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setAttr(id, attr, val) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, val);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', {
      year:  'numeric',
      month: 'short',
      day:   'numeric',
    });
  } catch { return dateStr; }
}


/* ===== KEYBOARD SHORTCUTS ===== */

document.addEventListener('keydown', (e) => {
  if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.key === 'g' || e.key === 'G') showSection('gallery');
  if (e.key === 'u' || e.key === 'U') showSection('upload');
  if (e.key === 'p' || e.key === 'P') showSection('profile');
});


/* ===== INTERSECTION OBSERVER for lazy card animation ===== */

function initCardObserver() {
  if (!window.IntersectionObserver) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0) scale(1)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.photo-card').forEach(card => observer.observe(card));
}

// Re-run observer after each render
const _originalRenderGallery = renderGallery;
window.renderGallery = function() {
  _originalRenderGallery();
  requestAnimationFrame(initCardObserver);
};


/* ===== WINDOW FOCUS — sync posts from other tabs ===== */

window.addEventListener('focus', () => {
  loadState();
  renderGallery();
  updateHeaderUser();
});


/* ===== PREVENT CONTEXT MENU on images (optional) ===== */
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
