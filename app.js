// ================================================================
// NutriAgenda + Supabase
// Las citas ya NO se guardan en localStorage.
// Todos los dispositivos leen y escriben en la misma base de datos.
// ================================================================

const SUPABASE_URL = "https://zemfekzwzcpoehxrkbml.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6yqaX3PdQieS4IE5ZHSbyg_htjNK4MH";

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let selectedSlotId = null;
let currentView = "booking";
let refreshTimer = null;

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
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

function formatTime(timeString) {
  return String(timeString || "").slice(0, 5);
}

function isPastSlot(slot) {
  const dateTime = new Date(`${slot.appointment_date}T${formatTime(slot.appointment_time)}:00`);
  return dateTime.getTime() < Date.now();
}

async function showView(view) {
  currentView = view;

  document.getElementById("bookingView").classList.toggle("active", view === "booking");
  document.getElementById("adminView").classList.toggle("active", view === "admin");
  document.getElementById("navBooking").classList.toggle("active", view === "booking");
  document.getElementById("navAdmin").classList.toggle("active", view === "admin");

  if (view === "booking") {
    await renderPublicSlots();
  } else {
    await checkAdminSession();
  }
}

async function renderPublicSlots() {
  const grid = document.getElementById("slotsGrid");
  const empty = document.getElementById("emptySlots");

  grid.innerHTML = `<div class="loading-row">Cargando horarios...</div>`;
  empty.classList.add("hidden");

  const { data, error } = await db
    .from("slots")
    .select("id, subject, appointment_date, appointment_time, duration_minutes, booked")
    .eq("booked", false)
    .gte("appointment_date", localToday())
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });

  if (error) {
    console.error(error);
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    empty.innerHTML = `
      <div class="empty-icon">⚠️</div>
      <h3>No se pudieron cargar las citas</h3>
      <p>Revisa la conexión con Supabase o las políticas de la base de datos.</p>
    `;
    return;
  }

  const slots = (data || []).filter(slot => !isPastSlot(slot));
  grid.innerHTML = "";

  if (slots.length === 0) {
    empty.classList.remove("hidden");
    empty.innerHTML = `
      <div class="empty-icon">📅</div>
      <h3>No hay horarios disponibles</h3>
      <p>El administrador todavía no ha publicado nuevas citas.</p>
    `;
    return;
  }

  empty.classList.add("hidden");

  slots.forEach(slot => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.innerHTML = `
      <div class="slot-date">${formatDate(slot.appointment_date)}</div>
      <h3>${escapeHtml(slot.subject)}</h3>
      <div class="slot-meta">🕒 ${formatTime(slot.appointment_time)} · ${slot.duration_minutes} min</div>
      <button class="primary-btn" onclick="openBookingForm('${slot.id}')">Reservar</button>
    `;
    grid.appendChild(card);
  });
}

