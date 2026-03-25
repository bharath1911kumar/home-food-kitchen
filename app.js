// Simple single-page POS app for Home Food Cloud Kitchen

const STORAGE_KEYS = {
  MENU: "hf_menu_items",
  ORDERS: "hf_orders",
};

const TAX_PERCENT = 0; // easy to tweak later
const REPORT_AUTH = { username: "admin", password: "1234" };
const MENU_AUTH = { username: "admin", password: "1234" };

let menuItems = [];
let cartItems = [];
let orders = [];
let currentOrderLocation = null;
let leafletMap = null;
let leafletMarker = null;
let pendingNavTarget = null;
let checkoutStep = 1;

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

function getFilteredAndSortedMenuItems() {
  const categoryFilter = (document.getElementById("menu-category-filter")?.value || "all").toLowerCase();
  const sortOrder = document.getElementById("menu-sort-order")?.value || "name-asc";

  let filtered = [...menuItems];
  if (categoryFilter !== "all") {
    filtered = filtered.filter((item) => (item.category || "").toLowerCase() === categoryFilter);
  }

  filtered.sort((a, b) => {
    if (sortOrder === "price-asc") return a.price - b.price;
    if (sortOrder === "price-desc") return b.price - a.price;
    return a.name.localeCompare(b.name);
  });

  return filtered;
}

