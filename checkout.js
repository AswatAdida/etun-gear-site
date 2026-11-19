import { formspreeFormId, orderSubmissionEnabled } from './checkout-config.js';

const endpoint = orderSubmissionEnabled && /^[a-z0-9]+$/i.test(formspreeFormId)
  ? `https://formspree.io/f/${formspreeFormId}`
  : null;
const deliveryMethods = new Set(['СДЭК', 'Почта России']);

function fieldError(field) {
  const value = field.value.trim();
  switch (field.name) {
    case 'name': return value ? '' : 'Введите имя.';
    case 'city': return value ? '' : 'Введите город доставки.';
    case 'phone': {
      const digits = value.replace(/[\s()-]/g, '');
      return /^(?:\+7|8)\d{10}$/.test(digits) ? '' : 'Введите номер в формате +7 или 8 с десятью цифрами после него.';
    }
    case 'email': return value && field.validity.valid ? '' : 'Введите корректный email.';
    case 'delivery': return deliveryMethods.has(value) ? '' : 'Выберите способ доставки.';
    case 'consent': return field.checked ? '' : 'Подтвердите согласие на обработку данных.';
    default: return '';
  }
}

function showFieldError(field, message) {
  const error = document.querySelector(`#${field.id}-error`);
  error.textContent = message;
  error.hidden = !message;
  if (message) {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', error.id);
  } else {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
  }
}

function submissionData(form, order, rubles) {
  const fields = form.elements;
  const data = {
    subject: 'Ётун — новый заказ',
    'Имя': fields.name.value.trim(),
    'Телефон': '+7' + fields.phone.value.replace(/\D/g, '').slice(1),
    email: fields.email.value.trim(),
    'Город': fields.city.value.trim(),
    'Способ доставки': fields.delivery.value,
    'Состав заказа': order.items.map(item =>
      `${item.name} — ${item.quantity} × ${rubles(item.price)} ${item.unit} = ${rubles(item.subtotal)}`
    ).join('\n'),
    'Итог': `Стоимость товаров: ${rubles(order.total)}. Доставка оплачивается отдельно.`,
    'Дата и время': new Date().toISOString(),
    'Согласие на обработку персональных данных': 'Подтверждено'
  };
  const comment = fields.comment.value.trim();
  if (comment) data['Комментарий'] = comment;
  return data;
}

export function setupCheckout({ getCartSummary, clearCart, rubles, restoreFocus }) {
  const dialog = document.querySelector('#checkout');
  const closer = dialog.querySelector('.checkout-close');
  const form = dialog.querySelector('#order-form');
  const summary = dialog.querySelector('.checkout-summary');
  const list = summary.querySelector('.checkout-items');
  const template = document.querySelector('#checkout-item');
  const submit = form.querySelector('.checkout-submit');
  const notice = form.querySelector('#checkout-disabled');
  const status = dialog.querySelector('.checkout-status');
  const fields = [...form.querySelectorAll('[required]')];
  let sending = false;
  let accepted = false;

  notice.hidden = Boolean(endpoint);
  submit.disabled = !endpoint;
  if (endpoint) submit.removeAttribute('aria-describedby');

  function open() {
    const order = getCartSummary();
    if (!order.count || dialog.open) return;
    accepted = false;
    form.hidden = false;
    summary.hidden = false;
    status.textContent = '';
    status.dataset.state = '';
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
  }

  closer.addEventListener('click', () => {
    if (!sending) dialog.close();
  });
  dialog.addEventListener('cancel', event => {
    if (sending) event.preventDefault();
  });
  dialog.addEventListener('close', () => restoreFocus());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href], button, input, select, textarea')]
      .filter(control => !control.disabled && !control.closest('[hidden]'));
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const boundary = event.shiftKey ? controls[0] : controls.at(-1);
    if (document.activeElement === boundary || !controls.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? controls.at(-1) : controls[0]).focus();
    }
  });

  for (const field of fields) {
    field.addEventListener('input', () => {
      if (field.hasAttribute('aria-invalid')) showFieldError(field, fieldError(field));
    });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!endpoint || sending || accepted) return;
    const order = getCartSummary();
    if (!order.count) return;

    const invalid = fields.filter(field => {
      const error = fieldError(field);
      showFieldError(field, error);
      return Boolean(error);
    });
    if (invalid.length) {
      invalid[0].focus();
      return;
    }

    const data = submissionData(form, order, rubles);
    sending = true;
    submit.disabled = closer.disabled = true;
    submit.textContent = 'Отправляем заказ…';
    status.dataset.state = 'sending';
    status.textContent = 'Отправляем заказ…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
      if (!response.ok || (await response.json())?.ok !== true) throw new Error('Submission was not acknowledged');
      accepted = true;
    } catch {
      status.dataset.state = 'error';
      status.textContent = controller.signal.aborted
        ? 'Сервис не ответил вовремя. Заявка могла быть принята. Проверьте подтверждение перед повторной отправкой.'
        : 'Не удалось подтвердить отправку заявки. Данные и корзина сохранены. Попробуйте отправить ещё раз.';
    } finally {
      clearTimeout(timeout);
      sending = false;
      closer.disabled = false;
      submit.disabled = accepted;
      submit.textContent = 'Отправить заявку';
    }

    if (accepted) {
      clearCart();
      form.reset();
      form.hidden = summary.hidden = true;
      status.dataset.state = 'success';
      status.textContent = 'Спасибо! Ваша заявка отправлена. Мы свяжемся с вами, чтобы подтвердить заказ, уточнить совместимость изделий и согласовать доставку и оплату.';
      closer.focus();
    } else {
      submit.focus({ preventScroll: true });
    }
    status.scrollIntoView({ block: 'nearest' });
  });
  return open;
}