async function openBookingForm(id) {
  const { data: slot, error } = await db
    .from("slots")
    .select("id, subject, appointment_date, appointment_time, duration_minutes, booked")
    .eq("id", id)
    .single();

  if (error || !slot || slot.booked || isPastSlot(slot)) {
    toast("Ese horario ya no está disponible.");
    await renderPublicSlots();
    return;
  }

  selectedSlotId = id;
  document.getElementById("selectedSlotSummary").innerHTML = `
    <strong>${escapeHtml(slot.subject)}</strong><br>
    ${formatDate(slot.appointment_date)} · ${formatTime(slot.appointment_time)} · ${slot.duration_minutes} minutos
  `;

  document.getElementById("bookingFormCard").classList.remove("hidden");
  document.getElementById("bookingFormCard").scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeBookingForm() {
  selectedSlotId = null;
  document.getElementById("bookingFormCard").classList.add("hidden");
  document.getElementById("bookingForm").reset();
}

document.getElementById("bookingForm").addEventListener("submit", async function(event) {
  event.preventDefault();

  if (!selectedSlotId) return;

  const submitButton = event.submitter;
  setButtonLoading(submitButton, true, "Reservando...");

  const payload = {
    p_slot_id: selectedSlotId,
    p_name: document.getElementById("clientName").value.trim(),
    p_phone: document.getElementById("clientPhone").value.trim(),
    p_email: document.getElementById("clientEmail").value.trim() || null,
    p_notes: document.getElementById("clientNotes").value.trim() || null
  };

  const { error } = await db.rpc("book_slot", payload);

  setButtonLoading(submitButton, false);

  if (error) {
    console.error(error);
    const unavailable = String(error.message || "").includes("SLOT_NOT_AVAILABLE") ||
                        String(error.message || "").toLowerCase().includes("duplicate");
    toast(unavailable
      ? "Ese horario acaba de ser reservado por otra persona."
      : "No se pudo guardar la cita. Intenta nuevamente.");
    closeBookingForm();
    await renderPublicSlots();
    return;
  }

  toast("¡Cita reservada correctamente! 🌿");
  closeBookingForm();
  await renderPublicSlots();
});

// ============================ ADMIN ============================

document.getElementById("adminLoginForm").addEventListener("submit", loginAdmin);

async function loginAdmin(event) {
  event.preventDefault();

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const errorText = document.getElementById("loginError");
  const button = event.submitter;

  errorText.classList.add("hidden");
  setButtonLoading(button, true, "Entrando...");

  const { error } = await db.auth.signInWithPassword({ email, password });

  setButtonLoading(button, false);

  if (error) {
    console.error(error);
    errorText.textContent = "Correo o contraseña incorrectos.";
    errorText.classList.remove("hidden");
    return;
  }

  document.getElementById("adminPassword").value = "";
  await showAdminPanel();
}

async function checkAdminSession() {
  const { data, error } = await db.auth.getSession();

  if (error || !data.session) {
    document.getElementById("adminPanel").classList.add("hidden");
    document.getElementById("adminLogin").classList.remove("hidden");
    return;
  }

  await showAdminPanel();
}

async function logoutAdmin() {
  await db.auth.signOut();
  document.getElementById("adminPanel").classList.add("hidden");
  document.getElementById("adminLogin").classList.remove("hidden");
  document.getElementById("adminEmail").value = "";
  document.getElementById("adminPassword").value = "";
  toast("Sesión cerrada.");
}

async function showAdminPanel() {
  document.getElementById("adminLogin").classList.add("hidden");
  document.getElementById("adminPanel").classList.remove("hidden");
  await renderAdminSlots();
}

document.getElementById("slotForm").addEventListener("submit", async function(event) {
  event.preventDefault();

  const button = event.submitter;
  setButtonLoading(button, true, "Publicando...");

  const slot = {
    subject: document.getElementById("slotSubject").value.trim(),
    appointment_date: document.getElementById("slotDate").value,
    appointment_time: document.getElementById("slotTime").value,
    duration_minutes: Number(document.getElementById("slotDuration").value),
    booked: false
  };

  const { error } = await db.from("slots").insert(slot);

  setButtonLoading(button, false);

  if (error) {
    console.error(error);
    if (String(error.code) === "23505") {
      toast("Ya existe un horario en esa fecha y hora.");
    } else if (String(error.code) === "42501") {
      toast("Tu usuario no tiene permiso para crear horarios.");
    } else {
      toast("No se pudo publicar el horario.");
    }
    return;
  }

  event.target.reset();
  document.getElementById("slotDuration").value = "60";
  setDefaultDate();
  toast("Horario publicado y visible en todos los dispositivos. 🌿");
  await refreshAll();
});

async function renderAdminSlots() {
  const list = document.getElementById("adminSlotsList");
  list.innerHTML = `<div class="loading-row">Cargando citas...</div>`;

  const [{ data: slots, error: slotsError }, { data: bookings, error: bookingsError }] = await Promise.all([
    db
      .from("slots")
      .select("id, subject, appointment_date, appointment_time, duration_minutes, booked")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true }),
    db
      .from("bookings")
      .select("id, slot_id, name, phone, email, notes, created_at")
      .order("created_at", { ascending: false })
  ]);

  if (slotsError || bookingsError) {
    console.error(slotsError || bookingsError);
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>No se pudieron cargar los datos</h3>
        <p>Verifica que hayas iniciado sesión y que las políticas RLS estén configuradas.</p>
      </div>
    `;
    return;
  }

  const allSlots = slots || [];
  const bookingMap = new Map((bookings || []).map(b => [b.slot_id, b]));
  const upcomingSlots = allSlots.filter(slot => !isPastSlot(slot));

  document.getElementById("statSlots").textContent = upcomingSlots.length;
  document.getElementById("statBooked").textContent = upcomingSlots.filter(s => s.booked).length;
  document.getElementById("statFree").textContent = upcomingSlots.filter(s => !s.booked).length;

  list.innerHTML = "";

  if (allSlots.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗓️</div>
        <h3>Sin horarios</h3>
        <p>Agrega el primer horario disponible.</p>
      </div>
    `;
    return;
  }

  allSlots.forEach(slot => {
    const booking = bookingMap.get(slot.id);
    const past = isPastSlot(slot);
    const item = document.createElement("div");
    item.className = `admin-slot${past ? " past-slot" : ""}`;

    const clientBox = booking ? `
      <div class="client-box">
        <strong>Paciente:</strong> ${escapeHtml(booking.name)}<br>
        <strong>Teléfono:</strong> <a href="tel:${escapeAttribute(booking.phone)}">${escapeHtml(booking.phone)}</a><br>
        ${booking.email ? `<strong>Correo:</strong> <a href="mailto:${escapeAttribute(booking.email)}">${escapeHtml(booking.email)}</a><br>` : ""}
        ${booking.notes ? `<strong>Notas:</strong> ${escapeHtml(booking.notes)}` : ""}
      </div>
    ` : "";

    const statusClass = booking ? "booked" : "free";
    const statusText = past ? (booking ? "Finalizada / reservada" : "Horario pasado") : (booking ? "Reservada" : "Disponible");

    item.innerHTML = `
      <div class="admin-slot-top">
        <div>
          <h3>${escapeHtml(slot.subject)}</h3>
          <p>${formatShortDate(slot.appointment_date)} · ${formatTime(slot.appointment_time)} · ${slot.duration_minutes} min</p>
        </div>
        <button class="danger-btn" onclick="deleteSlot('${slot.id}', ${Boolean(booking)})">Eliminar</button>
      </div>

      <span class="status ${statusClass}">${statusText}</span>
      ${clientBox}
    `;

    list.appendChild(item);
  });
}

