const searchInput = document.querySelector("#marketSearch");
const cards = Array.from(document.querySelectorAll("[data-market-card]"));
const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
const dateButtons = Array.from(document.querySelectorAll(".date-chip"));
const selectableButtons = Array.from(
  document.querySelectorAll(".probability-button, .trade-button, .odds-row"),
);
const watchButtons = Array.from(document.querySelectorAll(".watch-button"));

let activeFilter = "all";

function normalize(value) {
  return value.trim().toLowerCase();
}

function updateVisibleCards() {
  const query = normalize(searchInput.value);

  cards.forEach((card) => {
    const tags = card.dataset.tags || "";
    const text = normalize(card.textContent || "");
    const matchesSearch = !query || tags.includes(query) || text.includes(query);
    const matchesFilter = activeFilter === "all" || tags.includes(activeFilter);

    card.classList.toggle("is-hidden", !(matchesSearch && matchesFilter));
  });
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    activeFilter = button.dataset.filter || "all";
    updateVisibleCards();
  });
});

dateButtons.forEach((button) => {
  button.addEventListener("click", () => {
    dateButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

searchInput.addEventListener("input", updateVisibleCards);

selectableButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const parent = button.closest(".market-card, .featured-market");
    if (!parent) return;

    parent
      .querySelectorAll(".probability-button, .trade-button, .odds-row")
      .forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
  });
});

watchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const isActive = button.classList.toggle("is-active");
    button.textContent = isActive ? "Watching" : "Watch";
  });
});
