// app.js - frontend for menu / edit_order pages + login/signup support
const API_BASE = 'http://localhost:3000';

// small helpers
async function postJSON(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, networkError: true, error: err.message || String(err) };
  }
}
async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    const data = await res.json().catch(()=>({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, networkError: true, error: err.message || String(err) };
  }
}
function saveSession(user) {
  if (!user) return;
  localStorage.setItem('currentUserId', String(user.userId || user.id));
  localStorage.setItem('currentUserEmail', user.email || '');
  localStorage.setItem('currentUserName', user.name || '');
}
function clearSession() {
  localStorage.removeItem('currentUserId');
  localStorage.removeItem('currentUserEmail');
  localStorage.removeItem('currentUserName');
}
function requireLogin() {
  const id = localStorage.getItem('currentUserId');
  if (!id) {
    alert('Please log in first');
    window.location.href = 'index.html';
    return null;
  }
  return id;
}

// --- common UI wiring: logout link & show username ---
document.querySelectorAll('#logoutLink, #logoutLink2').forEach(el => {
  if (!el) return;
  el.addEventListener('click', () => {
    clearSession();
    // allow anchor to navigate to index.html
  });
});
const userInfoEl = document.getElementById('userInfo');
if (userInfoEl) {
  const name = localStorage.getItem('currentUserName') || localStorage.getItem('currentUserEmail') || '';
  userInfoEl.textContent = name ? `Hi ${name}` : '';
}

// ---------- INDEX page handling (signup/login) ----------
const signupForm = document.getElementById('signup');
const signupMsg = document.getElementById('signupMsg');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupMsg.textContent = '';
    const payload = {
      name: document.getElementById('name').value.trim(),
      address: document.getElementById('address').value.trim(),
      phone: document.getElementById('number').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value
    };
    if (!payload.email || !payload.password) {
      signupMsg.style.color = 'red';
      signupMsg.textContent = 'Email & password required';
      return;
    }
    const res = await postJSON(`${API_BASE}/signup`, payload);
    if (res.ok) {
      signupMsg.style.color = 'green';
      signupMsg.textContent = 'Sign-up successful — please log in.';
      signupForm.reset();
      return;
    }
    signupMsg.style.color = 'red';
    if (res.networkError) signupMsg.textContent = 'Server unreachable';
    else signupMsg.textContent = (res.data && res.data.error) ? res.data.error : 'Signup failed';
  });
}

const loginForm = document.getElementById('login');
const loginMsg = document.getElementById('loginMsg');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginMsg.textContent = '';
    const payload = {
      email: document.getElementById('loginEmail').value.trim(),
      password: document.getElementById('loginPassword').value
    };
    if (!payload.email || !payload.password) {
      loginMsg.style.color = 'red';
      loginMsg.textContent = 'Email & password required';
      return;
    }
    const res = await postJSON(`${API_BASE}/login`, payload);
    if (res.ok) {
      saveSession({ userId: res.data.userId || res.data.id, email: res.data.email, name: res.data.name });
      loginMsg.style.color = 'green';
      loginMsg.textContent = `Welcome, ${res.data.name || res.data.email}`;
      setTimeout(()=> window.location.href = 'menu.html', 600);
      return;
    }
    if (res.networkError) {
      loginMsg.style.color = 'red';
      loginMsg.textContent = 'Server unreachable';
      return;
    }
    loginMsg.style.color = 'red';
    loginMsg.textContent = (res.data && res.data.error) ? res.data.error : 'Login failed';
  });
}

// ---------- MENU PAGE ----------
const menuListEl = document.getElementById('menuList');
const menuMsg = document.getElementById('menuMsg');

