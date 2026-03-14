// Simple single-page POS app for Home Food Cloud Kitchen

const STORAGE_KEYS = {
  MENU: "hf_menu_items",
  ORDERS: "hf_orders",
};

const TAX_PERCENT = 0; // easy to tweak later

let menuItems = [];
let cartItems = [];
let orders = [];
let currentOrderLocation = null;
let leafletMap = null;
let leafletMarker = null;

function formatCurrency(amount) {
  return `₹${amount.toFixed(2)}`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  void toast.offsetWidth;
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 2000);
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors for now
  }
}

function getDefaultMenu() {
  return [
    {
      id: "idly",
      name: "Idly",
      price: 10,
      category: "Breakfast",
      image: "img/idly.jpg",
      isAvailable: true,
    },
    {
      id: "puttu",
      name: "Puttu",
      price: 25,
      category: "Breakfast",
      image: "img/puttu.jpg",
      isAvailable: true,
    },
    {
      id: "poori",
      name: "Poori",
      price: 30,
      category: "Breakfast",
      image: "img/poori.jpg",
      isAvailable: true,
    },
    {
      id: "dosai",
      name: "Dosai",
      price: 35,
      category: "Breakfast",
      image: "img/dosai.jpg",
      isAvailable: true,
    },
    {
      id: "vada",
      name: "Vada",
      price: 8,
      category: "Snacks",
      image: "img/vada.jpg",
      isAvailable: true,
    },
    {
      id: "pazham-pori",
      name: "Pazham Pori",
      price: 20,
      category: "Snacks",
      image: "img/pazham-pori.jpg",
      isAvailable: true,
    },
    {
      id: "coffee",
      name: "Coffee",
      price: 15,
      category: "Beverage",
      image: "img/coffee.jpg",
      isAvailable: true,
    },
  ];
}

