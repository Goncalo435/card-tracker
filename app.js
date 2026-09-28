(function () {
  "use strict";

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var SUITS = {
    spades: { symbol: "♠", label: "Spades", red: false },
    hearts: { symbol: "♥", label: "Hearts", red: true },
    diamonds: { symbol: "♦", label: "Diamonds", red: true },
    clubs: { symbol: "♣", label: "Clubs", red: false }
  };
  var PLAYER_SEATS = [
    { id: "you", name: "You", short: "YOU" },
    { id: "p1", name: "Seat 2", short: "2" },
    { id: "p2", name: "Seat 3", short: "3" },
    { id: "p4", name: "Seat 4", short: "4" },
    { id: "p5", name: "Seat 5", short: "5" },
    { id: "p6", name: "Seat 6", short: "6" },
    { id: "p7", name: "Seat 7", short: "7" }
  ];
  var SEATS = [{ id: "shoe", name: "Shoe only", short: "SHOE" }].concat(PLAYER_SEATS, [{ id: "dealer", name: "Dealer", short: "DEALER" }]);
  var STORE_KEY = "blackjack-table-trainer-v3";
  var HISTORY_LIMIT = 40;
  var UNDO_LIMIT = 12;
  var TEN_RANKS = ["10", "J", "Q", "K"];
  var GROUPS = [
    { name: "Ace", ranks: ["A"] },
    { name: "2–6", ranks: ["2", "3", "4", "5", "6"] },
    { name: "7–9", ranks: ["7", "8", "9"] },
    { name: "10-value", ranks: TEN_RANKS }
  ];

  function initialState() {
    return {
      version: 3,
      cards: [],
      sessions: [],
      undoStack: [],
      selectedSeat: "you",
      seatCount: 5,
      youPosition: 3,
      roundPhase: "setup",
      dealerRevealPending: false,
      stoodSeats: [],
      shoeOnlyEntry: false,
      suitTracking: false,
      selectedSuit: "spades",
      hitSoft17: false,
      dealerHoleHidden: true,
      cutPosition: 75,
      manualCutReached: false,
      shoeStarted: new Date().toISOString(),
      currentRoundId: id(),
      nextSessionNumber: 1
    };
  }

  function validCard(card) {
    return card && typeof card.id === "string" && RANKS.indexOf(card.rank) >= 0 &&
      SEATS.some(function (seat) { return seat.id === card.seat; }) &&
      (card.suit == null || Object.prototype.hasOwnProperty.call(SUITS, card.suit));
  }

  function readState() {
    var fresh = initialState();
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || saved.version !== 3) return migrateLegacy(fresh);
      fresh.shoeStarted = typeof saved.shoeStarted === "string" ? saved.shoeStarted : fresh.shoeStarted;
      fresh.currentRoundId = typeof saved.currentRoundId === "string" ? saved.currentRoundId : "round-" + fresh.shoeStarted;
      fresh.cards = Array.isArray(saved.cards) ? saved.cards.filter(validCard).map(function (card) {
        var oldPositions = { you: 1, p1: 2, p2: 3, p4: 4, p5: 5, p6: 6, p7: 7 };
        var oldNames = { you: "You", p1: "Seat 2", p2: "Seat 3", p4: "Seat 4", p5: "Seat 5", p6: "Seat 6", p7: "Seat 7", dealer: "Dealer", shoe: "Shoe only" };
        var oldShort = { you: "YOU", p1: "2", p2: "3", p4: "4", p5: "5", p6: "6", p7: "7", dealer: "DEALER", shoe: "SHOE" };
        return { id: card.id, rank: card.rank, suit: card.suit || null, seat: card.seat, seatNumber: Number.isInteger(card.seatNumber) ? card.seatNumber : (oldPositions[card.seat] || null), seatLabel: typeof card.seatLabel === "string" ? card.seatLabel : (oldNames[card.seat] || null), seatShort: typeof card.seatShort === "string" ? card.seatShort : (oldShort[card.seat] || null), addedAt: card.addedAt || null, roundId: typeof card.roundId === "string" || card.roundId === null ? card.roundId : fresh.currentRoundId };
      }) : [];
      fresh.sessions = Array.isArray(saved.sessions) ? saved.sessions.slice(-HISTORY_LIMIT) : [];
      fresh.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack.slice(-UNDO_LIMIT).map(function (entry) {
        if (Array.isArray(entry)) return { cards: entry.filter(validCard), selectedSeat: "you", stoodSeats: [], shoeOnlyEntry: false, seatCount: 5, youPosition: 3, roundPhase: "turns", dealerRevealPending: false, dealerHoleHidden: true, currentRoundId: fresh.currentRoundId };
        return {
          cards: Array.isArray(entry && entry.cards) ? entry.cards.filter(validCard) : [],
          selectedSeat: entry && (PLAYER_SEATS.some(function (seat) { return seat.id === entry.selectedSeat; }) || entry.selectedSeat === "dealer") ? entry.selectedSeat : "you",
          stoodSeats: entry && Array.isArray(entry.stoodSeats) ? entry.stoodSeats.filter(function (seatId) { return PLAYER_SEATS.some(function (seat) { return seat.id === seatId; }); }) : [],
          shoeOnlyEntry: entry && entry.shoeOnlyEntry === true,
          seatCount: Number.isInteger(entry && entry.seatCount) ? Math.max(1, Math.min(7, entry.seatCount)) : 5,
          youPosition: Number.isInteger(entry && entry.youPosition) ? Math.max(1, Math.min(7, entry.youPosition)) : 3,
          roundPhase: entry && ["setup", "deal-first", "dealer-up", "deal-second", "turns"].indexOf(entry.roundPhase) >= 0 ? entry.roundPhase : "turns",
          dealerRevealPending: entry && entry.dealerRevealPending === true,
          dealerHoleHidden: entry ? entry.dealerHoleHidden !== false : true,
          currentRoundId: entry && typeof entry.currentRoundId === "string" ? entry.currentRoundId : fresh.currentRoundId
        };
      }) : [];
      fresh.seatCount = Number.isInteger(saved.seatCount) ? Math.max(1, Math.min(7, saved.seatCount)) : 5;
      var hasRoundCards = fresh.cards.some(function (card) { return card.seat !== "shoe" && card.roundId === fresh.currentRoundId; });
      fresh.youPosition = Number.isInteger(saved.youPosition) ? Math.max(1, Math.min(fresh.seatCount, saved.youPosition)) : (hasRoundCards ? 1 : 3);
      fresh.roundPhase = ["setup", "deal-first", "dealer-up", "deal-second", "turns"].indexOf(saved.roundPhase) >= 0 ? saved.roundPhase : (hasRoundCards ? "turns" : "setup");
      fresh.dealerRevealPending = saved.dealerRevealPending === true;
      fresh.shoeOnlyEntry = saved.shoeOnlyEntry === true || saved.selectedSeat === "shoe";
      var savedTurn = saved.selectedSeat === "shoe" ? "you" : saved.selectedSeat;
      fresh.selectedSeat = PLAYER_SEATS.some(function (seat) { return seat.id === savedTurn; }) || savedTurn === "dealer" ? savedTurn : "you";
      fresh.stoodSeats = Array.isArray(saved.stoodSeats) ? saved.stoodSeats.filter(function (seatId) { return PLAYER_SEATS.some(function (seat) { return seat.id === seatId; }); }) : [];
      var otherIds = PLAYER_SEATS.filter(function (seat) { return seat.id !== "you"; }).map(function (seat) { return seat.id; });
      var activeIds = [];
      var otherIndex = 0;
      for (var position = 1; position <= fresh.seatCount; position += 1) activeIds.push(position === fresh.youPosition ? "you" : otherIds[otherIndex++]);
      if (fresh.selectedSeat !== "dealer" && activeIds.indexOf(fresh.selectedSeat) < 0) {
        var firstActive = activeIds.find(function (seatId) { return fresh.stoodSeats.indexOf(seatId) < 0; });
        fresh.selectedSeat = firstActive || "dealer";
      }
      fresh.suitTracking = saved.suitTracking === true;
      fresh.selectedSuit = Object.prototype.hasOwnProperty.call(SUITS, saved.selectedSuit) ? saved.selectedSuit : "spades";
      fresh.hitSoft17 = saved.hitSoft17 === true;
      fresh.dealerHoleHidden = saved.dealerHoleHidden !== false;
      fresh.cutPosition = Number.isFinite(saved.cutPosition) ? Math.max(50, Math.min(90, saved.cutPosition)) : 75;
      fresh.manualCutReached = saved.manualCutReached === true;
      fresh.nextSessionNumber = Number.isInteger(saved.nextSessionNumber) && saved.nextSessionNumber > 0 ? saved.nextSessionNumber : 1;
      return fresh;
    } catch (error) {
      return fresh;
    }
  }

  function migrateLegacy(fresh) {
    try {
      var legacy = JSON.parse(localStorage.getItem("bjTrackerV2") || "null");
      if (!legacy || !Array.isArray(legacy.history)) return fresh;
      var target = Object.create(null);
      RANKS.forEach(function (rank) {
        var remaining = legacy.remaining && legacy.remaining[rank];
        target[rank] = Number.isInteger(remaining) && remaining >= 0 && remaining <= 32 ? 32 - remaining : null;
      });
      var accepted = Object.create(null);
      RANKS.forEach(function (rank) { accepted[rank] = 0; });
      var validHistory = legacy.history.filter(function (entry) {
        return entry && RANKS.indexOf(entry.rank) >= 0;
      }).slice(-416);
      var prepared = [];
      validHistory.forEach(function (entry) {
        var rank = entry.rank;
        var limit = target[rank] == null ? 32 : target[rank];
        if (accepted[rank] >= limit || accepted[rank] >= 32) return;
        accepted[rank] += 1;
        prepared.push({ rank: rank, zone: entry.zone });
      });
      var playerNeeds = Object.create(null);
      var dealerNeeds = Object.create(null);
      RANKS.forEach(function (rank) { playerNeeds[rank] = 0; dealerNeeds[rank] = 0; });
      (Array.isArray(legacy.playerHand) ? legacy.playerHand : []).forEach(function (rank) { if (playerNeeds[rank] !== undefined) playerNeeds[rank] += 1; });
      (Array.isArray(legacy.dealerHand) ? legacy.dealerHand : []).forEach(function (rank) { if (dealerNeeds[rank] !== undefined) dealerNeeds[rank] += 1; });
      var activeSeats = new Array(prepared.length);
      for (var i = prepared.length - 1; i >= 0; i -= 1) {
        var item = prepared[i];
        if (item.zone === "player" && playerNeeds[item.rank] > 0) {
          activeSeats[i] = "you";
          playerNeeds[item.rank] -= 1;
        } else if (item.zone === "dealer" && dealerNeeds[item.rank] > 0) {
          activeSeats[i] = "dealer";
          dealerNeeds[item.rank] -= 1;
        } else {
          activeSeats[i] = "shoe";
        }
      }
      fresh.cards = prepared.map(function (entry, index) {
        var seatId = activeSeats[index] || "shoe";
        var location = seatId === "you" ? { name: "You · Seat " + fresh.youPosition, short: "YOU", position: fresh.youPosition } : seatId === "dealer" ? { name: "Dealer", short: "DEALER", position: null } : { name: "Shoe only", short: "SHOE", position: null };
        return { id: id(), rank: entry.rank, suit: null, seat: seatId, seatNumber: location.position, seatLabel: location.name, seatShort: location.short, addedAt: null, roundId: seatId === "shoe" ? null : fresh.currentRoundId };
      });
      fresh.roundPhase = fresh.cards.some(function (card) { return card.seat !== "shoe"; }) ? "turns" : "setup";
      fresh.dealerRevealPending = false;
      if (["shoe", "player", "dealer"].indexOf(legacy.mode) >= 0) {
        fresh.selectedSeat = legacy.mode === "dealer" ? "dealer" : "you";
        fresh.shoeOnlyEntry = legacy.mode === "shoe";
      }
      fresh.manualCutReached = legacy.cutReached === true;
      return fresh;
    } catch (error) {
      return fresh;
    }
  }

  var state = readState();
  var toastTimer = 0;
  var editId = null;
  var $ = function (selector) { return document.querySelector(selector); };

  function copyCards(cards) {
    return cards.map(function (card) {
      return { id: card.id, rank: card.rank, suit: card.suit || null, seat: card.seat, seatNumber: card.seatNumber == null ? null : card.seatNumber, seatLabel: card.seatLabel || null, seatShort: card.seatShort || null, addedAt: card.addedAt || null, roundId: card.roundId == null ? null : card.roundId };
    });
  }

  function rememberUndo() {
    state.undoStack.push({
      cards: copyCards(state.cards),
      selectedSeat: state.selectedSeat,
      stoodSeats: state.stoodSeats.slice(),
      shoeOnlyEntry: state.shoeOnlyEntry,
      seatCount: state.seatCount,
      youPosition: state.youPosition,
      roundPhase: state.roundPhase,
      dealerRevealPending: state.dealerRevealPending,
      dealerHoleHidden: state.dealerHoleHidden,
      currentRoundId: state.currentRoundId
    });
    if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      showToast("This device could not save the latest change. Free some storage and try again.", true);
      return false;
    }
  }

  function id() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "card-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function seatById(seatId) {
    return SEATS.find(function (seat) { return seat.id === seatId; }) || PLAYER_SEATS[0];
  }

  function activePlayerSeats() {
    var otherSeats = PLAYER_SEATS.filter(function (seat) { return seat.id !== "you"; });
    var otherIndex = 0;
    var seats = [];
    for (var position = 1; position <= state.seatCount; position += 1) {
      if (position === state.youPosition) {
        seats.push({ id: "you", name: "You · Seat " + position, short: "YOU", position: position });
      } else {
        var other = otherSeats[otherIndex] || otherSeats[otherSeats.length - 1];
        seats.push({ id: other.id, name: "Seat " + position, short: String(position), position: position });
        otherIndex += 1;
      }
    }
    return seats;
  }

  function activeSeat(seatId) {
    return activePlayerSeats().find(function (seat) { return seat.id === seatId; }) || (seatId === "dealer" ? { id: "dealer", name: "Dealer", short: "DEALER", position: null } : seatById(seatId));
  }

  function firstPlayerSeat() {
    var seats = activePlayerSeats();
    return seats.length ? seats[0].id : "you";
  }

  function cardSeatName(card) {
    return card.seatLabel || seatById(card.seat).name;
  }

  function cardSeatShort(card) {
    return card.seatShort || seatById(card.seat).short;
  }

  function nextSeatAfterStand() {
    var active = activePlayerSeats();
    var index = active.findIndex(function (seat) { return seat.id === state.selectedSeat; });
    for (var offset = 1; offset < active.length; offset += 1) {
      var seat = active[(index + offset + active.length) % active.length];
      if (seat.id !== state.selectedSeat && state.stoodSeats.indexOf(seat.id) < 0) return seat.id;
    }
    return "dealer";
  }

  function cardsFor(seatId, cards) {
    return (cards || state.cards).filter(function (card) {
      return card.seat === seatId && (seatId === "shoe" || card.roundId === state.currentRoundId);
    });
  }

  function countRanks(cards) {
    var counts = Object.create(null);
    RANKS.forEach(function (rank) { counts[rank] = 0; });
    (cards || state.cards).forEach(function (card) { if (counts[card.rank] !== undefined) counts[card.rank] += 1; });
    return counts;
  }

  function rankCountsBySuit(cards) {
    var counts = Object.create(null);
    Object.keys(SUITS).forEach(function (suit) { counts[suit] = Object.create(null); RANKS.forEach(function (rank) { counts[suit][rank] = 0; }); });
    (cards || state.cards).forEach(function (card) { if (card.suit && counts[card.suit]) counts[card.suit][card.rank] += 1; });
    return counts;
  }

  function shoeRemaining(cards) {
    var seen = countRanks(cards);
    var remain = Object.create(null);
    RANKS.forEach(function (rank) { remain[rank] = Math.max(0, 32 - seen[rank]); });
    return remain;
  }

  function remainingTotal(cards) {
    var remaining = shoeRemaining(cards);
    return RANKS.reduce(function (sum, rank) { return sum + remaining[rank]; }, 0);
  }

  function valueOf(rank) {
    if (rank === "A") return 1;
    if (TEN_RANKS.indexOf(rank) >= 0) return 10;
    return Number(rank);
  }

  function totalForCards(cards) {
    var base = 0;
    var aces = 0;
    cards.forEach(function (card) {
      base += valueOf(card.rank);
      if (card.rank === "A") aces += 1;
    });
    var soft = aces > 0 && base + 10 <= 21;
    return { base: base, aces: aces, total: base + (soft ? 10 : 0), soft: soft };
  }

  function fmtPct(value, digits) {
    if (!Number.isFinite(value)) return "0%";
    if (value < 0.000001) return "0%";
    if (value < 0.05) return "<0.1%";
    return value.toFixed(digits == null ? 1 : digits) + "%";
  }

  function dateLabel(value, includeTime) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat(undefined, includeTime
      ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function showToast(message, warning) {
    var toast = $("#toast");
    toast.textContent = message;
    toast.classList.toggle("warning", warning === true);
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 2600);
  }

  function vibrate() {
    if (navigator.vibrate) {
      try { navigator.vibrate(8); } catch (error) { /* vibration is optional */ }
    }
  }

  function rankButtonMarkup(rank, counts, suitCounts) {
    var near = counts[rank] >= 28;
    var disabled = counts[rank] >= 32 || state.roundPhase === "setup";
    if (!disabled && state.suitTracking && suitCounts[state.selectedSuit][rank] >= 8) disabled = true;
    return '<button type="button" class="rank-key" data-rank="' + rank + '" data-near-limit="' + near + '"' + (disabled ? " disabled" : "") + ' aria-label="Add ' + rank + '">' + rank + '</button>';
  }

  function cardMiniMarkup(card) {
    var suit = card.suit && SUITS[card.suit] ? SUITS[card.suit] : null;
    var red = suit && suit.red ? " red" : "";
    var title = card.rank + (suit ? suit.symbol : "");
    return '<span class="mini-card' + red + '" title="' + title + '">' + card.rank + (suit ? suit.symbol : "") + "</span>";
  }

  function renderSeats() {
    var root = $("#seatPicker");
    var seats = activePlayerSeats().concat([{ id: "dealer", name: "Dealer", short: "DEALER" }]);
    root.innerHTML = seats.map(function (seat) {
      var hand = cardsFor(seat.id);
      var preview = hand.slice(-5).map(cardMiniMarkup).join("");
      var extra = hand.length > 5 ? '<span class="seat-empty">+' + (hand.length - 5) + "</span>" : "";
      var isStood = state.stoodSeats.indexOf(seat.id) >= 0;
      var seatClass = (seat.id === "dealer" ? " dealer-seat" : "") + (seat.id === state.selectedSeat ? " active-seat" : "") + (isStood ? " stood-seat" : "");
      var turnLabel = hand.length + " card" + (hand.length === 1 ? "" : "s");
      if (state.roundPhase === "deal-first" && seat.id !== "dealer") turnLabel = seat.id === state.selectedSeat ? "DEAL" : hand.length ? "DEALT" : "NEXT";
      else if (state.roundPhase === "dealer-up" && seat.id === "dealer") turnLabel = "UPCARD";
      else if (state.roundPhase === "deal-second" && seat.id !== "dealer") turnLabel = seat.id === state.selectedSeat ? "DEAL" : hand.length > 1 ? "DEALT" : "NEXT";
      else if (state.roundPhase === "turns") turnLabel = seat.id === state.selectedSeat ? (seat.id === "dealer" ? (state.dealerRevealPending ? "HOLE CARD" : "TURN") : "TURN") : isStood ? "STAND" : turnLabel;
      else if (state.roundPhase === "setup" && seat.id === "you") turnLabel = "YOU";
      return '<div class="seat-card' + seatClass + '" aria-current="' + (seat.id === state.selectedSeat ? "step" : "false") + '">' +
        '<span class="seat-top"><span>' + seat.short + '</span><span>' + turnLabel + "</span></span>" +
        '<strong>' + seat.name + "</strong>" +
        '<span class="seat-cards">' + (hand.length ? preview + extra : '<span class="seat-empty">Empty hand</span>') + "</span></div>";
    }).join("");
    var activeTile = root.querySelector(".active-seat");
    if (activeTile && root.scrollWidth > root.clientWidth) {
      root.scrollLeft = Math.max(0, activeTile.offsetLeft - root.offsetLeft - (root.clientWidth - activeTile.offsetWidth) / 2);
    }
    var active = activeSeat(state.selectedSeat);
    var statusText = "Current turn: " + active.name;
    if (state.roundPhase === "setup") statusText = "Choose your seats to start a new round.";
    else if (state.roundPhase === "deal-first") statusText = "First card · " + active.name;
    else if (state.roundPhase === "dealer-up") statusText = "Dealer upcard · tap the card dealt to the dealer.";
    else if (state.roundPhase === "deal-second") statusText = "Second card · " + active.name;
    else if (state.selectedSeat === "dealer" && state.dealerRevealPending) statusText = "Dealer hole card · tap to reveal it.";
    else if (state.shoeOnlyEntry) statusText = "Shoe-only entry · turn stays with " + active.name;
    $("#activeSeatLabel").textContent = statusText;
    $("#entrySeatName").textContent = state.roundPhase === "setup" ? "Set up a round" : (state.selectedSeat === "dealer" && state.dealerRevealPending ? "Dealer · reveal hole card" : active.name);
    var roundCount = state.cards.filter(function (card) { return card.seat !== "shoe" && card.roundId === state.currentRoundId; }).length;
    $("#tableCardCount").textContent = roundCount + " visible card" + (roundCount === 1 ? "" : "s") + " in this round";
    var standButton = $("#standButton");
    if (state.roundPhase === "setup") {
      standButton.textContent = "Choose seats to start";
      standButton.disabled = true;
    } else if (state.roundPhase !== "turns") {
      standButton.textContent = "Initial deal · automatic";
      standButton.disabled = true;
    } else if (state.selectedSeat === "dealer" && state.dealerRevealPending) {
      standButton.textContent = "Tap a rank to reveal hole card";
      standButton.disabled = true;
    } else if (state.shoeOnlyEntry) {
      standButton.textContent = "Turn shoe-only off to stand";
      standButton.disabled = true;
    } else if (state.selectedSeat === "dealer") {
      standButton.textContent = "Finish dealer turn";
      standButton.disabled = false;
    } else {
      standButton.textContent = "Stand · " + activeSeat(nextSeatAfterStand()).name;
      standButton.disabled = false;
    }
    var shoeOnlyAllowed = state.roundPhase === "turns" && !(state.selectedSeat === "dealer" && state.dealerRevealPending);
    $("#shoeOnlyToggle").disabled = !shoeOnlyAllowed;
    $("#shoeOnlyToggle").setAttribute("aria-pressed", String(state.shoeOnlyEntry));
    $("#newRoundButton").hidden = state.roundPhase !== "setup";
  }

  function renderRecent() {
    var root = $("#recentCards");
    var recent = state.cards.slice(-10).reverse();
    if (!recent.length) {
      root.innerHTML = '<span class="recent-empty">Cards you enter will appear here for quick corrections.</span>';
      return;
    }
    root.innerHTML = recent.map(function (card) {
      var suit = card.suit && SUITS[card.suit] ? SUITS[card.suit] : null;
      var red = suit && suit.red ? " red" : "";
      return '<button type="button" class="recent-card' + red + '" data-edit-card="' + card.id + '" aria-label="Edit ' + card.rank + (suit ? " " + SUITS[card.suit].label : "") + " at " + cardSeatName(card) + '">' +
        "<strong>" + card.rank + "</strong><small>" + (suit ? suit.symbol : cardSeatShort(card)) + "</small></button>";
    }).join("") + (state.cards.length > 10 ? '<span class="recent-overflow">+' + (state.cards.length - 10) + " earlier</span>" : "");
  }

  function renderRankAudit() {
    var counts = countRanks();
    var remain = shoeRemaining();
    var total = remainingTotal();
    var root = $("#rankAudit");
    root.innerHTML = RANKS.map(function (rank) {
      var left = 32 - counts[rank];
      var probability = total ? remain[rank] / total * 100 : 0;
      return '<div class="rank-audit-item' + (counts[rank] >= 28 ? " warn" : "") + '"><strong>' + rank + '</strong><span>' + counts[rank] + " / " + left + '</span><span>' + fmtPct(probability) + " next</span></div>";
    }).join("");
    var warning = $("#warningMessage");
    var near = RANKS.filter(function (rank) { return counts[rank] >= 28; });
    if (near.length) {
      warning.hidden = false;
      warning.textContent = near.join(", ") + " " + (near.length === 1 ? "has" : "have") + " only a few copies left. Check recent entries for mistakes.";
    } else {
      warning.hidden = true;
      warning.textContent = "";
    }
  }

  function renderShoeSummary() {
    var seen = state.cards.length;
    var left = Math.max(0, 416 - seen);
    var penetration = seen / 416 * 100;
    var reached = state.manualCutReached || penetration >= state.cutPosition;
    $("#seenTotal").textContent = seen;
    $("#remainingTotal").textContent = left;
    $("#penetrationValue").textContent = penetration.toFixed(1) + "%";
    $("#penetrationBar").style.width = Math.min(100, penetration) + "%";
    $("#cutMarker").style.left = state.cutPosition + "%";
    $("#cutStatus").textContent = reached ? "Cut card reached" : "Cut card ahead";
    $("#cutStatus").classList.toggle("reached", reached);
    $("#cutNotice").hidden = !reached;
    $("#cutReachedButton").innerHTML = state.manualCutReached ? "<span>↶</span> Clear cut card marker" : "<span>✦</span> Mark cut card reached";
    $("#cutReachedButton").disabled = false;
    $("#cutReachedButton").setAttribute("aria-pressed", String(state.manualCutReached));
    $("#shoeStarted").textContent = "Since " + dateLabel(state.shoeStarted, true);
    $("#cardsLeftLabel").textContent = left + " cards";
    $("#suitToggle").setAttribute("aria-pressed", String(state.suitTracking));
    $("#shoeOnlyToggle").setAttribute("aria-pressed", String(state.shoeOnlyEntry));
    $("#suitPicker").hidden = !state.suitTracking;
    $("#entryDock").classList.toggle("suits-on", state.suitTracking);
    $("#suitPicker").querySelectorAll("button[data-suit]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.suit === state.selectedSuit));
    });
    $("#deckLimitHint").textContent = state.suitTracking ? "8 of each rank and suit" : "32 of each rank in the shoe";
  }

  function renderRankPad() {
    var counts = countRanks();
    var suitCounts = rankCountsBySuit();
    $("#rankPad").innerHTML = RANKS.map(function (rank) { return rankButtonMarkup(rank, counts, suitCounts); }).join("");
  }

  function renderGroups() {
    var remain = shoeRemaining();
    var total = remainingTotal();
    $("#groupProbabilities").innerHTML = GROUPS.map(function (group) {
      var count = group.ranks.reduce(function (sum, rank) { return sum + remain[rank]; }, 0);
      var pct = total ? count / total * 100 : 0;
      return '<div class="group-row"><span class="group-name">' + group.name + '</span><span class="group-track"><span class="group-fill" style="width:' + pct.toFixed(2) + '%"></span></span><span class="group-value">' + fmtPct(pct) + "</span></div>";
    }).join("");
  }

  function handResultForNextCard(cards) {
    var totalRemaining = remainingTotal();
    if (!cards.length || !totalRemaining) return null;
    var remain = shoeRemaining();
    var now = totalForCards(cards);
    var output = { "≤16": 0, Bust: 0, Blackjack: 0, "17": 0, "18": 0, "19": 0, "20": 0, "21": 0 };
    var bustRanks = [];
    RANKS.forEach(function (rank) {
      var count = remain[rank];
      if (!count) return;
      var after = totalForCards(cards.concat([{ rank: rank }]));
      var category;
      if (after.total > 21) {
        category = "Bust";
        bustRanks.push(rank);
      } else if (after.total === 21 && cards.length === 1) {
        category = "Blackjack";
      } else if (after.total >= 17) {
        category = String(after.total);
      } else {
        category = "≤16";
      }
      output[category] += count / totalRemaining * 100;
    });
    return { values: output, total: now.total, soft: now.soft, cards: cards.length, bustRanks: bustRanks };
  }

  function openingBlackjackChance(cards) {
    var total = remainingTotal();
    if (!total) return null;
    var remain = shoeRemaining();
    var aces = remain.A;
    var tens = TEN_RANKS.reduce(function (sum, rank) { return sum + remain[rank]; }, 0);
    if (!cards.length) {
      if (total < 2) return 0;
      return ((aces / total) * (tens / (total - 1)) + (tens / total) * (aces / (total - 1))) * 100;
    }
    if (cards.length === 1) {
      if (cards[0].rank === "A") return tens / total * 100;
      if (TEN_RANKS.indexOf(cards[0].rank) >= 0) return aces / total * 100;
      return 0;
    }
    var hand = totalForCards(cards);
    return cards.length === 2 && hand.total === 21 ? 100 : 0;
  }

  function renderPlayerOdds() {
    var cards = cardsFor("you");
    var hand = handResultForNextCard(cards);
    var totalLabel = $("#yourHandTotal");
    var description = $("#handDescription");
    var root = $("#playerOutcomes");
    var breakdown = $("#nextHandBreakdown");
    var nextCardOdds = $("#myNextCardOdds");
    var remaining = shoeRemaining();
    var cardsLeft = remainingTotal();
    var opening = openingBlackjackChance(cards);
    $("#openingBlackjackValue").textContent = opening == null ? "—" : fmtPct(opening);
    $("#bustProbability").textContent = hand ? fmtPct(hand.values.Bust) : "—";
    nextCardOdds.innerHTML = RANKS.map(function (rank) {
      var probability = cardsLeft ? remaining[rank] / cardsLeft * 100 : null;
      var causesBust = hand && hand.bustRanks.indexOf(rank) >= 0;
      return '<div class="rank-odds-item' + (causesBust ? " bust-rank" : "") + '"><strong>' + rank + "</strong><span>" + (probability == null ? "—" : fmtPct(probability)) + "</span></div>";
    }).join("");
    if (!cards.length) {
      totalLabel.textContent = "—";
      description.textContent = "Choose cards for You to start.";
      root.innerHTML = "";
      breakdown.textContent = "";
      return;
    }
    var currentHand = totalForCards(cards);
    totalLabel.textContent = currentHand.total + (currentHand.soft ? " soft" : "");
    if (!hand) {
      description.textContent = "No unseen cards remain for a next-card calculation.";
      root.innerHTML = ["≤16", "Bust", "17", "18", "19", "20", "21", "Blackjack"].map(function (label) {
        return '<div class="outcome"><span>' + label + "</span><strong>—</strong></div>";
      }).join("");
      breakdown.textContent = "The shoe has no unseen cards.";
      return;
    }
    description.textContent = hand.cards + " card" + (hand.cards === 1 ? "" : "s") + " · " + (hand.soft ? "soft" : "hard") + (hand.total > 21 ? " · bust" : hand.total === 21 ? " · 21" : "");
    var labels = ["≤16", "Bust", "17", "18", "19", "20", "21", "Blackjack"];
    root.innerHTML = labels.map(function (label) {
      var extra = label === "Bust" ? " bust" : label === "Blackjack" ? " blackjack" : "";
      return '<div class="outcome' + extra + '"><span>' + label + "</span><strong>" + fmtPct(hand.values[label]) + "</strong></div>";
    }).join("");
    var bustText = hand.bustRanks.length ? "Busts on " + hand.bustRanks.join(", ") + "." : "No rank causes a bust.";
    breakdown.textContent = bustText + " Probabilities use " + remainingTotal() + " unseen cards.";
  }

  function dealerBuckets(cards) {
    var labels = ["Bust", "Blackjack", "17", "18", "19", "20", "21"];
    if (!cards.length) return null;
    var initial = totalForCards(cards);
    var unseen = remainingTotal();
    if (!unseen) {
      var forced = initial.total > 21 ? "Bust" :
        cards.length === 2 && initial.total === 21 ? "Blackjack" :
        initial.total > 17 || (initial.total === 17 && !(state.hitSoft17 && initial.soft)) ? String(initial.total) : null;
      if (!forced) return null;
      var fixed = {};
      labels.forEach(function (label) { fixed[label] = label === forced ? 100 : 0; });
      return { values: fixed, total: initial.total, soft: initial.soft, memoStates: 0 };
    }
    var remain = shoeRemaining();
    var pool = [
      remain.A, remain["2"], remain["3"], remain["4"], remain["5"],
      remain["6"], remain["7"], remain["8"], remain["9"],
      TEN_RANKS.reduce(function (sum, rank) { return sum + remain[rank]; }, 0)
    ];
    var startBase = 0;
    var startAces = 0;
    cards.forEach(function (card) {
      startBase += valueOf(card.rank);
      if (card.rank === "A") startAces += 1;
    });
    var memo = new Map();
    function solve(base, aces, counts, dealt) {
      var soft = aces > 0 && base + 10 <= 21;
      var total = base + (soft ? 10 : 0);
      if (total > 21) return { Bust: 1 };
      if (dealt === 2 && total === 21) return { Blackjack: 1 };
      if (total > 17 || (total === 17 && !(state.hitSoft17 && soft))) {
        var finalResult = {};
        finalResult[String(total)] = 1;
        return finalResult;
      }
      var all = counts.reduce(function (sum, value) { return sum + value; }, 0);
      if (!all) return { "17": 0, "18": 0, "19": 0, "20": 0, "21": 0, Bust: 0, Blackjack: 0 };
      var key = base + ":" + aces + ":" + dealt + ":" + counts.join(".");
      if (memo.has(key)) return memo.get(key);
      var result = Object.create(null);
      for (var i = 0; i < counts.length; i += 1) {
        var available = counts[i];
        if (!available) continue;
        counts[i] -= 1;
        var branch = solve(base + (i === 9 ? 10 : i + 1), aces + (i === 0 ? 1 : 0), counts, dealt + 1);
        counts[i] += 1;
        var weight = available / all;
        Object.keys(branch).forEach(function (outcome) {
          result[outcome] = (result[outcome] || 0) + branch[outcome] * weight;
        });
      }
      memo.set(key, result);
      return result;
    }
    var hiddenHole = cards.length === 1 && state.dealerHoleHidden;
    var result;
    if (hiddenHole) {
      var holeTotal = pool.reduce(function (sum, count) { return sum + count; }, 0);
      if (!holeTotal) return null;
      result = Object.create(null);
      for (var hole = 0; hole < pool.length; hole += 1) {
        var holeCount = pool[hole];
        if (!holeCount) continue;
        pool[hole] -= 1;
        var holeBranch = solve(startBase + (hole === 9 ? 10 : hole + 1), startAces + (hole === 0 ? 1 : 0), pool, cards.length + 1);
        pool[hole] += 1;
        Object.keys(holeBranch).forEach(function (outcome) {
          result[outcome] = (result[outcome] || 0) + holeBranch[outcome] * holeCount / holeTotal;
        });
      }
    } else {
      result = solve(startBase, startAces, pool, cards.length);
    }
    var normalized = {};
    labels.forEach(function (label) { normalized[label] = Math.max(0, (result[label] || 0) * 100); });
    var sum = labels.reduce(function (value, label) { return value + normalized[label]; }, 0);
    if (sum > 0 && Math.abs(sum - 100) > 0.001) labels.forEach(function (label) { normalized[label] = normalized[label] / sum * 100; });
    return { values: normalized, total: initial.total, soft: initial.soft, memoStates: memo.size };
  }

  function renderDealerOdds() {
    var cards = cardsFor("dealer");
    var root = $("#dealerOutcomes");
    var description = $("#dealerDescription");
    var totalEl = $("#dealerHandTotal");
    var dealer = dealerBuckets(cards);
    var hiddenHole = cards.length === 1 && state.dealerHoleHidden;
    var holeToggle = $("#holeCardToggle");
    holeToggle.hidden = cards.length !== 1 || state.roundPhase !== "turns" || state.dealerRevealPending;
    holeToggle.setAttribute("aria-pressed", String(state.dealerHoleHidden));
    holeToggle.textContent = "Hidden hole card: " + (state.dealerHoleHidden ? "on" : "off");
    if (!cards.length) {
      totalEl.textContent = "—";
      description.textContent = "Add the dealer’s exposed cards to calculate outcomes.";
      root.innerHTML = "";
      return;
    }
    if (!dealer) {
      var unfinished = totalForCards(cards);
      totalEl.textContent = unfinished.total + (unfinished.soft ? " soft" : "");
      description.textContent = "No unseen cards remain to complete the dealer’s drawing hand.";
      root.innerHTML = ["Bust", "Blackjack", "17", "18", "19", "20", "21"].map(function (label) {
        return '<div class="dealer-outcome' + (label === "Bust" ? " bust" : "") + '"><span>' + label + "</span><strong>—</strong></div>";
      }).join("");
      return;
    }
    totalEl.textContent = dealer.total + (dealer.soft ? " soft" : "");
    description.textContent = dealer.total > 21 ? "Dealer has already busted." : hiddenHole ? "Includes one unknown hole card · " + (state.hitSoft17 ? "hits soft 17" : "stands on soft 17") : dealer.total >= 17 && !(dealer.total === 17 && state.hitSoft17 && dealer.soft) ? "Dealer stands on this hand." : "Exact outcomes · " + (state.hitSoft17 ? "hits soft 17" : "stands on soft 17");
    var labels = ["Bust", "Blackjack", "17", "18", "19", "20", "21"];
    root.innerHTML = labels.map(function (label) {
      return '<div class="dealer-outcome' + (label === "Bust" ? " bust" : "") + '"><span>' + label + "</span><strong>" + fmtPct(dealer.values[label]) + "</strong></div>";
    }).join("");
  }

  function renderHistory() {
    var sessions = state.sessions.slice().reverse();
    $("#historyCount").innerHTML = sessions.length + " saved <b>＋</b>";
    var root = $("#sessionList");
    if (!sessions.length) {
      root.innerHTML = '<div class="session-empty">Your completed shoes will be saved here on this device.</div>';
      return;
    }
    root.innerHTML = sessions.map(function (session) {
      return '<div class="session-row"><div><strong>Shoe ' + session.number + '</strong><small>' + dateLabel(session.endedAt, true) + "</small></div>" +
        '<span class="session-stat">' + session.cardCount + " cards · " + Number(session.penetration || 0).toFixed(1) + "%</span>" +
        '<button type="button" class="session-view" data-session="' + session.id + '">View</button></div>';
    }).join("");
  }

  function render() {
    renderSeats();
    renderRecent();
    renderRankAudit();
    renderShoeSummary();
    renderRankPad();
    renderGroups();
    renderPlayerOdds();
    renderDealerOdds();
    renderHistory();
    $("#undoButton").disabled = state.undoStack.length === 0;
    $("#clearRound").disabled = state.roundPhase === "setup";
  }

  function commit() {
    persist();
    render();
  }

  function addCard(rank) {
    if (state.roundPhase === "setup") return;
    var counts = countRanks();
    if (counts[rank] >= 32) {
      showToast("All 32 " + rank + "s are already accounted for. Check the recent cards.", true);
      return;
    }
    var suit = state.suitTracking ? state.selectedSuit : null;
    if (suit) {
      var suitCounts = rankCountsBySuit();
      if (suitCounts[suit][rank] >= 8) {
        showToast("All eight " + rank + SUITS[suit].symbol + " cards are already entered.", true);
        return;
      }
    }
    rememberUndo();
    var targetSeat = state.shoeOnlyEntry && state.roundPhase === "turns" ? "shoe" : state.selectedSeat;
    var location = targetSeat === "shoe" ? { id: "shoe", name: "Shoe only", short: "SHOE", position: null } : activeSeat(targetSeat);
    state.cards.push({ id: id(), rank: rank, suit: suit, seat: targetSeat, seatNumber: location.position, seatLabel: location.name, seatShort: location.short, addedAt: new Date().toISOString(), roundId: targetSeat === "shoe" ? null : state.currentRoundId });
    if (targetSeat !== "shoe") {
      if (state.roundPhase === "deal-first") {
        var firstIndex = activePlayerSeats().findIndex(function (seat) { return seat.id === state.selectedSeat; });
        var playerSeats = activePlayerSeats();
        if (firstIndex < playerSeats.length - 1) state.selectedSeat = playerSeats[firstIndex + 1].id;
        else { state.roundPhase = "dealer-up"; state.selectedSeat = "dealer"; }
      } else if (state.roundPhase === "dealer-up") {
        state.roundPhase = "deal-second";
        state.selectedSeat = firstPlayerSeat();
        state.dealerHoleHidden = true;
      } else if (state.roundPhase === "deal-second") {
        var secondIndex = activePlayerSeats().findIndex(function (seat) { return seat.id === state.selectedSeat; });
        var secondSeats = activePlayerSeats();
        if (secondIndex < secondSeats.length - 1) state.selectedSeat = secondSeats[secondIndex + 1].id;
        else {
          state.roundPhase = "turns";
          state.selectedSeat = firstPlayerSeat();
          state.stoodSeats = [];
          state.dealerRevealPending = true;
        }
      } else if (state.roundPhase === "turns" && state.selectedSeat === "dealer" && state.dealerRevealPending) {
        state.dealerRevealPending = false;
        state.dealerHoleHidden = false;
      }
    }
    commit();
    vibrate();
  }

  function showRoundSetup() {
    var countSelect = $("#roundSeatCount");
    countSelect.innerHTML = Array.from({ length: 7 }, function (_, index) {
      var count = index + 1;
      return '<option value="' + count + '">' + count + " player seat" + (count === 1 ? "" : "s") + " at the table</option>";
    }).join("");
    countSelect.value = String(state.seatCount);
    updateMySeatChoices(state.youPosition);
    if (!$("#roundDialog").open) $("#roundDialog").showModal();
  }

  function updateMySeatChoices(preferred) {
    var count = Number($("#roundSeatCount").value || state.seatCount);
    var selected = Math.max(1, Math.min(count, Number(preferred) || state.youPosition || 1));
    $("#mySeatPosition").innerHTML = Array.from({ length: count }, function (_, index) {
      var position = index + 1;
      return '<option value="' + position + '">Seat ' + position + (position === selected ? " · You" : "") + "</option>";
    }).join("");
    $("#mySeatPosition").value = String(selected);
  }

  function startRound(seatCount, youPosition) {
    rememberUndo();
    state.seatCount = Math.max(1, Math.min(7, seatCount));
    state.youPosition = Math.max(1, Math.min(state.seatCount, youPosition));
    state.currentRoundId = id();
    state.roundPhase = "deal-first";
    state.selectedSeat = firstPlayerSeat();
    state.stoodSeats = [];
    state.shoeOnlyEntry = false;
    state.dealerHoleHidden = true;
    state.dealerRevealPending = false;
    commit();
    showToast("Round started. Tap each dealt card; the table will assign it in order.");
  }

  function editCard(cardId) {
    var card = state.cards.find(function (entry) { return entry.id === cardId; });
    if (!card) return;
    editId = cardId;
    $("#editCardId").value = cardId;
    $("#editRank").innerHTML = RANKS.map(function (rank) { return '<option value="' + rank + '">' + rank + "</option>"; }).join("");
    $("#editRank").value = card.rank;
    var editSeats = [{ id: "shoe", name: "Shoe only" }].concat(activePlayerSeats(), [{ id: "dealer", name: "Dealer" }]);
    if (!editSeats.some(function (seat) { return seat.id === card.seat; })) editSeats.push({ id: card.seat, name: cardSeatName(card) });
    $("#editSeat").innerHTML = editSeats.map(function (seat) { return '<option value="' + seat.id + '">' + seat.name + "</option>"; }).join("");
    $("#editSeat").value = card.seat;
    $("#editSuit").value = card.suit || "";
    $("#editSuitWrap").hidden = !state.suitTracking && !card.suit;
    $("#editDialog").showModal();
  }

  function saveEdit() {
    if (!editId) return;
    var index = state.cards.findIndex(function (entry) { return entry.id === editId; });
    if (index < 0) return;
    var rank = $("#editRank").value;
    var suit = $("#editSuitWrap").hidden ? state.cards[index].suit : ($("#editSuit").value || null);
    var seat = $("#editSeat").value;
    var otherCards = state.cards.filter(function (entry) { return entry.id !== editId; });
    if (countRanks(otherCards)[rank] >= 32) {
      showToast("That rank already has all 32 copies entered.", true);
      $("#editDialog").close();
      editId = null;
      return;
    }
    if (suit) {
      var otherSuitCount = rankCountsBySuit(otherCards)[suit][rank];
      if (otherSuitCount >= 8) {
        showToast("All eight " + rank + SUITS[suit].symbol + " cards are already entered.", true);
        $("#editDialog").close();
        editId = null;
        return;
      }
    }
    rememberUndo();
    var original = state.cards[index];
    var roundId = seat === "shoe" ? null : seat === original.seat ? original.roundId : state.currentRoundId;
    var location = seat === original.seat ? { position: original.seatNumber, name: original.seatLabel || seatById(seat).name, short: original.seatShort || seatById(seat).short } : activeSeat(seat);
    if (seat === "shoe") location = { position: null, name: "Shoe only", short: "SHOE" };
    state.cards[index] = { id: original.id, rank: rank, suit: suit, seat: seat, seatNumber: location.position, seatLabel: location.name, seatShort: location.short, addedAt: original.addedAt, roundId: roundId };
    editId = null;
    commit();
    showToast("Card entry updated.");
  }

  function removeCard() {
    if (!editId) return;
    var index = state.cards.findIndex(function (entry) { return entry.id === editId; });
    if (index < 0) return;
    rememberUndo();
    state.cards.splice(index, 1);
    editId = null;
    $("#editDialog").close();
    commit();
    showToast("Card removed from the shoe.");
  }

  function clearRound() {
    if (state.roundPhase === "setup") return;
    rememberUndo();
    state.cards = state.cards.map(function (card) {
      if (card.seat !== "shoe" && card.roundId === state.currentRoundId) return Object.assign({}, card, { roundId: null });
      return card;
    });
    state.roundPhase = "setup";
    state.selectedSeat = "you";
    state.stoodSeats = [];
    state.shoeOnlyEntry = false;
    state.dealerRevealPending = false;
    state.dealerHoleHidden = true;
    commit();
    showToast("Hands cleared. All cards remain counted in the shoe.");
    showRoundSetup();
  }

  function stand() {
    if (state.roundPhase !== "turns" || state.shoeOnlyEntry) return;
    if (state.selectedSeat === "dealer" && state.dealerRevealPending) return;
    rememberUndo();
    if (state.selectedSeat === "dealer") {
      state.cards = state.cards.map(function (card) {
        if (card.seat !== "shoe" && card.roundId === state.currentRoundId) return Object.assign({}, card, { roundId: null });
        return card;
      });
      state.roundPhase = "setup";
      state.selectedSeat = "you";
      state.stoodSeats = [];
      state.shoeOnlyEntry = false;
      state.dealerRevealPending = false;
      state.dealerHoleHidden = true;
      commit();
      showToast("Round finished. Set up the next table.");
      showRoundSetup();
      return;
    }
    if (state.stoodSeats.indexOf(state.selectedSeat) < 0) state.stoodSeats.push(state.selectedSeat);
    state.selectedSeat = nextSeatAfterStand();
    if (state.selectedSeat === "dealer") state.dealerRevealPending = true;
    commit();
    showToast(state.selectedSeat === "dealer" ? "All players have stood. Reveal the dealer hole card." : activeSeat(state.selectedSeat).name + " is up next.");
  }

  function undo() {
    if (!state.undoStack.length) return;
    var previous = state.undoStack.pop();
    state.cards = previous.cards;
    state.selectedSeat = previous.selectedSeat;
    state.stoodSeats = previous.stoodSeats;
    state.shoeOnlyEntry = previous.shoeOnlyEntry;
    state.seatCount = previous.seatCount || state.seatCount;
    state.youPosition = previous.youPosition || state.youPosition;
    state.roundPhase = previous.roundPhase || "turns";
    state.dealerRevealPending = previous.dealerRevealPending === true;
    state.dealerHoleHidden = previous.dealerHoleHidden !== false;
    state.currentRoundId = previous.currentRoundId || state.currentRoundId;
    commit();
    showToast("Last change undone.");
  }

  function newShoe() {
    if (state.cards.length) {
      var seen = state.cards.length;
      state.sessions.push({
        id: id(),
        number: state.nextSessionNumber,
        startedAt: state.shoeStarted,
        endedAt: new Date().toISOString(),
        cardCount: seen,
        penetration: seen / 416 * 100,
        cutReached: state.manualCutReached || seen / 416 * 100 >= state.cutPosition,
        cards: copyCards(state.cards)
      });
      state.sessions = state.sessions.slice(-HISTORY_LIMIT);
      state.nextSessionNumber += 1;
    }
    state.cards = [];
    state.undoStack = [];
    state.selectedSeat = "you";
    state.stoodSeats = [];
    state.shoeOnlyEntry = false;
    state.roundPhase = "setup";
    state.dealerRevealPending = false;
    state.dealerHoleHidden = true;
    state.manualCutReached = false;
    state.shoeStarted = new Date().toISOString();
    state.currentRoundId = id();
    commit();
    showToast("New 8-deck shoe started.");
    showRoundSetup();
  }

  function viewSession(sessionId) {
    var session = state.sessions.find(function (entry) { return entry.id === sessionId; });
    if (!session) return;
    var distribution = Object.create(null);
    session.cards.forEach(function (card) { distribution[card.seat] = (distribution[card.seat] || 0) + 1; });
    var seatSummary = SEATS.filter(function (seat) { return distribution[seat.id]; })
      .map(function (seat) { return seat.name + " " + distribution[seat.id]; }).join(" · ") || "No card entries";
    var cardList = session.cards.map(function (card) {
      var suit = card.suit && SUITS[card.suit] ? SUITS[card.suit] : null;
      return '<span class="session-card-item' + (suit && suit.red ? " red" : "") + '">' + card.rank + (suit ? suit.symbol : "") + '<small>' + cardSeatShort(card) + "</small></span>";
    }).join("");
    $("#sessionDetail").innerHTML =
      '<div class="session-detail-top"><p class="eyebrow">SAVED SHOE</p><h2>Shoe ' + session.number + "</h2><p>" + dateLabel(session.startedAt, true) + " – " + dateLabel(session.endedAt, true) + "</p></div>" +
      '<div class="session-detail-stats"><div><small>Cards tracked</small><strong>' + session.cardCount + "</strong></div><div><small>Penetration</small><strong>" + Number(session.penetration || 0).toFixed(1) + "%</strong></div><div><small>Cut card</small><strong>" + (session.cutReached ? "Reached" : "Ahead") + "</strong></div></div>" +
      '<p class="field-help">' + seatSummary + "</p>" +
      '<div class="session-card-list">' + (cardList || '<span class="session-empty">No cards were recorded.</span>') + "</div>";
    $("#sessionDialog").showModal();
  }

  function openSettings() {
    $("#cutPosition").value = String(state.cutPosition);
    $("#cutPositionValue").textContent = state.cutPosition + "%";
    $("#hitSoft17").checked = state.hitSoft17;
    $("#rulesDialog").showModal();
  }

  function bindEvents() {
    $("#rankPad").addEventListener("click", function (event) {
      var button = event.target.closest("[data-rank]");
      if (button && !button.disabled) addCard(button.dataset.rank);
    });
    $("#recentCards").addEventListener("click", function (event) {
      var button = event.target.closest("[data-edit-card]");
      if (button) editCard(button.dataset.editCard);
    });
    $("#suitToggle").addEventListener("click", function () {
      state.suitTracking = !state.suitTracking;
      if (!state.selectedSuit) state.selectedSuit = "spades";
      commit();
    });
    $("#shoeOnlyToggle").addEventListener("click", function () {
      state.shoeOnlyEntry = !state.shoeOnlyEntry;
      commit();
    });
    $("#suitPicker").addEventListener("click", function (event) {
      var button = event.target.closest("[data-suit]");
      if (!button) return;
      state.selectedSuit = button.dataset.suit;
      persist();
      renderShoeSummary();
      renderRankPad();
    });
    $("#undoButton").addEventListener("click", undo);
    $("#standButton").addEventListener("click", stand);
    $("#clearRound").addEventListener("click", clearRound);
    $("#newRoundButton").addEventListener("click", showRoundSetup);
    $("#newShoeButton").addEventListener("click", newShoe);
    $("#cutReachedButton").addEventListener("click", function () {
      state.manualCutReached = !state.manualCutReached;
      commit();
      showToast(state.manualCutReached ? "Cut card marked as reached." : "Cut card marker cleared.");
    });
    $("#holeCardToggle").addEventListener("click", function () {
      state.dealerHoleHidden = !state.dealerHoleHidden;
      commit();
    });
    $("#rulesButton").addEventListener("click", openSettings);
    $("#cutPosition").addEventListener("input", function () { $("#cutPositionValue").textContent = this.value + "%"; });
    $("#rulesForm").addEventListener("submit", function (event) {
      if (event.submitter && event.submitter.value === "save") {
        state.cutPosition = Number($("#cutPosition").value);
        state.hitSoft17 = $("#hitSoft17").checked;
        commit();
        showToast("Training settings saved.");
      }
    });
    $("#roundSeatCount").addEventListener("change", function () {
      updateMySeatChoices(Number($("#mySeatPosition").value));
    });
    $("#roundForm").addEventListener("submit", function (event) {
      if (event.submitter && event.submitter.value === "start") {
        event.preventDefault();
        startRound(Number($("#roundSeatCount").value), Number($("#mySeatPosition").value));
        if ($("#roundDialog").open) $("#roundDialog").close();
      }
    });
    $("#editForm").addEventListener("submit", function (event) {
      if (event.submitter && event.submitter.value === "save") {
        event.preventDefault();
        saveEdit();
        if ($("#editDialog").open) $("#editDialog").close();
      }
    });
    $("#removeCard").addEventListener("click", removeCard);
    $("#sessionList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-session]");
      if (button) viewSession(button.dataset.session);
    });
    window.addEventListener("online", function () { renderConnection(); });
    window.addEventListener("offline", function () { renderConnection(); });
  }

  function renderConnection() {
    var status = $("#connectionStatus");
    var online = navigator.onLine !== false;
    var offlineReady = "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
    status.classList.toggle("is-offline", !online);
    status.querySelector("span").textContent = online ? (offlineReady ? "Offline ready" : "Online") : "Offline mode";
  }

  function initialize() {
    $("#rankPad").innerHTML = RANKS.map(function (rank) { return '<button type="button" class="rank-key" data-rank="' + rank + '">' + rank + "</button>"; }).join("");
    bindEvents();
    renderConnection();
    render();
    if (state.roundPhase === "setup") showRoundSetup();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("./sw.js").then(function () {
        navigator.serviceWorker.ready.then(renderConnection);
      }).catch(function () {
        showToast("Offline install is not available in this browser session.", true);
      });
    }
  }

  initialize();
}());