if (menuListEl) {
  (async function loadMenu() {
    menuListEl.innerHTML = 'Loading menu...';
    const res = await fetchJSON(`${API_BASE}/dinners`);
    if (!res.ok) {
      menuListEl.innerHTML = '<p style="color:red">Could not load menu.</p>';
      return;
    }
    const dinners = Array.isArray(res.data) ? res.data : res;
    if (!dinners.length) {
      menuListEl.innerHTML = '<p>No menu items found.</p>';
      return;
    }

    // Render dinners
    menuListEl.innerHTML = '';
    for (const d of dinners) {
      const div = document.createElement('div');
      div.className = 'dinner';
      div.dataset.dinnerId = d.id;
      div.innerHTML = `
        <h3>${d.name}</h3>
        <p>${d.description || ''}</p>
        <p><strong>Base price:</strong> ${d.base_price || 0}원</p>

        <div class="controls">
          <label>Style (text): <input type="text" class="styleInput" placeholder="e.g. medium rare"></label>
          <label>Quantity: <input type="number" class="qtyInput" min="1" value="1" style="width:72px"></label>

          <label>Extra options:
            <select class="extraSelect">
              <option value="">(choose extra to add immediately)</option>
            </select>
          </label>

          <button class="addBtn">Add to Cart</button>
        </div>
      `;
      menuListEl.appendChild(div);

      // populate extra Select with dinner options (predefined)
      (async () => {
        const sel = div.querySelector('.extraSelect');
        const optsRes = await fetchJSON(`${API_BASE}/dinners/${d.id}/options`);
        if (optsRes.ok) {
          const opts = Array.isArray(optsRes.data) ? optsRes.data : optsRes;
          opts.forEach(o => {
            const optEl = document.createElement('option');
            optEl.value = JSON.stringify({option_key: o.option_key, option_text: o.option_text, extra_price: o.extra_price});
            optEl.textContent = `${o.option_text}${o.extra_price ? ' (+'+o.extra_price+'원)' : ''}`;
            sel.appendChild(optEl);
          });
        }
      })();
    }

    // wire button handlers
    menuListEl.querySelectorAll('.addBtn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const container = btn.closest('.dinner');
        const dinnerId = Number(container.dataset.dinnerId);
        const dinnerName = container.querySelector('h3').textContent;
        const style = container.querySelector('.styleInput').value.trim();
        const qty = Math.max(1, Number(container.querySelector('.qtyInput').value || 1));
        const sel = container.querySelector('.extraSelect');
        const selectedExtra = sel && sel.value ? JSON.parse(sel.value) : null;

        // require login
        const userId = requireLogin();
        if (!userId) return;

        // unit price uses base_price from dinners (server seeded)
        // find dinner object from previously loaded dinners (use container data)
        // We'll request dinner detail to be safe:
        const dinnerRes = await fetchJSON(`${API_BASE}/dinners`);
        let unitPrice = 0;
        if (dinnerRes.ok) {
          const found = (Array.isArray(dinnerRes.data) ? dinnerRes.data : dinnerRes).find(x => x.id === dinnerId);
          unitPrice = found ? (found.base_price || 0) : 0;
        }

        // Add item to cart on server
        const addRes = await postJSON(`${API_BASE}/cart/add`, {
          userId: Number(userId),
          dinnerId: dinnerId,
          style: style,
          quantity: qty,
          unitPrice: Number(unitPrice)
        });

        if (!addRes.ok) {
          if (addRes.networkError) {
            menuMsg.style.color = 'red';
            menuMsg.textContent = 'Server unreachable. Could not add.';
          } else {
            menuMsg.style.color = 'red';
            menuMsg.textContent = addRes.data && addRes.data.error ? addRes.data.error : 'Failed to add';
          }
          return;
        }

        // If user selected an extra option from predefined list, add it to the newly created item
        const newItemId = addRes.data.itemId;
        if (selectedExtra) {
          // call POST /order_item/:id/option
          await postJSON(`${API_BASE}/order_item/${newItemId}/option`, {
            userId: Number(userId),
            option_key: selectedExtra.option_key || null,
            option_text: selectedExtra.option_text,
            extra_price: Number(selectedExtra.extra_price || 0)
          });
        }

        menuMsg.style.color = 'green';
        menuMsg.textContent = `Added ${dinnerName} to cart.`;
        // go to edit page to allow further customization
        setTimeout(()=> window.location.href = 'edit_order.html', 400);
      });
    });

  })();
}

// ---------- EDIT ORDER PAGE ----------
const orderListEl = document.getElementById('orderList');
const orderMsgEl = document.getElementById('orderMsg');