function renderMenu() {
  const list = document.getElementById("menu-list");
  const manageBody = document.getElementById("menu-manage-body");
  const emptyMsg = document.getElementById("menu-empty-msg");
  if (!list || !manageBody || !emptyMsg) return;

  list.innerHTML = "";
  manageBody.innerHTML = "";

  if (!menuItems.length) {
    emptyMsg.style.display = "block";
    return;
  }
  emptyMsg.style.display = "none";

  menuItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = "menu-card";
    if (!item.isAvailable) {
      card.classList.add("unavailable");
    }

    const img = document.createElement("img");
    img.src = item.image || "img/placeholder-food.jpg";
    img.alt = item.name;
    card.appendChild(img);

    const titleRow = document.createElement("div");
    titleRow.className = "menu-card-title";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = item.name;
    const priceSpan = document.createElement("span");
    priceSpan.className = "menu-card-price";
    priceSpan.textContent = formatCurrency(item.price);
    titleRow.appendChild(nameSpan);
    titleRow.appendChild(priceSpan);
    card.appendChild(titleRow);

    const metaRow = document.createElement("div");
    metaRow.className = "menu-card-meta";
    metaRow.innerHTML = `<span>${item.category || "-"}</span><span>${
      item.isAvailable ? "Available" : "Unavailable"
    }</span>`;
    card.appendChild(metaRow);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.isAvailable ? "Add to cart" : "Not available";
    btn.disabled = !item.isAvailable;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addItemToCart(item.id);
    });
    card.addEventListener("click", () => {
      if (item.isAvailable) addItemToCart(item.id);
    });
    card.appendChild(btn);

    list.appendChild(card);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.category || "-"}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${item.isAvailable ? "Yes" : "No"}</td>
      <td>
        <button class="secondary" data-edit-menu="${item.id}">Edit</button>
        <button class="icon-button" data-delete-menu="${item.id}">&times;</button>
      </td>
    `;
    manageBody.appendChild(tr);
  });
}

function addItemToCart(menuItemId) {
  const item = menuItems.find((m) => m.id === menuItemId);
  if (!item || !item.isAvailable) return;

  const existing = cartItems.find((c) => c.itemId === item.id);
  if (existing) {
    existing.quantity += 1;
    existing.lineTotal = existing.quantity * existing.unitPrice;
  } else {
    cartItems.push({
      itemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: 1,
      lineTotal: item.price,
    });
  }
  renderCart();
  showToast(`${item.name} added to cart`);
}

function clearCart() {
  cartItems = [];
  renderCart();
}

function getCartTotals() {
  const subtotal = cartItems.reduce((sum, line) => sum + line.lineTotal, 0);
  const tax = (subtotal * TAX_PERCENT) / 100;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

function renderCart() {
  const body = document.getElementById("cart-body");
  const emptyMsg = document.getElementById("empty-cart-msg");
  const subtotalEl = document.getElementById("bill-subtotal");
  const taxEl = document.getElementById("bill-tax");
  const totalEl = document.getElementById("bill-total");
  const btnClear = document.getElementById("btn-clear-cart");
  const btnPay = document.getElementById("btn-pay-now");
  const btnSave = document.getElementById("btn-save-order");

  if (!body) return;

  body.innerHTML = "";

  if (!cartItems.length) {
    emptyMsg.style.display = "block";
    btnClear.disabled = true;
    btnPay.disabled = true;
    btnSave.disabled = true;
  } else {
    emptyMsg.style.display = "none";
    btnClear.disabled = false;
    btnPay.disabled = false;
    btnSave.disabled = false;
  }

  cartItems.forEach((line) => {
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = line.name;

    const qtyTd = document.createElement("td");
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.value = String(line.quantity);
    qtyInput.className = "cart-qty-input";
    qtyInput.addEventListener("change", () => {
      let newQty = parseInt(qtyInput.value, 10);
      if (Number.isNaN(newQty) || newQty < 1) newQty = 1;
      line.quantity = newQty;
      line.lineTotal = line.quantity * line.unitPrice;
      renderCart();
    });
    qtyTd.appendChild(qtyInput);

    const priceTd = document.createElement("td");
    priceTd.textContent = formatCurrency(line.unitPrice);

    const totalTd = document.createElement("td");
    totalTd.textContent = formatCurrency(line.lineTotal);

    const actionTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.className = "icon-button";
    removeBtn.type = "button";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => {
      cartItems = cartItems.filter((c) => c.itemId !== line.itemId);
      renderCart();
    });
    actionTd.appendChild(removeBtn);

    tr.appendChild(nameTd);
    tr.appendChild(qtyTd);
    tr.appendChild(priceTd);
    tr.appendChild(totalTd);
    tr.appendChild(actionTd);

    body.appendChild(tr);
  });

  const totals = getCartTotals();
  subtotalEl.textContent = formatCurrency(totals.subtotal);
  taxEl.textContent = formatCurrency(totals.tax);
  totalEl.textContent = formatCurrency(totals.total);
}

function getCustomerDetails() {
  return {
    name: document.getElementById("cust-name").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
    flat: document.getElementById("cust-flat").value.trim(),
    street: document.getElementById("cust-street").value.trim(),
    area: document.getElementById("cust-area").value.trim(),
    city: document.getElementById("cust-city").value.trim(),
    pincode: document.getElementById("cust-pincode").value.trim(),
  };
}

function buildAddressText(details) {
  const parts = [];
  if (details.name) parts.push(details.name);
  if (details.flat) parts.push(details.flat);
  if (details.street) parts.push(details.street);
  if (details.area) parts.push(details.area);
  if (details.city) parts.push(details.city);
  if (details.pincode) parts.push(`PIN: ${details.pincode}`);
  return parts.join(", ");
}

function saveOrderAndPrint() {
  if (!cartItems.length) {
    showToast("Cart is empty");
    return;
  }

  const customer = getCustomerDetails();
  const totals = getCartTotals();
  const now = new Date();
  const orderId = `ORD-${now.getTime()}`;

  const order = {
    id: orderId,
    timestamp: now.toISOString(),
    items: cartItems.map((c) => ({
      name: c.name,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      lineTotal: c.lineTotal,
    })),
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    customerName: customer.name,
    address: buildAddressText(customer),
    phone: customer.phone,
    location: currentOrderLocation,
  };

  orders.push(order);
  saveToStorage(STORAGE_KEYS.ORDERS, orders);

  fillPrintBill(order);
  showToast("Order saved");
  clearCart();
  window.print();
}

function fillPrintBill(order) {
  const meta = document.getElementById("print-bill-meta");
  const body = document.getElementById("print-bill-body");
  const subt = document.getElementById("print-subtotal");
  const tax = document.getElementById("print-tax");
  const total = document.getElementById("print-total");
  const addr = document.getElementById("print-address-text");

  const dateStr = new Date(order.timestamp).toLocaleString();
  meta.textContent = `Order: ${order.id} | ${dateStr}`;

  body.innerHTML = "";
  order.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${formatCurrency(item.unitPrice)}</td>
      <td>${formatCurrency(item.lineTotal)}</td>
    `;
    body.appendChild(tr);
  });

  subt.textContent = formatCurrency(order.subtotal);
  tax.textContent = formatCurrency(order.tax);
  total.textContent = formatCurrency(order.total);
  addr.textContent = order.address || "-";
}

