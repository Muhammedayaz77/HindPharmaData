import { LocalFirstProductDataSource } from './dataSource.js';
import { ProductViewModel } from './productViewModel.js';
import { TempSessionService } from '../temp/temp_file_sessionService.js?v=20260830-7';

const session = TempSessionService.requireLogin();
if (!session) throw new Error('Login required.');
const medical = localStorage.getItem('hindPharmaMedical');
if (!medical) location.replace('medical.html');

const DEFAULT_IMAGE = '../Assets/Images/hind-pharma-default.svg';
const UNITS = ['PIECE', 'BOX', 'CASE', 'STRIP', 'PACK', 'BOTTLE', 'TUBE', 'VIAL', 'OTHER'];
const RENDER_BATCH_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 180;

const dataSource = new LocalFirstProductDataSource('../data/products.json');
const viewModel = new ProductViewModel(dataSource);
let filtered = [];
let renderedCount = 0;
let selected = null;
let manualMode = false;

let order;
try {
  const savedOrder = JSON.parse(localStorage.getItem('hindPharmaOrder') || '[]');
  order = Array.isArray(savedOrder) ? savedOrder.map(item => {
    const unit = UNITS.includes(item.unit) ? item.unit : 'PIECE';
    const key = item.key && item.key.includes(`:${unit}`)
      ? item.key
      : `${item.key || `product:${item.productId || item.name || 'item'}`}:${unit}`;
    return { ...item, unit, key };
  }) : [];
} catch {
  order = [];
}

const grid = document.getElementById('grid');
const search = document.getElementById('search');
const count = document.getElementById('count');
const modal = document.getElementById('modal');
const qty = document.getElementById('qty');
const unit = document.getElementById('unit');
const manualName = document.getElementById('manualName');
const modalTitle = document.getElementById('modalTitle');
const modalInfo = document.getElementById('modalInfo');
const addButton = document.getElementById('add');
const cartButton = document.getElementById('cartBtn');

const esc = value => String(value ?? '').replace(/[&<>\\'\"]/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '\"': '&quot;'
}[char]));

function updateCart() {
  cartButton.textContent = `Order (${order.length})`;
}

function updateAddButton() {
  const quantity = parseInt(qty.value, 10);
  const canAdd = Number.isFinite(quantity) && quantity > 0;
  addButton.disabled = !canAdd;
  addButton.setAttribute('aria-disabled', String(!canAdd));
}

function productCard(product, index) {
  return `
    <button class="card" type="button" data-index="${index}" aria-label="Select ${esc(product.name || 'product')}">
      <img class="productImage" src="${esc(product.image || DEFAULT_IMAGE)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE}'">
      <span class="productInfo">
        <span class="name">${esc(product.name || 'Unnamed Product')}</span>
        ${product.company ? `<span class="company">${esc(product.company)}</span>` : ''}
        ${product.formula ? `<span class="formula">${esc(product.formula)}</span>` : ''}
        ${product.mrp != null && product.mrp !== '' ? `<span class="mrp">MRP: ₹${esc(product.mrp)}</span>` : ''}
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`;
}

function render(reset = true) {
  if (reset) {
    renderedCount = 0;
    grid.innerHTML = '';
  }

  const end = Math.min(renderedCount + RENDER_BATCH_SIZE, filtered.length);
  if (end > renderedCount) {
    const html = filtered.slice(renderedCount, end)
      .map((product, offset) => productCard(product, renderedCount + offset))
      .join('');
    grid.insertAdjacentHTML('beforeend', html);
    renderedCount = end;
  }

  let loadMore = document.getElementById('loadMoreProducts');
  if (renderedCount < filtered.length) {
    if (!loadMore) {
      loadMore = document.createElement('button');
      loadMore.id = 'loadMoreProducts';
      loadMore.type = 'button';
      loadMore.className = 'manual';
      loadMore.textContent = 'LOAD MORE PRODUCTS';
      loadMore.addEventListener('click', () => render(false));
    }
    grid.appendChild(loadMore);
  } else if (loadMore) {
    loadMore.remove();
  }

  if (filtered.length === 0) {
    grid.insertAdjacentHTML('beforeend', '<div class="empty">No matching products found.</div>');
  }

  const manualCard = document.createElement('div');
  manualCard.id = 'manualCard';
  manualCard.className = 'manual';
  manualCard.innerHTML = '<strong>Product not found?</strong><p>You can temporarily add a product that is not in the catalogue.</p><button id="manualAdd" type="button">ADD PRODUCT TEMPORARILY</button>';
  grid.appendChild(manualCard);
  manualCard.querySelector('#manualAdd').addEventListener('click', openManualProduct);

  count.textContent = `${filtered.length} product${filtered.length === 1 ? '' : 's'} found${renderedCount < filtered.length ? ` • showing first ${renderedCount}` : ''}`;
}

