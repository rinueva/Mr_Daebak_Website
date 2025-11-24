// server.js
// Full backend for Mr Deabak: users, dinners, dinner_options, orders, order_items, order_item_options
// Run: node server.js

const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors()); // in production restrict origin
app.use(express.json());

// DB file
const DB_FILE = path.join(__dirname, 'data.db');
const db = new Database(DB_FILE);

// Initialize DB schema
db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dinners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  base_price INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dinner_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dinner_id INTEGER NOT NULL,
  option_key TEXT,
  option_text TEXT NOT NULL,
  extra_price INTEGER DEFAULT 0,
  FOREIGN KEY (dinner_id) REFERENCES dinners(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'cart', -- 'cart', 'placed', 'cancelled'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  dinner_id INTEGER NOT NULL,
  dinner_name TEXT NOT NULL,
  style TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (dinner_id) REFERENCES dinners(id)
);

CREATE TABLE IF NOT EXISTS order_item_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL,
  option_key TEXT,
  option_text TEXT NOT NULL,
  extra_price INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);
`);

// Seed dinners & default options (only if dinners table is empty)
const dinnerCount = db.prepare('SELECT COUNT(*) as c FROM dinners').get().c;
if (dinnerCount === 0) {
  const insertDinner = db.prepare('INSERT INTO dinners (name, description, base_price) VALUES (?, ?, ?)');
  const insertOpt = db.prepare('INSERT INTO dinner_options (dinner_id, option_key, option_text, extra_price) VALUES (?, ?, ?, ?)');
  const dinners = [
    {
      name: 'Valentine Dinner',
      description: '작은 하트 모양과 큐피드가 장식된 접시에 냅킨과 함께 와인과 스테이크 제공',
      base_price: 30000,
      options: [
        { key: 'decor', text: 'Small heart plate', extra: 0 },
        { key: 'napkin', text: 'Decorative napkin', extra: 0 },
        { key: 'drink', text: 'Wine', extra: 0 },
        { key: 'main', text: 'Steak', extra: 0 }
      ]
    },
    {
      name: 'French Dinner',
      description: '커피 한잔, 와인 한잔, 샐러드, 스테이크 제공',
      base_price: 20000,
      options: [
        { key: 'drink', text: 'Coffee', extra: 0 },
        { key: 'drink', text: 'Wine', extra: 0 },
        { key: 'side', text: 'Salad', extra: 0 },
        { key: 'main', text: 'Steak', extra: 0 }
      ]
    },
    {
      name: 'English Dinner',
      description: '에그 스크램블, 베이컨, 빵, 스테이크가 제공된다.',
      base_price: 20000,
      options: [
        { key: 'breakfast', text: 'Egg scramble', extra: 0 },
        { key: 'side', text: 'Bacon', extra: 0 },
        { key: 'bread', text: 'Bread', extra: 0 },
        { key: 'main', text: 'Steak', extra: 0 }
      ]
    },
    {
      name: 'Champagne Feast',
      description: '항상 2인 식사, 샴페인 1병, 4개의 바게트빵, 커피 1 포트, 와인, 스테이크 제공',
      base_price: 50000,
      options: [
        { key: 'bottle', text: 'Champagne (1 bottle)', extra: 0 },
        { key: 'bread', text: 'Baguette x4', extra: 0 },
        { key: 'drink', text: 'Coffee (1 pot)', extra: 0 },
        { key: 'main', text: 'Steak', extra: 0 }
      ]
    }
  ];

  const insert = db.transaction(() => {
    dinners.forEach(d => {
      const r = insertDinner.run(d.name, d.description, d.base_price);
      const dinnerId = r.lastInsertRowid;
      d.options.forEach(o => {
        insertOpt.run(dinnerId, o.key, o.text, o.extra);
      });
    });
  });
  insert();
  console.log('Seeded dinners and options.');
}

// Prepared statements for common operations
const insertUserStmt = db.prepare('INSERT INTO users (name,address,phone,email,password_hash) VALUES (?,?,?,?,?)');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const getUserById = db.prepare('SELECT id, name, email FROM users WHERE id = ?');

const getOpenOrderForUserStmt = db.prepare('SELECT * FROM orders WHERE user_id = ? AND status = ? LIMIT 1');
const createOrderStmt = db.prepare('INSERT INTO orders (user_id, status) VALUES (?, ?)');

const insertOrderItemStmt = db.prepare(`
  INSERT INTO order_items (order_id, dinner_id, dinner_name, style, quantity, unit_price)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getDefaultDinnerOptionsStmt = db.prepare('SELECT * FROM dinner_options WHERE dinner_id = ?');
const insertOrderItemOptionStmt = db.prepare(`
  INSERT INTO order_item_options (order_item_id, option_key, option_text, extra_price)
  VALUES (?, ?, ?, ?)
`);

