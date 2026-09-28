(function () {
  "use strict";

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var SUITS = {
    spades: { symbol: "♠", label: "Spades", red: false },
    hearts: { symbol: "♥", label: "Hearts", red: true },
    diamonds: { symbol: "♦", label: "Diamonds", red: true },
    clubs: { symbol: "♣", label: "Clubs", red: false }
  };
  var SEATS = [
    { id: "shoe", name: "Shoe only", short: "SHOE" },
    { id: "p1", name: "Seat 1", short: "1" },
    { id: "p2", name: "Seat 2", short: "2" },
    { id: "you", name: "You", short: "YOU" },
    { id: "p4", name: "Seat 4", short: "4" },
    { id: "p5", name: "Seat 5", short: "5" },
    { id: "dealer", name: "Dealer", short: "DEALER" }
  ];
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
      selectedSeat: "shoe",
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
        return { id: card.id, rank: card.rank, suit: card.suit || null, seat: card.seat, addedAt: card.addedAt || null, roundId: typeof card.roundId === "string" || card.roundId === null ? card.roundId : fresh.currentRoundId };
      }) : [];
      fresh.sessions = Array.isArray(saved.sessions) ? saved.sessions.slice(-HISTORY_LIMIT) : [];
      fresh.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack.slice(-UNDO_LIMIT).map(function (list) {
        return Array.isArray(list) ? list.filter(validCard) : [];
      }) : [];
      fresh.selectedSeat = SEATS.some(function (seat) { return seat.id === saved.selectedSeat; }) ? saved.selectedSeat : "shoe";
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
        return { id: id(), rank: entry.rank, suit: null, seat: activeSeats[index] || "shoe", addedAt: null, roundId: activeSeats[index] === "shoe" ? null : fresh.currentRoundId };
      });
      if (["shoe", "player", "dealer"].indexOf(legacy.mode) >= 0) {
        fresh.selectedSeat = legacy.mode === "player" ? "you" : legacy.mode === "dealer" ? "dealer" : "shoe";
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
      return { id: card.id, rank: card.rank, suit: card.suit || null, seat: card.seat, addedAt: card.addedAt || null, roundId: card.roundId == null ? null : card.roundId };
    });
  }

  function rememberUndo() {
    state.undoStack.push(copyCards(state.cards));
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
    return SEATS.find(function (seat) { return seat.id === seatId; }) || SEATS[2];
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
    var disabled = counts[rank] >= 32;
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
    root.innerHTML = SEATS.map(function (seat) {
      var hand = cardsFor(seat.id);
      var preview = hand.slice(-5).map(cardMiniMarkup).join("");
      var extra = hand.length > 5 ? '<span class="seat-empty">+' + (hand.length - 5) + "</span>" : "";
      var countLabel = seat.id === "shoe" ? hand.length + " seen" : hand.length + " card" + (hand.length === 1 ? "" : "s");
      var seatClass = seat.id === "dealer" ? " dealer-seat" : seat.id === "shoe" ? " shoe-seat" : "";
      return '<button type="button" class="seat-card' + seatClass + '" data-seat="' + seat.id + '" aria-pressed="' + (state.selectedSeat === seat.id) + '">' +
        '<span class="seat-top"><span>' + seat.short + '</span><span>' + countLabel + "</span></span>" +
        '<strong>' + seat.name + "</strong>" +
        '<span class="seat-cards">' + (hand.length ? preview + extra : '<span class="seat-empty">Empty hand</span>') + "</span></button>";
    }).join("");
    var active = seatById(state.selectedSeat);
    $("#activeSeatLabel").textContent = active.id === "shoe" ? "Next card removes it from the shoe only" : "Next card goes to " + active.name;
    $("#entrySeatName").textContent = active.name;
    var roundCount = state.cards.filter(function (card) { return card.seat !== "shoe" && card.roundId === state.currentRoundId; }).length;
    $("#tableCardCount").textContent = roundCount + " visible card" + (roundCount === 1 ? "" : "s") + " in this round";
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
      var seat = seatById(card.seat);
      return '<button type="button" class="recent-card' + red + '" data-edit-card="' + card.id + '" aria-label="Edit ' + card.rank + (suit ? " " + SUITS[card.suit].label : "") + " at " + seat.name + '">' +
        "<strong>" + card.rank + "</strong><small>" + (suit ? suit.symbol : seat.short) + "</small></button>";
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
    var opening = openingBlackjackChance(cards);
    $("#openingBlackjackValue").textContent = opening == null ? "—" : fmtPct(opening);
    if (!cards.length) {
      totalLabel.textContent = "—";
      description.textContent = "Choose cards for You to start.";
      root.innerHTML = "";
      breakdown.textContent = "";
      return;
    }
    totalLabel.textContent = hand.total + (hand.soft ? " soft" : "");
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
    holeToggle.hidden = cards.length !== 1;
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
    $("#clearRound").disabled = !state.cards.some(function (card) { return card.seat !== "shoe" && card.roundId === state.currentRoundId; });
  }

  function commit() {
    persist();
    render();
  }

  function addCard(rank) {
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
    state.cards.push({ id: id(), rank: rank, suit: suit, seat: state.selectedSeat, addedAt: new Date().toISOString(), roundId: state.selectedSeat === "shoe" ? null : state.currentRoundId });
    commit();
    vibrate();
  }

  function editCard(cardId) {
    var card = state.cards.find(function (entry) { return entry.id === cardId; });
    if (!card) return;
    editId = cardId;
    $("#editCardId").value = cardId;
    $("#editRank").innerHTML = RANKS.map(function (rank) { return '<option value="' + rank + '">' + rank + "</option>"; }).join("");
    $("#editRank").value = card.rank;
    $("#editSeat").innerHTML = SEATS.map(function (seat) { return '<option value="' + seat.id + '">' + seat.name + "</option>"; }).join("");
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
    state.cards[index] = { id: original.id, rank: rank, suit: suit, seat: seat, addedAt: original.addedAt, roundId: roundId };
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
    if (!state.cards.some(function (card) { return card.seat !== "shoe" && card.roundId === state.currentRoundId; })) return;
    rememberUndo();
    state.cards = state.cards.map(function (card) {
      if (card.seat !== "shoe" && card.roundId === state.currentRoundId) return { id: card.id, rank: card.rank, suit: card.suit || null, seat: card.seat, addedAt: card.addedAt || null, roundId: null };
      return card;
    });
    commit();
    showToast("Hands cleared. All cards remain counted in the shoe.");
  }

  function undo() {
    if (!state.undoStack.length) return;
    state.cards = state.undoStack.pop();
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
    state.selectedSeat = "shoe";
    state.manualCutReached = false;
    state.shoeStarted = new Date().toISOString();
    state.currentRoundId = id();
    commit();
    showToast("New 8-deck shoe started.");
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
      return '<span class="session-card-item' + (suit && suit.red ? " red" : "") + '">' + card.rank + (suit ? suit.symbol : "") + '<small>' + seatById(card.seat).short + "</small></span>";
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
    $("#seatPicker").addEventListener("click", function (event) {
      var button = event.target.closest("[data-seat]");
      if (!button) return;
      state.selectedSeat = button.dataset.seat;
      persist();
      renderSeats();
      renderRankPad();
    });
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
    $("#suitPicker").addEventListener("click", function (event) {
      var button = event.target.closest("[data-suit]");
      if (!button) return;
      state.selectedSuit = button.dataset.suit;
      persist();
      renderShoeSummary();
      renderRankPad();
    });
    $("#undoButton").addEventListener("click", undo);
    $("#clearRound").addEventListener("click", clearRound);
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