function openQrModal() {
  const modal = document.getElementById("qr-modal");
  if (!modal) return;
  const amountLine = document.getElementById("qr-amount-line");
  const totals = getCartTotals();
  amountLine.textContent = `Amount: ${formatCurrency(totals.total)}`;
  modal.classList.remove("hidden");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("hidden");
  }
}

function initMap() {
  if (leafletMap) return;
  const mapDiv = document.getElementById("map");
  if (!mapDiv) return;

  leafletMap = L.map(mapDiv).setView([11.0168, 76.9558], 13); // default: Coimbatore

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
  }).addTo(leafletMap);

  leafletMap.on("click", (e) => {
    setMapLocation(e.latlng.lat, e.latlng.lng);
  });
}

function setMapLocation(lat, lng) {
  currentOrderLocation = { lat, lng };
  const status = document.getElementById("location-status");
  if (status) {
    status.textContent = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
  }
  if (!leafletMap) return;
  if (!leafletMarker) {
    leafletMarker = L.marker([lat, lng]).addTo(leafletMap);
  } else {
    leafletMarker.setLatLng([lat, lng]);
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported");
    return;
  }
  const status = document.getElementById("location-status");
  status.textContent = "Detecting location…";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      setMapLocation(latitude, longitude);
      if (leafletMap) {
        leafletMap.setView([latitude, longitude], 16);
      }
      showToast("Location set");
    },
    () => {
      status.textContent = "Could not get location";
      showToast("Location permission denied");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function chooseOnMap() {
  const modal = document.getElementById("map-modal");
  modal.classList.remove("hidden");
  setTimeout(() => {
    initMap();
    if (leafletMap) {
      leafletMap.invalidateSize();
      if (currentOrderLocation) {
        leafletMap.setView([currentOrderLocation.lat, currentOrderLocation.lng], 16);
      }
    }
  }, 50);
}

function handleNavClick(e) {
  const btn = e.currentTarget;
  const targetId = btn.getAttribute("data-target");
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const view = document.getElementById(targetId);
  if (view) view.classList.add("active");

  if (targetId === "reports-view") {
    renderReportFilters();
    renderReports();
  }
}

function handleMenuFormSubmit(e) {
  e.preventDefault();
  const idField = document.getElementById("menu-item-id");
  const nameField = document.getElementById("menu-name");
  const priceField = document.getElementById("menu-price");
  const catField = document.getElementById("menu-category");
  const imgField = document.getElementById("menu-image");
  const availField = document.getElementById("menu-available");

  const name = nameField.value.trim();
  const price = parseFloat(priceField.value);
  if (!name) {
    showToast("Name is required");
    return;
  }
  if (Number.isNaN(price) || price <= 0) {
    showToast("Price must be positive");
    return;
  }

  const idExisting = idField.value;
  if (idExisting) {
    const item = menuItems.find((m) => m.id === idExisting);
    if (item) {
      item.name = name;
      item.price = price;
      item.category = catField.value.trim();
      item.image = imgField.value.trim();
      item.isAvailable = availField.checked;
      showToast("Menu item updated");
    }
  } else {
    const newId = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36);
    menuItems.push({
      id: newId,
      name,
      price,
      category: catField.value.trim(),
      image: imgField.value.trim(),
      isAvailable: availField.checked,
    });
    showToast("Menu item added");
  }

  saveToStorage(STORAGE_KEYS.MENU, menuItems);
  renderMenu();
  resetMenuForm();
}

function resetMenuForm() {
  document.getElementById("menu-form").reset();
  document.getElementById("menu-item-id").value = "";
  document.getElementById("menu-available").checked = true;
}

function handleMenuManageClick(e) {
  const editId = e.target.getAttribute("data-edit-menu");
  const deleteId = e.target.getAttribute("data-delete-menu");
  if (editId) {
    const item = menuItems.find((m) => m.id === editId);
    if (!item) return;
    document.getElementById("menu-item-id").value = item.id;
    document.getElementById("menu-name").value = item.name;
    document.getElementById("menu-price").value = item.price;
    document.getElementById("menu-category").value = item.category || "";
    document.getElementById("menu-image").value = item.image || "";
    document.getElementById("menu-available").checked = !!item.isAvailable;
    showToast("Editing item");
  } else if (deleteId) {
    const confirmDelete = window.confirm("Delete this menu item?");
    if (!confirmDelete) return;
    menuItems = menuItems.filter((m) => m.id !== deleteId);
    saveToStorage(STORAGE_KEYS.MENU, menuItems);
    renderMenu();
    showToast("Menu item deleted");
  }
}

