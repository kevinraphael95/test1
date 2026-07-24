(function(){

// ---------------------------------------------------------------
// Aucune liste interne : les personnalités viennent en direct de
// l'API "Éphéméride" (onthisday/births) de Wikipédia, pour une
// date aléatoire. Le nom de chaque personnalité est masqué dans
// son propre extrait pour ne pas trahir la réponse.
// ---------------------------------------------------------------
const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];
const PAIR_COUNT = 5;

let pairs = [];          // { id, title, thumb, clue }
let selectedLeft = null; // id
let selectedRight = null;// id
let matchedCount = 0;
let mistakes = 0;
let locked = false;      // true while showing a wrong-match flash

const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
}
let currentTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
applyTheme(currentTheme);
themeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
});

const statusEl = document.getElementById('status');
const loadingEl = document.getElementById('loading');
const boardWrapEl = document.getElementById('boardWrap');
const leftColEl = document.getElementById('leftCol');
const rightColEl = document.getElementById('rightCol');
const newGameBtn = document.getElementById('newGameBtn');
const resultBanner = document.getElementById('resultBanner');

function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomMonthDay(){
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * DAYS_IN_MONTH[month - 1]) + 1;
  return { mm: String(month).padStart(2, '0'), dd: String(day).padStart(2, '0') };
}

// Récupère les naissances "un jour comme aujourd'hui" pour une date au hasard.
async function fetchBirths(){
  const { mm, dd } = randomMonthDay();
  const res = await fetch(`https://fr.wikipedia.org/api/rest_v1/feed/onthisday/births/${mm}/${dd}`);
  if (!res.ok) throw new Error('bad response');
  const data = await res.json();
  return data.births || [];
}

// Retire toute occurrence du nom (et de ses mots pris isolément s'ils font
// plus de 3 lettres) de l'extrait, pour ne pas trahir la réponse.
function maskName(extract, fullName){
  if (!extract || !fullName) return extract || '';
  let masked = extract;
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  masked = masked.replace(new RegExp(escape(fullName), 'gi'), 'Cette personnalité');
  fullName.split(/\s+/).forEach(part => {
    if (part.length > 3){
      masked = masked.replace(new RegExp(`\\b${escape(part)}\\b`, 'gi'), 'Cette personnalité');
    }
  });
  masked = masked.replace(/(Cette personnalité[,\s]*){2,}/gi, 'Cette personnalité ');
  masked = masked.replace(/\s{2,}/g, ' ').trim();
  if (!/^Cette personnalité/i.test(masked)) masked = 'Cette personnalité ' + masked.charAt(0).toLowerCase() + masked.slice(1);
  return masked;
}

function selectPairs(births){
  const usable = shuffle(births).filter(b =>
    b.pages && b.pages[0] && b.pages[0].thumbnail && b.pages[0].extract && b.pages[0].extract.length > 50
  );
  const chosen = [];
  const usedTitles = new Set();
  for (const b of usable){
    if (chosen.length >= PAIR_COUNT) break;
    const page = b.pages[0];
    if (usedTitles.has(page.title)) continue;
    usedTitles.add(page.title);
    const clue = maskName(page.extract.split('. ').slice(0, 2).join('. '), page.title);
    chosen.push({
      id: page.title + '-' + Date.now() + '-' + chosen.length,
      title: page.title,
      year: b.year,
      thumb: page.thumbnail.source,
      clue,
    });
  }
  return chosen;
}

async function pickPairsFromApi(){
  for (let attempt = 0; attempt < 8; attempt++){
    try {
      const births = await fetchBirths();
      const chosen = selectPairs(births);
      if (chosen.length >= PAIR_COUNT) return chosen;
    } catch (e) { /* on retente avec une autre date */ }
  }
  return [];
}

function formatYear(y){
  if (y == null) return '';
  return y < 0 ? `${Math.abs(y)} av. J.-C.` : `${y}`;
}