function openProduct(index) {
  selected = filtered[index];
  if (!selected) return;

  manualMode = false;
  modalTitle.textContent = selected.name || 'Product';
  modalInfo.textContent = [
    selected.company,
    selected.formula,
    selected.mrp != null ? `MRP ₹${selected.mrp}` : ''
  ].filter(Boolean).join(' • ');
  manualName.style.display = 'none';
  manualName.value = '';
  qty.value = 1;
  unit.value = 'PIECE';
  addButton.textContent = 'Add to Order';
  updateAddButton();
  modal.classList.add('show');
}

function openManualProduct() {
  manualMode = true;
  selected = null;
  modalTitle.textContent = 'Add Missing Product';
  modalInfo.textContent = 'This product will be added only to your current order. It will not be added to the catalogue.';
  manualName.style.display = 'block';
  manualName.value = search.value.trim();
  qty.value = 1;
  unit.value = 'PIECE';
  addButton.textContent = 'Add to Order';
  updateAddButton();
  modal.classList.add('show');
  setTimeout(() => manualName.focus(), 0);
}

grid.addEventListener('click', event => {
  const card = event.target.closest('.card');
  if (!card || !grid.contains(card)) return;
  openProduct(Number(card.dataset.index));
});

document.getElementById('minus').onclick = () => {
  qty.value = Math.max(0, (+qty.value || 0) - 1);
  updateAddButton();
};

document.getElementById('plus').onclick = () => {
  qty.value = Math.max(0, (+qty.value || 0)) + 1;
  updateAddButton();
};

qty.addEventListener('input', () => {
  const value = parseInt(qty.value, 10);
  if (!Number.isFinite(value) || value < 0) qty.value = 0;
  updateAddButton();
});

const quantityControls = [document.getElementById('minus'), document.getElementById('plus')];
quantityControls.forEach(control => control.addEventListener('dblclick', event => event.preventDefault()));

document.getElementById('cancel').onclick = () => {
  modal.classList.remove('show');
  manualName.value = '';
};

let adding = false;
addButton.onclick = () => {
  if (adding) return;

  const quantity = parseInt(qty.value, 10);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    updateAddButton();
    return;
  }

  const selectedUnit = UNITS.includes(unit.value) ? unit.value : 'PIECE';
  let name;
  let key;

  if (manualMode) {
    name = manualName.value.trim();
    if (!name) {
      manualName.focus();
      return;
    }
    key = `manual:${name.toLowerCase()}:${selectedUnit}`;
  } else {
    if (!selected) return;
    name = selected.name || 'Unnamed Product';
    key = `product:${selected.id || name}:${selectedUnit}`;
  }

  adding = true;
  addButton.disabled = true;

  const old = order.find(item => item.key === key);
  if (old) old.quantity += quantity;
  else order.push({
    key,
    productId: manualMode ? null : selected.id,
    name,
    quantity,
    unit: selectedUnit,
    temporary: manualMode
  });

  localStorage.setItem('hindPharmaOrder', JSON.stringify(order));
  updateCart();
  modal.classList.remove('show');
  manualName.value = '';

  setTimeout(() => {
    adding = false;
    updateAddButton();
  }, 300);
};

let cartOpening = false;
cartButton.onclick = () => {
  if (cartOpening) return;
  cartOpening = true;
  cartButton.disabled = true;
  location.href = 'order.html';
};

let searchTimer;
search.addEventListener('input', event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchProducts(event.target.value), SEARCH_DEBOUNCE_MS);
});

async function loadProducts() {
  try {
    count.textContent = 'Loading products...';
    await viewModel.loadProducts();
    filtered = viewModel.products;
    render(true);
  } catch (error) {
    count.textContent = 'Could not load products';
    filtered = [];
    render(true);
  }
}

async function searchProducts(query) {
  try {
    filtered = await viewModel.searchProducts(query);
    render(true);
  } catch (error) {
    count.textContent = 'Search failed';
    filtered = [];
    render(true);
  }
}

document.getElementById('intro').textContent = `Ordering for ${medical}. Tap anywhere on a product card to select it.`;
localStorage.setItem('hindPharmaOrder', JSON.stringify(order));
updateCart();
loadProducts();
TempSessionService.startExpiryWatcher(() => location.replace('login.html'));
