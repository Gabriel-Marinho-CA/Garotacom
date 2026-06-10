/**
 * minicart.js
 * PubSub + Web Components para o minicart
 * Arquitetura inspirada no Dawn (Shopify)
 */

// ─────────────────────────────────────────────
// PubSub
// ─────────────────────────────────────────────
const subscribers = {};

function subscribe(eventName, callback) {
  if (!subscribers[eventName]) subscribers[eventName] = [];
  subscribers[eventName].push(callback);
  return function unsubscribe() {
    subscribers[eventName] = subscribers[eventName].filter(cb => cb !== callback);
  };
}

function publish(eventName, data) {
  if (subscribers[eventName]) {
    subscribers[eventName].forEach(cb => cb(data));
  }
}

// Expõe globalmente para que outros scripts (add-to-cart, etc.) possam usar
window.CartPubSub = { subscribe, publish };
window.CART_EVENTS = {
  updated: 'cart:updated',
};

// ─────────────────────────────────────────────
// Cart API helper
// ─────────────────────────────────────────────
function cartChange(line, quantity) {
  return fetch('/cart/change.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      line,
      quantity,
      sections: ['minicart-items'],
    }),
  }).then(res => {
    if (!res.ok) throw new Error('Cart change request failed');
    return res.json();
  });
}

// ─────────────────────────────────────────────
// minicart-remove-button
// Uso: <minicart-remove-button data-line="1">
// ─────────────────────────────────────────────
class MinicartRemoveButton extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', (e) => {
      e.preventDefault();
      const drawer = document.querySelector('minicart-drawer');
      if (drawer) drawer.updateQuantity(parseInt(this.dataset.line), 0);
    });
  }
}
customElements.define('minicart-remove-button', MinicartRemoveButton);

// ─────────────────────────────────────────────
// minicart-quantity-button
// Uso: <minicart-quantity-button>
//        <button class="qty-minus">−</button>
//        <input class="qty-input" data-line="1" value="2">
//        <button class="qty-plus">+</button>
//      </minicart-quantity-button>
// ─────────────────────────────────────────────
class MinicartQuantityButton extends HTMLElement {
  connectedCallback() {
    const minus = this.querySelector('.qty-minus');
    const plus  = this.querySelector('.qty-plus');
    const input = this.querySelector('.qty-input');
    if (!minus || !plus || !input) return;

    const getDrawer = () => document.querySelector('minicart-drawer');

    minus.addEventListener('click', () => {
      const qty = Math.max(0, parseInt(input.value) - 1);
      getDrawer()?.updateQuantity(parseInt(input.dataset.line), qty);
    });

    plus.addEventListener('click', () => {
      const qty = parseInt(input.value) + 1;
      getDrawer()?.updateQuantity(parseInt(input.dataset.line), qty);
    });

    input.addEventListener('change', () => {
      const qty = Math.max(0, parseInt(input.value) || 0);
      getDrawer()?.updateQuantity(parseInt(input.dataset.line), qty);
    });
  }
}
customElements.define('minicart-quantity-button', MinicartQuantityButton);

// ─────────────────────────────────────────────
// minicart-drawer
// Componente principal — gerencia estado, re-render e eventos
// ─────────────────────────────────────────────
class MinicartDrawer extends HTMLElement {
  connectedCallback() {
    this._bindStaticEvents();

    // Escuta atualizações externas (add-to-cart, etc.)
    subscribe(window.CART_EVENTS.updated, ({ source, sections, cart } = {}) => {
      if (source === 'minicart-drawer') return;

      if (sections?.['minicart-items']) {
        this._renderItems(sections['minicart-items']);
      } else {
        this._refreshFromServer();
      }

      if (cart) this._updateCartCount(cart.item_count);

      // Abre o minicart automaticamente ao adicionar produto
      if (source === 'add-to-cart') this.open();
    });
  }