if (orderListEl) {
  (async function loadCart() {
    const userId = requireLogin();
    if (!userId) return;
    orderListEl.innerHTML = 'Loading cart...';

    const res = await fetchJSON(`${API_BASE}/cart/${userId}`);
    if (!res.ok) {
      orderListEl.innerHTML = '<p style="color:red">Could not load cart.</p>';
      return;
    }

    const order = res.data.order;
    const items = res.data.items || [];
    if (!order || items.length === 0) {
      orderListEl.innerHTML = '<p>Your cart is empty.</p>';
      return;
    }

    orderListEl.innerHTML = '';
    // For each item, render UI
    for (const obj of items) {
      const item = obj.item;
      const opts = obj.options || [];

      const div = document.createElement('div');
      div.className = 'item';
      div.dataset.itemId = item.id;
      div.innerHTML = `
        <h3>${item.dinner_name}</h3>
        <div><strong>Unit price:</strong> ${item.unit_price || 0}원</div>
        <div style="margin-top:8px">
          <label>Style (text): <input type="text" class="styleInput" value="${item.style || ''}"></label>
          <label style="margin-left:12px">Quantity: <input type="number" class="qtyInput" min="1" value="${item.quantity || 1}" style="width:72px"></label>
        </div>

        <div class="options" id="options-${item.id}">
          <h4>Options</h4>
        </div>

        <div class="controls">
          <button class="saveItemBtn">Save Item</button>
          <button class="delItemBtn">Remove Item</button>

          <label style="margin-left:12px">Add predefined option:
            <select class="addOptionSelect">
              <option value="">(select)</option>
            </select>
          </label>
          <button class="addOptionBtn">Add Selected Option</button>
        </div>
      `;
      orderListEl.appendChild(div);

      // populate options list
      const optsContainer = div.querySelector(`#options-${item.id}`);
      if (opts.length === 0) {
        const p = document.createElement('div'); p.textContent = '(no options)'; optsContainer.appendChild(p);
      } else {
        opts.forEach(o => {
          const row = document.createElement('div');
          row.className = 'option-row';
          row.innerHTML = `
            <span>${o.option_text}${o.extra_price ? ' (+'+o.extra_price+'원)' : ''}</span>
            <button class="editOptBtn" data-optid="${o.id}">Edit</button>
            <button class="delOptBtn" data-optid="${o.id}">Delete</button>
          `;
          optsContainer.appendChild(row);
        });
      }

      // populate addOptionSelect with dinner's predefined options
      (async () => {
        const sel = div.querySelector('.addOptionSelect');
        const dinnerId = item.dinner_id;
        const defsRes = await fetchJSON(`${API_BASE}/dinners/${dinnerId}/options`);
        if (defsRes.ok) {
          const defs = Array.isArray(defsRes.data) ? defsRes.data : defsRes;
          defs.forEach(dopt => {
            const oEl = document.createElement('option');
            oEl.value = JSON.stringify({ key: dopt.option_key, text: dopt.option_text, price: dopt.extra_price });
            oEl.textContent = `${dopt.option_text}${dopt.extra_price ? ' (+'+dopt.extra_price+'원)' : ''}`;
            sel.appendChild(oEl);
          });
        }
      })();
    }

    // attach handlers after DOM has all items
    attachEditHandlers();
  })();
}

function attachEditHandlers() {
  const userId = Number(localStorage.getItem('currentUserId'));

  document.querySelectorAll('.saveItemBtn').forEach(btn => {
    btn.onclick = async () => {
      const container = btn.closest('.item');
      const itemId = Number(container.dataset.itemId);
      const style = container.querySelector('.styleInput').value.trim();
      const qty = Math.max(1, Number(container.querySelector('.qtyInput').value || 1));
      // unit price: keep existing unit_price (server stores it); to keep consistent, we refetch item or assume no change
      // we'll send unitPrice unchanged by reading displayed unit_price text:
      const unitPriceText = container.querySelector('div strong').textContent || '';
      // not reliable; instead fetch item by id to get unit_price (API doesn't have item-get endpoint),
      // but we can assume unit price didn't change — send 0 to keep existing if server fallback is coded.
      // For safety, send existing unit_price we can extract from HTML text (works with our render).
      const unitPriceMatch = container.querySelector('div').innerText.match(/Unit price:\s*([0-9]+)/i);
      const unitPrice = unitPriceMatch ? Number(unitPriceMatch[1]) : 0;

      const res = await fetch(`${API_BASE}/order_item/${itemId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: Number(userId), style, quantity: qty, unitPrice })
      });
      if (res.ok) {
        orderMsgEl.style.color = 'green';
        orderMsgEl.textContent = 'Item updated.';
        setTimeout(()=> location.reload(), 400);
      } else {
        orderMsgEl.style.color = 'red';
        const d = await res.json().catch(()=>({}));
        orderMsgEl.textContent = d && d.error ? d.error : 'Update failed';
      }
    };
  });

  document.querySelectorAll('.delItemBtn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Remove this item from cart?')) return;
      const container = btn.closest('.item');
      const itemId = Number(container.dataset.itemId);
      const res = await fetch(`${API_BASE}/order_item/${itemId}`, {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: Number(localStorage.getItem('currentUserId')) })
      });
      if (res.ok) {
        orderMsgEl.style.color = 'green';
        orderMsgEl.textContent = 'Item removed.';
        setTimeout(()=> location.reload(), 300);
      } else {
        orderMsgEl.style.color = 'red';
        const d = await res.json().catch(()=>({}));
        orderMsgEl.textContent = d && d.error ? d.error : 'Delete failed';
      }
    };
  });

  // handle add predefined option
  document.querySelectorAll('.addOptionBtn').forEach(btn => {
    btn.onclick = async () => {
      const container = btn.closest('.item');
      const itemId = Number(container.dataset.itemId);
      const sel = container.querySelector('.addOptionSelect');
      const val = sel && sel.value;
      if (!val) {
        alert('Choose a predefined option first');
        return;
      }
      const selected = JSON.parse(val);
      const res = await postJSON(`${API_BASE}/order_item/${itemId}/option`, {
        userId: Number(localStorage.getItem('currentUserId')),
        option_key: selected.key || null,
        option_text: selected.text,
        extra_price: Number(selected.price || 0)
      });
      if (res.ok) {
        orderMsgEl.style.color = 'green';
        orderMsgEl.textContent = 'Option added.';
        setTimeout(()=> location.reload(), 300);
      } else {
        orderMsgEl.style.color = 'red';
        orderMsgEl.textContent = res.networkError ? 'Server unreachable' : (res.data && res.data.error) ? res.data.error : 'Failed';
      }
    };
  });

  // handle delete option
  document.querySelectorAll('.delOptBtn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Remove this option?')) return;
      const optId = Number(btn.dataset.optid);
      const res = await fetch(`${API_BASE}/order_item_option/${optId}`, {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: Number(localStorage.getItem('currentUserId')) })
      });
      if (res.ok) {
        orderMsgEl.style.color = 'green';
        orderMsgEl.textContent = 'Option removed.';
        setTimeout(()=> location.reload(), 300);
      } else {
        orderMsgEl.style.color = 'red';
        const d = await res.json().catch(()=>({}));
        orderMsgEl.textContent = d && d.error ? d.error : 'Delete failed';
      }
    };
  });

  // handle edit option (simple prompt)
  document.querySelectorAll('.editOptBtn').forEach(btn => {
    btn.onclick = async () => {
      const optId = Number(btn.dataset.optid);
      const newText = prompt('Edit option text:');
      if (!newText) return;
      const res = await fetch(`${API_BASE}/order_item_option/${optId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: Number(localStorage.getItem('currentUserId')), option_text: newText })
      });
      if (res.ok) {
        orderMsgEl.style.color = 'green';
        orderMsgEl.textContent = 'Option updated.';
        setTimeout(()=> location.reload(), 300);
      } else {
        orderMsgEl.style.color = 'red';
        const d = await res.json().catch(()=>({}));
        orderMsgEl.textContent = d && d.error ? d.error : 'Update failed';
      }
    };
  });
}

