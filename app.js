const STORAGE_KEY = "nutriagenda_slots_v1";
const ADMIN_PIN = "1234";

let selectedSlotId = null;

function getSlots() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveSlots(slots) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
}

function formatDate(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

function formatShortDate(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function showView(view) {
  document.getElementById("bookingView").classList.toggle("active", view === "booking");
  document.getElementById("adminView").classList.toggle("active", view === "admin");
  document.getElementById("navBooking").classList.toggle("active", view === "booking");
  document.getElementById("navAdmin").classList.toggle("active", view === "admin");

  if (view === "booking") renderPublicSlots();
  if (view === "admin" && sessionStorage.getItem("nutriAdmin") === "1") {
    showAdminPanel();
  }
}

function renderPublicSlots() {
  const grid = document.getElementById("slotsGrid");
  const empty = document.getElementById("emptySlots");
  const slots = getSlots()
    .filter(slot => !slot.booking)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  grid.innerHTML = "";

  if (slots.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  slots.forEach(slot => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.innerHTML = `
      <div class="slot-date">${formatDate(slot.date)}</div>
      <h3>${escapeHtml(slot.subject)}</h3>
      <div class="slot-meta">🕒 ${slot.time} · ${slot.duration} min</div>
      <button class="primary-btn" onclick="openBookingForm('${slot.id}')">Reservar</button>
    `;
    grid.appendChild(card);
  });
}

function openBookingForm(id) {
  const slot = getSlots().find(s => s.id === id);
  if (!slot || slot.booking) return;

  selectedSlotId = id;

  document.getElementById("selectedSlotSummary").innerHTML = `
    <strong>${escapeHtml(slot.subject)}</strong><br>
    ${formatDate(slot.date)} · ${slot.time} · ${slot.duration} minutos
  `;

  document.getElementById("bookingFormCard").classList.remove("hidden");
  document.getElementById("bookingFormCard").scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeBookingForm() {
  selectedSlotId = null;
  document.getElementById("bookingFormCard").classList.add("hidden");
  document.getElementById("bookingForm").reset();
}

document.getElementById("bookingForm").addEventListener("submit", function(event) {
  event.preventDefault();

  const slots = getSlots();
  const index = slots.findIndex(s => s.id === selectedSlotId);

  if (index === -1 || slots[index].booking) {
    toast("Ese horario ya no está disponible.");
    closeBookingForm();
    renderPublicSlots();
    return;
  }

  slots[index].booking = {
    name: document.getElementById("clientName").value.trim(),
    phone: document.getElementById("clientPhone").value.trim(),
    email: document.getElementById("clientEmail").value.trim(),
    notes: document.getElementById("clientNotes").value.trim(),
    createdAt: new Date().toISOString()
  };

  saveSlots(slots);
  toast("¡Cita reservada correctamente! 🌿");
  closeBookingForm();
  renderPublicSlots();
});

function loginAdmin() {
  const pin = document.getElementById("adminPin").value;

  if (pin === ADMIN_PIN) {
    sessionStorage.setItem("nutriAdmin", "1");
    document.getElementById("pinError").classList.add("hidden");
    showAdminPanel();
  } else {
    document.getElementById("pinError").classList.remove("hidden");
  }
}

function logoutAdmin() {
  sessionStorage.removeItem("nutriAdmin");
  document.getElementById("adminPanel").classList.add("hidden");
  document.getElementById("adminLogin").classList.remove("hidden");
  document.getElementById("adminPin").value = "";
}

function showAdminPanel() {
  document.getElementById("adminLogin").classList.add("hidden");
  document.getElementById("adminPanel").classList.remove("hidden");
  renderAdminSlots();
}

document.getElementById("slotForm").addEventListener("submit", function(event) {
  event.preventDefault();

  const subject = document.getElementById("slotSubject").value.trim();
  const date = document.getElementById("slotDate").value;
  const time = document.getElementById("slotTime").value;
  const duration = Number(document.getElementById("slotDuration").value);

  const slots = getSlots();

  const exists = slots.some(s => s.date === date && s.time === time);
  if (exists) {
    toast("Ya existe un horario en esa fecha y hora.");
    return;
  }

  slots.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    subject,
    date,
    time,
    duration,
    booking: null
  });

  saveSlots(slots);
  event.target.reset();
  document.getElementById("slotDuration").value = "60";
  setDefaultDate();
  toast("Horario publicado.");
  renderAdminSlots();
  renderPublicSlots();
});

function renderAdminSlots() {
  const list = document.getElementById("adminSlotsList");
  const slots = getSlots()
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  list.innerHTML = "";

  document.getElementById("statSlots").textContent = slots.length;
  document.getElementById("statBooked").textContent = slots.filter(s => s.booking).length;
  document.getElementById("statFree").textContent = slots.filter(s => !s.booking).length;

  if (slots.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗓️</div>
        <h3>Sin horarios</h3>
        <p>Agrega el primer horario disponible.</p>
      </div>
    `;
    return;
  }

  slots.forEach(slot => {
    const item = document.createElement("div");
    item.className = "admin-slot";

    const clientBox = slot.booking ? `
      <div class="client-box">
        <strong>Paciente:</strong> ${escapeHtml(slot.booking.name)}<br>
        <strong>Teléfono:</strong> ${escapeHtml(slot.booking.phone)}<br>
        ${slot.booking.email ? `<strong>Correo:</strong> ${escapeHtml(slot.booking.email)}<br>` : ""}
        ${slot.booking.notes ? `<strong>Notas:</strong> ${escapeHtml(slot.booking.notes)}` : ""}
      </div>
    ` : "";

    item.innerHTML = `
      <div class="admin-slot-top">
        <div>
          <h3>${escapeHtml(slot.subject)}</h3>
          <p>${formatShortDate(slot.date)} · ${slot.time} · ${slot.duration} min</p>
        </div>
        <button class="danger-btn" onclick="deleteSlot('${slot.id}')">Eliminar</button>
      </div>

      <span class="status ${slot.booking ? "booked" : "free"}">
        ${slot.booking ? "Reservada" : "Disponible"}
      </span>

      ${clientBox}
    `;

    list.appendChild(item);
  });
}

function deleteSlot(id) {
  const slots = getSlots();
  const slot = slots.find(s => s.id === id);

  const message = slot && slot.booking
    ? "Este horario tiene una reservación. ¿Seguro que quieres eliminarlo?"
    : "¿Eliminar este horario?";

  if (!confirm(message)) return;

  saveSlots(slots.filter(s => s.id !== id));
  toast("Horario eliminado.");
  renderAdminSlots();
  renderPublicSlots();
}

function seedDemoData() {
  const slots = getSlots();

  if (slots.length > 0 && !confirm("Ya existen datos. ¿Agregar además algunos horarios de ejemplo?")) {
    return;
  }

  const now = new Date();
  const makeDate = offset => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const demo = [
    {
      id: "demo-" + Date.now() + "-1",
      subject: "Consulta nutricional inicial",
      date: makeDate(1),
      time: "10:00",
      duration: 60,
      booking: null
    },
    {
      id: "demo-" + Date.now() + "-2",
      subject: "Seguimiento nutricional",
      date: makeDate(1),
      time: "12:30",
      duration: 45,
      booking: null
    },
    {
      id: "demo-" + Date.now() + "-3",
      subject: "Valoración y plan alimenticio",
      date: makeDate(2),
      time: "16:00",
      duration: 60,
      booking: null
    }
  ];

  saveSlots([...slots, ...demo]);
  toast("Horarios de ejemplo agregados.");
  renderAdminSlots();
  renderPublicSlots();
}

function setDefaultDate() {
  const input = document.getElementById("slotDate");
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  input.min = local;
  if (!input.value) input.value = local;
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

setDefaultDate();
renderPublicSlots();

if (sessionStorage.getItem("nutriAdmin") === "1") {
  showAdminPanel();
}