async function deleteSlot(id, hasBooking) {
  const message = hasBooking
    ? "Este horario tiene una reservación y también se eliminarán los datos de esa cita. ¿Continuar?"
    : "¿Eliminar este horario?";

  if (!confirm(message)) return;

  const { error } = await db.from("slots").delete().eq("id", id);

  if (error) {
    console.error(error);
    toast("No se pudo eliminar el horario.");
    return;
  }

  toast("Horario eliminado.");
  await refreshAll();
}

async function refreshAll() {
  if (currentView === "booking") {
    await renderPublicSlots();
    return;
  }

  const { data } = await db.auth.getSession();
  if (data.session) await renderAdminSlots();
}

function setDefaultDate() {
  const input = document.getElementById("slotDate");
  const today = localToday();
  input.min = today;
  if (!input.value) input.value = today;
}

function setButtonLoading(button, loading, text = "Cargando...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

// Actualización automática para que una reservación hecha en otro celular
// aparezca sin tener que recargar manualmente la página.
function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!document.hidden) refreshAll();
  }, 12000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshAll();
});

db.auth.onAuthStateChange((event) => {
  if (currentView !== "admin") return;

  if (event === "SIGNED_OUT") {
    document.getElementById("adminPanel").classList.add("hidden");
    document.getElementById("adminLogin").classList.remove("hidden");
  }
});

setDefaultDate();
renderPublicSlots();
startAutoRefresh();