  _bindStaticEvents() {
    // Botão fechar dentro do drawer
    this.querySelector('.mini-cart-undo')?.addEventListener('click', () => this.close());

    // Overlay de fundo
    document.querySelector('.bg-minicart')?.addEventListener('click', () => this.close());

    // Tecla Esc
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  open() {
    this.querySelector('.js-minicart')?.classList.add('active');
    document.querySelector('.bg-minicart')?.classList.add('active');
    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.querySelector('.js-minicart')?.classList.remove('active');
    document.querySelector('.bg-minicart')?.classList.remove('active');
    document.body.classList.remove('overflow-hidden');
  }

  _setLoading(loading) {
    const area = this.querySelector('.enj-minicart-ajax');
    if (area) area.classList.toggle('minicart--loading', loading);
  }

  /**
   * Altera a quantidade de um item. quantity=0 remove o item.
   * Chamado por MinicartRemoveButton e MinicartQuantityButton.
   */
  updateQuantity(line, quantity) {
    this._setLoading(true);

    cartChange(line, quantity)
      .then(state => {
        if (state.sections?.['minicart-items']) {
          this._renderItems(state.sections['minicart-items']);
        }
        this._updateCartCount(state.item_count);
        publish(window.CART_EVENTS.updated, {
          source: 'minicart-drawer',
          cart: state,
        });
      })
      .catch(err => {
        console.error('[MinicartDrawer] Falha ao atualizar carrinho:', err);
      })
      .finally(() => {
        this._setLoading(false);
      });
  }

  /**
   * Re-renderiza os itens buscando a section do servidor.
   * Usado quando um evento cart:updated vem de fonte externa.
   */
  _refreshFromServer() {
    fetch('/?sections=minicart-items')
      .then(res => res.json())
      .then(sections => {
        if (sections['minicart-items']) {
          this._renderItems(sections['minicart-items']);
        }
        // Atualiza o contador buscando /cart.js
        return fetch('/cart.js').then(r => r.json());
      })
      .then(cart => {
        this._updateCartCount(cart.item_count);
      })
      .catch(err => {
        console.error('[MinicartDrawer] Falha ao recarregar minicart:', err);
      });
  }

  /**
   * Injeta o HTML da section renderizada na área de itens.
   * O HTML vindo da API tem: <div class="shopify-section"><div class="minicart-items-inner">...
   */
  _renderItems(sectionHtml) {
    const doc = new DOMParser().parseFromString(sectionHtml, 'text/html');
    const newContent = doc.querySelector('.minicart-items-inner');
    const target = this.querySelector('.enj-minicart-ajax');
    if (target && newContent) {
      target.innerHTML = newContent.outerHTML;
    }
  }

  /**
   * Atualiza todos os contadores de carrinho na página.
   */
  _updateCartCount(count) {
    document.querySelectorAll(
      '.js-number-cart, .enj-cartcount, .js-minicart-count, .cart-counter'
    ).forEach(el => {
      el.textContent = count;
      el.classList.toggle('active', count > 0);
    });
  }
}
customElements.define('minicart-drawer', MinicartDrawer);

// ─────────────────────────────────────────────
// add-to-cart-button
// Uso: <add-to-cart-button>
//        <button class="enj-add-to-cart-btn">Adicionar</button>
//      </add-to-cart-button>
// ─────────────────────────────────────────────
class AddToCartButton extends HTMLElement {
  connectedCallback() {
    this._btn  = this.querySelector('button');
    this._form = this.closest('form');
    console.log(this._btn);
    console.log(this._form );
    if (!this._btn || !this._form) return;

    this._btn.addEventListener('click', (e) => {
        console.log("@@@")
      e.preventDefault();
      this._addToCart();
    });
  }

  _addToCart() {
    const variantId = this._form.querySelector('[name="id"]')?.value;
    const quantity  = parseInt(this._form.querySelector('[name="quantity"]')?.value || 1);
    if (!variantId) return;

    this._setLoading(true);

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(e => { throw new Error(e.description || 'Erro ao adicionar'); });
        return res.json();
      })
      .then(addedItem => {
        // Busca sections + cart em paralelo para o evento
        return Promise.all([
          fetch('/?sections=minicart-items').then(r => r.json()),
          fetch('/cart.js').then(r => r.json()),
        ]).then(([sections, cart]) => {
          publish(window.CART_EVENTS.updated, {
            source: 'add-to-cart',
            addedItem,
            sections,
            cart,
          });
        });
      })
      .catch(err => {
        console.error('[AddToCartButton]', err);
        this._setError();
      })
      .finally(() => {
        this._setLoading(false);
      });
  }

  _setLoading(loading) {
    this._btn.disabled = loading;
    this._btn.classList.toggle('is-loading', loading);
  }

  _setError() {
    this._btn.classList.add('is-error');
    setTimeout(() => this._btn.classList.remove('is-error'), 2000);
  }
}
customElements.define('add-to-cart-button', AddToCartButton);

// ─────────────────────────────────────────────
// Integração com o botão de abrir (.js-call-minicart)
// Permite que o jQuery existente e o novo componente coexistam.
// Se o jQuery já cuida do open, este listener é um fallback.
// ─────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.js-call-minicart');
  if (!trigger) return;
  e.preventDefault();
  document.querySelector('minicart-drawer')?.open();
});
