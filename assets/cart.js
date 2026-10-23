
// Корзина shopcienty.com (23.10.2026). Хранится в localStorage: {ключ: количество}, ключ = SKU или GIFTSET-<slug>.
// Оплата: POST на Worker (data-endpoint на #basket) → Stripe Checkout Session → переход на страницу Stripe.
// Цену выбирает сервер по своей таблице — в запросе только ключи и количества.
const CART_KEY = 'shopcienty-basket-v2';
const MAX_QTY = 10;

function getCart() {
  try {
    const c = JSON.parse(localStorage.getItem(CART_KEY)) || {};
    return (c && typeof c === 'object' && !Array.isArray(c)) ? c : {};
  } catch (e) { return {}; }
}
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  updateBadge();
}
function totalItems() {
  return Object.values(getCart()).reduce((a, b) => a + (Number(b) || 0), 0);
}
function updateBadge() {
  const n = totalItems();
  document.querySelectorAll('.cart-badge').forEach(el => { el.textContent = n; });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function money(v) { return '£' + (Math.round(v * 100) / 100).toFixed(2); }

function siteRoot() {
  // ссылка на корзину в шапке всегда ведёт в корень сайта: ./cart.html или ../cart.html
  const a = document.querySelector('a.cart-link');
  return a ? a.getAttribute('href').replace(/cart\.html$/, '') : './';
}

function toast(html) {
  let t = document.getElementById('basket-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'basket-toast';
    t.className = 'basket-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 4200);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.add-to-cart');
  if (!btn) return;
  const sku = btn.dataset.sku;
  if (!sku) return;
  const cart = getCart();
  cart[sku] = Math.min(MAX_QTY, (Number(cart[sku]) || 0) + 1);
  saveCart(cart);
  const original = btn.innerHTML;
  btn.innerHTML = 'Added&nbsp;to&nbsp;basket &nbsp;✓';
  btn.classList.add('added');
  setTimeout(() => { btn.innerHTML = original; btn.classList.remove('added'); }, 1600);
  const n = totalItems();
  toast('Added to your basket &middot; ' + n + (n === 1 ? ' item' : ' items') +
        ' &nbsp;<a href="' + siteRoot() + 'cart.html">View basket&nbsp;→</a>');
});

// ── Страница корзины ───────────────────────────────────────
let CATALOG = null;
async function loadCatalog() {
  if (CATALOG) return CATALOG;
  const resp = await fetch('./catalog.json', { cache: 'no-cache' });
  if (!resp.ok) throw new Error('catalog ' + resp.status);
  const list = await resp.json();
  CATALOG = Object.fromEntries(list.map(p => [p.key, p]));
  return CATALOG;
}

function cartLines(cat) {
  const cart = getCart();
  const lines = [], gone = [];
  for (const [key, q] of Object.entries(cart)) {
    const p = cat[key];
    const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(q) || 0)));
    if (!p || !p.in_stock) { gone.push(key); continue; }
    lines.push({ key, qty, p });
  }
  if (gone.length) {
    gone.forEach(k => delete cart[k]);
    saveCart(cart);
  }
  return { lines, gone };
}

function notice(msg) {
  const n = document.getElementById('cart-notice');
  if (!n) return;
  n.innerHTML = msg || '';
  n.hidden = !msg;
}

async function renderCartPage() {
  const root = document.getElementById('basket');
  if (!root) return;
  const wrap = document.getElementById('cart-items');
  const summary = document.getElementById('cart-summary');
  const empty = document.getElementById('cart-empty');
  let cat;
  try { cat = await loadCatalog(); }
  catch (e) {
    notice('We could not load the basket just now. Please refresh the page.');
    return;
  }
  const { lines, gone } = cartLines(cat);
  if (gone.length) notice('Some items are no longer available and were removed from your basket.');
  if (!lines.length) {
    empty.hidden = false; wrap.hidden = true; summary.hidden = true;
    return;
  }
  empty.hidden = true; wrap.hidden = false; summary.hidden = false;

  let qtyTotal = 0, sub = 0;
  wrap.innerHTML = lines.map(({ key, qty, p }) => {
    qtyTotal += qty; sub += qty * p.price;
    const img = p.img ? '<img src="' + escapeHtml(p.img) + '" alt="">' : '<div class="placeholder"></div>';
    return `
      <div class="cart-item" data-key="${escapeHtml(key)}">
        <a class="item-thumb" href="${escapeHtml(p.url)}">${img}</a>
        <div class="item-main">
          <a class="item-title" href="${escapeHtml(p.url)}">${escapeHtml(p.name)}</a>
          <div class="item-unit">${money(p.price)} each</div>
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" class="qty-btn" data-act="dec" aria-label="One fewer">−</button>
            <span class="qty-n" aria-live="polite">${qty}</span>
            <button type="button" class="qty-btn" data-act="inc" aria-label="One more"${qty >= MAX_QTY ? ' disabled' : ''}>+</button>
          </div>
        </div>
        <div class="item-price">${money(p.price * qty)}</div>
        <button type="button" class="item-remove" aria-label="Remove ${escapeHtml(p.name)}">×</button>
      </div>`;
  }).join('');

  const DELIVERY = 3.49;
  document.getElementById('cart-total-qty').textContent = qtyTotal;
  document.getElementById('cart-subtotal').textContent = money(sub);
  document.getElementById('cart-total-price').textContent = money(sub + DELIVERY);
}

