const WHATSAPP_NUMBER = "639171669125";
const MESSENGER_URL = "https://m.me/jennyluxespa";
const bookingConfig = window.JENNYLUXE_BOOKING || {};
const bookingForm = document.querySelector("#booking-form");
const dateInput = document.querySelector("#date");
const timeSelect = document.querySelector("#time");
const formStatus = document.querySelector("#form-status");
const bookingHelp = document.querySelector("#booking-help");
const whatsappLink = document.querySelector("#booking-whatsapp");
const submitButton = bookingForm.querySelector(".form-submit");
const bookingApi = bookingConfig.supabaseUrl && bookingConfig.supabaseAnonKey
  ? `${bookingConfig.supabaseUrl.replace(/\/+$/, "")}/rest/v1`
  : null;
const supabaseClient = bookingApi && window.supabase?.createClient
  ? window.supabase.createClient(bookingConfig.supabaseUrl, bookingConfig.supabaseAnonKey)
  : null;
dateInput.min = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
document.querySelector("#year").textContent = new Date().getFullYear();
document.querySelector(".messenger-link").href = MESSENGER_URL;

function setSlotOptions(slots, emptyMessage, selectedSlotId = "") {
  timeSelect.replaceChildren(new Option(emptyMessage, ""));
  slots.forEach((slot) => {
    const startsAt = new Date(slot.starts_at);
    const label = startsAt.toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit"
    });
    timeSelect.add(new Option(label, slot.id));
  });
  if (slots.some((slot) => slot.id === selectedSlotId)) timeSelect.value = selectedSlotId;
  timeSelect.disabled = slots.length === 0;
  submitButton.disabled = timeSelect.disabled || !timeSelect.value;
}

