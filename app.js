(function () {
  "use strict";

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var SUITS = ["spades", "hearts", "diamonds", "clubs"];
  var RED_SUITS = ["hearts", "diamonds"];
  var TEN_VALUES = ["10", "J", "Q", "K"];
  var STORE_KEY = "table-trainer-v36";
  var TOTAL_CARDS = 416;
  var $ = function (id) { return document.getElementById(id); };
  var toastTimer = 0;

  function freshState() {
    return {
      cards: [], sessions: [], currentRoundId: 1, roundNumber: 1, phase: "yourFirst",
      shoeStartedAt: Date.now(), cutPosition: 75, cutReached: false,
      hitSoft17: false, doubleAfterSplit: true, trackSuits: false, selectedSuit: "",
      undoStack: []
    };
  }

  function loadState() {
    var fresh = freshState();
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return fresh;
      fresh.cards = Array.isArray(saved.cards) ? saved.cards : [];
      fresh.sessions = Array.isArray(saved.sessions) ? saved.sessions.slice(0, 50) : [];
      fresh.currentRoundId = Number.isInteger(saved.currentRoundId) && saved.currentRoundId > 0 ? saved.currentRoundId : 1;
      fresh.roundNumber = Number.isInteger(saved.roundNumber) && saved.roundNumber > 0 ? saved.roundNumber : 1;
      fresh.phase = ["yourFirst", "dealerUp", "yourSecond", "player", "dealerReveal", "dealerDraw", "roundComplete"].indexOf(saved.phase) >= 0 ? saved.phase : "yourFirst";
      fresh.shoeStartedAt = Number(saved.shoeStartedAt) || Date.now();
      fresh.cutPosition = Number.isFinite(Number(saved.cutPosition)) ? Math.max(50, Math.min(90, Number(saved.cutPosition))) : 75;
      fresh.cutReached = saved.cutReached === true;
      fresh.hitSoft17 = saved.hitSoft17 === true;
      fresh.doubleAfterSplit = saved.doubleAfterSplit !== false;
      fresh.trackSuits = saved.trackSuits === true;
      fresh.selectedSuit = SUITS.indexOf(saved.selectedSuit) >= 0 ? saved.selectedSuit : "";
      fresh.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack.slice(-50) : [];
      return fresh;
    } catch (error) {
      return fresh;
    }
  }

  var state = loadState();

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (error) { showToast("This device could not save the latest change. Free some storage and try again."); }
  }

  function snapshot() {
    var copy = JSON.parse(JSON.stringify(state));
    copy.undoStack = [];
    state.undoStack.push(copy);
    if (state.undoStack.length > 50) state.undoStack.shift();
  }

  function undo() {
    if (!state.undoStack.length) return showToast("Nothing to undo yet.");
    var previous = state.undoStack.pop();
    var stack = state.undoStack;
    state = previous;
    state.undoStack = stack;
    persist();
    render();
    showToast("Last change undone.");
  }

  function showToast(message) {
    var toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 2300);
  }

  function uid() {
    return window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : "card-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function currentCards() {
    return state.cards.filter(function (card) { return card.roundId === state.currentRoundId && card.removed !== true; });
  }

  function cardsFor(role) {
    return currentCards().filter(function (card) { return card.role === role; });
  }

  function knownCards() {
    return state.cards.filter(function (card) { return card.removed !== true && RANKS.indexOf(card.rank) >= 0; });
  }

  function missedUnknownCards() {
    return state.cards.filter(function (card) { return card.removed !== true && card.unknown === true && !card.hidden; });
  }

  function hiddenHoleCards() {
    return state.cards.filter(function (card) { return card.removed !== true && card.hidden === true; });
  }

  function rankCounts() {
    var counts = {};
    RANKS.forEach(function (rank) { counts[rank] = 32; });
    knownCards().forEach(function (card) { counts[card.rank] = Math.max(0, counts[card.rank] - 1); });
    return counts;
  }

  function suitCount(rank, suit) {
    return 8 - knownCards().filter(function (card) { return card.rank === rank && card.suit === suit; }).length;
  }

  function physicalSeen() { return knownCards().length + missedUnknownCards().length + hiddenHoleCards().length; }
  function physicalRemaining() { return Math.max(0, TOTAL_CARDS - physicalSeen()); }
  function decksRemaining() { return physicalRemaining() / 52; }
  function runningCount() {
    return knownCards().reduce(function (sum, card) {
      if (["2", "3", "4", "5", "6"].indexOf(card.rank) >= 0) return sum + 1;
      if (["10", "J", "Q", "K", "A"].indexOf(card.rank) >= 0) return sum - 1;
      return sum;
    }, 0);
  }
  function trueCount() { return decksRemaining() > 0 ? runningCount() / decksRemaining() : 0; }
  function countIsUncertain() { return missedUnknownCards().length > 0; }
  function formatCount(value, decimals) {
    var rounded = Number(value).toFixed(decimals);
    return value > 0 ? "+" + rounded : rounded;
  }

  function rankValue(rank) { return rank === "A" ? 11 : TEN_VALUES.indexOf(rank) >= 0 ? 10 : Number(rank); }
  function handValue(cards) {
    var total = 0;
    var aces = 0;
    cards.forEach(function (card) {
      if (RANKS.indexOf(card.rank) < 0) return;
      total += rankValue(card.rank);
      if (card.rank === "A") aces += 1;
    });
    var adjustedAces = aces;
    while (total > 21 && adjustedAces > 0) { total -= 10; adjustedAces -= 1; }
    return { total: total, soft: adjustedAces > 0 && total <= 21, unknown: cards.some(function (card) { return card.unknown || card.hidden || RANKS.indexOf(card.rank) < 0; }) };
  }

  function allKnown(cards) { return cards.every(function (card) { return RANKS.indexOf(card.rank) >= 0 && !card.unknown && !card.hidden; }); }
  function dealerUpcard() { return cardsFor("dealer").find(function (card) { return !card.hidden; }) || null; }

  function nextEntryRole() {
    if (["yourFirst", "yourSecond", "player"].indexOf(state.phase) >= 0) return "you";
    if (["dealerUp", "dealerReveal", "dealerDraw"].indexOf(state.phase) >= 0) return "dealer";
    return "";
  }

  function flowText() {
    var prompts = {
      yourFirst: "Enter your first card",
      dealerUp: "Enter the dealer up card",
      yourSecond: "Enter your second card",
      player: "Your turn · enter a hit or stand",
      dealerReveal: "Stand · reveal the dealer hole card",
      dealerDraw: "Dealer turn · enter dealer draws",
      roundComplete: "Round complete · start the next round"
    };
    return prompts[state.phase] || prompts.yourFirst;
  }

  function advanceAfterVisibleCard(role) {
    if (state.phase === "yourFirst") state.phase = "dealerUp";
    else if (state.phase === "dealerUp") state.phase = "yourSecond";
    else if (state.phase === "yourSecond") {
      state.cards.push({ id: uid(), rank: null, suit: "", role: "dealer", hidden: true, unknown: false, roundId: state.currentRoundId, addedAt: Date.now() });
      state.phase = "player";
    } else if (state.phase === "dealerReveal") state.phase = "dealerDraw";
  }

  function isRankAvailable(rank) {
    var counts = rankCounts();
    if ((counts[rank] || 0) <= 0) return false;
    if (state.trackSuits && state.selectedSuit && suitCount(rank, state.selectedSuit) <= 0) return false;
    return physicalRemaining() > 0;
  }

  function addKnown(rank) {
    if (RANKS.indexOf(rank) < 0) return;
    if (["yourFirst", "dealerUp", "yourSecond", "player", "dealerReveal", "dealerDraw"].indexOf(state.phase) < 0) return;
    if (state.trackSuits && !state.selectedSuit) return showToast("Choose a suit first.");
    if (!isRankAvailable(rank)) return showToast("That rank is no longer available in the tracked shoe.");
    snapshot();
    var suit = state.trackSuits ? state.selectedSuit : "";
    if (state.phase === "dealerReveal") {
      var hidden = currentCards().find(function (card) { return card.hidden === true; });
      if (!hidden) { state.undoStack.pop(); return showToast("No hidden dealer card is waiting to be revealed."); }
      hidden.rank = rank;
      hidden.suit = suit;
      hidden.hidden = false;
      hidden.unknown = false;
      hidden.revealedHole = true;
      hidden.addedAt = Date.now();
      state.phase = "dealerDraw";
    } else {
      var role = nextEntryRole();
      if (!role) { state.undoStack.pop(); return; }
      state.cards.push({ id: uid(), rank: rank, suit: suit, role: role, hidden: false, unknown: false, roundId: state.currentRoundId, addedAt: Date.now() });
      advanceAfterVisibleCard(role);
    }
    state.selectedSuit = "";
    persist();
    render();
  }

  function addUnknown() {
    if (["yourFirst", "dealerUp", "yourSecond", "player", "dealerReveal", "dealerDraw"].indexOf(state.phase) < 0) return showToast("There is no card to enter right now.");
    snapshot();
    if (state.phase === "dealerReveal") {
      var hole = currentCards().find(function (card) { return card.hidden === true; });
      if (!hole) { state.undoStack.pop(); return showToast("No hidden dealer card is waiting to be resolved."); }
      hole.hidden = false;
      hole.unknown = true;
      hole.rank = null;
      hole.suit = "";
      hole.addedAt = Date.now();
      state.phase = "dealerDraw";
    } else {
      var role = nextEntryRole();
      state.cards.push({ id: uid(), rank: null, suit: "", role: role, hidden: false, unknown: true, roundId: state.currentRoundId, addedAt: Date.now() });
      advanceAfterVisibleCard(role);
    }
    state.selectedSuit = "";
    persist();
    render();
    showToast("Unknown card recorded. Count-based suggestions are paused until it is resolved.");
  }

  function advanceFlow() {
    if (state.phase === "player") {
      snapshot();
      state.phase = "dealerReveal";
      persist();
      render();
    } else if (state.phase === "dealerDraw") {
      snapshot();
      state.phase = "roundComplete";
      persist();
      render();
    }
  }

  function startNextRound(askFirst) {
    var hasCards = currentCards().some(function (card) { return !card.hidden || card.unknown; });
    if (askFirst && hasCards && state.phase !== "roundComplete" && !window.confirm("Start a new round and keep every entered card in the shoe count?")) return;
    snapshot();
    state.currentRoundId += 1;
    state.roundNumber += 1;
    state.phase = "yourFirst";
    state.selectedSuit = "";
    persist();
    render();
  }

  function archiveShoe() {
    var seen = physicalSeen();
    if (!seen) return;
    state.sessions.unshift({
      endedAt: Date.now(), startedAt: state.shoeStartedAt, cardsSeen: seen,
      unknownCards: missedUnknownCards().length, penetration: seen / TOTAL_CARDS,
      hands: Math.max(0, state.roundNumber - 1), cutReached: state.cutReached,
      runningCount: runningCount()
    });
    state.sessions = state.sessions.slice(0, 50);
  }

  function newShoe() {
    if (physicalSeen() && !window.confirm("Save this shoe to Sessions and reset to a fresh eight-deck shoe?")) return;
    snapshot();
    archiveShoe();
    state.cards = [];
    state.currentRoundId = 1;
    state.roundNumber = 1;
    state.phase = "yourFirst";
    state.shoeStartedAt = Date.now();
    state.cutReached = false;
    state.selectedSuit = "";
    persist();
    render();
    showToast("Fresh eight-deck shoe loaded.");
  }

  function markCutReached() {
    snapshot();
    state.cutReached = true;
    persist();
    render();
    showToast("Cut card marked as reached.");
  }

  function countBadge() { return countIsUncertain() ? "uncertain" : "exact"; }
  function pct(value) { return Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "—"; }
  function remainingProbability(rank) {
    var counts = rankCounts();
    var total = RANKS.reduce(function (sum, item) { return sum + counts[item]; }, 0);
    return total > 0 ? counts[rank] / total : 0;
  }

  function buildRankButton(rank) {
    var button = document.createElement("button");
    var counts = rankCounts();
    button.type = "button";
    button.className = "rank-button" + (rank === "10" ? " ten" : "");
    button.textContent = rank;
    button.setAttribute("aria-label", "Add " + rank);
    button.disabled = !isRankAvailable(rank) || ["roundComplete"].indexOf(state.phase) >= 0;
    button.addEventListener("click", function () { addKnown(rank); });
    return button;
  }

  function renderRanks() {
    var root = $("rankPad");
    root.innerHTML = "";
    RANKS.forEach(function (rank) { root.appendChild(buildRankButton(rank)); });
  }

  function renderSuits() {
    var toggle = $("suitToggle");
    toggle.setAttribute("aria-pressed", state.trackSuits ? "true" : "false");
    toggle.textContent = state.trackSuits ? "Suits on" : "Suits off";
    $("suitPicker").hidden = !state.trackSuits;
    $("suitPicker").querySelectorAll("button").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.suit === state.selectedSuit ? "true" : "false");
      button.classList.toggle("red-suit", RED_SUITS.indexOf(button.dataset.suit) >= 0);
    });
  }

  function cardMarkup(card) {
    if (card.hidden) return '<span class="playing-card hidden" aria-label="Dealer hole card">◆</span>';
    if (card.unknown || !card.rank) return '<span class="playing-card">?</span>';
    var suit = card.suit ? ({ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[card.suit] || "") : "";
    var red = RED_SUITS.indexOf(card.suit) >= 0 ? " red" : "";
    return '<span class="playing-card' + red + '" aria-label="' + card.rank + (suit ? " " + suit : "") + '">' + card.rank + suit + '</span>';
  }

  function renderHand(role, containerId, totalId) {
    var cards = cardsFor(role);
    var root = $(containerId);
    var value = handValue(cards);
    root.innerHTML = "";
    if (!cards.length) root.innerHTML = '<span class="empty-card">' + (role === "you" ? "Add your first card" : "Dealer cards appear here") + "</span>";
    else cards.forEach(function (card) { root.insertAdjacentHTML("beforeend", cardMarkup(card)); });
    $(totalId).textContent = cards.length && allKnown(cards.filter(function (card) { return !card.hidden; })) ? value.total + (value.soft ? " soft" : "") : cards.length ? "?" : "—";
  }

  function renderRecent() {
    var root = $("recentCards");
    var cards = state.cards.filter(function (card) { return card.removed !== true; }).slice(-16).reverse();
    root.innerHTML = "";
    if (!cards.length) { root.innerHTML = '<span class="empty-card">No cards entered yet.</span>'; return; }
    cards.forEach(function (card) {
      var button = document.createElement("button");
      var rank = card.hidden ? "HIDDEN" : card.unknown || !card.rank ? "UNKNOWN" : card.rank + (card.suit ? ({ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[card.suit] || "") : "");
      button.type = "button";
      button.className = "recent-item " + (card.role === "dealer" ? "dealer " : "") + (card.unknown ? "unknown" : "");
      button.innerHTML = '<span class="rank">' + rank + '</span><span class="seat">' + (card.role === "dealer" ? "DEALER" : "YOU") + '</span>';
      if (!card.hidden) button.addEventListener("click", function () { openEdit(card); });
      root.appendChild(button);
    });
  }

  function renderFlow() {
    var text = flowText();
    $("flowPrompt").textContent = text;
    $("entryPrompt").textContent = text;
    $("roundNumber").textContent = "Round " + state.roundNumber;
    var button = $("flowButton");
    var next = $("nextRoundButton");
    button.hidden = !["player", "dealerDraw"].includes(state.phase);
    button.textContent = state.phase === "player" ? "Stand · Dealer" : "Finish dealer turn";
    next.hidden = state.phase !== "roundComplete";
    $("dockHint").textContent = state.phase === "dealerReveal" ? "Tap the dealer hole-card rank" : state.phase === "roundComplete" ? "Round complete" : "Tap a rank to add it";
  }

  function renderCount() {
    var rc = runningCount();
    var tc = trueCount();
    var uncertain = countIsUncertain();
    $("runningCount").textContent = formatCount(rc, 0) + (uncertain ? "*" : "");
    $("trueCount").textContent = formatCount(tc, 2) + (uncertain ? "*" : "");
    $("decksRemaining").textContent = decksRemaining().toFixed(2);
    $("countCertainty").textContent = uncertain ? "Unknown card · count uncertain" : "No missed ranks";
    $("countCertainty").classList.toggle("uncertain", uncertain);
    var notice = $("unknownNotice");
    notice.hidden = !uncertain;
    notice.textContent = uncertain ? missedUnknownCards().length + " unresolved Unknown card" + (missedUnknownCards().length === 1 ? "" : "s") + ". The running and true counts are marked *; Hi-Lo overrides and insurance suggestions are paused until the rank is resolved." : "";
  }

  function renderShoeSummary() {
    var seen = physicalSeen();
    var penetration = Math.min(100, seen / TOTAL_CARDS * 100);
    $("seenTotal").textContent = seen;
    $("remainingTotal").textContent = physicalRemaining();
    $("penetrationValue").textContent = penetration.toFixed(1) + "%";
    $("penetrationBar").style.width = penetration + "%";
    $("cutMarker").style.left = state.cutPosition + "%";
    var reached = state.cutReached || penetration >= state.cutPosition;
    $("cutStatus").textContent = state.cutReached ? "Cut card marked" : reached ? "Estimated cut reached" : "Cut card ahead";
    $("cutStatus").classList.toggle("reached", reached);
    $("cutNotice").hidden = !reached;
    $("cutNotice").textContent = state.cutReached ? "Cut card marked. Finish this round, then start a fresh shoe." : "Estimated cut position reached. Mark it manually when you see the cut card.";
    $("shoeStarted").textContent = "Started " + new Date(state.shoeStartedAt).toLocaleDateString();
    $("cardsLeftLabel").textContent = physicalRemaining() + " cards · " + decksRemaining().toFixed(2) + " decks";
  }

  function probChip(label, value, extraClass) {
    return '<div class="prob-chip ' + (extraClass || "") + '"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function renderQuickProbabilities() {
    var groups = [
      ["Aces", ["A"]], ["2–6", ["2", "3", "4", "5", "6"]], ["7–9", ["7", "8", "9"]], ["10 value", ["10", "J", "Q", "K"]]
    ];
    var counts = rankCounts();
    var total = RANKS.reduce(function (sum, rank) { return sum + counts[rank]; }, 0);
    $("quickProbabilities").innerHTML = groups.map(function (group) {
      var n = group[1].reduce(function (sum, rank) { return sum + counts[rank]; }, 0);
      return probChip(group[0], total ? pct(n / total) : "—");
    }).join("");
  }

  function renderRankAudit() {
    var counts = rankCounts();
    var total = RANKS.reduce(function (sum, rank) { return sum + counts[rank]; }, 0);
    $("rankAudit").innerHTML = RANKS.map(function (rank) {
      var chance = total ? counts[rank] / total : 0;
      return '<div class="rank-row"><strong>' + rank + '</strong><span>' + counts[rank] + ' left</span><b>' + pct(chance) + '</b><div class="bar"><i style="width:' + Math.min(100, chance * 520) + '%"></i></div></div>';
    }).join("");
    var groups = [["Aces", ["A"]], ["2–6", ["2", "3", "4", "5", "6"]], ["7–9", ["7", "8", "9"]], ["10-value cards", ["10", "J", "Q", "K"]]];
    $("groupProbabilities").innerHTML = groups.map(function (group) {
      var n = group[1].reduce(function (sum, rank) { return sum + counts[rank]; }, 0);
      return '<div class="group-card"><span>' + group[0] + '</span><b>' + pct(total ? n / total : 0) + '</b><span>' + n + ' cards</span></div>';
    }).join("");
    var uncertainty = countIsUncertain() ? '<br><br><b>Unknown ranks:</b> ' + missedUnknownCards().length + ' card(s) remain unassigned, so exact composition and count-based suggestions are uncertain.' : "";
    $("auditText").innerHTML = "Cards dealt: <b>" + physicalSeen() + "</b><br>Known ranks: <b>" + knownCards().length + "</b><br>Unknown cards: <b>" + missedUnknownCards().length + "</b><br>Dealer hole cards still hidden: <b>" + hiddenHoleCards().length + "</b><br>Hi-Lo running count: <b>" + formatCount(runningCount(), 0) + (countIsUncertain() ? "*" : "") + "</b><br>True count: <b>" + formatCount(trueCount(), 2) + (countIsUncertain() ? "*" : "") + "</b><br>Estimated decks remaining: <b>" + decksRemaining().toFixed(2) + "</b><br>Dealer rule: <b>" + (state.hitSoft17 ? "H17" : "S17") + "</b>" + uncertainty;
  }

  function scoreState(cards) { return handValue(cards); }

  function dealerDistribution() {
    var dealer = cardsFor("dealer").filter(function (card) { return !card.hidden && RANKS.indexOf(card.rank) >= 0; });
    if (!dealer.length) return null;
    var countsObject = rankCounts();
    var initialCounts = RANKS.map(function (rank) { return countsObject[rank]; });
    var memo = new Map();
    function recurse(cards, counts) {
      var hand = scoreState(cards);
      var result = { bust: 0, 17: 0, 18: 0, 19: 0, 20: 0, 21: 0 };
      if (hand.total > 21) { result.bust = 1; return result; }
      var mustHit = hand.total < 17 || (hand.total === 17 && hand.soft && state.hitSoft17);
      if (!mustHit) { result[hand.total >= 17 && hand.total <= 21 ? hand.total : "bust"] = 1; return result; }
      var totalLeft = counts.reduce(function (a, b) { return a + b; }, 0);
      if (!totalLeft) { result.bust = 1; return result; }
      var key = hand.total + "|" + (hand.soft ? "1" : "0") + "|" + counts.join(",");
      if (memo.has(key)) return memo.get(key);
      for (var i = 0; i < RANKS.length; i += 1) {
        if (!counts[i]) continue;
        var nextCounts = counts.slice();
        nextCounts[i] -= 1;
        var nextCards = cards.concat([{ rank: RANKS[i] }]);
        var sub = recurse(nextCards, nextCounts);
        var p = counts[i] / totalLeft;
        Object.keys(result).forEach(function (label) { result[label] += p * sub[label]; });
      }
      memo.set(key, result);
      return result;
    }
    try { return recurse(dealer.map(function (card) { return { rank: card.rank }; }), initialCounts); }
    catch (error) { return null; }
  }

  function renderDealerOutcomes() {
    var dealer = cardsFor("dealer").filter(function (card) { return !card.hidden; });
    var hand = handValue(dealer);
    $("dealerTotalBadge").textContent = dealer.length && allKnown(dealer) ? hand.total + (hand.soft ? " soft" : "") : dealer.length ? "?" : "—";
    var distribution = dealerDistribution();
    $("dealerDescription").textContent = !dealer.length ? "Add the dealer up card to calculate final outcomes." : countIsUncertain() ? "Estimated outcomes · unresolved Unknown cards affect exact shoe composition." : hiddenHoleCards().length ? "Includes the unseen dealer hole card and the remaining shoe." : hand.total > 21 ? "Dealer has already busted." : hand.total >= 17 && !(hand.total === 17 && hand.soft && state.hitSoft17) ? "Dealer stands on this hand." : "Outcome odds use the visible dealer cards and remaining shoe.";
    $("dealerOutcomes").innerHTML = distribution ? ["bust", "17", "18", "19", "20", "21"].map(function (label) {
      return '<div class="outcome ' + (label === "bust" ? "bad" : label === "21" ? "good" : "") + '"><span>Dealer ' + label + '</span><b>' + pct(distribution[label]) + '</b></div>';
    }).join("") : '<div class="empty-card">Add dealer cards to see probabilities.</div>';
  }

  function renderPlayerOdds() {
    var cards = cardsFor("you");
    var hand = handValue(cards);
    $("handTotalBadge").textContent = cards.length && allKnown(cards) ? hand.total + (hand.soft ? " soft" : "") : cards.length ? "?" : "—";
    if (!cards.length || !allKnown(cards) || hand.total > 21) {
      $("handDescription").textContent = !cards.length ? "Your hand outcomes appear after the deal." : !allKnown(cards) ? "Resolve Unknown cards in your hand to calculate the next-card odds." : "Your hand is already over 21.";
      $("bustProbability").textContent = hand.total > 21 ? "100%" : "—";
      $("myNextCardOdds").innerHTML = "";
      $("playerOutcomes").innerHTML = "";
      return;
    }
    var counts = rankCounts();
    var total = RANKS.reduce(function (sum, rank) { return sum + counts[rank]; }, 0);
    var bust = 0;
    var resultCounts = { bust: 0, 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, "16 or lower": 0 };
    $("myNextCardOdds").innerHTML = RANKS.map(function (rank) { return probChip(rank, pct(total ? counts[rank] / total : 0)); }).join("");
    RANKS.forEach(function (rank) {
      if (!counts[rank] || !total) return;
      var next = handValue(cards.concat([{ rank: rank }]));
      var chance = counts[rank] / total;
      if (next.total > 21) { bust += chance; resultCounts.bust += chance; }
      else if (next.total >= 17) resultCounts[next.total] += chance;
      else resultCounts["16 or lower"] += chance;
    });
    $("bustProbability").textContent = pct(bust);
    $("handDescription").textContent = "Current total " + hand.total + (hand.soft ? " soft" : " hard") + " · next-card odds use the remaining rank mix" + (countIsUncertain() ? " (estimate; Unknown cards unresolved)." : ".");
    $("playerOutcomes").innerHTML = ["17", "18", "19", "20", "21", "bust", "16 or lower"].map(function (label) {
      return '<div class="outcome ' + (label === "bust" ? "bad" : ["17", "18", "19", "20", "21"].indexOf(label) >= 0 ? "good" : "") + '"><span>' + label + '</span><b>' + pct(resultCounts[label]) + '</b></div>';
    }).join("");
  }

  function dealerValue(upcard) { return rankValue(upcard); }
  function pairAdvice(cards, up) {
    if (cards.length !== 2 || cards[0].rank !== cards[1].rank) return null;
    var rank = cards[0].rank;
    var dealer = dealerValue(up);
    if (rank === "A" || rank === "8") return "SPLIT";
    if (rank === "10" || TEN_VALUES.indexOf(rank) >= 0) return "STAND";
    if (rank === "9") return ((dealer >= 2 && dealer <= 6) || dealer === 8 || dealer === 9) ? "SPLIT" : "STAND";
    if (rank === "7") return dealer >= 2 && dealer <= 7 ? "SPLIT" : "HIT";
    if (rank === "6") return dealer >= (state.doubleAfterSplit ? 2 : 3) && dealer <= 6 ? "SPLIT" : "HIT";
    if (rank === "5") return null;
    if (rank === "4") return state.doubleAfterSplit && (dealer === 5 || dealer === 6) ? "SPLIT" : "HIT";
    if (rank === "2" || rank === "3") return dealer >= (state.doubleAfterSplit ? 2 : 4) && dealer <= 7 ? "SPLIT" : "HIT";
    return null;
  }

  function basicAction(cards, up, ignorePair, allowDouble) {
    if (!cards.length || !allKnown(cards) || !up || RANKS.indexOf(up.rank) < 0) return null;
    var dealer = dealerValue(up.rank);
    if (!ignorePair) {
      var pair = pairAdvice(cards, up.rank);
      if (pair) return pair;
    }
    var hand = handValue(cards);
    var total = hand.total;
    var canDouble = allowDouble !== false && cards.length === 2;
    var doubleOr = function (fallback) { return canDouble ? "DOUBLE" : fallback; };
    if (total > 21) return "BUST";
    if (hand.soft) {
      if (total >= 20) return "STAND";
      if (total === 19) return state.hitSoft17 && dealer === 6 ? doubleOr("STAND") : "STAND";
      if (total === 18) {
        if (dealer >= 3 && dealer <= 6) return doubleOr("HIT");
        if (state.hitSoft17 && dealer === 2) return doubleOr("STAND");
        if (dealer === 2 || dealer === 7 || dealer === 8) return "STAND";
        return "HIT";
      }
      if (total === 17) {
        if (dealer >= 3 && dealer <= 6) return doubleOr("HIT");
        return "HIT";
      }
      if (total === 16 || total === 15) {
        if (dealer >= 4 && dealer <= 6) return doubleOr("HIT");
        return "HIT";
      }
      if (total === 14 || total === 13) {
        if (dealer === 5 || dealer === 6) return doubleOr("HIT");
        return "HIT";
      }
      return "HIT";
    }
    if (total >= 17) return "STAND";
    if (total >= 13) return dealer >= 2 && dealer <= 6 ? "STAND" : "HIT";
    if (total === 12) return dealer >= 4 && dealer <= 6 ? "STAND" : "HIT";
    if (total === 11) {
      if (dealer === 11 && !state.hitSoft17) return "HIT";
      return doubleOr("HIT");
    }
    if (total === 10) return dealer >= 2 && dealer <= 9 ? doubleOr("HIT") : "HIT";
    if (total === 9) return dealer >= 3 && dealer <= 6 ? doubleOr("HIT") : "HIT";
    return "HIT";
  }

  function deviationFor(cards, up, base) {
    if (!cards.length || !allKnown(cards) || !up || !allKnown([up]) || countIsUncertain()) return null;
    var tc = trueCount();
    var hand = handValue(cards);
    var dealer = dealerValue(up.rank);
    var total = hand.total;
    var initialTwo = cards.length === 2;
    var pair10 = initialTwo && cards[0].rank === cards[1].rank && TEN_VALUES.indexOf(cards[0].rank) >= 0;
    var splitPair = initialTwo && cards[0].rank === cards[1].rank && pairAdvice(cards, up.rank) === "SPLIT";
    var hardIndexHand = !hand.soft && !splitPair;
    var rules = [
      { match: hardIndexHand && total === 16 && dealer === 10, index: 0, direction: "above", action: "STAND", label: "Hard 16 vs 10" },
      { match: hardIndexHand && total === 15 && dealer === 10, index: 4, direction: "above", action: "STAND", label: "Hard 15 vs 10" },
      { match: hardIndexHand && total === 16 && dealer === 9, index: state.hitSoft17 ? 4 : 5, direction: "above", action: "STAND", label: "Hard 16 vs 9" },
      { match: state.hitSoft17 && hardIndexHand && total === 16 && dealer === 11, index: 3, direction: "above", action: "STAND", label: "Hard 16 vs Ace" },
      { match: state.hitSoft17 && hardIndexHand && total === 15 && dealer === 11, index: 5, direction: "above", action: "STAND", label: "Hard 15 vs Ace" },
      { match: hardIndexHand && total === 12 && dealer === 2, index: 3, direction: "above", action: "STAND", label: "Hard 12 vs 2" },
      { match: hardIndexHand && total === 12 && dealer === 3, index: 2, direction: "above", action: "STAND", label: "Hard 12 vs 3" },
      { match: hardIndexHand && total === 12 && dealer === 4, index: 0, direction: "below", action: "HIT", label: "Hard 12 vs 4" },
      { match: hardIndexHand && total === 12 && dealer === 5, index: -2, direction: "below", action: "HIT", label: "Hard 12 vs 5" },
      { match: hardIndexHand && total === 12 && dealer === 6, index: state.hitSoft17 ? -3 : -1, direction: "below", action: "HIT", label: "Hard 12 vs 6" },
      { match: hardIndexHand && total === 13 && dealer === 2, index: -1, direction: "below", action: "HIT", label: "Hard 13 vs 2" },
      { match: hardIndexHand && total === 13 && dealer === 3, index: -2, direction: "below", action: "HIT", label: "Hard 13 vs 3" },
      { match: initialTwo && total === 9 && dealer === 2, index: 1, direction: "above", action: "DOUBLE", label: "Hard 9 vs 2" },
      { match: initialTwo && total === 9 && dealer === 7, index: 3, direction: "above", action: "DOUBLE", label: "Hard 9 vs 7" },
      { match: initialTwo && total === 10 && dealer === 10, index: 4, direction: "above", action: "DOUBLE", label: "Hard 10 vs 10" },
      { match: initialTwo && total === 10 && dealer === 11, index: state.hitSoft17 ? 3 : 4, direction: "above", action: "DOUBLE", label: "Hard 10 vs Ace" },
      { match: initialTwo && total === 11 && dealer === 11, index: 1, direction: "above", action: "DOUBLE", label: "Hard 11 vs Ace" },
      { match: pair10 && dealer === 5, index: 5, direction: "above", action: "SPLIT", label: "Pair of 10s vs 5" },
      { match: pair10 && dealer === 6, index: 4, direction: "above", action: "SPLIT", label: "Pair of 10s vs 6" }
    ];
    for (var i = 0; i < rules.length; i += 1) {
      var rule = rules[i];
      if (!rule.match) continue;
      var applies = rule.direction === "above" ? tc >= rule.index : tc < rule.index;
      if (!applies || base === rule.action) continue;
      return { action: rule.action, label: rule.label, index: rule.index, direction: rule.direction, base: base };
    }
    return null;
  }

  function recommendation() {
    var cards = cardsFor("you");
    var up = dealerUpcard();
    if (state.phase !== "player") return { ready: false, message: state.phase === "roundComplete" ? "Round complete. Start the next round when ready." : "Finish the opening deal to get a suggestion." };
    if (!cards.length || !up) return { ready: false, message: "Enter your two cards and the dealer up card." };
    if (!allKnown(cards) || !allKnown([up])) return { ready: false, message: "Resolve the Unknown card in your hand or the dealer up card to get a suggestion." };
    var base = basicAction(cards, up, false);
    if (!base) return { ready: false, message: "Complete the hand entry to get a suggestion." };
    var deviation = deviationFor(cards, up, base);
    return { ready: true, base: base, action: deviation ? deviation.action : base, deviation: deviation, cards: cards, up: up, uncertain: countIsUncertain(), tc: trueCount() };
  }

  function fallbackAction(cards, up, action) {
    if (action === "DOUBLE") return basicAction(cards, up, true, false) || "HIT";
    if (action === "SPLIT") return basicAction(cards, up, true, false) === "STAND" ? "STAND" : "HIT";
    return "";
  }

  function renderRecommendation() {
    var result = recommendation();
    var badge = $("suggestionBadge");
    var reason = $("recommendationReason");
    var breakdown = $("strategyBreakdown");
    var insurance = $("insuranceSuggestion");
    badge.textContent = result.ready ? result.action : "—";
    badge.classList.toggle("waiting", !result.ready);
    badge.classList.toggle("override", !!(result.ready && result.deviation));
    reason.textContent = result.ready ? (result.deviation ? result.deviation.label + " changes from " + result.base + " to " + result.action + " at the current true count." : "Eight-deck basic strategy recommends " + result.action.toLowerCase() + " against the dealer " + result.up.rank + ".") : result.message;
    breakdown.hidden = !result.ready;
    insurance.hidden = !result.ready || result.up.rank !== "A";
    if (!result.ready) { breakdown.textContent = ""; insurance.textContent = ""; return; }
    var detail = "<b>Basic strategy:</b> " + result.base + ".";
    if (result.deviation) {
      var threshold = result.deviation.direction === "above" ? "TC ≥ " : "TC < ";
      detail += "<br><b>Hi-Lo index:</b> " + result.deviation.action + " at " + threshold + (result.deviation.index > 0 ? "+" : "") + result.deviation.index + ". Current TC " + formatCount(result.tc, 2) + ".";
    } else if (result.uncertain) {
      detail += "<br><b>Count override:</b> paused because the true count is uncertain (*).";
    } else {
      detail += "<br><b>Hi-Lo:</b> no listed index changes this play at TC " + formatCount(result.tc, 2) + ".";
    }
    var fallback = fallbackAction(result.cards, result.up, result.action);
    if (fallback) detail += "<br><b>Hit/stand fallback:</b> " + fallback + ".";
    breakdown.innerHTML = detail;
    if (result.up.rank === "A") {
      insurance.textContent = result.uncertain ? "Insurance index paused · resolve Unknown cards before using the +3 threshold." : result.tc >= 3 ? "Insurance index: TAKE at TC ≥ +3 · current TC " + formatCount(result.tc, 2) + "." : "Insurance index: DECLINE below TC +3 · current TC " + formatCount(result.tc, 2) + ".";
    }
  }

  function renderSessions() {
    var root = $("sessionList");
    if (!state.sessions.length) { root.innerHTML = '<div class="empty-sessions">No saved shoes yet. Starting a new shoe saves this one here.</div>'; return; }
    root.innerHTML = state.sessions.map(function (session) {
      var date = new Date(session.endedAt || session.startedAt).toLocaleString();
      var detail = (session.cardsSeen || 0) + " cards · " + ((session.penetration || 0) * 100).toFixed(1) + "% used · " + (session.hands || 0) + " rounds" + (session.cutReached ? " · cut card reached" : "");
      return '<article class="session-card"><div><strong>' + date + '</strong><span>' + detail + (session.unknownCards ? " · " + session.unknownCards + " unresolved Unknown" : "") + '</span></div><b>RC ' + formatCount(session.runningCount || 0, 0) + '</b></article>';
    }).join("");
  }

  function renderNetwork() {
    var status = $("connectionStatus");
    status.classList.toggle("offline", !navigator.onLine);
    status.querySelector("span").textContent = navigator.onLine ? "Online" : "Offline";
  }

  function render() {
    renderNetwork();
    renderRanks();
    renderSuits();
    renderFlow();
    renderHand("you", "playerCards", "playerTotal");
    renderHand("dealer", "dealerCards", "dealerTotal");
    renderRecent();
    renderCount();
    renderShoeSummary();
    renderQuickProbabilities();
    renderRankAudit();
    renderPlayerOdds();
    renderDealerOutcomes();
    renderRecommendation();
    renderSessions();
  }

  function openEdit(card) {
    $("editCardId").value = card.id;
    $("editRank").value = card.unknown || !card.rank ? "?" : card.rank;
    $("editSeat").value = card.role === "dealer" ? "dealer" : "you";
    $("editSuit").value = card.suit || "";
    $("editDialog").showModal();
  }

  function saveEdit() {
    var id = $("editCardId").value;
    var card = state.cards.find(function (item) { return item.id === id; });
    if (!card || card.hidden) return;
    var rank = $("editRank").value;
    var suit = $("editSuit").value;
    if (rank !== "?" && RANKS.indexOf(rank) < 0) return;
    if (rank !== "?") {
      var availableRankCopies = 32 - state.cards.filter(function (item) { return item.id !== id && item.removed !== true && item.rank === rank; }).length;
      if (availableRankCopies <= 0) return showToast("That rank is already fully used in the shoe.");
    }
    if (state.trackSuits && rank !== "?" && suit) {
      var capacity = 8 - state.cards.filter(function (item) { return item.id !== id && item.removed !== true && item.rank === rank && item.suit === suit; }).length;
      if (capacity <= 0) return showToast("That rank and suit are already fully used.");
    }
    snapshot();
    card = state.cards.find(function (item) { return item.id === id; });
    card.rank = rank === "?" ? null : rank;
    card.unknown = rank === "?";
    card.suit = rank === "?" ? "" : suit;
    card.role = $("editSeat").value === "dealer" ? "dealer" : "you";
    persist();
    render();
    $("editDialog").close();
  }

  function removeEditedCard() {
    var id = $("editCardId").value;
    var card = state.cards.find(function (item) { return item.id === id; });
    if (!card) return;
    snapshot();
    card = state.cards.find(function (item) { return item.id === id; });
    card.removed = true;
    persist();
    render();
    $("editDialog").close();
    showToast("Card removed from this shoe.");
  }

  function setupDialogs() {
    RANKS.concat(["?"]).forEach(function (rank) {
      var option = document.createElement("option");
      option.value = rank;
      option.textContent = rank === "?" ? "Unknown" : rank;
      $("editRank").appendChild(option);
    });
    $("settingsButton").addEventListener("click", function () {
      $("cutPosition").value = state.cutPosition;
      $("cutPositionValue").textContent = state.cutPosition + "%";
      $("hitSoft17").checked = state.hitSoft17;
      $("doubleAfterSplit").checked = state.doubleAfterSplit;
      $("settingsDialog").showModal();
    });
    $("cutPosition").addEventListener("input", function (event) { $("cutPositionValue").textContent = event.target.value + "%"; });
    $("settingsForm").addEventListener("submit", function () {
      snapshot();
      state.cutPosition = Number($("cutPosition").value);
      state.hitSoft17 = $("hitSoft17").checked;
      state.doubleAfterSplit = $("doubleAfterSplit").checked;
      persist();
      window.setTimeout(render, 0);
    });
    $("editForm").addEventListener("submit", function (event) { event.preventDefault(); saveEdit(); });
    $("removeCardButton").addEventListener("click", removeEditedCard);
    $("settingsDialog").addEventListener("click", function (event) { if (event.target === $("settingsDialog")) $("settingsDialog").close(); });
    $("editDialog").addEventListener("click", function (event) { if (event.target === $("editDialog")) $("editDialog").close(); });
  }

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (item) { item.classList.toggle("active", item === tab); });
      document.querySelectorAll(".page").forEach(function (page) { page.classList.toggle("active", page.id === tab.dataset.page); });
      window.scrollTo(0, 0);
    });
  });
  $("suitPicker").querySelectorAll("button").forEach(function (button) {
    button.addEventListener("click", function () { state.selectedSuit = button.dataset.suit; persist(); renderSuits(); renderRanks(); });
  });
  $("suitToggle").addEventListener("click", function () {
    if (!state.trackSuits && physicalSeen() > 0) return showToast("Turn on suit tracking at the start of a fresh shoe for a complete suit count.");
    snapshot();
    state.trackSuits = !state.trackSuits;
    state.selectedSuit = "";
    persist();
    renderSuits();
    renderRanks();
  });
  $("unknownButton").addEventListener("click", addUnknown);
  $("undoButton").addEventListener("click", undo);
  $("flowButton").addEventListener("click", advanceFlow);
  $("nextRoundButton").addEventListener("click", function () { startNextRound(false); });
  $("clearRoundButton").addEventListener("click", function () { startNextRound(true); });
  $("newShoeButton").addEventListener("click", newShoe);
  $("cutReachedButton").addEventListener("click", markCutReached);
  $("clearSessionsButton").addEventListener("click", function () {
    if (!state.sessions.length || !window.confirm("Delete saved shoe summaries from this device?")) return;
    snapshot();
    state.sessions = [];
    persist();
    renderSessions();
  });
  window.addEventListener("online", renderNetwork);
  window.addEventListener("offline", renderNetwork);
  setupDialogs();
  render();
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });
}());


