# Blackjack Table Trainer V3.6

An iPhone-friendly, installable eight-deck blackjack PWA for probability and strategy practice. It is static and can be published from the root of a GitHub Pages repository.

## Publish to GitHub Pages

1. Unzip this bundle and upload the files in `blackjack-probability-tracker-v3-6` to the root of a GitHub repository.
2. In GitHub, open **Settings → Pages** and choose **Deploy from a branch**, the `main` branch, and `/(root)`.
3. Open the published HTTPS address in Safari on your iPhone.
4. Tap **Share → Add to Home Screen**.

The app caches its files for offline use after the first successful load. Shoe cards, settings, and session summaries are stored in local browser storage on that device.

## Round flow

The card selector stays fixed at the bottom of the screen. Tap cards in dealt order:

1. Your first card
2. Dealer up card
3. Your second card
4. The dealer hole card is recorded face down automatically
5. Your hits
6. Tap **Stand · Dealer**, then enter the revealed dealer hole card
7. Enter dealer draws and tap **Finish dealer turn**
8. Tap **Next round**

Tap **Unknown** when a card was exposed but its rank was missed. It is counted as physically seen, marked with `*` in the count, and can be resolved later by tapping it in Recent Cards. The dealer's face-down hole card is kept separate from missed Unknown cards until it is revealed.

## Count-based suggestions

The action suggestion starts with an eight-deck basic-strategy baseline and applies common multi-deck Hi-Lo index plays: insurance; hard 16 vs 9/10, 15 vs 10, 12 vs 2–6, and 13 vs 2–3; doubles on 9 vs 2/7, 10 vs 10/A, and 11 vs A; and splitting 10s vs 5/6. For H17 it also uses the common 16 vs A and 15 vs A stand deviations. It displays the baseline, the active index and threshold, and a hit/stand fallback when the suggestion is DOUBLE or SPLIT.

Any unresolved **Unknown** card makes the true count uncertain. The count is visibly marked `*`, and count-based action and insurance overrides are paused until all missed ranks are resolved. The basic-strategy suggestion remains available when the hand and dealer up card are known.

The index values use commonly published multi-deck Hi-Lo charts; the classic Illustrious 18 values are often presented for six-deck games. Indexes can vary with deck count, H17/S17, table rules, and index conventions, so this compact set is a training aid rather than a rule-specific simulation. The eight-deck S17 baseline is based on [Wizard of Odds — eight-deck strategy](https://wizardofodds.com/games/blackjack/strategy/8-decks/). See [Wizard of Odds — Hi-Lo indexes](https://wizardofodds.com/games/blackjack/card-counting/high-low/) and the [Blackjack Apprenticeship H17 deviation chart](https://www.blackjackapprenticeship.com/wp-content/uploads/2019/07/BJA_H17.pdf) for the reference thresholds and rule-specific context.

## Included features

- Guided Your Hand + Dealer round entry, undo, card editing, and Unknown-card resolution
- Eight-deck rank probabilities, player next-card and bust odds, and dealer outcome probabilities
- Hi-Lo running count, estimated true count, decks remaining, and cut-card tracking
- Optional suit tracking, H17/S17 and double-after-split settings
- Local shoe-session history and fresh-shoe reset
- Offline-capable service worker and iPhone home-screen metadata

## Notes

- Card order is not predicted; probabilities describe the remaining tracked shoe.
- An unresolved Unknown card means exact shoe composition and true-count-based decisions are unavailable.
- The tracker assumes a 3:2 blackjack payout in its training baseline and does not replace the table's posted rules.