function renderReportFilters() {
  const monthSel = document.getElementById("report-month");
  const yearSel = document.getElementById("report-year");
  if (!monthSel || !yearSel) return;

  if (!monthSel.options.length) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    monthNames.forEach((name, index) => {
      const opt = document.createElement("option");
      opt.value = String(index);
      opt.textContent = name;
      monthSel.appendChild(opt);
    });
  }

  const years = new Set();
  const nowYear = new Date().getFullYear();
  years.add(nowYear);
  orders.forEach((o) => years.add(new Date(o.timestamp).getFullYear()));
  const sortedYears = Array.from(years).sort();

  yearSel.innerHTML = "";
  sortedYears.forEach((y) => {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  });

  const now = new Date();
  monthSel.value = String(now.getMonth());
  yearSel.value = String(now.getFullYear());
}

function renderReports() {
  const monthSel = document.getElementById("report-month");
  const yearSel = document.getElementById("report-year");
  const body = document.getElementById("report-orders-body");
  const emptyMsg = document.getElementById("report-empty-msg");
  const totalOrdersEl = document.getElementById("summary-total-orders");
  const totalRevenueEl = document.getElementById("summary-total-revenue");
  const topItemEl = document.getElementById("summary-top-item");

  if (!monthSel || !yearSel || !body) return;

  const month = parseInt(monthSel.value, 10);
  const year = parseInt(yearSel.value, 10);

  const filtered = orders.filter((o) => {
    const d = new Date(o.timestamp);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  body.innerHTML = "";

  if (!filtered.length) {
    emptyMsg.style.display = "block";
    totalOrdersEl.textContent = "0";
    totalRevenueEl.textContent = formatCurrency(0);
    topItemEl.textContent = "-";
    return;
  }
  emptyMsg.style.display = "none";

  let totalRevenue = 0;
  const itemCounts = new Map();

  filtered.forEach((o) => {
    totalRevenue += o.total;
    o.items.forEach((it) => {
      const prev = itemCounts.get(it.name) || 0;
      itemCounts.set(it.name, prev + it.quantity);
    });

    const tr = document.createElement("tr");
    const dateStr = new Date(o.timestamp).toLocaleDateString();
    const itemsStr = o.items.map((i) => `${i.name} x${i.quantity}`).join(", ");
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${o.id}</td>
      <td>${itemsStr}</td>
      <td>${formatCurrency(o.total)}</td>
    `;
    body.appendChild(tr);
  });

  totalOrdersEl.textContent = String(filtered.length);
  totalRevenueEl.textContent = formatCurrency(totalRevenue);

  let topItem = "-";
  let maxCount = 0;
  itemCounts.forEach((count, name) => {
    if (count > maxCount) {
      maxCount = count;
      topItem = name;
    }
  });
  topItemEl.textContent = topItem;
}

function initApp() {
  menuItems = loadFromStorage(STORAGE_KEYS.MENU, getDefaultMenu());
  orders = loadFromStorage(STORAGE_KEYS.ORDERS, []);

  const dateEl = document.getElementById("current-date");
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  renderMenu();
  renderCart();

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", handleNavClick);
  });

  document.getElementById("btn-clear-cart").addEventListener("click", () => {
    if (!cartItems.length) return;
    if (window.confirm("Clear cart?")) clearCart();
  });

  document.getElementById("btn-pay-now").addEventListener("click", openQrModal);
  document.getElementById("btn-save-order").addEventListener("click", saveOrderAndPrint);

  document.getElementById("btn-use-location").addEventListener("click", useCurrentLocation);
  document.getElementById("btn-choose-on-map").addEventListener("click", chooseOnMap);

  document.querySelectorAll("[data-close='qr-modal']").forEach((el) => {
    el.addEventListener("click", () => closeModal("qr-modal"));
  });
  document.querySelectorAll("[data-close='map-modal']").forEach((el) => {
    el.addEventListener("click", () => closeModal("map-modal"));
  });

  document.getElementById("menu-form").addEventListener("submit", handleMenuFormSubmit);
  document.getElementById("btn-reset-menu-form").addEventListener("click", resetMenuForm);
  document.getElementById("menu-manage-body").addEventListener("click", handleMenuManageClick);

  document.getElementById("btn-refresh-report").addEventListener("click", renderReports);

  renderReportFilters();
}

document.addEventListener("DOMContentLoaded", initApp);

