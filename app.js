/* ─── State ──────────────────────────────────────────────── */
let allRecipes   = [];
let categories   = [];
let activeFilter = 'all';
let currentRecipe  = null;
let currentPortions = 0;

/* ─── Fraction formatting ─────────────────────────────────── */
const FRACTIONS = [
  [1/8,  '⅛'], [1/4,  '¼'], [1/3,  '⅓'], [3/8, '⅜'],
  [1/2,  '½'], [5/8,  '⅝'], [2/3,  '⅔'], [3/4, '¾'], [7/8, '⅞'],
];

function formatQty(raw) {
  if (raw === null || raw === undefined) return '';
  const num = Math.round(raw * 1000) / 1000;
  if (num === 0) return '0';

  const whole = Math.floor(num);
  const frac  = num - whole;

  let fracStr = '';
  for (const [val, sym] of FRACTIONS) {
    if (Math.abs(frac - val) < 0.04) { fracStr = sym; break; }
  }

  if (fracStr) return whole > 0 ? `${whole} ${fracStr}` : fracStr;
  if (frac < 0.04) return whole.toString();

  // Large numbers: no decimal
  if (num >= 10) return Math.round(num).toString();

  // 1 decimal if needed
  const dec = Math.round(num * 10) / 10;
  return dec % 1 === 0 ? dec.toString() : dec.toFixed(1);
}

/* ─── DOM helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/* ─── Load data ───────────────────────────────────────────── */
async function init() {
  const res  = await fetch('recettes.json');
  const data = await res.json();
  categories = data.categories;
  allRecipes = data.recettes;

  buildFilters();
  render();
  handleHash();
}

/* ─── Filters ─────────────────────────────────────────────── */
function buildFilters() {
  const wrap = $('filters');
  categories.forEach(cat => {
    const btn = el('button', 'filter-btn');
    btn.dataset.cat = cat.id;
    btn.textContent = `${cat.emoji} ${cat.nom}`;
    btn.addEventListener('click', () => setFilter(cat.id));
    wrap.appendChild(btn);
  });

  wrap.querySelector('[data-cat="all"]').addEventListener('click', () => setFilter('all'));
}

function setFilter(catId) {
  activeFilter = catId;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === catId);
  });
  render();
}

/* ─── Search ──────────────────────────────────────────────── */
$('search').addEventListener('input', render);

/* ─── Render grid ─────────────────────────────────────────── */
function render() {
  const query = $('search').value.trim().toLowerCase();

  const visible = allRecipes.filter(r => {
    const matchCat  = activeFilter === 'all' || r.categorie === activeFilter;
    const matchText = !query ||
      r.nom.toLowerCase().includes(query) ||
      r.ingredients.some(i => i.nom.toLowerCase().includes(query));
    return matchCat && matchText;
  });

  const grid = $('recipe-grid');
  grid.innerHTML = '';

  $('empty-state').hidden = visible.length > 0;

  visible.forEach(recipe => {
    const cat = categories.find(c => c.id === recipe.categorie);
    const card = el('li', 'recipe-card');
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', recipe.nom);

    card.innerHTML = `
      <span class="card-emoji">${cat ? cat.emoji : '🍴'}</span>
      <span class="card-cat">${cat ? cat.nom : recipe.categorie}</span>
      <span class="card-name">${recipe.nom}</span>
      <span class="card-meta">${recipe.portions} ${recipe.portions_label}</span>
    `;

    card.addEventListener('click',   () => openModal(recipe));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openModal(recipe); });

    grid.appendChild(card);
  });
}

/* ─── Modal ───────────────────────────────────────────────── */
function openModal(recipe) {
  currentRecipe   = recipe;
  currentPortions = recipe.portions;

  const cat = categories.find(c => c.id === recipe.categorie);

  $('modal-cat').textContent   = cat ? `${cat.emoji} ${cat.nom}` : recipe.categorie;
  $('modal-title').textContent = recipe.nom;

  // Note
  const noteEl = $('modal-note');
  if (recipe.note) {
    noteEl.textContent = recipe.note;
    noteEl.hidden = false;
  } else {
    noteEl.hidden = true;
  }

  // Meta (temps, rendement)
  const metaEl = $('modal-meta');
  metaEl.innerHTML = '';
  if (recipe.temps_prep) {
    const m = el('div', 'meta-item');
    m.innerHTML = `<span>Préparation</span><span>${recipe.temps_prep}</span>`;
    metaEl.appendChild(m);
  }
  if (recipe.temps_cuisson) {
    const m = el('div', 'meta-item');
    m.innerHTML = `<span>Cuisson</span><span>${recipe.temps_cuisson}</span>`;
    metaEl.appendChild(m);
  }

  renderPortions();
  renderIngredients();
  renderSteps();

  const overlay = $('modal-overlay');
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // URL hash for bookmarking
  history.pushState(null, '', `#${recipe.id}`);

  // Focus close button for accessibility
  setTimeout(() => $('modal-close').focus(), 50);
}

function closeModal() {
  $('modal-overlay').hidden = true;
  $('modal-overlay').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentRecipe = null;
  history.pushState(null, '', window.location.pathname);
}

function renderPortions() {
  $('portions-count').textContent = `${currentPortions} ${currentRecipe.portions_label}`;
  $('portions-minus').disabled = currentPortions <= 1;
}

function renderIngredients() {
  const multiplier = currentPortions / currentRecipe.portions;
  const list = $('ingredient-list');
  list.innerHTML = '';

  currentRecipe.ingredients.forEach(ing => {
    const li = el('li', 'ingredient-item');

    const qty = ing.quantite !== null
      ? `${formatQty(ing.quantite * multiplier)} ${ing.unite}`.trim()
      : '';

    li.innerHTML = `
      <span class="ingredient-qty">${qty || '—'}</span>
      <span>
        <span class="ingredient-name">${ing.nom}</span>
        ${ing.note ? `<span class="ingredient-note"> (${ing.note})</span>` : ''}
      </span>
    `;
    list.appendChild(li);
  });
}

function renderSteps() {
  const list = $('step-list');
  list.innerHTML = '';
  currentRecipe.preparation.forEach(step => {
    const li = el('li', 'step-item');
    li.textContent = step;
    list.appendChild(li);
  });
}

/* ─── Portions buttons ────────────────────────────────────── */
$('portions-plus').addEventListener('click', () => {
  currentPortions++;
  renderPortions();
  renderIngredients();
});

$('portions-minus').addEventListener('click', () => {
  if (currentPortions > 1) {
    currentPortions--;
    renderPortions();
    renderIngredients();
  }
});

/* ─── Close modal ─────────────────────────────────────────── */
$('modal-close').addEventListener('click', closeModal);

$('modal-overlay').addEventListener('click', e => {
  if (e.target === $('modal-overlay')) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal-overlay').hidden) closeModal();
});

/* ─── Hash routing ────────────────────────────────────────── */
function handleHash() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const recipe = allRecipes.find(r => r.id === hash);
    if (recipe) openModal(recipe);
  }
}

window.addEventListener('popstate', () => {
  if (!window.location.hash && !$('modal-overlay').hidden) {
    $('modal-overlay').hidden = true;
    $('modal-overlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    currentRecipe = null;
  }
});

/* ─── Start ───────────────────────────────────────────────── */
init();