const getCartItemsStmt = db.prepare(`
  SELECT o.id as order_id, o.user_id as user_id, o.status,
         oi.id as item_id, oi.order_id, oi.dinner_id, oi.dinner_name, oi.style, oi.quantity, oi.unit_price
  FROM orders o
  JOIN order_items oi ON o.id = oi.order_id
  WHERE o.user_id = ? AND o.status = 'cart'
  ORDER BY oi.id
`);

const getOptionsForItemStmt = db.prepare('SELECT * FROM order_item_options WHERE order_item_id = ? ORDER BY id');
const getOrderItemById = db.prepare('SELECT * FROM order_items WHERE id = ?');
const getOrderById = db.prepare('SELECT * FROM orders WHERE id = ?');

const updateOrderItemStmt = db.prepare('UPDATE order_items SET style = ?, quantity = ?, unit_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const deleteOrderItemStmt = db.prepare('DELETE FROM order_items WHERE id = ?');

const deleteOrderItemOptionStmt = db.prepare('DELETE FROM order_item_options WHERE id = ?');
const updateOrderItemOptionStmt = db.prepare('UPDATE order_item_options SET option_key = ?, option_text = ?, extra_price = ? WHERE id = ?');
const getOrderItemOptionById = db.prepare('SELECT * FROM order_item_options WHERE id = ?');

const getDinnersStmt = db.prepare('SELECT * FROM dinners ORDER BY id');
const getDinnerByIdStmt = db.prepare('SELECT * FROM dinners WHERE id = ?');
const getDinnerOptionsStmt = db.prepare('SELECT * FROM dinner_options WHERE dinner_id = ? ORDER BY id');

// ----------------- Helpers -----------------
function jsonOK(res, data = {}) {
  res.json(Object.assign({ ok: true }, data));
}
function jsonError(res, status = 400, message = 'Error') {
  res.status(status).json({ ok: false, error: message });
}

// ----------------- Routes -----------------

// Signup
app.post('/signup', (req, res) => {
  try {
    const { name, address, phone, email, password } = req.body;
    if (!email || !password) return jsonError(res, 400, 'Email and password required');

    const password_hash = bcrypt.hashSync(password, 10);
    try {
      const info = insertUserStmt.run(name || '', address || '', phone || '', email, password_hash);
      return jsonOK(res, { message: 'User created', userId: info.lastInsertRowid });
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return jsonError(res, 409, 'Email already registered');
      }
      console.error(err);
      return jsonError(res, 500, 'Database error');
    }
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Login
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return jsonError(res, 400, 'Email and password required');

    const user = getUserByEmail.get(email);
    if (!user) return jsonError(res, 400, 'Invalid email or password');

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) return jsonError(res, 400, 'Invalid email or password');

    return jsonOK(res, { message: 'Login successful', userId: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Get list of dinners (menu)
app.get('/dinners', (req, res) => {
  try {
    const dinners = getDinnersStmt.all();
    res.json(dinners);
  } catch (err) {
    console.error(err);
    jsonError(res, 500, 'Database error');
  }
});

// Get default options for a dinner
app.get('/dinners/:id/options', (req, res) => {
  try {
    const dinnerId = Number(req.params.id);
    if (!dinnerId) return jsonError(res, 400, 'Invalid dinner id');
    const opts = getDinnerOptionsStmt.all(dinnerId);
    res.json(opts);
  } catch (err) {
    console.error(err);
    jsonError(res, 500, 'Database error');
  }
});

// Add an item to cart: POST /cart/add
// payload: { userId, dinnerId, style, quantity, unitPrice }
app.post('/cart/add', (req, res) => {
  try {
    const { userId, dinnerId, style, quantity = 1, unitPrice = 0 } = req.body;
    const uid = Number(userId);
    const did = Number(dinnerId);

    if (!uid || !did) return jsonError(res, 400, 'Missing userId or dinnerId');

    // check user exists
    const user = getUserById.get(uid);
    if (!user) return jsonError(res, 400, 'Invalid userId');

    // find or create cart order
    let cart = getOpenOrderForUserStmt.get(uid, 'cart');
    if (!cart) {
      const info = createOrderStmt.run(uid, 'cart');
      cart = getOrderById.get(info.lastInsertRowid);
    }

    // check dinner
    const dinner = getDinnerByIdStmt.get(did);
    if (!dinner) return jsonError(res, 400, 'Invalid dinnerId');

    // insert item
    const infoItem = insertOrderItemStmt.run(cart.id, did, dinner.name, style || '', Number(quantity) || 1, Number(unitPrice) || 0);

    // copy default options
    const defaults = getDefaultDinnerOptionsStmt.all(did);
    defaults.forEach(o => {
      insertOrderItemOptionStmt.run(infoItem.lastInsertRowid, o.option_key, o.option_text, o.extra_price || 0);
    });

    return jsonOK(res, { message: 'Added to cart', orderId: cart.id, itemId: infoItem.lastInsertRowid });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Get cart (order + items + options) for user: GET /cart/:userId
app.get('/cart/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return jsonError(res, 400, 'Invalid userId');

    const cartOrder = getOpenOrderForUserStmt.get(userId, 'cart');
    if (!cartOrder) return res.json({ order: null, items: [] });

    // get items
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(cartOrder.id);
    const itemsWithOptions = items.map(it => {
      const opts = getOptionsForItemStmt.all(it.id);
      return { item: it, options: opts };
    });

    return res.json({ order: cartOrder, items: itemsWithOptions });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Update an order item (style, quantity, unit_price): PUT /order_item/:id
// payload: { userId, style, quantity, unitPrice }
app.put('/order_item/:id', (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const { userId, style, quantity, unitPrice } = req.body;
    if (!userId) return jsonError(res, 400, 'Missing userId');

    const item = getOrderItemById.get(itemId);
    if (!item) return jsonError(res, 404, 'Item not found');

    const order = getOrderById.get(item.order_id);
    if (!order) return jsonError(res, 404, 'Order not found');

    if (order.user_id !== Number(userId)) return jsonError(res, 403, 'Not allowed');

    updateOrderItemStmt.run(style || item.style, Number(quantity) || item.quantity, Number(unitPrice) || item.unit_price, itemId);
    return jsonOK(res, { message: 'Item updated' });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Delete an order item: DELETE /order_item/:id  (JSON body: { userId })
app.delete('/order_item/:id', (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const { userId } = req.body;
    if (!userId) return jsonError(res, 400, 'Missing userId');

    const item = getOrderItemById.get(itemId);
    if (!item) return jsonError(res, 404, 'Item not found');

    const order = getOrderById.get(item.order_id);
    if (!order) return jsonError(res, 404, 'Order not found');

    if (order.user_id !== Number(userId)) return jsonError(res, 403, 'Not allowed');

    deleteOrderItemStmt.run(itemId);
    return jsonOK(res, { message: 'Item deleted' });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Add option to an order item: POST /order_item/:id/option
// payload: { userId, option_key, option_text, extra_price }
app.post('/order_item/:id/option', (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const { userId, option_key, option_text, extra_price = 0 } = req.body;
    if (!userId) return jsonError(res, 400, 'Missing userId');
    if (!option_text) return jsonError(res, 400, 'option_text required');

    const item = getOrderItemById.get(itemId);
    if (!item) return jsonError(res, 404, 'Item not found');

    const order = getOrderById.get(item.order_id);
    if (!order) return jsonError(res, 404, 'Order not found');

    if (order.user_id !== Number(userId)) return jsonError(res, 403, 'Not allowed');

    const info = insertOrderItemOptionStmt.run(itemId, option_key || null, option_text, Number(extra_price) || 0);
    return jsonOK(res, { message: 'Option added', optionId: info.lastInsertRowid });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Update an order item option: PUT /order_item_option/:id
// payload: { userId, option_key, option_text, extra_price }
app.put('/order_item_option/:id', (req, res) => {
  try {
    const optId = Number(req.params.id);
    const { userId, option_key, option_text, extra_price } = req.body;
    if (!userId) return jsonError(res, 400, 'Missing userId');

    const opt = getOrderItemOptionById.get(optId);
    if (!opt) return jsonError(res, 404, 'Option not found');

    const item = getOrderItemById.get(opt.order_item_id);
    if (!item) return jsonError(res, 404, 'Order item not found');

    const order = getOrderById.get(item.order_id);
    if (!order) return jsonError(res, 404, 'Order not found');

    if (order.user_id !== Number(userId)) return jsonError(res, 403, 'Not allowed');

    updateOrderItemOptionStmt.run(option_key || opt.option_key, option_text || opt.option_text, Number(extra_price) || opt.extra_price, optId);
    return jsonOK(res, { message: 'Option updated' });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Delete order item option: DELETE /order_item_option/:id  (body: { userId })
app.delete('/order_item_option/:id', (req, res) => {
  try {
    const optId = Number(req.params.id);
    const { userId } = req.body;
    if (!userId) return jsonError(res, 400, 'Missing userId');

    const opt = getOrderItemOptionById.get(optId);
    if (!opt) return jsonError(res, 404, 'Option not found');

    const item = getOrderItemById.get(opt.order_item_id);
    if (!item) return jsonError(res, 404, 'Order item not found');

    const order = getOrderById.get(item.order_id);
    if (!order) return jsonError(res, 404, 'Order not found');

    if (order.user_id !== Number(userId)) return jsonError(res, 403, 'Not allowed');

    deleteOrderItemOptionStmt.run(optId);
    return jsonOK(res, { message: 'Option deleted' });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Checkout: set cart -> placed (POST /checkout with { userId })
app.post('/checkout', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return jsonError(res, 400, 'Missing userId');

    const cart = getOpenOrderForUserStmt.get(Number(userId), 'cart');
    if (!cart) return jsonError(res, 400, 'Cart empty');

    const stmt = db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run('placed', cart.id);

    return jsonOK(res, { message: 'Order placed', orderId: cart.id });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, 'Server error');
  }
});

// Helper: simple health
app.get('/ping', (req, res) => res.json({ ok: true, msg: 'pong' }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
