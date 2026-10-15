const WHATSAPP_NUMBER = "639171669125";
const MESSENGER_URL = "https://m.me/jennyluxespa";

const bookingForm = document.querySelector("#booking-form");
const dateInput = document.querySelector("#date");
const formStatus = document.querySelector("#form-status");
const today = new Date();
dateInput.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
document.querySelector("#year").textContent = new Date().getFullYear();
document.querySelector(".messenger-link").href = MESSENGER_URL;

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) return;

  const data = new FormData(bookingForm);
  const preferredDate = new Date(`${data.get("date")}T00:00:00`).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric"
  });
  const preferredTime = new Date(`2000-01-01T${data.get("time")}`).toLocaleTimeString("en-PH", {
    hour: "numeric", minute: "2-digit"
  });
  const details = [
    "Hello JennyLuxe! I'd like to request an appointment.",
    `Name: ${data.get("name")}`,
    `Mobile: ${data.get("phone")}`,
    `Interested in: ${data.get("service")}`,
    `Preferred date: ${preferredDate}`,
    `Preferred time: ${preferredTime}`,
    data.get("message") ? `Note: ${data.get("message")}` : ""
  ].filter(Boolean).join("\n");

  formStatus.textContent = "Opening WhatsApp with your appointment request. Send the message to contact the team; your time is confirmed only after JennyLuxe replies.";
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(details)}`, "_blank", "noopener,noreferrer");
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
    return "Use the appointment form to send your preferred service, date, and time to JennyLuxe on WhatsApp. The team will confirm availability and payment with you.";
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