// ---------- CHECKOUT PAGE (simple) ----------
const summaryEl = document.getElementById('summary');
const checkoutMsg = document.getElementById('checkoutMsg');
if (summaryEl) {
  (async function showSummary() {
    const userId = requireLogin();
    if (!userId) return;
    summaryEl.innerHTML = 'Loading...';
    const res = await fetchJSON(`${API_BASE}/cart/${userId}`);
    if (!res.ok) {
      summaryEl.innerHTML = '<p style="color:red">Could not load summary.</p>';
      return;
    }
    const items = res.data.items || [];
    if (items.length === 0) {
      summaryEl.innerHTML = '<p>Your cart is empty.</p>';
      return;
    }

    // compute totals: unit_price + sum extra_price
    let total = 0;
    let html = '<div class="summary">';
    items.forEach(obj => {
      const item = obj.item;
      const opts = obj.options || [];
      const unit = Number(item.unit_price || 0);
      const extras = opts.reduce((s,o) => s + Number(o.extra_price || 0), 0);
      const line = (unit + extras) * Number(item.quantity || 1);
      total += line;
      html += `<div><strong>${item.dinner_name}</strong> — ${item.style || ''} — ${unit}원 + extras ${extras}원 × ${item.quantity} = ${line}원</div>`;
    });
    html += `<hr><div><strong>Total: ${total}원</strong></div>`;
    html += `<button id="confirmCheckout">Confirm Checkout</button>`;
    html += `</div>`;
    summaryEl.innerHTML = html;

    document.getElementById('confirmCheckout').addEventListener('click', async () => {
      if (!confirm('Place order and mark as placed?')) return;
      const res2 = await postJSON(`${API_BASE}/checkout`, { userId: Number(userId) });
      if (res2.ok) {
        checkoutMsg.style.color = 'green';
        checkoutMsg.textContent = 'Checkout complete. Thank you!';
        setTimeout(()=> window.location.href = 'menu.html', 900);
      } else {
        checkoutMsg.style.color = 'red';
        if (res2.networkError) checkoutMsg.textContent = 'Server unreachable.';
        else checkoutMsg.textContent = (res2.data && res2.data.error) ? res2.data.error : 'Checkout failed';
      }
    });
  })();
}
