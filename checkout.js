import { orderSubmissionEnabled, qformFormId } from './checkout-config.js';

export function setupCheckout({ getCartSummary, clearCart, rubles, restoreFocus }) {
  const dialog = document.querySelector('#checkout');
  const closer = dialog.querySelector('.checkout-close');
  const host = dialog.querySelector('.checkout-qform');
  const summary = dialog.querySelector('.checkout-summary');
  const list = summary.querySelector('.checkout-items');
  const template = document.querySelector('#checkout-item');
  const status = dialog.querySelector('.checkout-status');
  let order;
  let fieldsReady = false;
  let timeout;
  let script;

  function orderItems(items) {
    return items.map(item =>
      `${item.name} — ${item.quantity} × ${rubles(item.price)} ${item.unit} = ${rubles(item.subtotal)}`
    ).join('\n');
  }

  function populateFields() {
    if (!dialog.open || !order?.count) return false;
    const items = host.querySelector('input[type="hidden"][name="order_items"]');
    const total = host.querySelector('input[type="hidden"][name="order_total"]');
    if (!items || !total || !items.form || items.form !== total.form) return false;
    items.value = orderItems(order.items);
    total.value = String(order.total);
    return true;
  }

  function syncForm() {
    if (!populateFields()) {
      host.inert = true;
      return;
    }

    fieldsReady = true;
    clearTimeout(timeout);
    host.inert = false;
    status.textContent = '';
  }

  // The widget builds its inputs asynchronously. The observer also covers
  // replacement of those inputs by the widget while checkout is open.
  new MutationObserver(syncForm).observe(host, { childList: true, subtree: true });

  function startQForm() {
    host.hidden = false;
    host.inert = true;
    status.textContent = 'Загружаем форму заказа…';
    syncForm();
    if (fieldsReady) return;
    timeout = setTimeout(() => {
      status.textContent = 'Форма заказа пока недоступна. Корзина сохранена.';
    }, 12000);

    if (script) return;
    host.dataset.formid = qformFormId;
    script = document.createElement('script');
    script.src = 'https://cdn.qform.io/forms.js?v=' + Date.now();
    script.async = true;
    script.addEventListener('error', () => {
      script.remove();
      script = undefined;
      clearTimeout(timeout);
      if (dialog.open) status.textContent = 'Не удалось загрузить форму. Закройте оформление и попробуйте снова.';
    });
    document.head.append(script);
  }

  function open() {
    const current = getCartSummary();
    if (!current.count || dialog.open) return;
    order = current;
    fieldsReady = false;
    summary.hidden = false;
    list.replaceChildren(...order.items.map(item => {
      const row = template.content.firstElementChild.cloneNode(true);
      row.querySelector('.checkout-item-name').textContent = item.name;
      row.querySelector('.checkout-item-detail').textContent = `${item.quantity} × ${rubles(item.price)} ${item.unit}`;
      row.querySelector('.checkout-item-subtotal').textContent = rubles(item.subtotal);
      return row;
    }));
    summary.querySelector('.cart-total strong').textContent = rubles(order.total);
    dialog.showModal();
    dialog.querySelector('.checkout-body').scrollTop = 0;
    closer.focus();
    if (orderSubmissionEnabled) startQForm();
  }

  closer.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    clearTimeout(timeout);
    fieldsReady = false;
    host.inert = true;
    order = undefined;
    restoreFocus();
  });

  host.addEventListener('submit', event => {
    const current = getCartSummary();
    if (!fieldsReady || !current.count || orderItems(current.items) !== orderItems(order.items) || !populateFields()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('etun:qform-success', () => {
    if (!dialog.open || !fieldsReady || !order?.count) return;
    const current = getCartSummary();
    if (current.total !== order.total || orderItems(current.items) !== orderItems(order.items)) return;
    fieldsReady = false;
    order = undefined;
    host.inert = true;
    host.hidden = true;
    summary.hidden = true;
    clearCart();
    status.textContent = 'Спасибо! QForm принял заявку. Мы свяжемся с вами, чтобы подтвердить заказ и согласовать доставку и оплату.';
    closer.focus();
  });

  return open;
}