function render(){
  leftColEl.innerHTML = '';
  rightColEl.innerHTML = '';

  const leftOrder = shuffle(pairs);
  const rightOrder = shuffle(pairs);

  leftOrder.forEach(item => {
    const card = document.createElement('div');
    card.className = 'portrait-card';
    card.dataset.id = item.id;

    const thumb = document.createElement('div');
    thumb.className = 'portrait-thumb';
    const img = document.createElement('img');
    img.src = item.thumb;
    img.alt = '';
    thumb.appendChild(img);

    const reveal = document.createElement('div');
    reveal.className = 'portrait-reveal';
    reveal.textContent = `${item.title}${item.year != null ? ' · ' + formatYear(item.year) : ''}`;

    card.appendChild(thumb);
    card.appendChild(reveal);
    card.addEventListener('click', () => onPick('left', item.id, card));
    leftColEl.appendChild(card);
  });

  rightOrder.forEach(item => {
    const card = document.createElement('div');
    card.className = 'clue-card';
    card.dataset.id = item.id;

    const text = document.createElement('div');
    text.className = 'clue-text';
    text.textContent = item.clue;

    card.appendChild(text);
    card.addEventListener('click', () => onPick('right', item.id, card));
    rightColEl.appendChild(card);
  });
}

function clearSelectionClasses(){
  document.querySelectorAll('.portrait-card.selected, .clue-card.selected').forEach(el => el.classList.remove('selected'));
}

function onPick(side, id, cardEl){
  if (locked) return;
  if (cardEl.classList.contains('matched')) return;

  if (side === 'left'){
    if (selectedLeft === id){ selectedLeft = null; cardEl.classList.remove('selected'); return; }
    document.querySelectorAll('.portrait-card.selected').forEach(el => el.classList.remove('selected'));
    selectedLeft = id;
    cardEl.classList.add('selected');
  } else {
    if (selectedRight === id){ selectedRight = null; cardEl.classList.remove('selected'); return; }
    document.querySelectorAll('.clue-card.selected').forEach(el => el.classList.remove('selected'));
    selectedRight = id;
    cardEl.classList.add('selected');
  }

  if (selectedLeft && selectedRight){
    evaluatePair();
  }
}

function evaluatePair(){
  const leftEl = document.querySelector(`.portrait-card[data-id="${cssEscape(selectedLeft)}"]`);
  const rightEl = document.querySelector(`.clue-card[data-id="${cssEscape(selectedRight)}"]`);

  if (selectedLeft === selectedRight){
    leftEl.classList.remove('selected');
    rightEl.classList.remove('selected');
    leftEl.classList.add('matched');
    rightEl.classList.add('matched');
    matchedCount++;
    selectedLeft = null;
    selectedRight = null;
    statusEl.textContent = `${matchedCount} / ${pairs.length} associations trouvées`;
    if (matchedCount === pairs.length){
      resultBanner.className = 'result-banner show win';
      resultBanner.textContent = mistakes === 0
        ? '✓ Sans faute ! Toutes les personnalités reconnues.'
        : `✓ Terminé — ${mistakes} erreur${mistakes > 1 ? 's' : ''} en cours de route.`;
    }
  } else {
    locked = true;
    mistakes++;
    leftEl.classList.add('wrong');
    rightEl.classList.add('wrong');
    setTimeout(() => {
      leftEl.classList.remove('selected', 'wrong');
      rightEl.classList.remove('selected', 'wrong');
      selectedLeft = null;
      selectedRight = null;
      locked = false;
    }, 550);
  }
}

function cssEscape(s){
  return s.replace(/["\\]/g, '\\$&');
}

async function newGame(){
  matchedCount = 0;
  mistakes = 0;
  selectedLeft = null;
  selectedRight = null;
  locked = false;
  resultBanner.className = 'result-banner';
  loadingEl.style.display = 'block';
  boardWrapEl.style.display = 'none';
  newGameBtn.disabled = true;
  statusEl.textContent = 'Chargement…';

  pairs = await pickPairsFromApi();

  if (pairs.length < PAIR_COUNT){
    loadingEl.style.display = 'none';
    newGameBtn.disabled = false;
    statusEl.textContent = 'Erreur de chargement — réessaie.';
    return;
  }

  render();

  loadingEl.style.display = 'none';
  boardWrapEl.style.display = 'grid';
  newGameBtn.disabled = false;
  statusEl.textContent = `0 / ${pairs.length} associations trouvées`;
}

newGameBtn.addEventListener('click', newGame);

newGame();

})();