function renderMenuCategoryFilter() {
  const select = document.getElementById("menu-category-filter");
  if (!select) return;

  const currentValue = select.value || "all";
  const categories = Array.from(new Set(menuItems.map((item) => item.category).filter(Boolean))).sort();
  select.innerHTML = `<option value="all">All</option>`;

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.toLowerCase();
    option.textContent = category;
    select.appendChild(option);
  });

  const hasCurrent = Array.from(select.options).some((opt) => opt.value === currentValue);
  select.value = hasCurrent ? currentValue : "all";
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

  renderMenuCategoryFilter();
  const displayItems = getFilteredAndSortedMenuItems();

  displayItems.forEach((item) => {
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
  const btnNextPayment = document.getElementById("btn-next-payment");
  const btnReviewCart = document.getElementById("btn-review-cart");

  if (!body) return;

  body.innerHTML = "";

  if (!cartItems.length) {
    emptyMsg.style.display = "block";
    btnClear.disabled = true;
    btnNextPayment.disabled = true;
    btnReviewCart.disabled = true;
  } else {
    emptyMsg.style.display = "none";
    btnClear.disabled = false;
    btnNextPayment.disabled = false;
    btnReviewCart.disabled = false;
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
  renderStep3Summary();
}

function getCustomerDetails() {
  return {
    name: document.getElementById("cust-name").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
    email: document.getElementById("cust-email").value.trim(),
    flat: document.getElementById("cust-flat").value.trim(),
    street: document.getElementById("cust-street").value.trim(),
    area: document.getElementById("cust-area").value.trim(),
    city: document.getElementById("cust-city").value.trim(),
    pincode: document.getElementById("cust-pincode").value.trim(),
    locationLink: document.getElementById("cust-location-link").value.trim(),
    comments: document.getElementById("cust-comments").value.trim(),
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
  if (details.locationLink) parts.push(`Map: ${details.locationLink}`);
  if (details.comments) parts.push(`Instructions: ${details.comments}`);
  return parts.join(", ");
}

function setCheckoutStep(step) {
  checkoutStep = step;
  document.getElementById("checkout-step-1").classList.toggle("step-hidden", step !== 1);
  document.getElementById("checkout-step-2").classList.toggle("step-hidden", step !== 2);
  document.getElementById("checkout-step-3").classList.toggle("step-hidden", step !== 3);

  document.getElementById("step-indicator-1").classList.toggle("active", step === 1);
  document.getElementById("step-indicator-2").classList.toggle("active", step === 2);
  document.getElementById("step-indicator-3").classList.toggle("active", step === 3);

  if (step === 3) {
    renderStep3Summary();
  }
}

function goStep2() {
  const customer = getCustomerDetails();
  if (!cartItems.length) {
    showToast("Add items before reviewing cart");
    return;
  }
  if (!customer.name || !customer.phone) {
    showToast("Enter customer name and phone");
    return;
  }
  if (!isValidPhoneNumber(customer.phone)) {
    showToast("Phone number must be exactly 10 digits");
    return;
  }
  setCheckoutStep(2);
}

function goStep3() {
  if (!cartItems.length) {
    showToast("Cart is empty");
    return;
  }
  setCheckoutStep(3);
}

function formatRupeeSimple(amount) {
  return Number.isInteger(amount) ? `₹${amount}` : `₹${amount.toFixed(2)}`;
}

function getPaymentLabel(paymentMethod) {
  return paymentMethod === "COD" ? "Cash on Delivery" : "UPI";
}

function isValidPhoneNumber(phone) {
  return /^[0-9]{10}$/.test(phone);
}

function buildOrderSummaryText(paymentMethod) {
  const customer = getCustomerDetails();
  const totals = getCartTotals();
  const location = customer.locationLink || "Not set";
  const paymentLabel = getPaymentLabel(paymentMethod);
  const lines = [
    "sri lakshmi Home foods - Daily Menu",
    `Name: ${customer.name || "-"}`,
    `Phone: ${customer.phone || "-"}`,
    `Email: ${customer.email || "-"}`,
    `Location: ${location}`,
    `Payment: ${paymentLabel}`,
    "",
    "Items:",
    ...cartItems.map((item) => `* ${item.name} x${item.quantity} = ${formatRupeeSimple(item.lineTotal)}`),
    "",
    `${formatRupeeSimple(totals.total)}`,
  ];
  return lines.join("\n");
}

function renderStep3Summary() {
  const subtotalEl = document.getElementById("step3-subtotal");
  const totalEl = document.getElementById("step3-total");
  const paymentMethod = document.getElementById("payment-method")?.value || "UPI";
  const summaryEl = document.getElementById("step3-order-summary");
  if (!subtotalEl || !totalEl || !summaryEl) return;

  const totals = getCartTotals();
  subtotalEl.textContent = formatCurrency(totals.subtotal);
  totalEl.textContent = formatCurrency(totals.total);
  summaryEl.textContent = buildOrderSummaryText(paymentMethod);
}

function copyOrderSummary() {
  const paymentMethod = document.getElementById("payment-method")?.value || "UPI";
  const text = buildOrderSummaryText(paymentMethod);
  navigator.clipboard.writeText(text).then(
    () => showToast("Order summary copied"),
    () => showToast("Copy failed")
  );
}

function placeOrder() {
  if (!cartItems.length) {
    showToast("Cart is empty");
    return;
  }

  const customer = getCustomerDetails();
  const paymentMethod = document.getElementById("payment-method").value;
  const paymentLabel = getPaymentLabel(paymentMethod);
  const totals = getCartTotals();
  const now = new Date();
  const orderId = `ORD-${now.getTime()}`;

  if (!customer.name || !isValidPhoneNumber(customer.phone)) {
    showToast("Enter valid customer details before placing order");
    return;
  }

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
    email: customer.email,
    comments: customer.comments,
    paymentMethod: paymentLabel,
    location: currentOrderLocation,
    locationLink: customer.locationLink,
  };

  orders.push(order);
  saveToStorage(STORAGE_KEYS.ORDERS, orders);

  showOrderPlacedModal(order);
  showToast("Order placed");
  clearCart();
  setCheckoutStep(1);
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

function showOrderPlacedModal(order) {
  const modal = document.getElementById("order-success-modal");
  if (!modal) return;
  const amountLine = document.getElementById("qr-amount-line");
  const msg = document.getElementById("order-success-message");
  const paymentMode = document.getElementById("order-payment-mode");
  const mapLink = document.getElementById("order-map-link");
  const summary = document.getElementById("order-success-summary");
  amountLine.textContent = `Bill Amount: ${formatCurrency(order.total)}`;
  paymentMode.textContent = order.paymentMethod;
  msg.textContent =
    order.paymentMethod === "UPI"
      ? "Order placed. Email summary was delivered. Please complete payment using UPI."
      : "Order placed. Email summary was delivered. Payment mode: Cash on Delivery.";
  mapLink.href = order.locationLink || "#";
  mapLink.style.display = order.locationLink ? "inline" : "none";
  summary.textContent = buildOrderSummaryText(order.paymentMethod);
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
    reverseGeocodeAndFill(e.latlng.lat, e.latlng.lng);
  });
}

function setMapLocation(lat, lng) {
  currentOrderLocation = { lat, lng };
  const status = document.getElementById("location-status");
  const linkInput = document.getElementById("cust-location-link");
  const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
  if (linkInput) {
    linkInput.value = mapsLink;
  }
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

async function reverseGeocodeAndFill(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error("Reverse geocode failed");
    }
    const data = await response.json();
    const address = data.address || {};

    const road = address.road || address.pedestrian || address.neighbourhood || "";
    const area = address.suburb || address.village || address.county || "";
    const city = address.city || address.town || address.state_district || address.state || "";
    const pincode = address.postcode || "";

    const streetInput = document.getElementById("cust-street");
    const areaInput = document.getElementById("cust-area");
    const cityInput = document.getElementById("cust-city");
    const pinInput = document.getElementById("cust-pincode");

    if (streetInput && !streetInput.value.trim()) streetInput.value = road;
    if (areaInput && !areaInput.value.trim()) areaInput.value = area;
    if (cityInput && !cityInput.value.trim()) cityInput.value = city;
    if (pinInput && !pinInput.value.trim()) pinInput.value = pincode;
  } catch {
    // Keep manual entry as fallback
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
      reverseGeocodeAndFill(latitude, longitude);
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
  if (targetId === "reports-view") {
    pendingNavTarget = targetId;
    openReportAuthModal();
    return;
  }
  if (targetId === "menu-view") {
    pendingNavTarget = targetId;
    openMenuAuthModal();
    return;
  }
  activateView(targetId);
}

function activateView(targetId) {
  const targetBtn = document.querySelector(`.nav-tab[data-target="${targetId}"]`);
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
  if (targetBtn) targetBtn.classList.add("active");
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const view = document.getElementById(targetId);
  if (view) view.classList.add("active");

  if (targetId === "reports-view") {
    renderReportFilters();
    renderReports();
  }
}

function openReportAuthModal() {
  const modal = document.getElementById("report-auth-modal");
  if (modal) modal.classList.remove("hidden");
}

function openMenuAuthModal() {
  const modal = document.getElementById("menu-auth-modal");
  if (modal) modal.classList.remove("hidden");
}

function handleReportLogin() {
  const user = document.getElementById("report-username")?.value.trim();
  const pass = document.getElementById("report-password")?.value.trim();
  if (user === REPORT_AUTH.username && pass === REPORT_AUTH.password) {
    closeModal("report-auth-modal");
    document.getElementById("report-username").value = "";
    document.getElementById("report-password").value = "";
    const target = pendingNavTarget || "reports-view";
    pendingNavTarget = null;
    activateView(target);
    showToast("Reports unlocked");
    return;
  }
  showToast("Invalid report credentials");
}

function handleMenuLogin() {
  const user = document.getElementById("menu-username")?.value.trim();
  const pass = document.getElementById("menu-password")?.value.trim();
  if (user === MENU_AUTH.username && pass === MENU_AUTH.password) {
    closeModal("menu-auth-modal");
    document.getElementById("menu-username").value = "";
    document.getElementById("menu-password").value = "";
    const target = pendingNavTarget || "menu-view";
    pendingNavTarget = null;
    activateView(target);
    showToast("Menu management unlocked");
    return;
  }
  showToast("Invalid menu credentials");
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

  document.getElementById("btn-review-cart").addEventListener("click", goStep2);
  document.getElementById("btn-back-step-1").addEventListener("click", () => setCheckoutStep(1));
  document.getElementById("btn-next-payment").addEventListener("click", goStep3);
  document.getElementById("btn-back-step-2").addEventListener("click", () => setCheckoutStep(2));
  document.getElementById("btn-copy-order").addEventListener("click", copyOrderSummary);
  document.getElementById("btn-place-order").addEventListener("click", placeOrder);
  document.getElementById("payment-method").addEventListener("change", renderStep3Summary);

  document.getElementById("btn-use-location").addEventListener("click", useCurrentLocation);
  document.getElementById("btn-choose-on-map").addEventListener("click", chooseOnMap);
  document.getElementById("cust-phone").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
  });
  document.getElementById("menu-category-filter").addEventListener("change", renderMenu);
  document.getElementById("menu-sort-order").addEventListener("change", renderMenu);

  document.querySelectorAll("[data-close='order-success-modal']").forEach((el) => {
    el.addEventListener("click", () => closeModal("order-success-modal"));
  });
  document.querySelectorAll("[data-close='map-modal']").forEach((el) => {
    el.addEventListener("click", () => closeModal("map-modal"));
  });
  document.querySelectorAll("[data-close='report-auth-modal']").forEach((el) => {
    el.addEventListener("click", () => {
      closeModal("report-auth-modal");
      pendingNavTarget = null;
    });
  });
  document.querySelectorAll("[data-close='menu-auth-modal']").forEach((el) => {
    el.addEventListener("click", () => {
      closeModal("menu-auth-modal");
      pendingNavTarget = null;
    });
  });
  document.getElementById("btn-report-login").addEventListener("click", handleReportLogin);
  document.getElementById("btn-menu-login").addEventListener("click", handleMenuLogin);

  document.getElementById("menu-form").addEventListener("submit", handleMenuFormSubmit);
  document.getElementById("btn-reset-menu-form").addEventListener("click", resetMenuForm);
  document.getElementById("menu-manage-body").addEventListener("click", handleMenuManageClick);

  document.getElementById("btn-refresh-report").addEventListener("click", renderReports);

  renderReportFilters();
  setCheckoutStep(1);
}

document.addEventListener("DOMContentLoaded", initApp);

