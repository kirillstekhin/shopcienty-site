
// Минимальная корзина на localStorage. Без чекаута.
const CART_KEY = 'shopcienty-cart-v1';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch { return {}; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateBadge();
}
function totalItems() {
  return Object.values(getCart()).reduce((a, b) => a + b, 0);
}
function updateBadge() {
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = totalItems();
  });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.add-to-cart');
  if (!btn) return;
  const sku = btn.dataset.sku;
  if (!sku) return;
  const cart = getCart();
  cart[sku] = (cart[sku] || 0) + 1;
  saveCart(cart);
  const original = btn.innerHTML;
  btn.innerHTML = 'Added&nbsp;to&nbsp;basket &nbsp;✓';
  btn.classList.add('added');
  setTimeout(() => {
    btn.innerHTML = original;
    btn.classList.remove('added');
  }, 1600);
});

async function renderCartPage() {
  const wrap = document.getElementById('cart-items');
  const summary = document.getElementById('cart-summary');
  const empty = document.getElementById('cart-empty');
  if (!wrap) return;
  const cart = getCart();
  const skus = Object.keys(cart);
  if (skus.length === 0) return;

  let products = [];
  try {
    const resp = await fetch('./products.json');
    products = await resp.json();
  } catch (e) {
    console.error('products.json fetch failed', e);
    return;
  }
  const bySku = Object.fromEntries(products.map(p => [p.sku, p]));

  empty.hidden = true;
  wrap.hidden = false;
  summary.hidden = false;

  let totalQty = 0, totalPrice = 0;
  wrap.innerHTML = skus.map(sku => {
    const p = bySku[sku];
    if (!p) return '';
    const qty = cart[sku];
    totalQty += qty;
    totalPrice += qty * p.price;
    const img = p.image_url
      ? '<img src="' + p.image_url + '" alt="">'
      : '<div class="placeholder">No image</div>';
    return `
      <div class="cart-item">
        ${img}
        <div class="item-title">${escapeHtml(p.title.slice(0, 90))}</div>
        <div class="item-price">£${(p.price * qty).toFixed(2)} <small>×${qty}</small></div>
        <button class="item-remove" data-sku="${sku}" aria-label="Remove">×</button>
      </div>`;
  }).join('');

  document.getElementById('cart-total-qty').textContent = totalQty;
  document.getElementById('cart-total-price').textContent = '£' + totalPrice.toFixed(2);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.item-remove');
  if (!btn) return;
  const cart = getCart();
  delete cart[btn.dataset.sku];
  saveCart(cart);
  location.reload();
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

// Department filter (index page)
function applyDeptFilter(dept) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const cards = grid.querySelectorAll('.card');
  let visible = 0;
  cards.forEach(card => {
    const match = dept === 'all' || card.dataset.department === dept;
    card.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  document.querySelectorAll('.dept-tab').forEach(tab => {
    const isActive = tab.dataset.dept === dept;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  grid.style.display = visible === 0 ? 'none' : '';

  // Update URL hash without scrolling
  if (dept === 'all') {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } else {
    history.replaceState(null, '', '#' + dept);
  }
}

document.addEventListener('click', e => {
  const tab = e.target.closest('.dept-tab');
  if (tab) { applyDeptFilter(tab.dataset.dept); return; }
  const catCard = e.target.closest('.cat-card');
  if (catCard && catCard.dataset.dept) {
    e.preventDefault();
    applyDeptFilter(catCard.dataset.dept);
    const shop = document.getElementById('shop');
    if (shop) shop.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// Rotating-word hero animation (vanilla, inspired by text-rotate)
function initTextRotate() {
  const nodes = document.querySelectorAll('.rotate-word');
  if (!nodes.length) return;

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

  function lockWidth(el, words) {
    const measurer = document.createElement('span');
    const cs = getComputedStyle(el);
    Object.assign(measurer.style, {
      position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap',
      fontFamily: cs.fontFamily, fontSize: cs.fontSize,
      fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
      letterSpacing: cs.letterSpacing, top: '-9999px', left: '-9999px'
    });
    document.body.appendChild(measurer);
    let maxWidth = 0;
    words.forEach(w => {
      measurer.textContent = w;
      if (measurer.offsetWidth > maxWidth) maxWidth = measurer.offsetWidth;
    });
    document.body.removeChild(measurer);
    const emPx = parseFloat(cs.fontSize) || 16;
    el.style.minWidth = (maxWidth + emPx * 0.7 + 4) + 'px';
  }

  nodes.forEach(el => {
    let words;
    try { words = JSON.parse(el.dataset.words || '[]'); }
    catch (e) { return; }
    if (!Array.isArray(words) || words.length === 0) return;

    // Already initialised — just recalibrate width (e.g. after webfonts loaded)
    if (el.dataset.rotateInit === '1') { lockWidth(el, words); return; }
    el.dataset.rotateInit = '1';

    const interval = parseInt(el.dataset.interval || '2600', 10);
    const stagger  = parseFloat(el.dataset.stagger || '25');
    const from     = el.dataset.staggerFrom || 'last';

    lockWidth(el, words);

    function delayFor(i, total) {
      if (from === 'last')   return (total - 1 - i) * stagger;
      if (from === 'center') return Math.abs(Math.floor(total / 2) - i) * stagger;
      return i * stagger;
    }

    function buildHtml(word, stateClass) {
      const chars = Array.from(word);
      const total = chars.length;
      const spans = chars.map((c, i) => {
        const d = delayFor(i, total);
        const safe = c === ' ' ? '&nbsp;' : escapeHtml(c);
        const cls = stateClass ? ('rw-char ' + stateClass) : 'rw-char';
        return '<span class="' + cls + '" style="transition-delay:' + d + 'ms">' + safe + '</span>';
      }).join('');
      return '<span class="rw-chars">' + spans + '</span>';
    }

    // Initial: use server-rendered word if present, otherwise build it
    let idx = 0;
    if (!el.querySelector('.rw-char')) {
      el.innerHTML = buildHtml(words[0], '');
    } else {
      // Find which word the server rendered, in case it's not words[0]
      const serverText = Array.from(el.querySelectorAll('.rw-char'))
        .map(c => c.textContent).join('');
      const found = words.indexOf(serverText);
      if (found >= 0) idx = found;
    }
    function rotate() {
      idx = (idx + 1) % words.length;
      const current = el.querySelectorAll('.rw-char');
      current.forEach(c => c.classList.add('out'));
      const total = current.length;
      const outDuration = 550 + (total > 0 ? (total - 1) * stagger : 0) + 80;

      setTimeout(function () {
        el.innerHTML = buildHtml(words[idx], 'in');
        // Force layout then drop "in" on next tick so transition runs
        void el.offsetHeight;
        setTimeout(function () {
          el.querySelectorAll('.rw-char.in').forEach(c => c.classList.remove('in'));
        }, 40);
      }, outDuration);
    }

    setInterval(rotate, interval);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateBadge();
  if (document.getElementById('cart-empty')) {
    renderCartPage();
  }
  // Restore filter from hash on load (e.g. /#beauty)
  if (document.getElementById('product-grid')) {
    const hash = (location.hash || '').replace('#', '');
    if (['beauty', 'grocery', 'household'].includes(hash)) {
      applyDeptFilter(hash);
    }
  }
  // Rotating word: run immediately, rerun after fonts settle to fix width
  try { initTextRotate(); } catch (e) { console.error('rotate init', e); }
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(() => {
      try { initTextRotate(); } catch (e) {}
    });
  }
});
