import { setupCheckout } from './checkout.js';

const storageKey = 'etun_cart_v1';
const maxQuantity = 999;
const pricing = {
  'ice-tool': { price: 300, unit: 'за штуку' },
  'ice-axe': { price: 250, unit: 'за штуку' },
  'ice-screw': { price: 150, unit: 'за штуку' },
  crampons: { price: 1400, unit: 'за пару' }
};
const cards = [...document.querySelectorAll('.product[data-product-id]')];
const products = new Map(cards.map(card => {
  const id = card.dataset.productId;
  return [id, {
    id,
    name: card.querySelector('h3').textContent,
    image: `assets/cart/${id}.webp`,
    ...pricing[id]
  }];
}));

const money = new Intl.NumberFormat('ru-RU');
const rubles = amount => `${money.format(amount)} ₽`;

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      return new Map(Object.entries(saved).filter(([id, quantity]) =>
        products.has(id) && Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity
      ));
    }
  } catch {
    // The cart also works for this page session if storage is blocked.
  }
  return new Map();
}

const cart = loadCart();

function getCartSummary() {
  const items = [...cart].map(([id, quantity]) => {
    const product = products.get(id);
    return { ...product, quantity, subtotal: product.price * quantity };
  });
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  return { items, count, total };
}

const toggle = document.querySelector('.cart-toggle');
const dialog = document.querySelector('#cart');
const close = dialog.querySelector('.cart-close');
const list = dialog.querySelector('.cart-items');
const empty = dialog.querySelector('.cart-empty');
const footer = dialog.querySelector('.cart-footer');
const template = document.querySelector('#cart-item');
const status = dialog.querySelector('[role="status"]');
const toast = document.querySelector('.cart-toast');
const toastMessage = toast.querySelector('.cart-toast-message');
const announcement = document.querySelector('.cart-announcement');
let returnFocus = toggle;
let catalogRequested = false;
let backdropPressed = false;
let toastTimer;

function renderItem(item) {
  const row = template.content.firstElementChild.cloneNode(true);
  row.dataset.id = item.id;
  row.querySelector('img').src = item.image;
  row.querySelector('h3').textContent = item.name;
  row.querySelector('.cart-unit-price').textContent = `${rubles(item.price)} ${item.unit}`;
  row.querySelector('.cart-quantity-value').textContent = item.quantity;
  row.querySelector('.cart-subtotal').textContent = rubles(item.subtotal);
  row.querySelector('[data-action="decrease"]').ariaLabel = `Уменьшить количество: ${item.name}`;
  const increase = row.querySelector('[data-action="increase"]');
  increase.ariaLabel = `Увеличить количество: ${item.name}`;
  increase.disabled = item.quantity >= maxQuantity;
  row.querySelector('[data-action="remove"]').ariaLabel = `Удалить: ${item.name}`;
  return row;
}

function renderCart() {
  const { items, count, total } = getCartSummary();
  toggle.querySelector('.cart-count').textContent = money.format(count);
  toggle.ariaLabel = `Корзина. Количество: ${count}`;
  list.replaceChildren(...items.map(renderItem));
  empty.hidden = count > 0;
  footer.hidden = count === 0;
  footer.querySelector('.cart-total strong').textContent = rubles(total);
  return total;
}

function setQuantity(id, quantity) {
  if (quantity > 0) {
    cart.set(id, Math.min(quantity, maxQuantity));
  } else {
    cart.delete(id);
  }
  return saveCart();
}

function saveCart() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(cart)));
  } catch {
    // Keep the in-memory state available even if saving fails.
  }
  return renderCart();
}

for (const card of cards) {
  const product = products.get(card.dataset.productId);
  const price = card.querySelector('.price');
  price.querySelector('strong').textContent = rubles(product.price);
  price.querySelector('span').textContent = product.unit;
  price.hidden = false;
  const add = card.querySelector('.add-to-cart');
  add.ariaLabel = `В корзину: ${product.name}`;
  add.hidden = false;
  add.addEventListener('click', () => {
    const quantity = cart.get(product.id) ?? 0;
    const added = quantity < maxQuantity;
    if (added) setQuantity(product.id, quantity + 1);
    const message = added
      ? `Добавлено: ${product.name}. Количество: ${quantity + 1}`
      : `Достигнут предел количества: ${product.name}`;
    announcement.textContent = message;
    toastMessage.textContent = message;
    add.after(toast);
    toast.hidden = false;
    scheduleToastHide();
  });
}

list.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const row = button.closest('[data-id]');
  const { id } = row.dataset;
  const { action } = button.dataset;
  const adjacentId = (row.nextElementSibling ?? row.previousElementSibling)?.dataset.id;
  const quantity = cart.get(id);
  const next = action === 'remove' ? 0 : quantity + (action === 'increase' ? 1 : -1);
  const total = setQuantity(id, next);
  status.textContent = next
    ? `Количество: ${next}. Стоимость товаров: ${rubles(total)}`
    : `Позиция удалена. Стоимость товаров: ${rubles(total)}`;

  const activeRow = list.querySelector(`[data-id="${next ? id : adjacentId}"]`);
  const replacement = activeRow?.querySelector(`[data-action="${action}"]:enabled`)
    ?? activeRow?.querySelector('[data-action="decrease"]');
  (replacement ?? (cart.size ? close : empty.querySelector('a'))).focus();
});

function scheduleToastHide() {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function openCart(opener) {
  returnFocus = opener;
  dialog.showModal();
  document.documentElement.classList.add('cart-open');
  close.focus();
  toast.hidden = true;
  clearTimeout(toastTimer);
}

toast.addEventListener('focus', () => clearTimeout(toastTimer));
toast.addEventListener('blur', () => {
  if (!dialog.open) scheduleToastHide();
});
toast.addEventListener('click', () => openCart(toast.previousElementSibling));
toggle.addEventListener('click', () => openCart(toggle));
close.addEventListener('click', () => dialog.close());

dialog.addEventListener('pointerdown', event => {
  backdropPressed = event.target === dialog;
});
dialog.addEventListener('click', event => {
  if (backdropPressed && event.target === dialog) dialog.close();
  backdropPressed = false;
});

dialog.addEventListener('close', () => {
  document.documentElement.classList.remove('cart-open');
  if (catalogRequested) {
    catalogRequested = false;
    const catalog = document.querySelector('#catalog');
    const smooth = catalog.getBoundingClientRect().top > 0
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('#catalog-title').focus({ preventScroll: true });
    if (location.hash !== '#catalog') history.pushState(history.state, '', '#catalog');
    catalog.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  } else {
    returnFocus.focus({ preventScroll: true });
  }
});
dialog.querySelectorAll('[data-cart-catalog]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    catalogRequested = true;
    dialog.close();
  });
});

dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href]')]
    .filter(element => !element.closest('[hidden]'));
  const boundary = event.shiftKey ? controls[0] : controls.at(-1);
  if (document.activeElement === boundary) {
    event.preventDefault();
    (event.shiftKey ? controls.at(-1) : controls[0]).focus();
  }
});

const checkoutButton = footer.querySelector('.checkout-open');
checkoutButton.addEventListener('click', setupCheckout({
  getCartSummary,
  rubles,
  clearCart() {
    cart.clear();
    saveCart();
  },
  restoreFocus() {
    (cart.size ? checkoutButton : close).focus({ preventScroll: true });
  }
}));

renderCart();
toggle.hidden = false;