async function loadAvailableSlots(silent = false) {
  if (!bookingApi) {
    setSlotOptions([], "Booking service needs setup");
    bookingHelp.textContent = "Live reservations need a connected booking database. Message JennyLuxe on WhatsApp in the meantime.";
    return;
  }
  if (!dateInput.value) {
    setSlotOptions([], "Choose a date first");
    return;
  }

  const selectedSlotId = timeSelect.value;
  if (!silent) {
    setSlotOptions([], "Loading available times...");
    timeSelect.disabled = true;
  }
  const dayStart = new Date(`${dateInput.value}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const query = new URLSearchParams({
    select: "id,starts_at,reserved_until",
    and: `(starts_at.gte.${dayStart.toISOString()},starts_at.lt.${dayEnd.toISOString()})`,
    order: "starts_at.asc"
  });

  try {
    const response = await fetch(`${bookingApi}/booking_slots?${query}`, {
      headers: {
        apikey: bookingConfig.supabaseAnonKey,
        Authorization: `Bearer ${bookingConfig.supabaseAnonKey}`
      }
    });
    if (!response.ok) throw new Error("Could not load availability. Please try again.");
    const slots = (await response.json()).filter((slot) =>
      !slot.reserved_until || new Date(slot.reserved_until).getTime() <= Date.now()
    );
    setSlotOptions(slots, slots.length ? "Choose an available time" : "No times available that day", selectedSlotId);
    bookingHelp.textContent = slots.length
      ? "Choose an open time. The slot is held for 15 minutes after you reserve it."
      : "There are no open appointment times on this date. Choose another date or message the team.";
  } catch (error) {
    setSlotOptions([], "Availability unavailable");
    bookingHelp.textContent = error.message;
  }
}

dateInput.addEventListener("change", () => {
  formStatus.textContent = "";
  whatsappLink.hidden = true;
  whatsappLink.removeAttribute("href");
  loadAvailableSlots();
});
if (supabaseClient) {
  supabaseClient.channel("public-booking-slots")
    .on("postgres_changes", { event: "*", schema: "public", table: "booking_slots" }, () => {
      if (dateInput.value) loadAvailableSlots(true);
    })
    .subscribe();
}
window.setInterval(() => {
  if (dateInput.value) loadAvailableSlots(true);
}, 30000);
bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!bookingApi) {
    formStatus.textContent = "Online booking isn't connected yet. Please contact JennyLuxe on WhatsApp.";
    return;
  }
  if (!bookingForm.reportValidity()) return;

  const data = new FormData(bookingForm);
  submitButton.disabled = true;
  formStatus.textContent = "Reserving that time...";
  try {
    const response = await fetch(`${bookingApi}/rpc/reserve_appointment`, {
      method: "POST",
      headers: {
        apikey: bookingConfig.supabaseAnonKey,
        Authorization: `Bearer ${bookingConfig.supabaseAnonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_slot_id: data.get("slot_id"),
        p_guest_name: data.get("name"),
        p_guest_phone: data.get("phone"),
        p_service: data.get("service"),
        p_note: data.get("message") || null
      })
    });
    const reservation = await response.json();
    if (!response.ok) {
      if (response.status === 409 || reservation.message === "SLOT_UNAVAILABLE") {
        await loadAvailableSlots();
        throw new Error("That time was just taken. Please choose another available slot.");
      }
      throw new Error(reservation.message || "Unable to reserve this time. Please try again.");
    }

    const expiration = new Date(reservation.expires_at).toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit"
    });
    const details = [
      "Hello JennyLuxe! I reserved an appointment slot and need payment instructions.",
      `Reservation: ${reservation.appointment_id}`,
      `Name: ${data.get("name")}`,
      `Mobile: ${data.get("phone")}`,
      `Service: ${data.get("service")}`,
      `Date: ${new Date(`${data.get("date")}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" })}`,
      `Time: ${timeSelect.selectedOptions[0].textContent}`,
      data.get("message") ? `Note: ${data.get("message")}` : ""
    ].filter(Boolean).join("\n");
    formStatus.textContent = `Time held until ${expiration}. Message the team for payment instructions; the appointment is confirmed after payment is verified.`;
    whatsappLink.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(details)}`;
    whatsappLink.hidden = false;
    await loadAvailableSlots();
  } catch (error) {
    formStatus.textContent = error.message;
  } finally {
    submitButton.disabled = timeSelect.disabled;
  }
});
timeSelect.addEventListener("change", () => {
  submitButton.disabled = timeSelect.disabled || !timeSelect.value;
});

const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector("#site-nav");
menuToggle.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});
siteNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  siteNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}));

const chatPanel = document.querySelector("#chat-panel");
const chatLaunch = document.querySelector(".chat-launch");
const chatMessages = document.querySelector("#chat-messages");
const chatInput = document.querySelector("#chat-text");

function setChatOpen(open) {
  chatPanel.classList.toggle("is-open", open);
  chatPanel.setAttribute("aria-hidden", String(!open));
  chatLaunch.setAttribute("aria-expanded", String(open));
  if (open) chatInput.focus();
}

function addChatMessage(text, sender) {
  const message = document.createElement("p");
  message.className = `chat-bubble ${sender}`;
  message.textContent = text;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function conciergeReply(text) {
  const question = text.toLowerCase();
  if (/book|appoint|reserve|schedule|visit/.test(question)) {
    return bookingApi
      ? "Choose a date in the appointment form to see live open times. Reserving a slot holds it for 15 minutes while you arrange payment with the team."
      : "Online reservations are not connected yet. Message JennyLuxe on WhatsApp to request an appointment while setup is completed.";
  }
  if (/where|address|location|direction|map/.test(question)) {
    return "JennyLuxe is on the 2nd Floor of Glasshouse Business Center, 7453 Manila East Road, Brgy. San Roque, Angono, Rizal. Use the Get directions link on this page for a map.";
  }
  if (/price|cost|menu|service|facial|skin|nail|treatment/.test(question)) {
    return "JennyLuxe offers skincare and nail care. The service menu and prices weren't listed in the information provided, so the team can share current options directly.";
  }
  if (/contact|message|speak|human|team|person/.test(question)) {
    return "You can message the JennyLuxe team on Messenger, or WhatsApp/call +63 917 166 9125.";
  }
  return "I can help with booking, directions, and contacting Jenny's team. For treatment advice, current prices, and a personal conversation, message the team directly.";
}

chatLaunch.addEventListener("click", () => setChatOpen(!chatPanel.classList.contains("is-open")));
document.querySelector(".chat-close").addEventListener("click", () => setChatOpen(false));
document.querySelectorAll(".chat-quick button").forEach((button) => button.addEventListener("click", () => {
  const question = button.dataset.question;
  addChatMessage(question, "user");
  addChatMessage(conciergeReply(question), "bot");
}));
document.querySelector("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addChatMessage(text, "user");
  addChatMessage(conciergeReply(text), "bot");
  chatInput.value = "";
});