document.addEventListener('click', e => {
  const row = e.target.closest('.cart-item');
  if (!row || !document.getElementById('basket')) return;
  const key = row.dataset.key;
  const cart = getCart();
  if (e.target.closest('.item-remove')) {
    delete cart[key];
  } else {
    const b = e.target.closest('.qty-btn');
    if (!b) return;
    const q = Number(cart[key]) || 1;
    if (b.dataset.act === 'inc') cart[key] = Math.min(MAX_QTY, q + 1);
    else if (q <= 1) delete cart[key];
    else cart[key] = q - 1;
  }
  saveCart(cart);
  renderCartPage();
});

// Попытка оплаты: один id на загрузку страницы. Worker склеивает его с составом корзины в ключ
// идемпотентности: двойной клик = та же сессия Stripe, изменённая корзина = новая.
const ATTEMPT = 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

async function checkout() {
  const root = document.getElementById('basket');
  const btn = document.getElementById('checkout-btn');
  const err = document.getElementById('cart-error');
  const endpoint = root && root.dataset.endpoint;
  if (!endpoint || !btn) return;
  err.hidden = true;
  let cat;
  try { cat = await loadCatalog(); } catch (e) { cat = null; }
  if (!cat) { err.textContent = 'We could not load the basket. Please refresh the page.'; err.hidden = false; return; }
  const { lines } = cartLines(cat);
  if (!lines.length) { renderCartPage(); return; }

  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Opening secure checkout…';
  const fail = (msg) => {
    btn.disabled = false;
    btn.innerHTML = label;
    err.innerHTML = msg;
    err.hidden = false;
  };
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempt: ATTEMPT, items: lines.map(l => ({ sku: l.key, qty: l.qty })) }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.url) { window.location.href = data.url; return; }
    if (resp.status === 409 && (data.error === 'price_changed' || data.error === 'unavailable')) {
      CATALOG = null;
      await renderCartPage();
      return fail('Something in your basket has changed since you added it. Please check the basket and press Checkout again.');
    }
    // Worker ещё не настроен/недоступен, а товар один — уходим по его ссылке Stripe (как раньше «Buy now»)
    if (lines.length === 1 && lines[0].p.link && (resp.status >= 500 || resp.status === 404)) {
      window.location.href = lines[0].p.link;
      return;
    }
    fail('We could not open the checkout just now. Please try again in a minute, or email ' +
         '<a href="mailto:admin@shopcienty.com">admin@shopcienty.com</a> and we will help.');
  } catch (e) {
    if (lines.length === 1 && lines[0].p.link) { window.location.href = lines[0].p.link; return; }
    fail('We could not reach the checkout. Please check your connection and try again.');
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('#checkout-btn')) { e.preventDefault(); checkout(); }
  const copy = e.target.closest('.contact-copy');
  if (copy) {
    const v = copy.dataset.copy || '';
    const done = () => { copy.textContent = 'Copied ✓'; setTimeout(() => { copy.textContent = 'Copy address'; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => {});
    else { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select();
           try { document.execCommand('copy'); done(); } catch (x) {} document.body.removeChild(t); }
  }
});

// Вернулись со Stripe «назад» (bfcache) — кнопка не должна остаться в «Opening…»
window.addEventListener('pageshow', () => {
  const btn = document.getElementById('checkout-btn');
  if (btn && btn.disabled) { btn.disabled = false; btn.innerHTML = 'Checkout&nbsp;securely &nbsp;→'; }
});

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
  if (document.getElementById('order-thanks')) {
    try { localStorage.removeItem(CART_KEY); } catch (e) {}
  }
  updateBadge();
  if (document.getElementById('basket')) {
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
