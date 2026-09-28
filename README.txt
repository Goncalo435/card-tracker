BLACKJACK TABLE TRAINER V3
An iPhone-friendly, offline-capable eight-deck blackjack tracker.

PUBLISH ON GITHUB PAGES
1. Unzip this folder and upload its files into the root of your GitHub repository.
2. In the repository, open Settings > Pages.
3. Choose Deploy from a branch, then select the main branch and /(root).
4. Open the published HTTPS address in Safari on your iPhone.
5. Tap Share > Add to Home Screen > Add.

The app works from a secure website after its first successful load. Its files and saved shoe data stay on your device.

TRACKING A ROUND
- Choose 1–7 player seats in Table settings. You are always first, followed by the other seats and the dealer.
- Tap a rank to add it to the active seat. Tap Stand to move to the next seat; after the last player stands, the dealer is up.
- Finish dealer turn to clear the hands and start the next round. Every exposed card stays counted in the shoe.
- Turn on Shoe only to count a card without adding it to a hand. The active seat's turn stays in place.
- Clear round clears the visible hands. It keeps every exposed card counted in the shoe.
- Undo restores the previous card-entry or round change.
- Tap any recent card to change its rank, suit, or table position, or remove it.
- New shoe archives the current shoe and starts a fresh 416-card count.

PROBABILITY PRACTICE
- Rank counts show cards seen, cards left, and each rank's next-card probability.
- Grouped odds show Aces, 2–6, 7–9, and 10-value cards.
- Your hand shows a prominent bust chance, each rank's next-card probability, and the next ranks that would bust that hand.
- Player results show the next-card chances for 17–21, blackjack, bust, and 16 or lower.
- Opening blackjack chance is shown before a player hand has been entered.
- Dealer final outcomes are calculated from exposed cards, the remaining shoe, and the selected soft-17 rule. With one exposed card, the standard hidden hole card is included by default; the toggle can turn it off for no-hole-card tables.
- The cut-card position can be changed in settings; the tracker can also mark it as reached.

OTHER DETAILS
- Suit entry is optional. In suit mode, the app warns when all eight copies of a rank and suit are used.
- The eight-deck limits block more than 32 cards of any rank.
- On supported iPhones, card entry gives a short haptic response.
- Shoe and session data are stored locally in this browser.
- If the V2 app's local storage is present on the same website origin, V3 imports its card history and current hands the first time it opens.
- Probabilities describe a random draw from the remaining shoe; they do not predict card order or recommend bets.

FILES
- index.html, styles.css, app.js: the app
- manifest.webmanifest, sw.js: iPhone installation and offline support
- icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png: app icons
